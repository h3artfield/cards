/**
 * Discord #inventory listener — same clerk + decklist-match as the store page.
 * Only answers in DISCORD_CHANNEL_ID. Cloud Run needs the HTTP health port.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, Events, GatewayIntentBits, type Message } from "discord.js";
import { resolveStoreBySlug } from "../src/lib/deck-builder/deck-builder-service";
import { matchDecklistToStoreInventory } from "../src/lib/inventory/inventory-decklist-match";
import { runStoreClerk } from "../src/lib/store-inventory/store-clerk-agent";
import {
  chunkDiscordMessage,
  formatClerkDiscordReply,
  formatDecklistDiscordReply,
  looksLikeDecklist,
} from "../src/lib/discord-inventory/discord-inventory-reply-v1";

function loadEnvLocal() {
  for (const rel of [".env.local", "web/.env.local"]) {
    const path = resolve(process.cwd(), rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in web/.env.local`);
  return value;
}

const history = new Map<string, Array<{ role: "user" | "assistant"; text: string }>>();

function pushHistory(key: string, role: "user" | "assistant", text: string) {
  const next = history.get(key) ?? [];
  next.push({ role, text });
  history.set(key, next.slice(-6));
}

async function attachmentText(message: Message): Promise<string> {
  const parts: string[] = [];
  for (const file of message.attachments.values()) {
    const name = file.name ?? "";
    const type = file.contentType ?? "";
    if (!name.endsWith(".txt") && !name.endsWith(".dek") && !type.includes("text")) {
      continue;
    }
    const res = await fetch(file.url);
    if (res.ok) parts.push(await res.text());
  }
  return parts.join("\n");
}

async function replyChunks(message: Message, text: string) {
  const chunks = chunkDiscordMessage(text);
  for (const [i, chunk] of chunks.entries()) {
    if (i === 0) await message.reply({ content: chunk, allowedMentions: { repliedUser: false } });
    else await message.channel.send({ content: chunk });
  }
}

async function handleMessage(message: Message, args: {
  channelId: string;
  storeSlug: string;
  storeId: string;
  storeName: string;
}) {
  if (message.author.bot) return;
  if (message.channelId !== args.channelId) return;

  const attached = await attachmentText(message);
  const text = [message.content?.trim() ?? "", attached].filter(Boolean).join("\n").trim();
  if (!text) return;

  if (message.channel.isSendable()) {
    await message.channel.sendTyping();
  }

  const historyKey = `${message.channelId}:${message.author.id}`;

  try {
    if (looksLikeDecklist(text) || attached) {
      const result = await matchDecklistToStoreInventory({
        storeSlug: args.storeSlug,
        decklistText: text,
      });
      const reply = formatDecklistDiscordReply(result, args.storeSlug);
      pushHistory(historyKey, "user", text.slice(0, 400));
      pushHistory(historyKey, "assistant", reply.slice(0, 400));
      await replyChunks(message, reply);
      return;
    }

    const clerk = await runStoreClerk({
      storeId: args.storeId,
      storeSlug: args.storeSlug,
      storeName: args.storeName,
      message: text,
      history: history.get(historyKey),
    });
    const reply = formatClerkDiscordReply(clerk.reply, args.storeSlug);
    pushHistory(historyKey, "user", text.slice(0, 400));
    pushHistory(historyKey, "assistant", reply.slice(0, 400));
    await replyChunks(message, reply);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    await message.reply({
      content: `I couldn't check inventory just now (${detail}). Try again in a moment.`,
      allowedMentions: { repliedUser: false },
    });
  }
}

function startHealthServer() {
  const port = Number.parseInt(process.env.PORT ?? "8080", 10);
  if (!Number.isFinite(port) || port <= 0) return;
  createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  }).listen(port, "0.0.0.0", () => {
    console.log(`Discord inventory bot health listening on ${port}`);
  });
}

async function main() {
  loadEnvLocal();
  startHealthServer();
  const token = requireEnv("DISCORD_BOT_TOKEN");
  const channelId = requireEnv("DISCORD_CHANNEL_ID");
  const storeSlug = requireEnv("DISCORD_STORE_SLUG");
  const guildId = process.env.DISCORD_GUILD_ID?.trim();

  const store = await resolveStoreBySlug(storeSlug);
  if (!store) throw new Error(`Store not found for DISCORD_STORE_SLUG=${storeSlug}`);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (ready) => {
    console.log(
      `Discord inventory bot ready as ${ready.user.tag} · channel ${channelId} · store ${storeSlug}`,
    );
  });

  client.on(Events.MessageCreate, (message) => {
    if (guildId && message.guildId && message.guildId !== guildId) return;
    void handleMessage(message, {
      channelId,
      storeSlug,
      storeId: store.id,
      storeName: store.storeName,
    });
  });

  await client.login(token);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

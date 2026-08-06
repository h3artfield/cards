import {
  MTG_RAG_EMBEDDING_DIMENSIONS,
  MTG_RAG_EMBEDDING_MODEL,
} from "../../src/lib/mtg-rag/constants";

const BATCH_SIZE = 100;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for MTG RAG embeddings.");
  }

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MTG_RAG_EMBEDDING_MODEL,
        input: batch,
        dimensions: MTG_RAG_EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI embeddings failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      data: Array<{ index: number; embedding: number[] }>;
    };
    const ordered = [...json.data].sort((a, b) => a.index - b.index);
    for (const row of ordered) {
      out.push(row.embedding);
    }
  }

  return out;
}

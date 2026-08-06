async function main() {
  const id = process.argv[2] ?? "9242259";
  const res = await fetch(`https://www.tcgplayer.com/product/${id}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(15_000),
  });
  console.log("status", res.status);
  const html = await res.text();
  const og = html.match(/property="og:image"\s+content="([^"]+)"/i);
  const json = html.match(/"imageUrl"\s*:\s*"([^"]+)"/);
  const cdn = html.match(
    /https:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/[^"'\s]+/,
  );
  console.log("og:image", og?.[1]);
  console.log("json imageUrl", json?.[1]);
  console.log("cdn", cdn?.[0]);
}

main().catch(console.error);

import {
  MTG_RAG_EMBEDDING_DIMENSIONS,
  MTG_RAG_EMBEDDING_MODEL,
} from "./constants";

export async function embedQueryText(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for MTG RAG query embeddings.");
  }

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MTG_RAG_EMBEDDING_MODEL,
      input: text,
      dimensions: MTG_RAG_EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI query embedding failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  const embedding = json.data[0]?.embedding;
  if (!embedding?.length) {
    throw new Error("OpenAI query embedding returned empty vector.");
  }
  return embedding;
}

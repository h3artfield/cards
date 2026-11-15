export type StaffArticle = {
  title: string;
  questions: string;
  body: string;
};

export function parseStaffHandbook(markdown: string): StaffArticle[] {
  const chunks = markdown.split(/\n(?=## )/).slice(1);
  return chunks.map((chunk) => {
    const lines = chunk.replace(/^## /, "").split("\n");
    const title = lines[0]?.trim() ?? "Untitled";
    const rest = lines.slice(1).join("\n").trim();
    const questionLine = rest.match(/^Questions:\s*(.+)$/m)?.[1]?.trim() ?? "";
    const body = rest.replace(/^Questions:\s*.+$/m, "").trim();
    return { title, questions: questionLine, body };
  });
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export function rankStaffArticles(
  articles: StaffArticle[],
  query: string,
): Array<{ article: StaffArticle; score: number }> {
  const wanted = tokens(query);
  const phrase = query.trim().toLowerCase();
  if (!wanted.length) return [];
  return articles
    .map((article) => {
      const title = article.title.toLowerCase();
      const questions = article.questions.toLowerCase();
      const body = article.body.toLowerCase();
      let score = 0;
      if (phrase.length > 6 && questions.includes(phrase)) score += 12;
      for (const token of wanted) {
        if (title.includes(token)) score += 3;
        if (questions.includes(token)) score += 2;
        if (body.includes(token)) score += 1;
      }
      return { article, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
}

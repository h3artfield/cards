import handbookMarkdown from "@/lib/staff-handbook/STAFF_HANDBOOK.md";
import { callOpenAiJson } from "@/lib/card-flow-v2/openai-json";
import { parseStaffHandbook, rankStaffArticles } from "./handbook";

export type StaffAnswer = {
  title: string | null;
  answer: string;
  covered: boolean;
};

const UNCOVERED = "This handbook does not cover that.";

export async function answerStaffQuestion(query: string): Promise<StaffAnswer> {
  const articles = parseStaffHandbook(handbookMarkdown);
  const ranked = rankStaffArticles(articles, query).slice(0, 3);
  if (!ranked.length || ranked[0]!.score < 3) {
    return { title: null, answer: UNCOVERED, covered: false };
  }

  const excerpts = ranked
    .map(
      (row, index) =>
        `Article ${index + 1}: ${row.article.title}\nQuestions: ${row.article.questions}\n${row.article.body}`,
    )
    .join("\n\n");

  try {
    const parsed = await callOpenAiJson<{ answer?: string; covered?: boolean }>(
      [
        "You are the staff assistant inside a card store's admin app.",
        "Answer only from the handbook articles provided.",
        "Use the same button and menu names the articles use.",
        "Give the steps in a short list when the article has steps.",
        "If the articles do not contain the procedure, set covered to false and answer exactly: This handbook does not cover that.",
        'Reply as JSON: {"answer": string, "covered": boolean}.',
      ].join(" "),
      [{ type: "text", text: `Question: ${query}\n\n${excerpts}` }],
      { maxTokens: 500, temperature: 0.1 },
    );
    const answer = parsed.answer?.trim();
    if (!answer || parsed.covered === false) {
      return { title: null, answer: UNCOVERED, covered: false };
    }
    return { title: ranked[0]!.article.title, answer, covered: true };
  } catch {
    const article = ranked[0]!.article;
    return {
      title: article.title,
      answer: article.body,
      covered: true,
    };
  }
}

import type { ClerkOrchestratorContext, ClerkRouterResult } from "../clerk-types";

export function buildVerifierBlockedReply(input: {
  ctx: ClerkOrchestratorContext;
  route: ClerkRouterResult;
  blockingIssues: string[];
}): string {
  const issues = input.blockingIssues.slice(0, 4);
  const issueText =
    issues.length > 0
      ? issues.map((i) => `• ${i}`).join("\n")
      : "• I couldn't confirm the answer against our inventory and rules.";

  if (input.route.intent === "build_deck") {
    return `I wasn't able to build a verified deck list from our current inventory.

${issueText}

You can pick a commander from our in-stock options and I'll try again, or ask what's available for a specific card.`;
  }

  if (input.route.intent === "recommendation") {
    return `I couldn't put together verified recommendations for that question.

${issueText}

Try asking about a specific commander, color, or budget — I'll only show cards we can confirm in stock.`;
  }

  return `I couldn't verify a reliable answer for your question.

${issueText}

Ask me about specific cards in stock, or narrow your request and I'll check our shelves directly.`;
}

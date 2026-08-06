import { hasBackImage } from "../card-image-utils";
import type { VisionMessageContent } from "./openai-json";
import type { CardEvidenceInput } from "./types";

export function buildCustomerImageContent(
  input: CardEvidenceInput,
  preamble: string,
): VisionMessageContent[] {
  const content: VisionMessageContent[] = [
    {
      type: "text",
      text: [
        preamble,
        input.declaredItemType
          ? `Customer declared item type: ${input.declaredItemType}.`
          : "",
        hasBackImage(input.backImageUrl)
          ? "Front and back customer images are provided."
          : "Only a front customer image is provided.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      type: "image_url",
      image_url: { url: input.frontImageUrl, detail: "high" },
    },
  ];

  if (hasBackImage(input.backImageUrl)) {
    content.push({
      type: "image_url",
      image_url: { url: input.backImageUrl!, detail: "high" },
    });
  }

  return content;
}

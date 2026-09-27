import { describe, expect, it } from "vite-plus/test";
import { MessageId } from "@t3tools/contracts";
import { rankPromptMatches } from "./ComposerPromptSearch";

describe("rankPromptMatches", () => {
  it("ranks fuzzy matches and collapses duplicate sent prompts", () => {
    const matches = [
      {
        messageId: MessageId.make("newest"),
        text: "Fix the login flow",
      },
      {
        messageId: MessageId.make("duplicate"),
        text: "Fix the login flow",
      },
      {
        messageId: MessageId.make("older"),
        text: "Flow login fix",
      },
    ];
    expect(rankPromptMatches(matches, "fix login").map((match) => match.prompt)).toEqual([
      "Fix the login flow",
    ]);
    expect(rankPromptMatches(matches, "flf").map((match) => match.prompt)).toEqual([
      "Flow login fix",
      "Fix the login flow",
    ]);
    expect(rankPromptMatches(matches, "").map((match) => match.id)).toEqual([
      MessageId.make("newest"),
      MessageId.make("older"),
    ]);
  });
});

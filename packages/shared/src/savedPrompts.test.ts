import { describe, expect, it } from "vite-plus/test";
import {
  expandSavedPrompt,
  savedPromptEnvironmentNames,
  searchSavedPrompts,
} from "./savedPrompts.ts";

describe("saved prompt variables", () => {
  it("expands repeated host and clipboard references without treating inserted text as a template", () => {
    const body = "Host: {{env.HOST}}. Paste: {{clipboard}}. Host again: {{env.HOST}}.";
    expect(savedPromptEnvironmentNames(body)).toEqual(["HOST"]);
    expect(expandSavedPrompt(body, { HOST: "mac" }, "{{env.SECRET}}")).toBe(
      "Host: mac. Paste: {{env.SECRET}}. Host again: mac.",
    );
  });

  it("rejects missing values instead of inserting a partial prompt", () => {
    expect(() => expandSavedPrompt("{{env.HOST}}", {}, "")).toThrow("HOST is not set");
    expect(() => expandSavedPrompt("{{clipboard}}", {}, null)).toThrow("clipboard");
    expect(() => expandSavedPrompt("{{clipboard}}", {}, "")).toThrow("no text");
  });
});

describe("searchSavedPrompts", () => {
  const prompts = {
    atest: "Started tilt",
    testing: "Run tests",
    test: "Just started tilt",
    pretest: "Prepare tests",
    beta: "Unrelated",
  };

  it("puts exact and prefix names before substring matches", () => {
    expect(searchSavedPrompts(prompts, "TEST").map(([name]) => name)).toEqual([
      "test",
      "testing",
      "atest",
      "pretest",
    ]);
  });

  it("finds abbreviated names without letting fuzzy matches outrank direct matches", () => {
    expect(searchSavedPrompts(prompts, "tng").map(([name]) => name)).toEqual(["testing"]);
    expect(searchSavedPrompts({ testing: "Fuzzy", atng: "Direct" }, "tng")[0]?.[0]).toBe("atng");
  });

  it("keeps alphabetical order when browsing with an empty query", () => {
    expect(searchSavedPrompts(prompts, "").map(([name]) => name)).toEqual([
      "atest",
      "beta",
      "pretest",
      "test",
      "testing",
    ]);
  });
});

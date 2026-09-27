import { describe, expect, it } from "vite-plus/test";
import { expandSavedPrompt, savedPromptEnvironmentNames } from "./savedPrompts.ts";

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

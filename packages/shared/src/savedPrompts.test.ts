import { describe, expect, it } from "vite-plus/test";
import {
  expandSavedPrompt,
  planSavedPromptTransfer,
  savedPromptEnvironmentNames,
  searchSavedPrompts,
  type SavedPromptTransferMode,
} from "./savedPrompts.ts";
import { applyServerSettingsPatch } from "./serverSettings.ts";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";

describe("planSavedPromptTransfer", () => {
  it.each<{ mode: SavedPromptTransferMode; review: string; keepRemote: boolean }>([
    { mode: "copy", review: "Remote review", keepRemote: true },
    { mode: "replace", review: "Laptop review", keepRemote: true },
    { mode: "sync", review: "Laptop review", keepRemote: false },
  ])("applies the requested merge or exact sync ($mode)", ({ mode, review, keepRemote }) => {
    const source = Object.freeze({
      review: "Laptop review",
      pr: "File a PR on {{env.HOST}} with {{clipboard}}",
    });
    const destination = Object.freeze({ review: "Remote review", remote: "Remote-only prompt" });
    const plan = planSavedPromptTransfer(source, destination, mode);
    expect(
      applyServerSettingsPatch(
        { ...DEFAULT_SERVER_SETTINGS, savedPrompts: destination },
        { savedPrompts: plan.patch },
      ).savedPrompts,
    ).toEqual({ ...(keepRemote ? { remote: destination.remote } : {}), review, pr: source.pr });
    expect(plan.added).toBe(1);
    expect(plan.updated).toBe(mode === "copy" ? 0 : 1);
    expect(plan.removed).toEqual(keepRemote ? [] : ["remote"]);
  });

  it("skips identical prompts and copies names inherited from Object.prototype", () => {
    expect(planSavedPromptTransfer({ review: "Same" }, { review: "Same" }, "sync")).toEqual({
      patch: {},
      added: 0,
      updated: 0,
      removed: [],
    });
    expect(planSavedPromptTransfer({}, { remote: "Keep" }, "replace").patch).toEqual({});
    expect(
      planSavedPromptTransfer({ constructor: "Review the constructor" }, {}, "copy").patch,
    ).toEqual({
      constructor: "Review the constructor",
    });
  });

  it("explicitly syncs an empty source by deleting every destination prompt", () => {
    const destination = { remote: "Remove", constructor: "Remove this too" };
    const plan = planSavedPromptTransfer({}, destination, "sync");
    expect(plan).toEqual({
      patch: { remote: null, constructor: null },
      added: 0,
      updated: 0,
      removed: ["remote", "constructor"],
    });
    expect(
      applyServerSettingsPatch(
        { ...DEFAULT_SERVER_SETTINGS, savedPrompts: destination },
        { savedPrompts: plan.patch },
      ).savedPrompts,
    ).toEqual({});
  });
});

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

import { describe, expect, it } from "vite-plus/test";
import { scoreSearchFields, searchItems } from "./weightedSearch.ts";

describe("weighted menu search", () => {
  it("orders exact labels, prefixes, word boundaries, substrings, then subsequences", () => {
    const labels = ["t-e-s-t", "pretest", "run test", "testing", "test", "unrelated"];
    expect(searchItems(labels, " TEST ", (label) => [label])).toEqual([
      "test",
      "testing",
      "run test",
      "pretest",
      "t-e-s-t",
    ]);
  });

  it("matches every token across weighted fields regardless of token order", () => {
    const entries = [
      { label: "Open settings", detail: "remote environment" },
      { label: "Remote settings", detail: "appearance" },
    ];
    expect(
      searchItems(entries, "stngs remote", (entry) => [
        entry.label,
        { value: entry.detail, weight: 1_000, fuzzy: false },
      ]),
    ).toEqual([entries[1], entries[0]]);
    expect(scoreSearchFields(["Remote settings"], "settings missing")).toBeNull();
  });

  it("does not let metadata hits outrank matching labels or fuzz prose into unrelated hits", () => {
    const entries = [
      { label: "Other", detail: "review" },
      { label: "Review changes", detail: "" },
    ];
    const fields = (entry: (typeof entries)[number]) => [
      entry.label,
      { value: entry.detail, weight: 1_000, fuzzy: false },
    ];
    expect(searchItems(entries, "review", fields)).toEqual([entries[1], entries[0]]);
    expect(searchItems(entries, "rvw", fields)).toEqual([entries[1]]);
  });

  it("normalizes accents and whitespace, and rewards a complete phrase", () => {
    expect(scoreSearchFields(["Thèmes"], " THEMES ")).toBe(0);
    const labels = ["Opus release 4.7", "Opus 4.7", "Claude Opus 4.7"];
    expect(searchItems(labels, "opus   4.7", (label) => [label])[0]).toBe("Opus 4.7");
  });

  it("can ignore match position and length without changing default ranking", () => {
    const shorter = ["Claude Opus 5"];
    const newer = ["Claude Opus 5.5"];
    expect(scoreSearchFields(shorter, "opus")).not.toBe(scoreSearchFields(newer, "opus"));
    expect(scoreSearchFields(shorter, "opus", { ignorePosition: true })).toBe(
      scoreSearchFields(newer, "opus", { ignorePosition: true }),
    );
    expect(scoreSearchFields(["Opus"], "opus", { ignorePosition: true })).toBeLessThan(
      scoreSearchFields(newer, "opus", { ignorePosition: true })!,
    );
  });

  it("preserves browsing and equal-score order, applies limits after ranking, and never mutates input", () => {
    const entries = [{ label: "Beta" }, { label: "Alpha" }, { label: "Alpha" }];
    const original = [...entries];
    expect(searchItems(entries, "  ", (entry) => [entry.label])).toEqual(entries);
    expect(searchItems(entries, "alpha", (entry) => [entry.label], 1)).toEqual([entries[1]]);
    expect(searchItems(entries, "alpha", (entry) => [entry.label])).toEqual(entries.slice(1));
    expect(searchItems(entries, "alpha", (entry) => [entry.label], 0)).toEqual([]);
    expect(entries).toEqual(original);
  });
});

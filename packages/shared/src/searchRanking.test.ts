import { describe, expect, it } from "vite-plus/test";

import {
  insertRankedSearchResult,
  normalizeSearchQuery,
  scoreQueryMatch,
  scoreSubsequenceMatch,
  scoreSearchFields,
  searchItems,
} from "./searchRanking.ts";

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

describe("normalizeSearchQuery", () => {
  it("trims and lowercases queries", () => {
    expect(normalizeSearchQuery("  UI  ")).toBe("ui");
  });

  it("can strip leading trigger characters", () => {
    expect(normalizeSearchQuery("  $ui", { trimLeadingPattern: /^\$+/ })).toBe("ui");
  });
});

describe("scoreQueryMatch", () => {
  it("prefers exact matches over broader contains matches", () => {
    expect(
      scoreQueryMatch({
        value: "ui",
        query: "ui",
        exactBase: 0,
        prefixBase: 10,
        includesBase: 20,
      }),
    ).toBe(0);

    expect(
      scoreQueryMatch({
        value: "building native ui",
        query: "ui",
        exactBase: 0,
        prefixBase: 10,
        boundaryBase: 20,
        includesBase: 30,
      }),
    ).toBeGreaterThan(0);
  });

  it("treats boundary matches as stronger than generic contains matches", () => {
    const boundaryScore = scoreQueryMatch({
      value: "gh-fix-ci",
      query: "fix",
      exactBase: 0,
      prefixBase: 10,
      boundaryBase: 20,
      includesBase: 30,
      boundaryMarkers: ["-"],
    });
    const containsScore = scoreQueryMatch({
      value: "highfixci",
      query: "fix",
      exactBase: 0,
      prefixBase: 10,
      boundaryBase: 20,
      includesBase: 30,
      boundaryMarkers: ["-"],
    });

    expect(boundaryScore).not.toBeNull();
    expect(containsScore).not.toBeNull();
    expect(boundaryScore!).toBeLessThan(containsScore!);
  });
});

describe("scoreSubsequenceMatch", () => {
  it("scores tighter subsequences ahead of looser ones", () => {
    const compact = scoreSubsequenceMatch("ghfixci", "gfc");
    const spread = scoreSubsequenceMatch("github-fix-ci", "gfc");

    expect(compact).not.toBeNull();
    expect(spread).not.toBeNull();
    expect(compact!).toBeLessThan(spread!);
  });
});

describe("insertRankedSearchResult", () => {
  it("keeps the best-ranked candidates within the limit", () => {
    const ranked = [
      { item: "b", score: 20, tieBreaker: "b" },
      { item: "d", score: 40, tieBreaker: "d" },
    ];

    insertRankedSearchResult(ranked, { item: "a", score: 10, tieBreaker: "a" }, 2);
    insertRankedSearchResult(ranked, { item: "c", score: 30, tieBreaker: "c" }, 2);

    expect(ranked.map((entry) => entry.item)).toEqual(["a", "b"]);
  });
});

import { describe, expect, it } from "vite-plus/test";

import { JJ_WORKING_COPY_REVISION, resolveWorktreeBaseRef } from "./vcs.ts";

describe("resolveWorktreeBaseRef", () => {
  it("uses the working copy when jj has no named base", () => {
    expect(resolveWorktreeBaseRef({ defaultRef: null, currentRef: null, vcsKind: "jj" })).toBe(
      JJ_WORKING_COPY_REVISION,
    );
  });

  it("preserves the default and current bookmark preferences", () => {
    expect(resolveWorktreeBaseRef({ defaultRef: "main", currentRef: "topic", vcsKind: "jj" })).toBe(
      "main",
    );
    expect(resolveWorktreeBaseRef({ defaultRef: null, currentRef: "topic", vcsKind: "jj" })).toBe(
      "topic",
    );
  });

  it.each(["git", "unknown", undefined] as const)(
    "does not offer a jj revision for %s repositories",
    (vcsKind) => {
      expect(resolveWorktreeBaseRef({ defaultRef: null, currentRef: null, vcsKind })).toBeNull();
    },
  );
});

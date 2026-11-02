import {
  GIT_VCS_TERMINOLOGY,
  JJ_VCS_TERMINOLOGY,
  JJ_WORKING_COPY_REVISION,
} from "@t3tools/shared/vcs";
import type { VcsRef } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { dedupeRemoteBranchesWithLocalMatches } from "@t3tools/shared/git";
import {
  deriveLocalBranchNameFromRemoteRef,
  resolveBranchSelectionTarget,
  resolveDraftEnvModeAfterBranchChange,
  resolveEffectiveEnvMode,
  resolveBranchToolbarPrBranch,
  resolveLocalCheckoutBranchMismatch,
  resolvePreviousWorktreeSeed,
  resolvePreviousWorktreeLabel,
  resolveBranchToolbarValue,
  resolveBranchTriggerLabel,
  resolveEnvModeLabel,
  resolveCurrentWorkspaceLabel,
  resolveLockedWorkspaceLabel,
  sanitizeNewRefName,
  shouldIncludeBranchPickerItem,
} from "./BranchToolbar.logic";

describe("resolvePreviousWorktreeSeed", () => {
  it("picks the most recently updated worktree thread", () => {
    expect(
      resolvePreviousWorktreeSeed({
        threads: [
          {
            branch: "t3/older",
            worktreePath: "/repo/.t3/worktrees/older",
            updatedAt: "2026-07-20T00:00:00.000Z",
          },
          {
            branch: "t3/newer",
            worktreePath: "/repo/.t3/worktrees/newer",
            updatedAt: "2026-07-22T00:00:00.000Z",
          },
          { branch: "main", worktreePath: null, updatedAt: "2026-07-23T00:00:00.000Z" },
        ],
        currentWorktreePath: null,
      }),
    ).toEqual({ branch: "t3/newer", worktreePath: "/repo/.t3/worktrees/newer" });
  });

  it("skips the worktree the composer already points at", () => {
    expect(
      resolvePreviousWorktreeSeed({
        threads: [
          {
            branch: "t3/current",
            worktreePath: "/repo/.t3/worktrees/current",
            updatedAt: "2026-07-22T00:00:00.000Z",
          },
        ],
        currentWorktreePath: "/repo/.t3/worktrees/current",
      }),
    ).toBeNull();
  });

  it("returns null when no thread has a worktree", () => {
    expect(
      resolvePreviousWorktreeSeed({
        threads: [{ branch: "main", worktreePath: null, updatedAt: "2026-07-22T00:00:00.000Z" }],
        currentWorktreePath: null,
      }),
    ).toBeNull();
  });

  it("ignores archived threads and threads with unparseable timestamps", () => {
    expect(
      resolvePreviousWorktreeSeed({
        threads: [
          {
            branch: "t3/archived",
            worktreePath: "/repo/.t3/worktrees/archived",
            updatedAt: "2026-07-23T00:00:00.000Z",
            archivedAt: "2026-07-23T01:00:00.000Z",
          },
          {
            branch: "t3/garbage-timestamp",
            worktreePath: "/repo/.t3/worktrees/garbage",
            updatedAt: "not-a-date",
          },
          {
            branch: "t3/live",
            worktreePath: "/repo/.t3/worktrees/live",
            updatedAt: "2026-07-21T00:00:00.000Z",
            archivedAt: null,
          },
        ],
        currentWorktreePath: null,
      }),
    ).toEqual({ branch: "t3/live", worktreePath: "/repo/.t3/worktrees/live" });
  });
});

describe("resolvePreviousWorktreeLabel", () => {
  it("includes the branch when known", () => {
    expect(
      resolvePreviousWorktreeLabel(
        { branch: "t3/fix-thing", worktreePath: "/wt" },
        GIT_VCS_TERMINOLOGY,
      ),
    ).toBe("Previous worktree (t3/fix-thing)");
    expect(
      resolvePreviousWorktreeLabel({ branch: null, worktreePath: "/wt" }, GIT_VCS_TERMINOLOGY),
    ).toBe("Previous worktree");
  });
});

describe("resolveDraftEnvModeAfterBranchChange", () => {
  it("switches to local mode when returning from an existing worktree to the main worktree", () => {
    expect(
      resolveDraftEnvModeAfterBranchChange({
        nextWorktreePath: null,
        currentWorktreePath: "/repo/.t3/worktrees/feature-a",
        effectiveEnvMode: "worktree",
      }),
    ).toBe("local");
  });

  it("uses worktree mode when selecting a ref already attached to a worktree", () => {
    expect(
      resolveDraftEnvModeAfterBranchChange({
        nextWorktreePath: "/repo/.t3/worktrees/feature-a",
        currentWorktreePath: null,
        effectiveEnvMode: "local",
      }),
    ).toBe("worktree");
  });
});

describe("resolveBranchToolbarValue", () => {
  it("defaults new-worktree mode to current git ref when no explicit base ref is set", () => {
    expect(
      resolveBranchToolbarValue({
        envMode: "worktree",
        activeWorktreePath: null,
        activeThreadBranch: null,
        currentGitBranch: "main",
      }),
    ).toBe("main");
  });

  it("keeps an explicitly selected worktree base ref", () => {
    expect(
      resolveBranchToolbarValue({
        envMode: "worktree",
        activeWorktreePath: null,
        activeThreadBranch: "feature/base",
        currentGitBranch: "main",
      }),
    ).toBe("feature/base");
  });

  it("shows the actual checked-out ref when not selecting a new worktree base", () => {
    expect(
      resolveBranchToolbarValue({
        envMode: "local",
        activeWorktreePath: null,
        activeThreadBranch: "feature/base",
        currentGitBranch: "main",
      }),
    ).toBe("main");
  });
});

describe("resolveBranchTriggerLabel", () => {
  it("labels the working-copy base without applying the origin default", () => {
    expect(
      resolveBranchTriggerLabel({
        activeWorktreePath: null,
        effectiveEnvMode: "worktree",
        resolvedActiveBranch: JJ_WORKING_COPY_REVISION,
        resolvedActiveBranchIsRemote: false,
        startFromOrigin: true,
        terminology: JJ_VCS_TERMINOLOGY,
      }),
    ).toBe("From current working copy");
    expect(
      shouldIncludeBranchPickerItem({
        itemValue: JJ_WORKING_COPY_REVISION,
        normalizedQuery: "working copy",
        createBranchItemValue: null,
        checkoutPullRequestItemValue: null,
      }),
    ).toBe(true);
  });

  it("names the empty state with the project's ref noun", () => {
    const input = {
      activeWorktreePath: null,
      effectiveEnvMode: "worktree" as const,
      resolvedActiveBranch: null,
      resolvedActiveBranchIsRemote: null,
      startFromOrigin: true,
    };
    expect(resolveBranchTriggerLabel({ ...input, terminology: GIT_VCS_TERMINOLOGY })).toBe(
      "Select branch",
    );
    expect(resolveBranchTriggerLabel({ ...input, terminology: JJ_VCS_TERMINOLOGY })).toBe(
      "Select bookmark",
    );
  });

  it("shows the origin ref when a new worktree will start from origin", () => {
    expect(
      resolveBranchTriggerLabel({
        activeWorktreePath: null,
        effectiveEnvMode: "worktree",
        resolvedActiveBranch: "main",
        resolvedActiveBranchIsRemote: false,
        startFromOrigin: true,
        terminology: GIT_VCS_TERMINOLOGY,
      }),
    ).toBe("From origin/main");
  });

  it("shows the origin ref for local branch names that contain slashes", () => {
    expect(
      resolveBranchTriggerLabel({
        activeWorktreePath: null,
        effectiveEnvMode: "worktree",
        resolvedActiveBranch: "feature/demo",
        resolvedActiveBranchIsRemote: false,
        startFromOrigin: true,
        terminology: GIT_VCS_TERMINOLOGY,
      }),
    ).toBe("From origin/feature/demo");
  });

  it("shows the local ref when start from origin is disabled", () => {
    expect(
      resolveBranchTriggerLabel({
        activeWorktreePath: null,
        effectiveEnvMode: "worktree",
        resolvedActiveBranch: "main",
        resolvedActiveBranchIsRemote: false,
        startFromOrigin: false,
        terminology: GIT_VCS_TERMINOLOGY,
      }),
    ).toBe("From main");
  });

  it("does not duplicate the origin prefix for an explicit remote ref", () => {
    expect(
      resolveBranchTriggerLabel({
        activeWorktreePath: null,
        effectiveEnvMode: "worktree",
        resolvedActiveBranch: "origin/feature/demo",
        resolvedActiveBranchIsRemote: true,
        startFromOrigin: true,
        terminology: GIT_VCS_TERMINOLOGY,
      }),
    ).toBe("From origin/feature/demo");
  });

  it("preserves an explicit ref from a non-origin remote", () => {
    expect(
      resolveBranchTriggerLabel({
        activeWorktreePath: null,
        effectiveEnvMode: "worktree",
        resolvedActiveBranch: "upstream/feature/demo",
        resolvedActiveBranchIsRemote: true,
        startFromOrigin: true,
        terminology: GIT_VCS_TERMINOLOGY,
      }),
    ).toBe("From upstream/feature/demo");
  });

  it("keeps current-checkout labels and empty state unchanged", () => {
    expect(
      resolveBranchTriggerLabel({
        activeWorktreePath: null,
        effectiveEnvMode: "local",
        resolvedActiveBranch: "main",
        resolvedActiveBranchIsRemote: false,
        startFromOrigin: true,
        terminology: GIT_VCS_TERMINOLOGY,
      }),
    ).toBe("main");
    expect(
      resolveBranchTriggerLabel({
        activeWorktreePath: null,
        effectiveEnvMode: "worktree",
        resolvedActiveBranch: null,
        resolvedActiveBranchIsRemote: null,
        startFromOrigin: true,
        terminology: GIT_VCS_TERMINOLOGY,
      }),
    ).toBe("Select branch");
  });

  it("does not fabricate an origin ref while branch metadata is loading", () => {
    expect(
      resolveBranchTriggerLabel({
        activeWorktreePath: null,
        effectiveEnvMode: "worktree",
        resolvedActiveBranch: "upstream/feature/demo",
        resolvedActiveBranchIsRemote: null,
        startFromOrigin: true,
        terminology: GIT_VCS_TERMINOLOGY,
      }),
    ).toBe("From upstream/feature/demo");
  });
});

describe("resolveBranchToolbarPrBranch", () => {
  it("hides PR state while an optimistic branch switch is in flight", () => {
    expect(
      resolveBranchToolbarPrBranch({
        activeThreadBranch: "feature/current",
        resolvedActiveBranch: "feature/next",
      }),
    ).toBeNull();
  });
});

describe("resolveLocalCheckoutBranchMismatch", () => {
  it("detects when a local thread is associated with a different branch than the checkout", () => {
    expect(
      resolveLocalCheckoutBranchMismatch({
        effectiveEnvMode: "local",
        activeWorktreePath: null,
        activeThreadBranch: "feature/thread",
        currentGitBranch: "feature/current",
      }),
    ).toEqual({
      threadBranch: "feature/thread",
      currentBranch: "feature/current",
    });
  });

  it("ignores dedicated worktrees because their checkout is already thread-scoped", () => {
    expect(
      resolveLocalCheckoutBranchMismatch({
        effectiveEnvMode: "worktree",
        activeWorktreePath: "/repo/.t3/worktrees/feature-thread",
        activeThreadBranch: "feature/thread",
        currentGitBranch: "feature/current",
      }),
    ).toBeNull();
  });
});

describe("resolveEffectiveEnvMode", () => {
  it("keeps a server thread in worktree mode while its worktree is still being created", () => {
    expect(
      resolveEffectiveEnvMode({
        activeWorktreePath: null,
        hasServerThread: true,
        draftThreadEnvMode: undefined,
        preparingWorktree: true,
      }),
    ).toBe("worktree");
    expect(
      resolveEffectiveEnvMode({
        activeWorktreePath: null,
        hasServerThread: true,
        draftThreadEnvMode: undefined,
      }),
    ).toBe("local");
  });
});

describe("resolveEnvModeLabel", () => {
  it("uses explicit workspace labels", () => {
    expect(resolveEnvModeLabel("local", GIT_VCS_TERMINOLOGY)).toBe("Current checkout");
    expect(resolveEnvModeLabel("worktree", GIT_VCS_TERMINOLOGY)).toBe("New worktree");
  });
});

describe("resolveCurrentWorkspaceLabel", () => {
  it("describes the main repo checkout when no worktree path is active", () => {
    expect(resolveCurrentWorkspaceLabel(null, GIT_VCS_TERMINOLOGY)).toBe("Current checkout");
  });

  it("describes the active checkout as a worktree when one is attached", () => {
    expect(resolveCurrentWorkspaceLabel("/repo/.t3/worktrees/feature-a", GIT_VCS_TERMINOLOGY)).toBe(
      "Current worktree",
    );
  });
});

describe("resolveLockedWorkspaceLabel", () => {
  it("uses a shorter label for the main repo checkout", () => {
    expect(resolveLockedWorkspaceLabel(null, "local")).toBe("Local checkout");
  });

  it("uses a shorter label for an attached worktree", () => {
    expect(resolveLockedWorkspaceLabel("/repo/.t3/worktrees/feature-a", "worktree")).toBe(
      "Worktree",
    );
  });

  it("describes a worktree that is still being created as a new worktree", () => {
    expect(resolveLockedWorkspaceLabel(null, "worktree")).toBe("New worktree");
  });
});

describe("deriveLocalBranchNameFromRemoteRef", () => {
  it("supports remote names that contain slashes", () => {
    expect(deriveLocalBranchNameFromRemoteRef("my-org/upstream/feature/demo")).toBe(
      "upstream/feature/demo",
    );
  });
});

describe("dedupeRemoteBranchesWithLocalMatches", () => {
  it("hides remote refs when the matching local ref exists", () => {
    const input: VcsRef[] = [
      {
        name: "feature/demo",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
      {
        name: "origin/feature/demo",
        isRemote: true,
        remoteName: "origin",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
      {
        name: "origin/feature/remote-only",
        isRemote: true,
        remoteName: "origin",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
    ];

    expect(dedupeRemoteBranchesWithLocalMatches(input).map((ref) => ref.name)).toEqual([
      "feature/demo",
      "origin/feature/remote-only",
    ]);
  });

  it("keeps non-origin remote refs visible when git tracks with first-slash local naming", () => {
    const input: VcsRef[] = [
      {
        name: "upstream/feature",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
      {
        name: "my-org/upstream/feature",
        isRemote: true,
        remoteName: "my-org/upstream",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
    ];

    expect(dedupeRemoteBranchesWithLocalMatches(input).map((ref) => ref.name)).toEqual([
      "upstream/feature",
      "my-org/upstream/feature",
    ]);
  });
});

describe("resolveBranchSelectionTarget", () => {
  it("reuses an existing secondary worktree for the selected ref", () => {
    expect(
      resolveBranchSelectionTarget({
        activeProjectCwd: "/repo",
        activeWorktreePath: "/repo/.t3/worktrees/feature-a",
        refName: {
          isDefault: false,
          worktreePath: "/repo/.t3/worktrees/feature-b",
        },
      }),
    ).toEqual({
      checkoutCwd: "/repo/.t3/worktrees/feature-b",
      nextWorktreePath: "/repo/.t3/worktrees/feature-b",
      reuseExistingWorktree: true,
    });
  });

  it("switches back to the main repo when the ref already lives there", () => {
    expect(
      resolveBranchSelectionTarget({
        activeProjectCwd: "/repo",
        activeWorktreePath: "/repo/.t3/worktrees/feature-a",
        refName: {
          isDefault: true,
          worktreePath: "/repo",
        },
      }),
    ).toEqual({
      checkoutCwd: "/repo",
      nextWorktreePath: null,
      reuseExistingWorktree: true,
    });
  });

  it("keeps checkout in the current worktree for non-default refs", () => {
    expect(
      resolveBranchSelectionTarget({
        activeProjectCwd: "/repo",
        activeWorktreePath: "/repo/.t3/worktrees/feature-a",
        refName: {
          isDefault: false,
          worktreePath: null,
        },
      }),
    ).toEqual({
      checkoutCwd: "/repo/.t3/worktrees/feature-a",
      nextWorktreePath: "/repo/.t3/worktrees/feature-a",
      reuseExistingWorktree: false,
    });
  });
});

describe("shouldIncludeBranchPickerItem", () => {
  it("keeps the synthetic checkout PR item visible for gh pr checkout input", () => {
    expect(
      shouldIncludeBranchPickerItem({
        itemValue: "__checkout_pull_request__:1359",
        normalizedQuery: "gh pr checkout 1359",
        createBranchItemValue: "__create_new_branch__:gh pr checkout 1359",
        checkoutPullRequestItemValue: "__checkout_pull_request__:1359",
      }),
    ).toBe(true);
  });

  it("surfaces an existing ref matching the sanitized query", () => {
    expect(
      shouldIncludeBranchPickerItem({
        itemValue: "new-branch",
        normalizedQuery: "new branch",
        createBranchItemValue: null,
        checkoutPullRequestItemValue: null,
      }),
    ).toBe(true);
  });
});

describe("sanitizeNewRefName", () => {
  it("collapses a run of whitespace into a single dash", () => {
    expect(sanitizeNewRefName("new   branch")).toBe("new-branch");
  });

  it("replaces tabs, which git rejects just like spaces", () => {
    expect(sanitizeNewRefName("new\tbranch")).toBe("new-branch");
  });

  it("preserves whitespace that git accepts", () => {
    expect(sanitizeNewRefName("new\u00a0branch")).toBe("new\u00a0branch");
    expect(sanitizeNewRefName("new\u2009branch")).toBe("new\u2009branch");
  });

  it("does not collapse dashes the user typed", () => {
    expect(sanitizeNewRefName("new - branch")).toBe("new---branch");
    expect(sanitizeNewRefName("foo--bar")).toBe("foo--bar");
  });
});

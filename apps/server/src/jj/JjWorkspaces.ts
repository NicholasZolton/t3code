// @effect-diagnostics nodeBuiltinImport:off - the exported path helper is pure, so it cannot take
// the Path service; the operations below use the injected one.
import * as NodePath from "node:path";

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";

import type { VcsWorkflowOps } from "../git/GitWorkflowService.ts";
import * as JjProcess from "../vcs/JjProcess.ts";
import { localBookmarkRevset, refNameToRevset, splitRemoteRefName } from "../vcs/JjRevset.ts";
import type { JjSegmentRow, JjVcsDriverShape, JjWorkspace } from "../vcs/JjVcsDriver.ts";
import type * as VcsProcess from "../vcs/VcsProcess.ts";
import { jjFailure, mapJjFailure } from "./JjFailure.ts";
import {
  assertBookmarkUsable,
  trackRemoteBookmark,
  writeBookmarkUpstreamConfig,
  type JjRemoteOps,
} from "./JjRemotes.ts";
import { resolveWorkspaceRefName, strandedSegmentRows } from "./JjStatus.ts";
import { bookmarkDigest, isT3WorkspaceName, workspaceNameForRef } from "./JjWorkspaceNaming.ts";
import { resolveWorktreesDirectory } from "../worktreesDirectory.ts";
import { inspectWorkspaceFiles } from "../vcs/WorkspaceFileSafety.ts";
import { T3_PROJECT_FILE_NAME } from "@t3tools/contracts";
import { parseT3ProjectFile } from "@t3tools/shared/t3ProjectFile";
import { resolveProjectFileBackedSetting } from "@t3tools/shared/projectSettings";

export { isT3WorkspaceName, workspaceNameForRef } from "./JjWorkspaceNaming.ts";
const WORKSPACE_ADD_TIMEOUT_MS = 300_000;

/**
 * `<worktreesDir>/<repoName>/<refName with "/" → "-">`, the layout
 * `AgentSessionScanner.isT3ManagedWorktree` and `ReviewService.assertWorkspaceBoundCwd` classify
 * by string prefix. A workspace outside it stops being recognised as a thread environment.
 */
export function defaultWorkspacePathForRef(input: {
  readonly worktreesDir: string;
  readonly mainWorkspaceRoot: string;
  readonly refName: string;
  readonly projectFolders?: boolean;
}): string {
  const projectName = NodePath.basename(input.mainWorkspaceRoot);
  const directoryName = input.refName.replaceAll("/", "-");
  return NodePath.join(
    input.worktreesDir,
    ...(input.projectFolders === false ? [] : [projectName]),
    input.projectFolders === false ? `${projectName}-${directoryName}` : directoryName,
  );
}

export interface JjWorkspaceOpsDeps {
  readonly driver: JjVcsDriverShape;
  readonly process: VcsProcess.VcsProcess["Service"];
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly worktreesDir: string;
  readonly bookmarkTo: JjRemoteOps["bookmarkTo"];
}

export type JjWorkspaceOps = Pick<
  VcsWorkflowOps,
  "createWorktree" | "removeWorktree" | "pruneWorktrees"
>;

export const makeJjWorkspaces = (deps: JjWorkspaceOpsDeps): JjWorkspaceOps => {
  const { bookmarkTo, driver, fileSystem, path, process, worktreesDir } = deps;

  const run = JjProcess.jjRunner(process);

  const canonicalize = (value: string) =>
    fileSystem.realPath(value).pipe(Effect.orElseSucceed(() => value));

  const isJjWorkspaceDirectory = (candidate: string) =>
    fileSystem.exists(path.join(candidate, ".jj")).pipe(Effect.orElseSucceed(() => false));

  const forgetWorkspace = (operation: string, cwd: string, name: string) =>
    run(operation, cwd, ["workspace", "forget", name], {
      timeoutMs: 30_000,
    });

  const removeIfOnlyJjMetadata = (directory: string) =>
    Effect.gen(function* () {
      const entries = yield* fileSystem
        .readDirectory(directory)
        .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
      if (entries.length === 0 || (entries.length === 1 && entries[0] === ".jj")) {
        yield* fileSystem.remove(directory, { recursive: true }).pipe(Effect.ignore);
      }
    });

  const preserveRegisteredWorkspace = Effect.fn("JjWorkspaces.preserveRegisteredWorkspace")(
    function* (operation: string, cwd: string, name: string, bookmark: string) {
      const change = yield* driver
        .changeAt(cwd, `${name}@`)
        .pipe(
          mapJjFailure(operation, cwd, "Could not read the missing workspace's last snapshot."),
        );
      if (change === null)
        return yield* jjFailure(
          operation,
          cwd,
          "The missing workspace has no recoverable revision.",
        );
      const revision =
        change.empty && change.parentCommitIds.length === 1
          ? change.parentCommitIds[0]!
          : change.commitId;
      yield* bookmarkTo({ operation, cwd, name: bookmark, revset: revision });
    },
  );

  const createWorktree: JjWorkspaceOps["createWorktree"] = Effect.fn("JjWorkspaces.createWorktree")(
    function* (input, options) {
      const operation = "JjWorkspaces.createWorktree";
      const paths = yield* driver
        .ensureUsable(operation, input.cwd)
        .pipe(mapJjFailure(operation, input.cwd, "This Jujutsu repository cannot be used."));

      const remoteNames = yield* driver
        .listRemoteNames(input.cwd)
        .pipe(mapJjFailure(operation, input.cwd, "Could not read this repository's remotes."));
      const remoteBase = splitRemoteRefName(input.refName, remoteNames);
      if (remoteBase !== null) {
        // Tracked whenever a remote base is named, not only alongside `newRefName`: otherwise
        // `jj workspace add -r bookmarks(exact:"origin/featX")` registers a workspace and then
        // fails on an empty revision set, leaving a half-created directory behind.
        yield* trackRemoteBookmark({
          process,
          operation,
          cwd: input.cwd,
          gitDir: paths.gitDir,
          remoteName: remoteBase.remote,
          name: remoteBase.name,
        });
      }
      const baseRef = remoteBase?.name ?? input.refName;
      const baseRevset =
        remoteBase === null ? refNameToRevset(baseRef, []) : localBookmarkRevset(baseRef);
      const targetRef = input.newRefName ?? baseRef;
      const targetRevset =
        input.newRefName === undefined ? baseRevset : localBookmarkRevset(targetRef);
      const workspaceName = workspaceNameForRef(targetRef);

      const workspaces = yield* driver
        .listWorkspaces(input.cwd)
        .pipe(mapJjFailure(operation, input.cwd, "Could not list Jujutsu workspaces."));
      const existing = workspaces.find((workspace) => workspace.name === workspaceName);

      const existingRoot = existing?.root ?? null;
      if (existing !== undefined) {
        const healthy =
          existingRoot !== null &&
          (yield* fileSystem.exists(existingRoot).pipe(Effect.orElseSucceed(() => false))) &&
          (yield* isJjWorkspaceDirectory(existingRoot));
        if (healthy && existingRoot !== null) {
          return { worktree: { path: existingRoot, refName: targetRef } };
        }
        // A registered workspace whose directory is gone, or that holds no `.jj`, is the
        // half-created state a failed `jj workspace add` leaves behind.
        yield* preserveRegisteredWorkspace(operation, input.cwd, workspaceName, targetRef);
        yield* forgetWorkspace(operation, paths.mainWorkspaceRoot, workspaceName).pipe(
          mapJjFailure(operation, input.cwd, "Could not deregister the missing workspace."),
        );
        if (existingRoot !== null) {
          yield* removeIfOnlyJjMetadata(existingRoot);
        }
      }

      const workspaceDirectory = resolveWorktreesDirectory(
        options?.worktreesDirectory ?? "",
        worktreesDir,
        path,
      );
      if (workspaceDirectory === null && input.path == null) {
        return yield* jjFailure(
          "createWorktree",
          input.cwd,
          "The worktree location must be an absolute path other than a filesystem root. Update it in Settings → Storage.",
        );
      }
      const requestedPath =
        input.path ??
        defaultWorkspacePathForRef({
          worktreesDir: workspaceDirectory ?? worktreesDir,
          mainWorkspaceRoot: paths.mainWorkspaceRoot,
          refName: targetRef,
          ...(options?.projectFolders !== undefined
            ? { projectFolders: options.projectFolders }
            : {}),
        });
      const resolvedRequestedPath = yield* canonicalize(requestedPath);
      const takenByAnotherWorkspace = workspaces.some(
        (workspace) =>
          workspace.name !== workspaceName &&
          workspace.root !== null &&
          workspace.root === resolvedRequestedPath,
      );
      const worktreePath = takenByAnotherWorkspace
        ? `${requestedPath}-${bookmarkDigest(targetRef)}`
        : requestedPath;

      const destinationExisted = yield* fileSystem
        .exists(worktreePath)
        .pipe(Effect.orElseSucceed(() => false));
      if (destinationExisted) {
        const info = yield* fileSystem
          .stat(worktreePath)
          .pipe(mapJjFailure(operation, input.cwd, "Could not inspect the workspace destination."));
        if (info.type !== "Directory")
          return yield* jjFailure(
            operation,
            input.cwd,
            `${worktreePath} already exists and is not a directory.`,
          );
        const entries = yield* fileSystem
          .readDirectory(worktreePath)
          .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
        if (entries.length > 0) {
          return yield* Effect.fail(
            jjFailure(
              operation,
              input.cwd,
              `${worktreePath} already exists and is not a Jujutsu workspace.`,
            ),
          );
        }
      }

      yield* assertBookmarkUsable(driver, operation, input.cwd, targetRef);
      const localBookmarkExists =
        input.newRefName !== undefined &&
        (yield* driver
          .listBookmarks(input.cwd)
          .pipe(mapJjFailure(operation, input.cwd, "Could not list Jujutsu bookmarks."))).some(
          (bookmark) => bookmark.remote === null && bookmark.name === input.newRefName,
        );
      if (input.newRefName !== undefined && !localBookmarkExists) {
        yield* run(
          operation,
          input.cwd,
          ["bookmark", "create", input.newRefName, "-r", baseRevset],
          { timeoutMs: 20_000 },
        ).pipe(
          mapJjFailure(operation, input.cwd, `Could not create bookmark ${input.newRefName}.`),
        );
      }

      const rollbackBookmark =
        input.newRefName !== undefined && !localBookmarkExists
          ? run(operation, input.cwd, ["bookmark", "delete", input.newRefName], {
              timeoutMs: 20_000,
            }).pipe(Effect.ignore)
          : Effect.void;

      let workspaceAdded = false;
      // jj creates only the leaf directory; a missing parent fails with "Cannot access ...".
      yield* Effect.gen(function* () {
        yield* fileSystem
          .makeDirectory(path.dirname(worktreePath), { recursive: true })
          .pipe(
            mapJjFailure(operation, input.cwd, `Could not create ${path.dirname(worktreePath)}.`),
          );

        // `-r X` means "@ is a fresh empty child of X". The bookmark stays on X and the thread's
        // edits land in `@`, which is git's `worktree add -b new base` translated.
        yield* run(
          operation,
          input.cwd,
          [
            "workspace",
            "add",
            "--name",
            workspaceName,
            "-m",
            `t3:${targetRef}`,
            "-r",
            targetRevset,
            worktreePath,
          ],
          { timeoutMs: WORKSPACE_ADD_TIMEOUT_MS },
        ).pipe(
          mapJjFailure(operation, input.cwd, `Could not create a workspace at ${worktreePath}.`),
        );
        workspaceAdded = true;

        yield* options?.progress?.onWorktreeClaimed?.(worktreePath) ?? Effect.void;
        if (
          yield* fileSystem
            .exists(path.join(worktreePath, ".gitmodules"))
            .pipe(mapJjFailure(operation, input.cwd, "Could not inspect submodule configuration."))
        ) {
          const projectFile =
            options?.submodules != null
              ? null
              : yield* fileSystem
                  .readFileString(path.join(worktreePath, T3_PROJECT_FILE_NAME))
                  .pipe(
                    Effect.map(parseT3ProjectFile),
                    Effect.orElseSucceed(() => null),
                  );
          const submodules = resolveProjectFileBackedSetting(
            "worktreeSubmodules",
            options?.submodules ?? null,
            projectFile,
          );
          if (submodules.value !== "none") {
            return yield* jjFailure(
              operation,
              input.cwd,
              "Jujutsu workspace creation does not support initializing Git submodules.",
            );
          }
          yield* (
            options?.progress?.onSubmodulesDisabled?.({
              source: submodules.source === "t3.json" ? "t3.json" : "settings",
            }) ?? Effect.void
          );
        }
        yield* JjProcess.exportGitRefs(process, operation, input.cwd).pipe(
          mapJjFailure(operation, input.cwd, "Could not synchronize the workspace bookmark."),
        );
      }).pipe(
        Effect.onError(() =>
          Effect.all(
            [
              rollbackBookmark.pipe(
                Effect.andThen(
                  JjProcess.exportGitRefs(process, operation, input.cwd).pipe(Effect.ignore),
                ),
              ),
              forgetWorkspace(operation, paths.mainWorkspaceRoot, workspaceName).pipe(
                Effect.ignore,
              ),
              Effect.gen(function* () {
                if (workspaceAdded) yield* fileSystem.remove(worktreePath, { recursive: true });
                else yield* removeIfOnlyJjMetadata(worktreePath);
                if (destinationExisted)
                  yield* fileSystem.makeDirectory(worktreePath, { recursive: true });
              }).pipe(Effect.ignore),
            ],
            { discard: true },
          ),
        ),
      );

      const baseRefNameForConfig =
        input.baseRefName === undefined
          ? undefined
          : (splitRemoteRefName(input.baseRefName, remoteNames)?.name ?? input.baseRefName);
      yield* writeWorktreeGitConfig({
        process,
        gitDir: paths.gitDir,
        cwd: input.cwd,
        targetRef,
        ...(remoteBase !== null ? { upstreamRemoteName: remoteBase.remote } : {}),
        ...(input.newRefName !== undefined ? { newRefName: input.newRefName } : {}),
        ...(baseRefNameForConfig !== undefined ? { baseRefName: baseRefNameForConfig } : {}),
      });

      return { worktree: { path: worktreePath, refName: targetRef } };
    },
  );

  const removeWorktree: JjWorkspaceOps["removeWorktree"] = Effect.fn("JjWorkspaces.removeWorktree")(
    function* (input) {
      const operation = "JjWorkspaces.removeWorktree";
      const paths = yield* driver
        .ensureUsable(operation, input.cwd)
        .pipe(mapJjFailure(operation, input.cwd, "This Jujutsu repository cannot be used."));
      const workspaces = yield* driver
        .listWorkspaces(input.cwd)
        .pipe(mapJjFailure(operation, input.cwd, "Could not list Jujutsu workspaces."));

      const target = yield* canonicalize(input.path);
      // A workspace jj lists with no root has lost its directory, and an empty root realpaths to
      // the server's own cwd, so a null root must never match anything.
      const matched = workspaces.find(
        (workspace): workspace is JjWorkspace & { readonly root: string } =>
          workspace.root !== null && workspace.root === target,
      );

      if (matched === undefined) {
        return yield* Effect.fail(
          jjFailure(operation, input.cwd, `No Jujutsu workspace is registered at ${input.path}.`),
        );
      }
      if (matched.name === "default" || matched.root === paths.mainWorkspaceRoot) {
        // `jj workspace forget default` is permitted by jj and leaves the main root without a
        // working copy; `git worktree remove` refuses the main worktree, and so does this.
        return yield* Effect.fail(
          jjFailure(
            operation,
            input.cwd,
            `${input.path} is the main Jujutsu workspace and cannot be removed.`,
          ),
        );
      }

      const directoryExists = yield* fileSystem
        .exists(matched.root)
        .pipe(Effect.orElseSucceed(() => false));
      if (!directoryExists) {
        yield* forgetWorkspace(operation, paths.mainWorkspaceRoot, matched.name).pipe(
          Effect.ignore,
        );
        return;
      }

      // `currentChange`, not `changeAt`: `changeAt` always passes `--ignore-working-copy` and so
      // reports the last snapshot, under which an agent that just wrote files reads as empty.
      const change = yield* driver.currentChange(input.path).pipe(Effect.option);
      const segment = yield* driver
        .currentSegment(input.path)
        .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<JjSegmentRow>));
      const stranded = strandedSegmentRows(segment).length > 0;
      // An unreadable workspace is not a licence to delete it.
      const dirty = Option.isNone(change) || !change.value.empty || stranded;

      if (input.force !== true && Option.isSome(change)) {
        const unpreserved = yield* inspectWorkspaceFiles({
          cwd: input.path,
          repositoryCwd: paths.mainWorkspaceRoot,
          revision: change.value.commitId,
          fileSystem,
          path,
          execute: (request) =>
            JjProcess.colocatedGitCommand(
              process,
              request.operation,
              { gitDir: paths.gitDir, cwd: request.cwd },
              request.args,
              {
                ...(request.env ? { env: request.env } : {}),
                ...(request.maxOutputBytes !== undefined
                  ? { maxOutputBytes: request.maxOutputBytes }
                  : {}),
              },
            ).pipe(
              mapJjFailure(
                operation,
                input.cwd,
                "Could not inspect files outside the Jujutsu snapshot.",
              ),
            ),
        }).pipe(
          mapJjFailure(
            operation,
            input.cwd,
            "Could not inspect files outside the Jujutsu snapshot.",
          ),
        );
        if (unpreserved.hasUnpreservedFiles)
          return yield* jjFailure(
            operation,
            input.cwd,
            "Workspace contains untracked or ignored local files that would be lost. Remove it with force to discard them.",
          );
      }

      if (
        dirty &&
        input.force !== true &&
        !(Option.isSome(change) && change.value.empty && stranded)
      ) {
        return yield* Effect.fail(
          jjFailure(
            operation,
            input.cwd,
            "Workspace has uncommitted or unbookmarked changes. Remove it with force to discard them.",
          ),
        );
      }

      const segmentBookmark = yield* resolveWorkspaceRefName(driver, input.path, segment);
      if (
        stranded &&
        segmentBookmark !== null &&
        workspaceNameForRef(segmentBookmark) === matched.name
      ) {
        // `jj workspace add -r <bookmark>` leaves the bookmark on the base, so the agent's own
        // commits sit on no ref. Moving the bookmark to `@-` first is the jj spelling of what
        // git's worktree branch does for free. Preservation must finish before removing the workspace.
        yield* bookmarkTo({
          cwd: input.path,
          name: segmentBookmark,
          revset: "@-",
          operation,
        });
      } else if (stranded) {
        return yield* jjFailure(
          operation,
          input.cwd,
          "Committed workspace changes have no recoverable bookmark. Create one before removing the workspace.",
        );
      }

      yield* forgetWorkspace(operation, paths.mainWorkspaceRoot, matched.name).pipe(
        mapJjFailure(operation, input.cwd, `Could not forget workspace ${matched.name}.`),
      );
      yield* fileSystem
        .remove(input.path, { recursive: true })
        .pipe(mapJjFailure(operation, input.cwd, `Could not delete ${input.path}.`));
    },
  );

  const pruneWorktrees: JjWorkspaceOps["pruneWorktrees"] = Effect.fn("JjWorkspaces.pruneWorktrees")(
    function* (input) {
      const operation = "JjWorkspaces.pruneWorktrees";
      const paths = yield* driver
        .ensureUsable(operation, input.cwd)
        .pipe(mapJjFailure(operation, input.cwd, "This Jujutsu repository cannot be used."));
      const workspaces = yield* driver
        .listWorkspaces(input.cwd)
        .pipe(mapJjFailure(operation, input.cwd, "Could not list Jujutsu workspaces."));

      const bookmarks = yield* driver
        .listBookmarks(input.cwd)
        .pipe(mapJjFailure(operation, input.cwd, "Could not read recreation bookmarks."));
      for (const workspace of workspaces) {
        // The name filter keeps a user's own workspace on an unmounted volume registered; only
        // directories T3 created are reclaimed. `default` can never match.
        if (!isT3WorkspaceName(workspace.name)) {
          continue;
        }
        const present =
          workspace.root !== null &&
          (yield* fileSystem.exists(workspace.root).pipe(Effect.orElseSucceed(() => false)));
        if (present) {
          continue;
        }
        const bookmark = bookmarks.find(
          (entry) => entry.remote === null && workspaceNameForRef(entry.name) === workspace.name,
        );
        if (bookmark === undefined) continue;
        yield* preserveRegisteredWorkspace(operation, input.cwd, workspace.name, bookmark.name);
        yield* forgetWorkspace(operation, paths.mainWorkspaceRoot, workspace.name).pipe(
          mapJjFailure(operation, input.cwd, "Could not deregister the missing workspace."),
        );
      }
    },
  );

  return { createWorktree, removeWorktree, pruneWorktrees };
};

/**
 * The per-thread PR base and upstream, written where git records them. A jj bookmark is
 * `refs/heads/<name>` in the colocated store, so the whole git-side PR machinery reads these back.
 * The upstream keys go on the thread's own bookmark, not on the base it was cut from: they are what
 * `resolveBranchHeadContext` reads to decide whether a pull request head is cross-repository.
 */
const writeWorktreeGitConfig = Effect.fn("JjWorkspaces.writeWorktreeGitConfig")(function* (input: {
  readonly process: VcsProcess.VcsProcess["Service"];
  readonly gitDir: string | null;
  readonly cwd: string;
  readonly targetRef: string;
  readonly upstreamRemoteName?: string;
  readonly newRefName?: string;
  readonly baseRefName?: string;
}): Effect.fn.Return<void, never> {
  const gitDir = input.gitDir;
  if (gitDir === null) {
    return;
  }
  if (input.upstreamRemoteName !== undefined) {
    yield* writeBookmarkUpstreamConfig(input.process, {
      gitDir,
      cwd: input.cwd,
      name: input.targetRef,
      remoteName: input.upstreamRemoteName,
    });
  }
  if (input.newRefName === undefined || input.baseRefName === undefined) {
    return;
  }
  yield* JjProcess.colocatedGitCommand(
    input.process,
    "JjWorkspaces.writeWorktreeGitConfig",
    { gitDir, cwd: input.cwd },
    ["config", `branch.${input.newRefName}.gh-merge-base`, input.baseRefName],
    { allowNonZeroExit: true, timeoutMs: 10_000 },
  ).pipe(Effect.ignore);
});

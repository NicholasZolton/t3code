import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  GitManagerError,
  GitCommandError,
  type VcsSwitchRefInput,
  type VcsSwitchRefResult,
  type VcsCreateRefInput,
  type VcsCreateRefResult,
  type VcsCreateWorktreeInput,
  type VcsCreateWorktreeResult,
  type VcsListRefsInput,
  type VcsListRefsResult,
  type GitManagerServiceError,
  type GitPreparePullRequestThreadInput,
  type GitPreparePullRequestThreadResult,
  type GitPullRequestRefInput,
  type VcsPullResult,
  type VcsRemoveWorktreeInput,
  type GitResolvePullRequestResult,
  type GitRunStackedActionInput,
  type GitRunStackedActionResult,
  type VcsStatusInput,
  type VcsStatusLocalResult,
  type VcsStatusRemoteResult,
  type VcsStatusResult,
  type VcsError,
} from "@t3tools/contracts";

import * as JjWorkflow from "../jj/JjWorkflow.ts";
import * as GitManager from "./GitManager.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { makeWorkspaceOwnership, type WorkspaceKind } from "../vcs/WorkspaceOwnership.ts";
import { inspectWorkspaceFiles } from "../vcs/WorkspaceFileSafety.ts";
import { workspaceNameForRef } from "../jj/JjWorkspaceNaming.ts";
import { workspaceSettings, makeWorkspaceQueries } from "../project/WorkspaceSettings.ts";

export interface WorkspaceCleanupInspection {
  readonly revision: string;
  readonly refName: string | null;
  readonly hasWorkingTreeChanges: boolean;
  readonly hasUnpreservedFiles: boolean;
  readonly isSecondary: boolean;
}

/**
 * The workflow surface every VCS kind implements. `GitWorkflowService` routes by kind; the Git and
 * Jujutsu implementations both satisfy this type, so a future change to a shared signature fails to
 * compile in both lanes instead of silently drifting in one.
 */
export interface VcsWorkflowOps {
  readonly hasCommit: (input: {
    readonly cwd: string;
    readonly refName: string;
  }) => Effect.Effect<boolean, GitCommandError>;
  readonly status: (
    input: VcsStatusInput,
  ) => Effect.Effect<VcsStatusResult, GitManagerServiceError>;
  readonly localStatus: (
    input: VcsStatusInput,
  ) => Effect.Effect<VcsStatusLocalResult, GitManagerServiceError>;
  readonly remoteStatus: (
    input: VcsStatusInput,
    options?: GitManager.GitRemoteStatusOptions,
  ) => Effect.Effect<VcsStatusRemoteResult | null, GitManagerServiceError>;
  readonly invalidateLocalStatus: (cwd: string) => Effect.Effect<void, never>;
  readonly invalidateRemoteStatus: (cwd: string) => Effect.Effect<void, never>;
  readonly invalidateStatus: (cwd: string) => Effect.Effect<void, never>;
  readonly pullCurrentBranch: (cwd: string) => Effect.Effect<VcsPullResult, GitCommandError>;
  readonly runStackedAction: (
    input: GitRunStackedActionInput,
    options?: GitManager.GitRunStackedActionOptions,
  ) => Effect.Effect<GitRunStackedActionResult, GitManagerServiceError>;
  readonly resolvePullRequest: (
    input: GitPullRequestRefInput,
  ) => Effect.Effect<GitResolvePullRequestResult, GitManagerServiceError>;
  readonly preparePullRequestThread: (
    input: GitPreparePullRequestThreadInput,
  ) => Effect.Effect<GitPreparePullRequestThreadResult, GitManagerServiceError>;
  readonly listRefs: (input: VcsListRefsInput) => Effect.Effect<VcsListRefsResult, GitCommandError>;
  readonly createWorktree: (
    input: VcsCreateWorktreeInput,
    options?: GitVcsDriver.CreateWorktreeOptions,
  ) => Effect.Effect<VcsCreateWorktreeResult, GitCommandError>;
  readonly listLocalBranchNames: (cwd: string) => Effect.Effect<string[], GitCommandError>;
  readonly fetchRemote: (input: {
    readonly cwd: string;
    readonly remoteName: string;
    readonly refName?: string;
  }) => Effect.Effect<void, GitCommandError>;
  readonly remoteExists: (input: {
    readonly cwd: string;
    readonly remoteName: string;
  }) => Effect.Effect<boolean, GitCommandError>;
  readonly remoteBranchExists: (input: {
    readonly cwd: string;
    readonly remoteName: string;
    readonly refName: string;
  }) => Effect.Effect<boolean, GitCommandError>;
  readonly resolveRemoteTrackingCommit: (input: {
    readonly cwd: string;
    readonly refName: string;
    readonly fallbackRemoteName: string;
  }) => Effect.Effect<
    { readonly commitSha: string; readonly remoteRefName: string },
    GitCommandError
  >;
  readonly removeWorktree: (input: VcsRemoveWorktreeInput) => Effect.Effect<void, GitCommandError>;
  readonly pruneWorktrees: (input: {
    readonly cwd: string;
  }) => Effect.Effect<void, GitCommandError>;
  readonly createRef: (
    input: VcsCreateRefInput,
  ) => Effect.Effect<VcsCreateRefResult, GitCommandError>;
  readonly switchRef: (
    input: VcsSwitchRefInput,
  ) => Effect.Effect<VcsSwitchRefResult, GitCommandError>;
  readonly renameBranch: (input: {
    readonly exactName?: boolean;
    readonly cwd: string;
    readonly oldBranch: string;
    readonly newBranch: string;
  }) => Effect.Effect<{ readonly branch: string }, GitManagerServiceError>;
}

type WorkflowKind = "git" | "jj";

/** Routes every workflow call to the driver that owns the directory it names. */
export class GitWorkflowService extends Context.Service<
  GitWorkflowService,
  VcsWorkflowOps & {
    readonly deleteLocalBranch: (
      input: GitVcsDriver.GitDeleteLocalBranchInput,
    ) => Effect.Effect<void, GitCommandError>;
    readonly ensureWorkspace: (
      input: VcsCreateWorktreeInput & { readonly path: string },
      options?: GitVcsDriver.CreateWorktreeOptions,
    ) => Effect.Effect<void, GitCommandError>;
    readonly inspectWorkspaceForCleanup: (
      cwd: string,
    ) => Effect.Effect<WorkspaceCleanupInspection, GitCommandError>;
    readonly workspaceIntegrationBase: (input: {
      readonly cwd: string;
      readonly refresh: boolean;
    }) => Effect.Effect<string | null, GitCommandError>;
    readonly isRevisionAncestor: (input: {
      readonly cwd: string;
      readonly from: string;
      readonly to: string;
    }) => Effect.Effect<boolean, GitCommandError>;
    readonly branchPullRequest: GitManager.GitManager["Service"]["branchPullRequest"];
    /** Whether a Git or Jujutsu driver owns this directory. */
    readonly isRepository: (cwd: string) => Effect.Effect<boolean, GitManagerServiceError>;
  }
>()("t3/git/GitWorkflowService") {}

function nonRepositoryLocalStatus(): VcsStatusLocalResult {
  return {
    isRepo: false,
    hasPrimaryRemote: false,
    isDefaultRef: false,
    refName: null,
    hasWorkingTreeChanges: false,
    workingTree: {
      files: [],
      insertions: 0,
      deletions: 0,
    },
  };
}

function nonRepositoryStatus(): VcsStatusResult {
  return {
    ...nonRepositoryLocalStatus(),
    hasUpstream: false,
    aheadCount: 0,
    behindCount: 0,
    aheadOfDefaultCount: 0,
    pr: null,
  };
}

function nonRepositoryListRefs(): VcsListRefsResult {
  return {
    refs: [],
    isRepo: false,
    hasPrimaryRemote: false,
    nextCursor: null,
    totalCount: 0,
  };
}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const withWorkspaceQueries = yield* makeWorkspaceQueries;
  const settingsService = yield* ServerSettingsService;
  const registry = yield* VcsDriverRegistry.VcsDriverRegistry;
  const git = yield* GitVcsDriver.GitVcsDriver;
  const gitManager = yield* GitManager.GitManager;
  const jjWorkflow = yield* JjWorkflow.JjWorkflow;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ownership = makeWorkspaceOwnership({ fileSystem, path, execute: git.execute });
  const workspaceOps = { git, jj: jjWorkflow };

  const commandFailure = (operation: string, cwd: string) =>
    Effect.mapError((cause) =>
      Schema.is(GitCommandError)(cause)
        ? cause
        : new GitCommandError({
            operation,
            command: "vcs",
            cwd,
            detail: "The workspace operation failed.",
            cause,
          }),
    );

  /**
   * The driver kind that owns a project cwd. `null` means "not a repository", which is what the
   * `nonRepository*` shapes already express, and an unknown kind degrades to it too. A detection
   * *failure* is a different thing and stays in the error channel: reporting a healthy repository
   * as absent hides the real reason from every caller and from the user.
   */
  const resolveWorkflowKind = (cwd: string): Effect.Effect<WorkflowKind | null, VcsError> =>
    registry
      .detect({ cwd })
      .pipe(
        Effect.map((handle) =>
          handle?.kind === "git" || handle?.kind === "jj" ? handle.kind : null,
        ),
      );

  const resolveWorkspaceKind = Effect.fn("GitWorkflowService.resolveWorkspaceKind")(
    function* (input: { readonly cwd: string; readonly path: string; readonly refName?: string }) {
      const detected = yield* resolveWorkflowKind(input.path);
      if (detected !== null) return detected;
      const remembered = yield* ownership.read(input);
      if (remembered !== null) return remembered;
      const repositoryCwd = yield* ownership.repositoryCwd(input.cwd);
      const registered = yield* git.execute({
        operation: "GitWorkflowService.registeredWorkspaces",
        cwd: repositoryCwd,
        args: ["worktree", "list", "--porcelain", "-z"],
      });
      const normalized = yield* ownership.normalize(input.path);
      for (const row of registered.stdout.split("\0")) {
        if (
          row.startsWith("worktree ") &&
          (yield* ownership.normalize(row.slice(9))) === normalized
        )
          return "git" as const;
      }
      if ((yield* resolveWorkflowKind(input.cwd)) === "jj") {
        const workspaces = yield* jjWorkflow.registeredWorkspaces(input.cwd);
        for (const workspace of workspaces) {
          if (
            workspace.root !== null &&
            (yield* ownership.normalize(workspace.root)) === normalized
          )
            return "jj" as const;
          if (
            workspace.root === null &&
            input.refName !== undefined &&
            workspace.name === workspaceNameForRef(input.refName)
          )
            return "jj" as const;
        }
      }
      return yield* new GitCommandError({
        operation: "GitWorkflowService.resolveWorkspaceKind",
        command: "vcs",
        cwd: input.cwd,
        detail: `The original VCS owner of ${input.path} is unavailable. Restore its registration before resuming.`,
      });
    },
  );

  const createWorkspaceWithKind = Effect.fn("GitWorkflowService.createWorkspaceWithKind")(
    function* (
      kind: WorkspaceKind,
      input: VcsCreateWorktreeInput,
      options?: GitVcsDriver.CreateWorktreeOptions,
    ) {
      const settings = yield* workspaceSettings(input).pipe(
        withWorkspaceQueries,
        Effect.provideService(ServerSettingsService, settingsService),
      );
      const result = yield* workspaceOps[kind].createWorktree(input, {
        ...options,
        worktreesDirectory: options?.worktreesDirectory ?? settings.worktreesDirectory,
        projectFolders: options?.projectFolders ?? settings.worktreeProjectFolders,
        submodules: options?.submodules ?? settings.worktreeSubmodules,
      });
      yield* ownership.remember({ cwd: input.cwd, path: result.worktree.path, kind });
      return result;
    },
  );

  const notARepositoryCommand = (operation: string, cwd: string) =>
    Effect.fail(
      new GitCommandError({
        operation,
        command: "vcs-route",
        cwd,
        detail: `The ${operation} command found no version control repository here.`,
      }),
    );

  const notARepositoryWorkflow = (operation: string, cwd: string) =>
    Effect.fail(
      new GitManagerError({
        operation,
        cwd,
        detail: `The ${operation} workflow found no version control repository here. (${cwd})`,
      }),
    );

  const undetectableCommand = (operation: string, cwd: string) =>
    Effect.mapError(
      (cause: VcsError) =>
        new GitCommandError({
          operation,
          command: "vcs-route",
          cwd,
          detail: "Could not determine which version control system manages this directory.",
          cause,
        }),
    );

  const undetectableWorkflow = (operation: string, cwd: string) =>
    Effect.mapError(
      (cause: VcsError) =>
        new GitManagerError({
          operation,
          cwd,
          detail: `Could not determine which version control system manages this directory. (${cwd})`,
          cause,
        }),
    );

  const commandRouting = {
    kind: (operation: string, cwd: string) =>
      resolveWorkflowKind(cwd).pipe(undetectableCommand(operation, cwd)),
    notARepository: notARepositoryCommand,
  };

  const workflowRouting = {
    kind: (operation: string, cwd: string) =>
      resolveWorkflowKind(cwd).pipe(undetectableWorkflow(operation, cwd)),
    notARepository: notARepositoryWorkflow,
  };

  type Routing<Error> = {
    readonly kind: (operation: string, cwd: string) => Effect.Effect<WorkflowKind | null, Error>;
    readonly notARepository: (operation: string, cwd: string) => Effect.Effect<never, Error>;
  };

  type RouteArms<Input, Output, Error> = {
    readonly git: (input: Input) => Effect.Effect<Output, Error>;
    readonly jj: (input: Input) => Effect.Effect<Output, Error>;
  };

  /** Routes on the project cwd; `fallback` answers for a directory that is not a repository. */
  const routeOr =
    <Input extends { readonly cwd: string }, Output, Error>(
      operation: string,
      routing: Routing<Error>,
      fallback: (operation: string, cwd: string) => Effect.Effect<Output, Error>,
      arms: RouteArms<Input, Output, Error>,
    ) =>
    (input: Input) =>
      routing
        .kind(operation, input.cwd)
        .pipe(
          Effect.flatMap((kind) =>
            kind === null ? fallback(operation, input.cwd) : arms[kind](input),
          ),
        );

  /** Routes on the project cwd, failing when the directory is not a repository at all. */
  const route = <Input extends { readonly cwd: string }, Output, Error>(
    operation: string,
    routing: Routing<Error>,
    arms: RouteArms<Input, Output, Error>,
  ) => routeOr<Input, Output, Error>(operation, routing, routing.notARepository, arms);

  return GitWorkflowService.of({
    isRepository: (cwd) =>
      registry.detect({ cwd }).pipe(
        Effect.map((handle) => handle !== null && handle.kind !== "unknown"),
        Effect.mapError(
          (cause) =>
            new GitManagerError({
              operation: "GitWorkflowService.isRepository",
              cwd,
              detail: "Failed to detect a VCS repository for this Git workflow.",
              cause,
            }),
        ),
      ),
    hasCommit: route("GitWorkflowService.hasCommit", commandRouting, {
      git: (input: { readonly cwd: string; readonly refName: string }) =>
        git
          .execute({
            operation: "GitWorkflowService.hasCommit",
            cwd: input.cwd,
            args: ["rev-parse", "--verify", `${input.refName}^{commit}`],
            allowNonZeroExit: true,
          })
          .pipe(Effect.map((result) => result.exitCode === 0)),
      jj: jjWorkflow.hasCommit,
    }),
    status: routeOr(
      "GitWorkflowService.status",
      workflowRouting,
      () => Effect.succeed(nonRepositoryStatus()),
      { git: gitManager.status, jj: jjWorkflow.status },
    ),
    localStatus: routeOr(
      "GitWorkflowService.localStatus",
      workflowRouting,
      () => Effect.succeed(nonRepositoryLocalStatus()),
      { git: gitManager.localStatus, jj: jjWorkflow.localStatus },
    ),
    remoteStatus: (input, options) =>
      routeOr("GitWorkflowService.remoteStatus", workflowRouting, () => Effect.succeed(null), {
        git: (statusInput: VcsStatusInput) => gitManager.remoteStatus(statusInput, options),
        jj: (statusInput: VcsStatusInput) => jjWorkflow.remoteStatus(statusInput, options),
      })(input),
    // Pure cache drops with no error channel: resolving the kind first would cost a detect on a
    // hot path for no benefit.
    invalidateLocalStatus: (cwd) =>
      Effect.all([gitManager.invalidateLocalStatus(cwd), jjWorkflow.invalidateLocalStatus(cwd)], {
        discard: true,
      }),
    invalidateRemoteStatus: (cwd) =>
      Effect.all([gitManager.invalidateRemoteStatus(cwd), jjWorkflow.invalidateRemoteStatus(cwd)], {
        discard: true,
      }),
    invalidateStatus: (cwd) =>
      Effect.all([gitManager.invalidateStatus(cwd), jjWorkflow.invalidateStatus(cwd)], {
        discard: true,
      }),
    pullCurrentBranch: (cwd) =>
      route("GitWorkflowService.pullCurrentBranch", commandRouting, {
        git: () => git.pullCurrentBranch(cwd),
        jj: () => jjWorkflow.pullCurrentBranch(cwd),
      })({ cwd }),
    runStackedAction: (input, options) =>
      route("GitWorkflowService.runStackedAction", workflowRouting, {
        git: (actionInput: GitRunStackedActionInput) =>
          gitManager.runStackedAction(actionInput, options),
        jj: (actionInput: GitRunStackedActionInput) =>
          jjWorkflow.runStackedAction(actionInput, options),
      })(input),
    resolvePullRequest: route("GitWorkflowService.resolvePullRequest", workflowRouting, {
      git: gitManager.resolvePullRequest,
      jj: jjWorkflow.resolvePullRequest,
    }),
    preparePullRequestThread: (input) =>
      route("GitWorkflowService.preparePullRequestThread", workflowRouting, {
        git: gitManager.preparePullRequestThread,
        jj: jjWorkflow.preparePullRequestThread,
      })(input).pipe(
        Effect.tap((result) =>
          result.worktreePath === null
            ? Effect.void
            : Effect.gen(function* () {
                const workspacePath = result.worktreePath;
                if (workspacePath === null) return;
                const kind = yield* resolveWorkspaceKind({ cwd: input.cwd, path: workspacePath });
                yield* ownership.remember({ cwd: input.cwd, path: workspacePath, kind });
              }).pipe(commandFailure("GitWorkflowService.preparePullRequestThread", input.cwd)),
        ),
      ),
    listRefs: routeOr(
      "GitWorkflowService.listRefs",
      commandRouting,
      () => Effect.succeed(nonRepositoryListRefs()),
      { git: git.listRefs, jj: jjWorkflow.listRefs },
    ),
    createWorktree: (input, options) =>
      route("GitWorkflowService.createWorktree", commandRouting, {
        git: (worktreeInput: VcsCreateWorktreeInput) =>
          createWorkspaceWithKind("git", worktreeInput, options).pipe(
            commandFailure("GitWorkflowService.createWorktree", input.cwd),
          ),
        jj: (worktreeInput: VcsCreateWorktreeInput) =>
          createWorkspaceWithKind("jj", worktreeInput, options).pipe(
            commandFailure("GitWorkflowService.createWorktree", input.cwd),
          ),
      })(input),
    ensureWorkspace: (input, options) =>
      Effect.gen(function* () {
        const kind = yield* resolveWorkspaceKind(input);
        yield* ownership.remember({ cwd: input.cwd, path: input.path, kind });
        if (yield* fileSystem.exists(input.path)) return;
        const repositoryCwd = yield* ownership.repositoryCwd(input.cwd);
        yield* workspaceOps[kind].pruneWorktrees({ cwd: repositoryCwd });
        yield* createWorkspaceWithKind(kind, input, options);
      }).pipe(commandFailure("GitWorkflowService.ensureWorkspace", input.cwd)),
    inspectWorkspaceForCleanup: (cwd) =>
      Effect.gen(function* () {
        if ((yield* resolveWorkflowKind(cwd)) === "jj")
          return yield* jjWorkflow.inspectWorkspaceForCleanup(cwd);
        const local = yield* git.statusDetailsLocal(cwd);
        const head = yield* git.resolveCommit({ cwd, revision: "HEAD" });
        const marker = yield* fileSystem.stat(path.join(cwd, ".git"));
        const unpreserved = yield* inspectWorkspaceFiles({
          cwd,
          repositoryCwd: cwd,
          revision: head.commitSha,
          fileSystem,
          path,
          execute: git.execute,
        });
        return {
          revision: head.commitSha,
          refName: local.branch,
          hasWorkingTreeChanges: local.hasWorkingTreeChanges,
          hasUnpreservedFiles: unpreserved.hasUnpreservedFiles,
          isSecondary: marker.type === "File",
        };
      }).pipe(commandFailure("GitWorkflowService.inspectWorkspaceForCleanup", cwd)),
    workspaceIntegrationBase: (input) =>
      Effect.gen(function* () {
        if ((yield* resolveWorkflowKind(input.cwd)) === "jj")
          return yield* jjWorkflow.workspaceIntegrationBase(input);
        const remote = yield* git.resolvePrimaryRemoteName(input.cwd);
        const refName = yield* git.resolveDefaultBranchName(input.cwd, remote);
        if (refName === null) return null;
        if (input.refresh)
          yield* git.fetchRemoteTrackingBranch({
            cwd: input.cwd,
            remoteName: remote,
            remoteBranch: refName,
          });
        return (yield* git.resolveCommit({
          cwd: input.cwd,
          revision: `refs/remotes/${remote}/${refName}`,
        })).commitSha;
      }).pipe(commandFailure("GitWorkflowService.workspaceIntegrationBase", input.cwd)),
    isRevisionAncestor: (input) =>
      Effect.gen(function* () {
        const cwd = yield* ownership.repositoryCwd(input.cwd);
        const result = yield* git.execute({
          operation: "GitWorkflowService.isRevisionAncestor",
          cwd,
          args: ["merge-base", "--is-ancestor", input.from, input.to],
          allowNonZeroExit: true,
        });
        if (result.exitCode > 1)
          return yield* new GitCommandError({
            operation: "GitWorkflowService.isRevisionAncestor",
            command: "git merge-base",
            cwd,
            detail: result.stderr,
          });
        return result.exitCode === 0;
      }).pipe(commandFailure("GitWorkflowService.isRevisionAncestor", input.cwd)),
    branchPullRequest: (input, options) =>
      route("GitWorkflowService.branchPullRequest", workflowRouting, {
        git: (request: typeof input) => gitManager.branchPullRequest(request, options),
        jj: (request: typeof input) => jjWorkflow.branchPullRequest(request, options),
      })(input),
    listLocalBranchNames: (cwd) =>
      route("GitWorkflowService.listLocalBranchNames", commandRouting, {
        git: () => git.listLocalBranchNames(cwd),
        jj: () => jjWorkflow.listLocalBranchNames(cwd),
      })({ cwd }),
    fetchRemote: route("GitWorkflowService.fetchRemote", commandRouting, {
      git: git.fetchRemote,
      jj: jjWorkflow.fetchRemote,
    }),
    remoteExists: route("GitWorkflowService.remoteExists", commandRouting, {
      git: git.remoteExists,
      jj: jjWorkflow.remoteExists,
    }),
    remoteBranchExists: route("GitWorkflowService.remoteBranchExists", commandRouting, {
      git: git.remoteBranchExists,
      jj: jjWorkflow.remoteBranchExists,
    }),
    resolveRemoteTrackingCommit: route(
      "GitWorkflowService.resolveRemoteTrackingCommit",
      commandRouting,
      {
        git: git.resolveRemoteTrackingCommit,
        jj: jjWorkflow.resolveRemoteTrackingCommit,
      },
    ),
    // Dispatched on the workspace path, not the project: a Git worktree inside a colocated jj
    // project must keep being removable after the detection flip.
    removeWorktree: (input) =>
      Effect.gen(function* () {
        const kind = yield* resolveWorkspaceKind(input);
        yield* ownership.remember({ cwd: input.cwd, path: input.path, kind });
        const repositoryCwd = yield* ownership.repositoryCwd(input.cwd);
        yield* workspaceOps[kind].removeWorktree({ ...input, cwd: repositoryCwd });
      }).pipe(commandFailure("GitWorkflowService.removeWorktree", input.cwd)),
    pruneWorktrees: route("GitWorkflowService.pruneWorktrees", commandRouting, {
      git: git.pruneWorktrees,
      jj: jjWorkflow.pruneWorktrees,
    }),
    deleteLocalBranch: (input) =>
      route("GitWorkflowService.deleteLocalBranch", commandRouting, {
        git: git.deleteLocalBranch,
        jj: (request: GitVcsDriver.GitDeleteLocalBranchInput) =>
          jjWorkflow.deleteLocalBranch(request),
      })(input),
    createRef: route("GitWorkflowService.createRef", commandRouting, {
      git: git.createRef,
      jj: jjWorkflow.createRef,
    }),
    // The Git driver's `switchRef` needs a `Scope` the service closes locally; the declared type
    // carries none, and leaking it would reach every caller. The jj arm needs no scope.
    switchRef: route("GitWorkflowService.switchRef", commandRouting, {
      git: (input) => Effect.scoped(git.switchRef(input)),
      jj: jjWorkflow.switchRef,
    }),
    renameBranch: route("GitWorkflowService.renameBranch", workflowRouting, {
      git: git.renameBranch,
      jj: jjWorkflow.renameBranch,
    }),
  });
});

export const layer = Layer.effect(GitWorkflowService, make);

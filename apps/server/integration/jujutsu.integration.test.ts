import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ChangeRequest,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";

import { checkpointRefForThreadTurn } from "../src/checkpointing/Utils.ts";
import { ProjectionSnapshotQuery } from "../src/orchestration/Services/ProjectionSnapshotQuery.ts";
import { SourceControlProvider } from "../src/sourceControl/SourceControlProvider.ts";
import { describeJj, commitId, runGit, runJj } from "../src/vcs/testing/JjTestSupport.ts";
import {
  makeOrchestrationIntegrationHarness,
  type OrchestrationIntegrationHarness,
} from "./OrchestrationEngineHarness.integration.ts";
import type { TestTurnResponse } from "./TestProviderAdapter.integration.ts";

const projectId = ProjectId.make("mixed-vcs-project");
const provider = ProviderDriverKind.make("codex");
const modelSelection = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" };
const old = "2026-01-01T00:00:00.000Z";

const seedThread = Effect.fnUntraced(function* (
  harness: OrchestrationIntegrationHarness,
  name: string,
  cwd: string,
  branch: string,
) {
  const threadId = ThreadId.make(name);
  yield* harness.engine.dispatch({
    type: "thread.create",
    commandId: CommandId.make(`create-${name}`),
    threadId,
    projectId,
    title: name,
    modelSelection,
    interactionMode: "default",
    runtimeMode: "full-access",
    branch,
    worktreePath: cwd,
    createdAt: old,
  });
  return threadId;
});

const mixedWorkspaces = Effect.fnUntraced(function* (harness: OrchestrationIntegrationHarness) {
  yield* harness.engine.dispatch({
    type: "project.create",
    commandId: CommandId.make("create-project"),
    projectId,
    title: "Mixed VCS",
    workspaceRoot: harness.workspaceDir,
    defaultModelSelection: modelSelection,
    createdAt: old,
  });
  const git = (yield* harness.workflow.createWorktree({
    cwd: harness.workspaceDir,
    refName: "main",
    newRefName: "legacy-git",
    path: null,
  })).worktree;
  yield* runJj(harness.workspaceDir, ["git", "init", "--colocate"]);
  yield* harness.vcs.invalidate(harness.workspaceDir);
  const jj = (yield* harness.workflow.createWorktree({
    cwd: harness.workspaceDir,
    refName: "main",
    newRefName: "topic-jj",
    path: null,
  })).worktree;
  return { git, jj };
});

const turn = Effect.fnUntraced(function* (
  harness: OrchestrationIntegrationHarness,
  threadId: ThreadId,
  count: number,
  mutation: TestTurnResponse["mutateWorkspace"],
) {
  const adapter = harness.adapterHarness;
  assert.isNotNull(adapter);
  if (adapter === null) return yield* Effect.die(new Error("Expected a deterministic provider"));
  const createdAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const response: TestTurnResponse = {
    events: [
      {
        type: "turn.started",
        eventId: EventId.make(`start-${threadId}-${count}`),
        provider,
        threadId,
        turnId: "fixture",
        createdAt,
      },
    ],
    ...(mutation ? { mutateWorkspace: mutation } : {}),
  };
  if (adapter.listActiveSessionIds().includes(threadId))
    yield* adapter.queueTurnResponse(threadId, response);
  else yield* adapter.queueTurnResponseForNextSession(response);
  yield* harness.engine.dispatch({
    type: "thread.turn.start",
    commandId: CommandId.make(`turn-${threadId}-${count}`),
    threadId,
    message: {
      messageId: MessageId.make(`message-${threadId}-${count}`),
      role: "user",
      text: "Update the workspace",
      attachments: [],
    },
    interactionMode: "default",
    runtimeMode: "full-access",
    createdAt,
  });
  const finalized = yield* harness.waitForReceipt(
    (receipt) =>
      receipt.type === "checkpoint.diff.finalized" &&
      receipt.threadId === threadId &&
      receipt.checkpointTurnCount === count,
  );
  if (finalized.type === "checkpoint.diff.finalized") assert.equal(finalized.status, "ready");
  yield* harness.waitForReceipt(
    (receipt) =>
      receipt.type === "turn.processing.quiesced" &&
      receipt.threadId === threadId &&
      receipt.checkpointTurnCount === count,
  );
  yield* harness.drainProviderRuntime;
});

describeJj("Jujutsu orchestration integration", () => {
  it.live(
    "checkpoints and rewinds mixed-backend turns independently, reporting exclusions and refreshing hints",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const harness = yield* makeOrchestrationIntegrationHarness({ realVcs: true });
        yield* Effect.addFinalizer(() => harness.dispose);
        const { git, jj } = yield* mixedWorkspaces(harness);
        const gitThread = yield* seedThread(harness, "git-turns", git.path, git.refName);
        const jjThread = yield* seedThread(harness, "jj-turns", jj.path, jj.refName);
        const mainBefore = yield* fs.readFileString(path.join(harness.workspaceDir, "README.md"));
        const gitHead = (yield* runGit(git.path, ["rev-parse", "HEAD"])).trim();
        yield* turn(harness, gitThread, 1, ({ cwd }) =>
          fs.writeFileString(path.join(cwd, "README.md"), "git turn\n").pipe(Effect.orDie),
        );
        yield* turn(harness, jjThread, 1, ({ cwd }) =>
          Effect.all(
            [
              fs.writeFileString(path.join(cwd, "README.md"), "jj turn\n"),
              fs.writeFileString(path.join(cwd, "captured.bin"), "x".repeat(2 * 1024 * 1024)),
              fs.writeFileString(path.join(cwd, "excluded.bin"), "x".repeat(10 * 1024 * 1024 + 1)),
            ],
            { discard: true },
          ).pipe(Effect.orDie),
        );
        const detail = Option.getOrThrow(
          yield* harness.snapshotQuery.getThreadDetailById(jjThread),
        );
        assert.isTrue(
          detail.activities.some(
            (activity) =>
              activity.kind === "checkpoint.capture.excluded" &&
              JSON.stringify(activity.payload).includes("excluded.bin"),
          ),
        );
        const captured = yield* runGit(harness.workspaceDir, [
          "ls-tree",
          "--name-only",
          "-r",
          checkpointRefForThreadTurn(jjThread, 1),
        ]);
        assert.include(captured, "captured.bin");
        assert.notInclude(captured, "excluded.bin");
        assert.include(
          harness.adapterHarness?.getSendTurnInputs().find((input) => input.threadId === jjThread)
            ?.vcsAgentHint ?? "",
          "Jujutsu",
        );
        assert.equal(
          harness.adapterHarness?.getSendTurnInputs().find((input) => input.threadId === gitThread)
            ?.vcsAgentHint,
          null,
        );
        yield* harness.settings.updateSettings({ enableVcsAgentHints: false });
        yield* turn(harness, jjThread, 2, ({ cwd }) =>
          fs.writeFileString(path.join(cwd, "README.md"), "jj second turn\n").pipe(Effect.orDie),
        );
        assert.equal(harness.adapterHarness?.getSendTurnInputs().at(-1)?.vcsAgentHint, null);
        yield* harness.settings.updateSettings({
          projectSettingsOverrides: { [projectId]: { enableVcsAgentHints: true } },
        });
        yield* turn(harness, jjThread, 3, undefined);
        assert.include(
          harness.adapterHarness?.getSendTurnInputs().at(-1)?.vcsAgentHint ?? "",
          "Jujutsu",
        );
        const events = yield* harness.engine.subscribeDomainEvents;
        const pull = yield* Stream.toPull(events);
        yield* harness.engine.dispatch({
          type: "thread.checkpoint.revert",
          commandId: CommandId.make("rewind-jj"),
          threadId: jjThread,
          turnCount: 1,
          createdAt: yield* DateTime.now.pipe(Effect.map(DateTime.formatIso)),
        });
        for (;;) {
          if (
            (yield* pull).some(
              (event) => event.type === "thread.reverted" && event.aggregateId === jjThread,
            )
          )
            break;
        }
        yield* harness.drainCheckpointReactor;
        assert.equal(yield* fs.readFileString(path.join(jj.path, "README.md")), "jj turn\n");
        assert.isTrue(yield* fs.exists(path.join(jj.path, "excluded.bin")));
        assert.equal(yield* fs.readFileString(path.join(git.path, "README.md")), "git turn\n");
        assert.equal((yield* runGit(git.path, ["rev-parse", "HEAD"])).trim(), gitHead);
        assert.equal(
          yield* fs.readFileString(path.join(harness.workspaceDir, "README.md")),
          mainBefore,
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    40_000,
  );

  it.live(
    "cleans committed work safely and recreates each original backend after a SQLite-backed restart",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const first = yield* makeOrchestrationIntegrationHarness({ realVcs: true });
        yield* Effect.addFinalizer(() => first.dispose);
        const { git, jj } = yield* mixedWorkspaces(first);
        const gitThread = yield* seedThread(first, "git-resume", git.path, git.refName);
        const jjThread = yield* seedThread(first, "jj-resume", jj.path, jj.refName);
        yield* fs.writeFileString(path.join(git.path, "git-work.txt"), "committed git\n");
        yield* runGit(git.path, ["add", "."]);
        yield* runGit(git.path, ["commit", "-m", "Git thread work"]);
        yield* fs.writeFileString(path.join(jj.path, "jj-work.txt"), "committed jj\n");
        yield* runJj(jj.path, ["commit", "-m", "Unbookmarked thread work"]);
        yield* first.dispose;
        const restarted = yield* makeOrchestrationIntegrationHarness({
          realVcs: true,
          rootDir: first.rootDir,
          settings: { storageCleanup: { worktreeAfterDays: 1 }, enableVcsAgentHints: false },
        });
        yield* Effect.addFinalizer(() => restarted.dispose);
        yield* restarted.storageCleanup.drain;
        assert.isFalse(yield* fs.exists(git.path));
        assert.isFalse(yield* fs.exists(jj.path));
        const saved = Option.getOrThrow(
          yield* restarted.snapshotQuery.getThreadDetailById(jjThread),
        );
        assert.equal(saved.worktreePath, jj.path);
        assert.equal(saved.branch, jj.refName);
        yield* turn(restarted, gitThread, 1, undefined);
        yield* turn(restarted, jjThread, 1, undefined);
        assert.equal((yield* restarted.vcs.resolve({ cwd: git.path })).kind, "git");
        assert.equal((yield* restarted.vcs.resolve({ cwd: jj.path })).kind, "jj");
        assert.equal(
          yield* fs.readFileString(path.join(git.path, "git-work.txt")),
          "committed git\n",
        );
        assert.equal(yield* fs.readFileString(path.join(jj.path, "jj-work.txt")), "committed jj\n");
        assert.isFalse(yield* fs.exists(path.join(jj.path, ".git")));
        assert.isTrue(
          restarted.adapterHarness
            ?.getSendTurnInputs()
            .every((input) => input.vcsAgentHint === null),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    40_000,
  );

  it.live(
    "publishes a secondary-workspace bookmark and opens its request with synchronized Git refs",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        let created = false;
        let expectedHead = "";
        const request: ChangeRequest = {
          provider: "github",
          number: 1,
          title: "Workspace changes",
          url: "https://github.com/test/project/pull/1",
          baseRefName: "main",
          headRefName: "topic-jj",
          state: "open",
          updatedAt: Option.some(DateTime.makeUnsafe(old)),
        };
        const sourceControlProvider = yield* SourceControlProvider.pipe(
          Effect.provide(
            Layer.mock(SourceControlProvider)({
              kind: "github",
              listChangeRequests: () => Effect.succeed(created ? [request] : []),
              getDefaultBranch: () => Effect.succeed("main"),
              getChangeRequest: () => Effect.succeed({ ...request, headRefName: "review-head" }),
              createChangeRequest: ({ cwd, headSelector }) =>
                Effect.gen(function* () {
                  assert.equal(headSelector, "topic-jj");
                  assert.equal(
                    (yield* runGit(cwd, ["rev-parse", "refs/heads/topic-jj"])).trim(),
                    expectedHead,
                  );
                  created = true;
                }).pipe(Effect.orDie),
            }),
          ),
        );
        const harness = yield* makeOrchestrationIntegrationHarness({
          realVcs: true,
          sourceControlProvider,
        });
        yield* Effect.addFinalizer(() => harness.dispose);
        const { jj } = yield* mixedWorkspaces(harness);
        const threadId = yield* seedThread(harness, "jj-review-source", jj.path, jj.refName);
        const remote = path.join(harness.rootDir, "remote.git");
        yield* runGit(harness.workspaceDir, ["init", "--bare", "--initial-branch=main", remote]);
        yield* runJj(jj.path, ["git", "remote", "add", "origin", remote]);
        yield* runJj(jj.path, ["git", "push", "--bookmark", "main", "--remote", "origin"]);
        const previous = (yield* runGit(harness.workspaceDir, [
          "rev-parse",
          "refs/heads/topic-jj",
        ])).trim();
        yield* fs.writeFileString(path.join(jj.path, "publish.txt"), "publish me\n");
        yield* fs.writeFileString(
          path.join(jj.path, ".gitmodules"),
          '[submodule "example"]\npath = example\nurl = https://example.com/example.git\n',
        );
        yield* runJj(jj.path, ["commit", "-m", "Publish workspace work"]);
        expectedHead = yield* commitId(jj.path, "@-");
        yield* runJj(jj.path, ["bookmark", "set", "topic-jj", "-r", "@-"]);
        yield* harness.workflow.invalidateStatus(jj.path);
        assert.equal(
          (yield* runGit(harness.workspaceDir, ["rev-parse", "refs/heads/topic-jj"])).trim(),
          previous,
        );
        const result = yield* harness.workflow.runStackedAction({
          cwd: jj.path,
          action: "commit_push_pr",
          actionId: "publish-request",
        });
        assert.equal(result.push.status, "pushed");
        assert.equal(result.pr.status, "created");
        assert.equal(
          (yield* runGit(remote, ["rev-parse", "refs/heads/topic-jj"])).trim(),
          expectedHead,
        );
        assert.equal(
          (yield* runGit(harness.workspaceDir, ["rev-parse", "refs/heads/topic-jj"])).trim(),
          expectedHead,
        );
        assert.isTrue(created);
        yield* harness.settings.updateSettings({
          worktreeSubmodules: "recursive",
          projectSettingsOverrides: { [projectId]: { worktreeSubmodules: "none" } },
        });
        yield* runGit(remote, ["update-ref", "refs/heads/review-head", expectedHead]);
        const review = yield* harness.workflow
          .preparePullRequestThread({ cwd: jj.path, reference: "1", mode: "worktree", threadId })
          .pipe(Effect.provideService(ProjectionSnapshotQuery, harness.snapshotQuery));
        assert.isNotNull(review.worktreePath);
        if (review.worktreePath !== null)
          assert.isTrue(yield* fs.exists(path.join(review.worktreePath, ".gitmodules")));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    40_000,
  );
});

import {
  CommandId,
  MCP_THREADS_COMMAND_PREFIX,
  MCP_TURN_ACCEPTED_ACTIVITY_KIND,
  mcpTurnAcceptedActivityId,
  MessageId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import { buildTemporaryWorktreeBranchName } from "@t3tools/shared/git";
import { derivePendingRequests } from "@t3tools/shared/pendingRequests";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";

import { makeThreadCommandDispatcher } from "../../../orchestration/ThreadCommandDispatcher.ts";
import * as OrchestrationEngine from "../../../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as GitWorkflowService from "../../../git/GitWorkflowService.ts";
import * as ProjectCloneTracker from "../../../project/ProjectCloneTracker.ts";
import * as ServerSettings from "../../../serverSettings.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { ThreadToolOperationError, ThreadsToolkit } from "./tools.ts";

const MAX_MESSAGES = 10;
const MAX_THREADS = 50;
const MAX_MESSAGE_CHARS = 1_500;
const DEFAULT_WAIT_MS = 60_000;

const summary = (thread: OrchestrationThreadShell) => ({
  threadId: thread.id,
  projectId: thread.projectId,
  title: thread.title,
  branch: thread.branch,
  worktreePath: thread.worktreePath,
  sessionStatus: thread.session?.status ?? null,
  sessionError: thread.session?.lastError ?? null,
  needsInput: thread.hasPendingApprovals || thread.hasPendingUserInput,
  latestTurn: thread.latestTurn,
});

const fail = (message: string) => new ThreadToolOperationError({ message });
const describeError = (cause: unknown) =>
  fail(cause instanceof Error ? cause.message : "Could not complete the thread operation.");

const make = Effect.gen(function* () {
  const snapshots = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const engine = yield* OrchestrationEngine.OrchestrationEngineService;
  const git = yield* GitWorkflowService.GitWorkflowService;
  const clones = yield* ProjectCloneTracker.ProjectCloneTracker;
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const crypto = yield* Crypto.Crypto;
  const dispatch = yield* makeThreadCommandDispatcher();

  const requireSource = Effect.fn("ThreadsToolkit.requireSource")(function* () {
    const scope = yield* McpInvocationContext.requireMcpCapability("threads");
    const source = yield* snapshots
      .getThreadShellById(scope.threadId)
      .pipe(Effect.mapError(describeError));
    if (Option.isNone(source)) return yield* fail("The calling thread is no longer available.");
    return source.value;
  });

  const canAccessAllProjects = serverSettings.getSettings.pipe(
    Effect.map((settings) => settings.agentThreadAccess === "environment"),
    Effect.mapError(describeError),
  );

  const requireTarget = Effect.fn("ThreadsToolkit.requireTarget")(function* (threadId: ThreadId) {
    const source = yield* requireSource();
    const target = yield* snapshots
      .getThreadShellById(threadId)
      .pipe(Effect.mapError(describeError));
    if (
      Option.isNone(target) ||
      (target.value.projectId !== source.projectId && !(yield* canAccessAllProjects))
    ) {
      return yield* fail("Thread not found among accessible projects.");
    }
    return target.value;
  });

  const detail = Effect.fn("ThreadsToolkit.detail")(function* (threadId: ThreadId) {
    yield* requireTarget(threadId);
    const result = yield* snapshots
      .getThreadDetailSnapshot(threadId, { turnLimit: 2 })
      .pipe(Effect.mapError(describeError));
    if (Option.isNone(result)) return yield* fail("Thread not found among accessible projects.");
    return result.value.thread;
  });

  const pending = Effect.fn("ThreadsToolkit.pending")(function* (threadId: ThreadId) {
    const thread = yield* detail(threadId);
    return derivePendingRequests(thread.activities);
  });

  const freshId = crypto.randomUUIDv4.pipe(Effect.orDie);
  const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const commandId = (value: string) => CommandId.make(`${MCP_THREADS_COMMAND_PREFIX}${value}`);

  const startTurn = Effect.fn("ThreadsToolkit.startTurn")(function* (input: {
    readonly thread: OrchestrationThreadShell;
    readonly prompt: string;
  }) {
    const messageId = MessageId.make(yield* freshId);
    const createdAt = yield* now;
    yield* dispatch({
      type: "thread.turn.start",
      commandId: commandId(yield* freshId),
      threadId: input.thread.id,
      message: { messageId, role: "user", text: input.prompt, attachments: [] },
      runtimeMode: input.thread.runtimeMode,
      interactionMode: input.thread.interactionMode,
      createdAt,
    }).pipe(Effect.mapError(describeError));
    return { threadId: input.thread.id, messageId };
  });

  return ThreadsToolkit.of({
    threads_list: (input) =>
      Effect.gen(function* () {
        const source = yield* requireSource();
        const allowAll = yield* canAccessAllProjects;
        const snapshot = yield* snapshots.getShellSnapshot().pipe(Effect.mapError(describeError));
        const threads = snapshot.threads
          .filter((thread) => allowAll || thread.projectId === source.projectId)
          .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        const offset = input.offset ?? 0;
        return {
          projects: snapshot.projects
            .filter((project) => allowAll || project.id === source.projectId)
            .map((project) => ({
              projectId: project.id,
              title: project.title,
              workspaceRoot: project.workspaceRoot,
            })),
          threads: threads.slice(offset, offset + (input.limit ?? MAX_THREADS)).map(summary),
          total: threads.length,
          offset,
        };
      }),
    threads_start: (input) =>
      Effect.gen(function* () {
        const source = yield* requireSource();
        const projectId = input.projectId ?? source.projectId;
        if (projectId !== source.projectId && !(yield* canAccessAllProjects)) {
          return yield* fail("Project not found among accessible projects.");
        }
        const project = yield* snapshots
          .getProjectShellById(projectId)
          .pipe(Effect.mapError(describeError));
        if (Option.isNone(project))
          return yield* fail("Project not found among accessible projects.");
        const useWorktree = input.worktree !== false;
        const baseBranch = useWorktree
          ? (input.baseBranch ??
            (projectId === source.projectId ? source.branch : null) ??
            (yield* git
              .localStatus({ cwd: project.value.workspaceRoot })
              .pipe(Effect.mapError(describeError))).refName)
          : null;
        if (useWorktree && baseBranch === null) {
          return yield* fail("No Git branch is available. Pass worktree=false for this project.");
        }
        const threadId = ThreadId.make(yield* freshId);
        const messageId = MessageId.make(yield* freshId);
        const createdAt = yield* now;
        const title =
          input.title ?? (input.prompt.split("\n")[0]!.trim().slice(0, 80) || "New thread");
        const modelSelection = input.modelSelection ?? source.modelSelection;
        const worktreeToken = useWorktree ? yield* freshId : null;
        const worktreeBranch = useWorktree
          ? buildTemporaryWorktreeBranchName(() => worktreeToken!.replaceAll("-", ""))
          : null;
        const command: Extract<OrchestrationCommand, { type: "thread.turn.start" }> = {
          type: "thread.turn.start",
          commandId: commandId(yield* freshId),
          threadId,
          message: { messageId, role: "user", text: input.prompt, attachments: [] },
          modelSelection,
          titleSeed: title,
          runtimeMode: source.runtimeMode,
          interactionMode: source.interactionMode,
          bootstrap: {
            createThread: {
              projectId,
              title,
              modelSelection,
              runtimeMode: source.runtimeMode,
              interactionMode: source.interactionMode,
              branch: useWorktree ? baseBranch : null,
              worktreePath: null,
              createdAt,
            },
            ...(useWorktree && baseBranch !== null && worktreeBranch !== null
              ? {
                  prepareWorktree: {
                    projectCwd: project.value.workspaceRoot,
                    baseBranch,
                    branch: worktreeBranch,
                    requireWorktree: true,
                  },
                  runSetupScript: true,
                }
              : {}),
          },
          createdAt,
        };
        yield* ProjectCloneTracker.rejectCommandsDuringClone(clones, command).pipe(
          Effect.mapError(describeError),
        );
        yield* dispatch(command).pipe(Effect.mapError(describeError));
        return { threadId, messageId };
      }),
    threads_send: (input) =>
      Effect.gen(function* () {
        const target = yield* requireTarget(input.threadId);
        if (target.id === (yield* requireSource()).id) {
          return yield* fail("Use the current conversation to continue this thread.");
        }
        if (target.hasPendingApprovals || target.hasPendingUserInput) {
          return yield* fail(
            "This thread needs input. Use threads_read to inspect and answer it before sending more work.",
          );
        }
        return yield* startTurn({ thread: target, prompt: input.prompt });
      }),
    threads_interrupt: (input) =>
      Effect.gen(function* () {
        const target = yield* requireTarget(input.threadId);
        if (target.session?.status !== "running") {
          return yield* fail("This thread has no running turn to interrupt.");
        }
        yield* dispatch({
          type: "thread.turn.interrupt",
          commandId: commandId(yield* freshId),
          threadId: input.threadId,
          ...(target.session.activeTurnId !== null ? { turnId: target.session.activeTurnId } : {}),
          createdAt: yield* now,
        }).pipe(Effect.mapError(describeError));
        return { threadId: input.threadId, submitted: true };
      }),
    threads_read: (input) =>
      Effect.gen(function* () {
        const target = yield* requireTarget(input.threadId);
        const thread = yield* detail(input.threadId);
        const { approvals, userInputs } = derivePendingRequests(thread.activities);
        return {
          ...summary(target),
          approvals,
          questions: userInputs,
          messages: thread.messages
            .filter((entry) => entry.role === "user" || entry.role === "assistant")
            .slice(-MAX_MESSAGES)
            .map((entry) => ({
              messageId: entry.id,
              role: entry.role === "user" ? ("user" as const) : ("assistant" as const),
              text: entry.text.slice(0, MAX_MESSAGE_CHARS),
              createdAt: entry.createdAt,
            })),
        };
      }),
    threads_approve: (input) =>
      Effect.gen(function* () {
        const { approvals } = yield* pending(input.threadId);
        const request = approvals.find((entry) => entry.requestId === input.requestId);
        if (!request) return yield* fail("Approval is no longer pending on this thread.");
        if (
          request.options?.length &&
          !request.options.some((option) => option.decision === input.decision)
        ) {
          return yield* fail("That decision is not offered for this approval.");
        }
        yield* dispatch({
          type: "thread.approval.respond",
          commandId: commandId(yield* freshId),
          threadId: input.threadId,
          requestId: input.requestId,
          decision: input.decision,
          createdAt: yield* now,
        }).pipe(Effect.mapError(describeError));
        return { threadId: input.threadId, requestId: input.requestId, submitted: true };
      }),
    threads_answer: (input) =>
      Effect.gen(function* () {
        const { userInputs } = yield* pending(input.threadId);
        const request = userInputs.find((entry) => entry.requestId === input.requestId);
        if (!request) return yield* fail("Question is no longer pending on this thread.");
        if (Object.keys(input.answers).length !== request.questions.length) {
          return yield* fail("Answer every question using only its question ID.");
        }
        for (const question of request.questions) {
          const answer = input.answers[question.id];
          const choices = Array.isArray(answer) ? answer : answer === undefined ? [] : [answer];
          if (
            choices.length === 0 ||
            choices.some((choice) => choice.trim().length === 0) ||
            (!question.multiSelect && Array.isArray(answer)) ||
            (request.dismissible && typeof answer !== "string") ||
            (question.allowCustomAnswer === false &&
              choices.some(
                (choice) =>
                  !question.options.some((option) => (option.value ?? option.label) === choice),
              ))
          ) {
            return yield* fail(`Invalid answer for question ${question.id}.`);
          }
        }
        yield* dispatch({
          type: "thread.user-input.respond",
          commandId: commandId(yield* freshId),
          threadId: input.threadId,
          requestId: input.requestId,
          answers: input.answers,
          createdAt: yield* now,
        }).pipe(Effect.mapError(describeError));
        return { threadId: input.threadId, requestId: input.requestId, submitted: true };
      }),
    threads_wait: (input) =>
      Effect.scoped(
        Effect.gen(function* () {
          yield* requireTarget(input.threadId);
          // Subscribe before reading so a completed turn cannot slip between the
          // snapshot and the live stream.
          const events = yield* engine.subscribeDomainEvents;
          const check = Effect.fn("ThreadsToolkit.checkWait")(function* () {
            const target = yield* requireTarget(input.threadId);
            const thread = yield* detail(input.threadId);
            const requestedIndex = thread.messages.findIndex(
              (entry) => entry.id === input.messageId && entry.role === "user",
            );
            const requested = thread.messages[requestedIndex];
            if (!requested)
              return yield* fail("Message not found in this thread's recent history.");
            const laterMessage = thread.messages
              .slice(requestedIndex + 1)
              .some((entry) => entry.role === "user");
            if (laterMessage)
              return yield* fail("A later turn superseded this message; read the thread.");
            const turn = thread.latestTurn;
            const startFailed = thread.activities.some(
              (activity) =>
                activity.kind === "provider.turn.start.failed" &&
                typeof activity.payload === "object" &&
                activity.payload !== null &&
                "requestId" in activity.payload &&
                activity.payload.requestId === input.messageId,
            );
            // The normal detail window can evict this receipt on a long turn.
            const accepted =
              !startFailed &&
              !target.hasPendingApprovals &&
              !target.hasPendingUserInput &&
              turn !== null &&
              turn.state !== "running"
                ? yield* snapshots
                    .getThreadDetailById(input.threadId, {
                      activityKinds: [MCP_TURN_ACCEPTED_ACTIVITY_KIND],
                    })
                    .pipe(Effect.mapError(describeError))
                : Option.none();
            const acceptedTurnId = Option.isSome(accepted)
              ? (accepted.value.activities.find(
                  (activity) => activity.id === mcpTurnAcceptedActivityId(input.messageId),
                )?.turnId ?? null)
              : null;
            const state = startFailed
              ? "error"
              : target.hasPendingApprovals || target.hasPendingUserInput
                ? "needs-input"
                : turn !== null &&
                    turn.state !== "running" &&
                    acceptedTurnId !== null &&
                    turn.turnId === acceptedTurnId
                  ? turn.state
                  : null;
            return state === null
              ? Option.none<{
                  threadId: ThreadId;
                  messageId: MessageId;
                  state: "completed" | "interrupted" | "error" | "needs-input" | "timeout";
                  turnId: string | null;
                }>()
              : Option.some<{
                  threadId: ThreadId;
                  messageId: MessageId;
                  state: "completed" | "interrupted" | "error" | "needs-input" | "timeout";
                  turnId: string | null;
                }>({
                  threadId: input.threadId,
                  messageId: input.messageId,
                  state,
                  turnId: turn?.turnId ?? null,
                });
          });
          const initial = yield* check();
          if (Option.isSome(initial)) return initial.value;
          const settled = yield* events.pipe(
            Stream.filter(
              (event) =>
                event.aggregateKind === "thread" &&
                event.aggregateId === input.threadId &&
                (event.type === "thread.session-set" ||
                  event.type === "thread.activity-appended" ||
                  event.type === "thread.turn-diff-completed" ||
                  event.type === "thread.deleted"),
            ),
            Stream.mapEffect(() => check()),
            Stream.filterMap((result) =>
              Option.isSome(result) ? Result.succeed(result.value) : Result.fail(undefined),
            ),
            Stream.runHead,
            Effect.timeoutOption(Duration.millis(input.timeoutMs ?? DEFAULT_WAIT_MS)),
          );
          if (Option.isSome(settled) && Option.isSome(settled.value)) return settled.value.value;
          return {
            threadId: input.threadId,
            messageId: input.messageId,
            state: "timeout" as const,
            turnId: null,
          };
        }),
      ),
  });
});

export const ThreadsToolkitHandlersLive = ThreadsToolkit.toLayer(make);

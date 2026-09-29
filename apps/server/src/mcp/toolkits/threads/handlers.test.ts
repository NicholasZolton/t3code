import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  DEFAULT_SERVER_SETTINGS,
  MCP_TURN_ACCEPTED_ACTIVITY_KIND,
  ApprovalRequestId,
  EnvironmentId,
  EventId,
  MessageId,
  mcpTurnAcceptedActivityId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationMessage,
  type OrchestrationProjectShell,
  type OrchestrationThreadActivity,
  type OrchestrationThreadShell,
  type ServerSettings,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { McpSchema, McpServer } from "effect/unstable/ai";

import * as McpHttpServer from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ThreadDeletionReactor } from "../../../orchestration/Services/ThreadDeletionReactor.ts";
import { ServerRuntimeStartup } from "../../../serverRuntimeStartup.ts";
import { ServerSettingsService } from "../../../serverSettings.ts";
import { ProjectSetupScriptRunner } from "../../../project/ProjectSetupScriptRunner.ts";
import { ProjectCloneTracker } from "../../../project/ProjectCloneTracker.ts";
import * as WorktreeSetup from "../../../project/WorktreeSetupTracker.ts";
import { TerminalManager } from "../../../terminal/Manager.ts";
import { GitWorkflowService } from "../../../git/GitWorkflowService.ts";
import { VcsStatusBroadcaster } from "../../../vcs/VcsStatusBroadcaster.ts";

const projectId = ProjectId.make("project-a");
const otherProjectId = ProjectId.make("project-b");
const sourceId = ThreadId.make("source");
const siblingId = ThreadId.make("sibling");
const otherId = ThreadId.make("other");
const timestamp = "2026-08-01T00:00:00.000Z";
const crossProjectSettings: ServerSettings = {
  ...DEFAULT_SERVER_SETTINGS,
  agentThreadAccess: "environment",
};
const noThreadAccessSettings: ServerSettings = {
  ...DEFAULT_SERVER_SETTINGS,
  agentThreadAccess: "none",
};
const decodeMessages = Schema.decodeUnknownEffect(
  Schema.Struct({
    messages: Schema.Array(Schema.Struct({ messageId: MessageId, text: Schema.String })),
  }),
);
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  clientCapabilities: {},
  clientInfo: { name: "test", version: "1" },
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  },
  getClient: Effect.die("unused"),
});

function thread(id: ThreadId, owner: ProjectId = projectId): OrchestrationThreadShell {
  return {
    id,
    projectId: owner,
    title: id,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test-model" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: "main",
    worktreePath: null,
    pullRequests: [],
    latestTurn: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

const project: OrchestrationProjectShell = {
  id: projectId,
  title: "Project",
  workspaceRoot: "/repo",
  defaultModelSelection: null,
  scripts: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};
const otherProject: OrchestrationProjectShell = {
  ...project,
  id: otherProjectId,
  title: "Other project",
  workspaceRoot: "/other-repo",
};

const invocation = (capabilities: ReadonlySet<McpInvocationContext.McpCapability>) => ({
  environmentId: EnvironmentId.make("environment-test"),
  threadId: sourceId,
  providerSessionId: "provider-session-test",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities,
  issuedAt: 1,
});

const makeFixture = Effect.gen(function* () {
  const threads = new Map<ThreadId, OrchestrationThreadShell>([
    [sourceId, thread(sourceId)],
    [siblingId, thread(siblingId)],
    [otherId, thread(otherId, otherProjectId)],
  ]);
  const messages = new Map<ThreadId, Array<OrchestrationMessage>>();
  const activities = new Map<ThreadId, Array<OrchestrationThreadActivity>>();
  const acceptedActivities = new Map<ThreadId, Array<OrchestrationThreadActivity>>();
  const acceptedTurnStates = new Map<
    MessageId,
    "running" | "completed" | "interrupted" | "error"
  >();
  const commands: Array<OrchestrationCommand> = [];
  const events = yield* PubSub.unbounded<OrchestrationEvent>();
  const checked = yield* Deferred.make<void>();
  const settings = yield* Ref.make<ServerSettings>(DEFAULT_SERVER_SETTINGS);
  const testLayer = McpHttpServer.ThreadsToolkitRegistrationLive.pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(ProjectionSnapshotQuery)({
          getThreadDetailById: (id, query) => {
            const shell = threads.get(id);
            return Effect.succeed(
              shell
                ? Option.some({
                    ...shell,
                    deletedAt: null,
                    messages: messages.get(id) ?? [],
                    activities: (acceptedActivities.get(id) ?? []).filter(
                      (activity) => query?.activityKinds?.includes(activity.kind) ?? true,
                    ),
                    proposedPlans: [],
                    checkpoints: [],
                  })
                : Option.none(),
            );
          },
          getThreadTurnStatus: ({ threadId, messageId }) =>
            Effect.gen(function* () {
              yield* Deferred.succeed(checked, undefined);
              const history = messages.get(threadId) ?? [];
              const index = history.findIndex(
                (entry) => entry.id === messageId && entry.role === "user",
              );
              if (index < 0) return Option.none();
              const acceptedTurnId =
                acceptedActivities
                  .get(threadId)
                  ?.find((activity) => activity.id === mcpTurnAcceptedActivityId(messageId))
                  ?.turnId ?? null;
              const latestTurn = threads.get(threadId)?.latestTurn;
              return Option.some({
                startFailed: (activities.get(threadId) ?? []).some(
                  (activity) =>
                    activity.kind === "provider.turn.start.failed" &&
                    typeof activity.payload === "object" &&
                    activity.payload !== null &&
                    "requestId" in activity.payload &&
                    activity.payload.requestId === messageId,
                ),
                turnId: acceptedTurnId,
                turnState:
                  acceptedTurnStates.get(messageId) ??
                  (latestTurn?.turnId === acceptedTurnId ? latestTurn.state : null),
              });
            }),
          getThreadMessagesPage: ({ threadId, beforeMessageId, limit, maxTextChars }) =>
            Effect.sync(() => {
              const entries = (messages.get(threadId) ?? [])
                .filter((entry) => entry.role === "user" || entry.role === "assistant")
                .toReversed();
              const cursor =
                beforeMessageId === null
                  ? 0
                  : entries.findIndex((entry) => entry.id === beforeMessageId) + 1;
              return entries.slice(cursor, cursor + limit).map((entry) => ({
                messageId: entry.id,
                role: entry.role === "user" ? ("user" as const) : ("assistant" as const),
                text: entry.text.slice(0, maxTextChars),
                createdAt: entry.createdAt,
                nextTextOffset: entry.text.length > maxTextChars ? maxTextChars : null,
              }));
            }),
          getThreadMessageExcerpt: ({ threadId, messageId, textOffset, maxTextChars }) => {
            const entry = messages.get(threadId)?.find((message) => message.id === messageId);
            return Effect.succeed(
              entry && (entry.role === "user" || entry.role === "assistant")
                ? Option.some({
                    messageId: entry.id,
                    role: entry.role === "user" ? ("user" as const) : ("assistant" as const),
                    text: entry.text.slice(textOffset, textOffset + maxTextChars),
                    createdAt: entry.createdAt,
                    nextTextOffset:
                      entry.text.length > textOffset + maxTextChars
                        ? textOffset + maxTextChars
                        : null,
                  })
                : Option.none(),
            );
          },
          getThreadShellById: (id) => Effect.succeed(Option.fromNullishOr(threads.get(id))),
          getProjectShellById: (id) =>
            Effect.succeed(
              id === projectId
                ? Option.some(project)
                : id === otherProjectId
                  ? Option.some(otherProject)
                  : Option.none(),
            ),
          getShellSnapshot: () =>
            Effect.succeed({
              snapshotSequence: 1,
              projects: [project, otherProject],
              threads: [...threads.values()],
              updatedAt: timestamp,
            }),
          getThreadDetailSnapshot: (id) =>
            Effect.gen(function* () {
              yield* Deferred.succeed(checked, undefined);
              const shell = threads.get(id);
              return shell
                ? Option.some({
                    snapshotSequence: 1,
                    thread: {
                      ...shell,
                      deletedAt: null,
                      messages: messages.get(id) ?? [],
                      activities: activities.get(id) ?? [],
                      proposedPlans: [],
                      checkpoints: [],
                    },
                  })
                : Option.none();
            }),
        }),
        Layer.mock(OrchestrationEngineService)({
          dispatch: (command) =>
            Effect.sync(() => {
              commands.push(command);
              if (command.type === "thread.create") {
                threads.set(command.threadId, {
                  ...thread(command.threadId),
                  title: command.title,
                  modelSelection: command.modelSelection,
                  branch: command.branch,
                  worktreePath: command.worktreePath,
                });
              }
              if (
                command.type === "thread.message.user.append" ||
                command.type === "thread.turn.start"
              ) {
                const id = command.threadId;
                const userMessage = command.message;
                const prior = messages.get(id) ?? [];
                if (!prior.some((entry) => entry.id === userMessage.messageId)) {
                  messages.set(id, [
                    ...prior,
                    {
                      id: userMessage.messageId,
                      role: "user",
                      text: userMessage.text,
                      turnId: null,
                      streaming: false,
                      createdAt: timestamp,
                      updatedAt: timestamp,
                    },
                  ]);
                }
              }
              return { sequence: commands.length };
            }),
          subscribeDomainEvents: PubSub.subscribe(events).pipe(Effect.map(Stream.fromSubscription)),
        }),
        Layer.mock(ThreadDeletionReactor)({ drainThrough: () => Effect.void }),
        Layer.mock(ServerRuntimeStartup)({ enqueueCommand: (effect) => effect }),
        Layer.mock(ServerSettingsService)({ getSettings: Ref.get(settings) }),
        Layer.mock(ProjectSetupScriptRunner)({
          runForThread: () => Effect.succeed({ status: "no-script" }),
        }),
        Layer.mock(ProjectCloneTracker)({ get: () => Effect.succeed(null) }),
        WorktreeSetup.layer,
        Layer.mock(TerminalManager)({}),
        Layer.mock(GitWorkflowService)({
          isRepository: () => Effect.succeed(true),
          hasCommit: () => Effect.succeed(true),
          localStatus: (input) =>
            Effect.succeed({
              isRepo: true,
              hasPrimaryRemote: false,
              isDefaultRef: true,
              refName: input.cwd === otherProject.workspaceRoot ? "other-main" : "main",
              hasWorkingTreeChanges: false,
              workingTree: { files: [], insertions: 0, deletions: 0 },
            }),
          createWorktree: (input) =>
            Effect.succeed({
              worktree: { path: "/repo-worktree", refName: input.newRefName ?? "new" },
            }),
        }),
        Layer.mock(VcsStatusBroadcaster)({
          refreshStatus: () =>
            Effect.succeed({
              isRepo: true,
              hasPrimaryRemote: false,
              isDefaultRef: true,
              refName: "main",
              hasWorkingTreeChanges: false,
              workingTree: { files: [], insertions: 0, deletions: 0 },
              hasUpstream: false,
              aheadCount: 0,
              behindCount: 0,
              pr: null,
            }),
        }),
        NodeServices.layer,
      ),
    ),
  );

  return {
    testLayer,
    threads,
    messages,
    activities,
    acceptedActivities,
    acceptedTurnStates,
    commands,
    events,
    checked,
    settings,
  };
});

const call = (name: string, args: Record<string, unknown>, canManage = true) =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    return yield* server
      .callTool({ name, arguments: args })
      .pipe(
        Effect.provideService(
          McpInvocationContext.McpInvocationContext,
          invocation(new Set(canManage ? ["threads"] : [])),
        ),
        Effect.provideService(McpSchema.McpServerClient, client),
      );
  });

it.effect("lists only the calling project and rejects unauthorized or cross-project reads", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture;
    yield* Effect.gen(function* () {
      const list = yield* call("threads_list", {});
      expect(list.structuredContent).toMatchObject({
        projects: [{ projectId }],
        threads: [{ threadId: sourceId }, { threadId: siblingId }],
        total: 2,
        offset: 0,
      });
      const older = yield* call("threads_list", { offset: 1, limit: 1 });
      expect(older.structuredContent).toMatchObject({
        threads: [{ threadId: siblingId }],
        total: 2,
        offset: 1,
      });
      const denied = yield* call("threads_list", {}, false);
      expect(denied.isError).toBe(true);
      expect(denied.content).toEqual([
        { type: "text", text: "MCP credential does not grant the threads capability." },
      ]);
      const outside = yield* call("threads_read", { threadId: otherId });
      expect(outside.isError).toBe(true);
      expect(outside.content).toEqual([
        { type: "text", text: "Thread not found among accessible projects." },
      ]);
      const outsideSend = yield* call("threads_send", {
        threadId: otherId,
        prompt: "Do something",
      });
      expect(outsideSend.isError).toBe(true);
      const outsideStart = yield* call("threads_start", {
        projectId: otherProjectId,
        prompt: "Do something",
        worktree: false,
      });
      expect(outsideStart.isError).toBe(true);
      const outsideWait = yield* call("threads_wait", {
        threadId: otherId,
        messageId: MessageId.make("other-message"),
      });
      expect(outsideWait.isError).toBe(true);
      expect(fixture.commands).toHaveLength(0);
    }).pipe(Effect.provide(fixture.testLayer));
  }),
);

it.effect(
  "denies every thread tool while access is off and restores access for active sessions",
  () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture;
      yield* Effect.gen(function* () {
        yield* Ref.set(fixture.settings, noThreadAccessSettings);
        const operations = [
          ["threads_list", {}],
          ["threads_start", { prompt: "Start a task", worktree: false }],
          ["threads_read", { threadId: siblingId }],
          ["threads_send", { threadId: siblingId, prompt: "Follow up" }],
          ["threads_interrupt", { threadId: siblingId }],
          ["threads_approve", { threadId: siblingId, requestId: "approval", decision: "accept" }],
          ["threads_answer", { threadId: siblingId, requestId: "question", answers: {} }],
          ["threads_wait", { threadId: siblingId, messageId: MessageId.make("message") }],
        ] as const;
        for (const [name, args] of operations) {
          const denied = yield* call(name, args);
          expect(denied.isError).toBe(true);
          expect(denied.content).toEqual([
            { type: "text", text: "Agent thread access is disabled for this environment." },
          ]);
        }
        expect(fixture.commands).toHaveLength(0);

        yield* Ref.set(fixture.settings, DEFAULT_SERVER_SETTINGS);
        const restored = yield* call("threads_list", {});
        expect(restored.structuredContent).toMatchObject({ total: 2 });
      }).pipe(Effect.provide(fixture.testLayer));
    }),
);

it.effect("makes other projects available immediately when the environment setting changes", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture;
    yield* Effect.gen(function* () {
      yield* Ref.set(fixture.settings, crossProjectSettings);
      const listed = yield* call("threads_list", {});
      expect(listed.structuredContent).toMatchObject({
        projects: [{ projectId }, { projectId: otherProjectId }],
        total: 3,
      });
      const started = yield* call("threads_start", {
        projectId: otherProjectId,
        prompt: "Review the other project",
        worktree: false,
      });
      expect(started.isError).toBeFalsy();
      const created = fixture.commands.find((command) => command.type === "thread.create");
      if (created?.type !== "thread.create") throw new Error("Expected a thread creation");
      expect(created.projectId).toBe(otherProjectId);
      const startedWithWorktree = yield* call("threads_start", {
        projectId: otherProjectId,
        prompt: "Work in the other project",
      });
      expect(startedWithWorktree.isError).toBeFalsy();
      expect(fixture.commands).toContainEqual(
        expect.objectContaining({
          type: "thread.create",
          projectId: otherProjectId,
          branch: "other-main",
        }),
      );
      const sent = yield* call("threads_send", { threadId: otherId, prompt: "Follow up" });
      expect(sent.isError).toBeFalsy();
      const sentMessage = fixture.messages.get(otherId)?.[0];
      if (!sentMessage) throw new Error("Expected the follow-up message");
      fixture.threads.set(otherId, {
        ...thread(otherId, otherProjectId),
        latestTurn: {
          turnId: TurnId.make("other-turn"),
          state: "completed",
          requestedAt: timestamp,
          startedAt: timestamp,
          completedAt: timestamp,
          assistantMessageId: null,
        },
      });
      fixture.acceptedActivities.set(otherId, [
        {
          id: mcpTurnAcceptedActivityId(sentMessage.id),
          kind: MCP_TURN_ACCEPTED_ACTIVITY_KIND,
          tone: "info",
          summary: "MCP turn accepted",
          payload: { messageId: sentMessage.id },
          turnId: TurnId.make("other-turn"),
          createdAt: timestamp,
        },
      ]);
      const waited = yield* call("threads_wait", {
        threadId: otherId,
        messageId: sentMessage.id,
      });
      expect(waited.structuredContent).toMatchObject({ state: "completed" });
      const read = yield* call("threads_read", { threadId: otherId });
      expect(read.structuredContent).toMatchObject({
        projectId: otherProjectId,
        messages: [{ text: "Follow up" }],
      });

      yield* Ref.set(fixture.settings, DEFAULT_SERVER_SETTINGS);
      const revoked = yield* call("threads_read", { threadId: otherId });
      expect(revoked.isError).toBe(true);
    }).pipe(Effect.provide(fixture.testLayer));
  }),
);

it.effect("interrupts only accessible running threads through the existing stop command", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture;
    const activeTurnId = TurnId.make("active-turn");
    fixture.threads.set(siblingId, {
      ...thread(siblingId),
      session: {
        threadId: siblingId,
        status: "running",
        providerName: "codex",
        runtimeMode: "full-access",
        activeTurnId,
        lastError: null,
        updatedAt: timestamp,
      },
    });
    fixture.threads.set(otherId, {
      ...thread(otherId, otherProjectId),
      session: {
        threadId: otherId,
        status: "running",
        providerName: "codex",
        runtimeMode: "full-access",
        activeTurnId: null,
        lastError: null,
        updatedAt: timestamp,
      },
    });
    yield* Effect.gen(function* () {
      expect((yield* call("threads_interrupt", { threadId: siblingId }, false)).isError).toBe(true);
      expect((yield* call("threads_interrupt", { threadId: otherId })).isError).toBe(true);
      expect((yield* call("threads_interrupt", { threadId: sourceId })).isError).toBe(true);
      expect(fixture.commands).toHaveLength(0);

      const stopped = yield* call("threads_interrupt", { threadId: siblingId });
      expect(stopped.structuredContent).toMatchObject({ threadId: siblingId, submitted: true });
      expect(fixture.commands).toMatchObject([
        { type: "thread.turn.interrupt", threadId: siblingId, turnId: activeTurnId },
      ]);

      yield* Ref.set(fixture.settings, crossProjectSettings);
      const otherStopped = yield* call("threads_interrupt", { threadId: otherId });
      expect(otherStopped.structuredContent).toMatchObject({ threadId: otherId, submitted: true });
      expect(fixture.commands[1]).toMatchObject({
        type: "thread.turn.interrupt",
        threadId: otherId,
      });
      expect(fixture.commands[1]).not.toHaveProperty("turnId");

      yield* Ref.set(fixture.settings, DEFAULT_SERVER_SETTINGS);
      expect((yield* call("threads_interrupt", { threadId: otherId })).isError).toBe(true);
      expect(fixture.commands).toHaveLength(2);
    }).pipe(Effect.provide(fixture.testLayer));
  }),
);

it.effect("reads pending approvals and questions and submits their native response commands", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture;
    const approvalId = ApprovalRequestId.make("approval-1");
    const questionId = ApprovalRequestId.make("question-1");
    const questionKey = " environment ";
    fixture.activities.set(siblingId, [
      {
        id: EventId.make("approval-request"),
        kind: "approval.requested",
        tone: "approval",
        summary: "Run command?",
        payload: {
          requestId: approvalId,
          requestKind: "command",
          detail: "Run tests",
          options: [
            { decision: "accept", label: "Allow once" },
            { decision: "decline", label: "Deny" },
          ],
        },
        turnId: null,
        createdAt: timestamp,
      },
      {
        id: EventId.make("question-request"),
        kind: "user-input.requested",
        tone: "info",
        summary: "Which option?",
        payload: {
          requestId: questionId,
          questions: [
            {
              id: questionKey,
              header: "Environment",
              question: "Where should I run it?",
              options: [{ label: "Local", description: "This machine", value: "local" }],
              multiSelect: false,
              allowCustomAnswer: false,
            },
          ],
        },
        turnId: null,
        createdAt: timestamp,
      },
    ]);
    yield* Effect.gen(function* () {
      const pending = yield* call("threads_read", { threadId: siblingId });
      expect(pending.structuredContent).toMatchObject({
        approvals: [
          {
            requestId: approvalId,
            detail: "Run tests",
            options: [{ decision: "accept" }, { decision: "decline" }],
          },
        ],
        questions: [{ requestId: questionId, questions: [{ id: questionKey }] }],
      });
      expect(
        (yield* call("threads_approve", {
          threadId: siblingId,
          requestId: approvalId,
          decision: "acceptAlways",
        })).isError,
      ).toBe(true);
      expect(
        (yield* call("threads_answer", {
          threadId: siblingId,
          requestId: questionId,
          answers: { [questionKey]: "remote" },
        })).isError,
      ).toBe(true);
      expect(
        (yield* call("threads_answer", { threadId: siblingId, requestId: questionId, answers: {} }))
          .isError,
      ).toBe(true);
      expect(fixture.commands).toHaveLength(0);

      expect(
        (yield* call("threads_approve", {
          threadId: siblingId,
          requestId: approvalId,
          decision: "accept",
        })).structuredContent,
      ).toMatchObject({ submitted: true });
      expect(
        (yield* call("threads_answer", {
          threadId: siblingId,
          requestId: questionId,
          answers: { [questionKey]: "local" },
        })).structuredContent,
      ).toMatchObject({ submitted: true });
      expect(fixture.commands).toMatchObject([
        {
          type: "thread.approval.respond",
          threadId: siblingId,
          requestId: approvalId,
          decision: "accept",
        },
        {
          type: "thread.user-input.respond",
          threadId: siblingId,
          requestId: questionId,
          answers: { [questionKey]: "local" },
        },
      ]);

      fixture.activities.get(siblingId)?.push({
        id: EventId.make("approval-resolved"),
        kind: "approval.resolved",
        tone: "info",
        summary: "Approved",
        payload: { requestId: approvalId },
        turnId: null,
        createdAt: timestamp,
      });
      fixture.activities.get(siblingId)?.push({
        id: EventId.make("question-resolved"),
        kind: "user-input.resolved",
        tone: "info",
        summary: "Answered",
        payload: { requestId: questionId },
        turnId: null,
        createdAt: timestamp,
      });
      expect(
        (yield* call("threads_read", { threadId: siblingId })).structuredContent,
      ).toMatchObject({ approvals: [], questions: [] });
      expect(
        (yield* call("threads_approve", {
          threadId: siblingId,
          requestId: approvalId,
          decision: "accept",
        })).isError,
      ).toBe(true);
      expect(
        (yield* call("threads_answer", {
          threadId: siblingId,
          requestId: questionId,
          answers: { [questionKey]: "local" },
        })).isError,
      ).toBe(true);
      expect(fixture.commands).toHaveLength(2);
    }).pipe(Effect.provide(fixture.testLayer));
  }),
);

it.effect("scopes request inspection and answers to accessible threads", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture;
    const requestId = ApprovalRequestId.make("other-request");
    fixture.activities.set(otherId, [
      {
        id: EventId.make("other-request-event"),
        kind: "approval.requested",
        tone: "approval",
        summary: "Approve other project",
        payload: { requestId, requestKind: "permission" },
        turnId: null,
        createdAt: timestamp,
      },
    ]);
    yield* Effect.gen(function* () {
      expect((yield* call("threads_read", { threadId: otherId })).isError).toBe(true);
      expect(
        (yield* call("threads_approve", {
          threadId: otherId,
          requestId: "req",
          decision: "accept",
        })).isError,
      ).toBe(true);
      expect(
        (yield* call("threads_answer", {
          threadId: otherId,
          requestId: "req",
          answers: { q: "yes" },
        })).isError,
      ).toBe(true);
      expect((yield* call("threads_read", { threadId: siblingId }, false)).isError).toBe(true);
      yield* Ref.set(fixture.settings, crossProjectSettings);
      expect((yield* call("threads_read", { threadId: otherId })).structuredContent).toMatchObject({
        threadId: otherId,
        approvals: [{ requestId }],
        questions: [],
      });
      expect(
        (yield* call("threads_approve", { threadId: otherId, requestId, decision: "decline" }))
          .structuredContent,
      ).toMatchObject({ submitted: true });
      expect(fixture.commands).toMatchObject([
        { type: "thread.approval.respond", threadId: otherId, requestId, decision: "decline" },
      ]);
      yield* Ref.set(fixture.settings, DEFAULT_SERVER_SETTINGS);
      expect((yield* call("threads_read", { threadId: otherId })).isError).toBe(true);
      expect(
        (yield* call("threads_approve", { threadId: otherId, requestId, decision: "accept" }))
          .isError,
      ).toBe(true);
      expect(fixture.commands).toHaveLength(1);
    }).pipe(Effect.provide(fixture.testLayer));
  }),
);

it.effect("answers asynchronous message-mode questions through the existing response path", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture;
    const requestId = ApprovalRequestId.make("async-question");
    fixture.activities.set(siblingId, [
      {
        id: EventId.make("async-question-event"),
        kind: "user-input.requested",
        tone: "info",
        summary: "Clarify the approach",
        payload: {
          requestId,
          responseMode: "message",
          questions: [
            {
              id: "approach",
              header: "Approach",
              question: "Which approach?",
              options: [],
              multiSelect: false,
              allowCustomAnswer: true,
            },
          ],
        },
        turnId: null,
        createdAt: timestamp,
      },
    ]);
    yield* Effect.gen(function* () {
      expect(
        (yield* call("threads_read", { threadId: siblingId })).structuredContent,
      ).toMatchObject({
        questions: [{ requestId, dismissible: true }],
      });
      expect(
        (yield* call("threads_answer", {
          threadId: siblingId,
          requestId,
          answers: { approach: ["first", "second"] },
        })).isError,
      ).toBe(true);
      const answer = yield* call("threads_answer", {
        threadId: siblingId,
        requestId,
        answers: { approach: "Use the simpler approach" },
      });
      expect(answer.structuredContent).toMatchObject({ submitted: true });
      expect(fixture.commands).toMatchObject([
        {
          type: "thread.user-input.respond",
          threadId: siblingId,
          requestId,
          answers: { approach: "Use the simpler approach" },
        },
      ]);
    }).pipe(Effect.provide(fixture.testLayer));
  }),
);

it.effect("starts and follows up in a sibling thread through the shared dispatcher", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture;
    yield* Effect.gen(function* () {
      const started = yield* call("threads_start", {
        prompt: "Review this change",
        worktree: false,
      });
      expect(started.isError).toBeFalsy();
      expect(fixture.commands.map((command) => command.type)).toEqual([
        "thread.create",
        "thread.message.user.append",
        "thread.turn.start",
      ]);
      const created = fixture.commands[0];
      if (created?.type !== "thread.create") throw new Error("Expected a thread creation");
      expect(created.projectId).toBe(projectId);
      expect(created.modelSelection).toEqual(thread(sourceId).modelSelection);
      const followUp = yield* call("threads_send", {
        threadId: created.threadId,
        prompt: "Add tests",
      });
      expect(followUp.isError).toBeFalsy();
      expect(fixture.commands.at(-1)).toMatchObject({
        type: "thread.turn.start",
        threadId: created.threadId,
        message: { text: "Add tests" },
      });
      const read = yield* call("threads_read", { threadId: created.threadId });
      expect(read.structuredContent).toMatchObject({
        threadId: created.threadId,
        messages: [{ text: "Review this change" }, { text: "Add tests" }],
      });
    }).pipe(Effect.provide(fixture.testLayer));
  }),
);

it.effect("uses the target project's model and permission defaults for a new thread", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture;
    yield* Ref.set(fixture.settings, {
      ...crossProjectSettings,
      projectSettingsOverrides: {
        [otherProjectId]: {
          defaultModelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "project-model",
          },
          defaultRuntimeMode: "approval-required",
        },
      },
    });
    yield* Effect.gen(function* () {
      const started = yield* call("threads_start", {
        projectId: otherProjectId,
        prompt: "Work with target defaults",
        worktree: false,
      });
      expect(started.isError).toBeFalsy();
      const created = fixture.commands.find((command) => command.type === "thread.create");
      if (created?.type !== "thread.create") throw new Error("Expected a new thread");
      expect(created).toMatchObject({
        modelSelection: { instanceId: "codex", model: "project-model" },
        runtimeMode: "approval-required",
        interactionMode: "default",
      });
      expect(
        fixture.commands.find((command) => command.type === "thread.turn.start"),
      ).toMatchObject({
        modelSelection: { instanceId: "codex", model: "project-model" },
        runtimeMode: "approval-required",
      });
      const explicit = yield* call("threads_start", {
        projectId: otherProjectId,
        prompt: "Use the selected model",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "explicit-model" },
        worktree: false,
      });
      expect(explicit.isError).toBeFalsy();
      expect(
        fixture.commands.findLast((command) => command.type === "thread.create"),
      ).toMatchObject({
        modelSelection: { model: "explicit-model" },
        runtimeMode: "approval-required",
      });
    }).pipe(Effect.provide(fixture.testLayer));
  }),
);

it.effect("starts a separate worktree with the same bootstrap sequence as the client", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture;
    yield* Effect.gen(function* () {
      const started = yield* call("threads_start", { prompt: "Review independently" });
      expect(started.isError).toBeFalsy();
      expect(fixture.commands.map((command) => command.type)).toContain("thread.meta.update");
      const created = fixture.commands.find((command) => command.type === "thread.create");
      if (created?.type !== "thread.create") throw new Error("Expected a new thread");
      expect(created.branch).toBe("main");
      expect(fixture.commands).toContainEqual(
        expect.objectContaining({
          type: "thread.meta.update",
          threadId: created.threadId,
          worktreePath: "/repo-worktree",
        }),
      );
      expect(fixture.commands).toContainEqual(
        expect.objectContaining({
          type: "thread.turn.start",
          threadId: created.threadId,
        }),
      );
    }).pipe(Effect.provide(fixture.testLayer));
  }),
);

it.effect("waits on domain events for the requested turn and returns its completion", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = yield* makeFixture;
      const messageId = MessageId.make("requested-message");
      fixture.messages.set(siblingId, [
        {
          id: messageId,
          role: "user",
          text: "Review",
          turnId: null,
          streaming: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]);
      fixture.threads.set(siblingId, {
        ...thread(siblingId),
        latestTurn: {
          turnId: TurnId.make("older-turn"),
          state: "completed",
          requestedAt: timestamp,
          startedAt: timestamp,
          completedAt: timestamp,
          assistantMessageId: null,
        },
      });
      const result = yield* Effect.gen(function* () {
        const waiting = yield* call("threads_wait", { threadId: siblingId, messageId }).pipe(
          Effect.forkScoped,
        );
        yield* Deferred.await(fixture.checked);
        fixture.acceptedActivities.set(siblingId, [
          {
            id: mcpTurnAcceptedActivityId(messageId),
            kind: MCP_TURN_ACCEPTED_ACTIVITY_KIND,
            tone: "info",
            summary: "MCP turn accepted",
            payload: { messageId },
            turnId: TurnId.make("turn-review"),
            createdAt: timestamp,
          },
        ]);
        const sibling = fixture.threads.get(siblingId)!;
        fixture.threads.set(siblingId, {
          ...sibling,
          latestTurn: {
            turnId: TurnId.make("turn-review"),
            state: "completed",
            requestedAt: timestamp,
            startedAt: timestamp,
            completedAt: timestamp,
            assistantMessageId: null,
          },
        });
        yield* PubSub.publish(fixture.events, {
          sequence: 1,
          eventId: EventId.make("event-completed"),
          aggregateKind: "thread",
          aggregateId: siblingId,
          type: "thread.session-set",
          occurredAt: timestamp,
          commandId: null,
          causationEventId: null,
          correlationId: null,
          metadata: {},
          payload: {
            threadId: siblingId,
            session: {
              threadId: siblingId,
              status: "ready",
              providerName: "codex",
              runtimeMode: "full-access",
              activeTurnId: null,
              lastError: null,
              updatedAt: timestamp,
            },
          },
        });
        return yield* Fiber.join(waiting);
      }).pipe(Effect.provide(fixture.testLayer));
      expect(result.structuredContent).toMatchObject({
        threadId: siblingId,
        messageId,
        state: "completed",
        turnId: "turn-review",
      });
    }),
  ),
);

it.effect("waits for the accepted turn when a message steers an older running turn", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture;
    const messageId = MessageId.make("steered-message");
    const turnId = TurnId.make("steered-turn");
    fixture.messages.set(siblingId, [
      {
        id: messageId,
        role: "user",
        text: "Adjust the approach",
        turnId: null,
        streaming: false,
        createdAt: "2026-08-01T00:00:01.000Z",
        updatedAt: "2026-08-01T00:00:01.000Z",
      },
    ]);
    fixture.threads.set(siblingId, {
      ...thread(siblingId),
      latestTurn: {
        turnId,
        state: "completed",
        requestedAt: timestamp,
        startedAt: timestamp,
        completedAt: "2026-08-01T00:00:02.000Z",
        assistantMessageId: null,
      },
    });
    fixture.acceptedActivities.set(siblingId, [
      {
        id: mcpTurnAcceptedActivityId(messageId),
        kind: MCP_TURN_ACCEPTED_ACTIVITY_KIND,
        tone: "info",
        summary: "MCP turn accepted",
        payload: { messageId },
        turnId,
        createdAt: "2026-08-01T00:00:01.000Z",
      },
    ]);
    yield* Effect.gen(function* () {
      const result = yield* call("threads_wait", { threadId: siblingId, messageId });
      expect(result.structuredContent).toMatchObject({ state: "completed", turnId });
    }).pipe(Effect.provide(fixture.testLayer));
  }),
);

it.effect("reports the accepted parent despite later user work and a child's pending input", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture;
    const messageId = MessageId.make("fanout-message");
    const turnId = TurnId.make("fanout-parent");
    fixture.messages.set(siblingId, [
      {
        id: messageId,
        role: "user",
        text: "Review with subagents",
        turnId: null,
        streaming: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: MessageId.make("later-message"),
        role: "user",
        text: "Later task",
        turnId: null,
        streaming: false,
        createdAt: "2026-08-01T00:00:01.000Z",
        updatedAt: "2026-08-01T00:00:01.000Z",
      },
    ]);
    const childTurnId = TurnId.make("fanout-child");
    fixture.threads.set(siblingId, {
      ...thread(siblingId),
      hasPendingUserInput: true,
      latestTurn: {
        turnId: childTurnId,
        state: "running",
        requestedAt: timestamp,
        startedAt: timestamp,
        completedAt: timestamp,
        assistantMessageId: null,
      },
    });
    fixture.activities.set(siblingId, [
      {
        id: EventId.make("child-question"),
        kind: "user-input.requested",
        tone: "info",
        summary: "Child question",
        payload: {
          requestId: ApprovalRequestId.make("child-question"),
          questions: [
            {
              id: "q",
              header: "Question",
              question: "Proceed?",
              options: [],
              multiSelect: false,
              allowCustomAnswer: true,
            },
          ],
        },
        turnId: childTurnId,
        createdAt: timestamp,
      },
    ]);
    fixture.acceptedTurnStates.set(messageId, "completed");
    fixture.acceptedActivities.set(siblingId, [
      {
        id: mcpTurnAcceptedActivityId(messageId),
        kind: MCP_TURN_ACCEPTED_ACTIVITY_KIND,
        tone: "info",
        summary: "MCP turn accepted",
        payload: { messageId },
        turnId,
        createdAt: timestamp,
      },
    ]);
    yield* Effect.gen(function* () {
      const result = yield* call("threads_wait", { threadId: siblingId, messageId });
      expect(result.structuredContent).toMatchObject({ state: "completed", turnId });
    }).pipe(Effect.provide(fixture.testLayer));
  }),
);

it.effect("returns pending input without sending another turn to a blocked thread", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture;
    const messageId = MessageId.make("blocked-message");
    fixture.messages.set(siblingId, [
      {
        id: messageId,
        role: "user",
        text: "Review",
        turnId: null,
        streaming: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
    const turnId = TurnId.make("blocked-turn");
    fixture.threads.set(siblingId, { ...thread(siblingId), hasPendingUserInput: true });
    fixture.acceptedTurnStates.set(messageId, "running");
    fixture.acceptedActivities.set(siblingId, [
      {
        id: mcpTurnAcceptedActivityId(messageId),
        kind: MCP_TURN_ACCEPTED_ACTIVITY_KIND,
        tone: "info",
        summary: "MCP turn accepted",
        payload: { messageId },
        turnId,
        createdAt: timestamp,
      },
    ]);
    fixture.activities.set(siblingId, [
      {
        id: EventId.make("blocked-question"),
        kind: "user-input.requested",
        tone: "info",
        summary: "Answer this",
        payload: {
          requestId: ApprovalRequestId.make("blocked-question"),
          questions: [
            {
              id: "q",
              header: "Question",
              question: "Proceed?",
              options: [],
              multiSelect: false,
              allowCustomAnswer: true,
            },
          ],
        },
        turnId,
        createdAt: timestamp,
      },
    ]);
    yield* Effect.gen(function* () {
      const waiting = yield* call("threads_wait", { threadId: siblingId, messageId });
      expect(waiting.structuredContent).toMatchObject({ state: "needs-input" });
      const sent = yield* call("threads_send", { threadId: siblingId, prompt: "More work" });
      expect(sent.isError).toBe(true);
      expect(fixture.commands).toHaveLength(0);
    }).pipe(Effect.provide(fixture.testLayer));
  }),
);

it.effect("waits for a failure tied to the requested message, not an older session error", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = yield* makeFixture;
      const messageId = MessageId.make("failure-message");
      fixture.messages.set(siblingId, [
        {
          id: messageId,
          role: "user",
          text: "Review",
          turnId: null,
          streaming: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]);
      fixture.threads.set(siblingId, {
        ...thread(siblingId),
        session: {
          threadId: siblingId,
          status: "error",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: "Old error",
          updatedAt: timestamp,
        },
      });
      const result = yield* Effect.gen(function* () {
        const waiting = yield* call("threads_wait", { threadId: siblingId, messageId }).pipe(
          Effect.forkScoped,
        );
        yield* Deferred.await(fixture.checked);
        fixture.activities.set(siblingId, [
          {
            id: EventId.make("turn-start-failed"),
            kind: "provider.turn.start.failed",
            tone: "error",
            summary: "Provider turn start failed",
            payload: { requestId: messageId, detail: "Provider unavailable" },
            turnId: null,
            createdAt: timestamp,
          },
        ]);
        yield* PubSub.publish(fixture.events, {
          sequence: 1,
          eventId: EventId.make("failure-event"),
          aggregateKind: "thread",
          aggregateId: siblingId,
          type: "thread.activity-appended",
          occurredAt: timestamp,
          commandId: null,
          causationEventId: null,
          correlationId: null,
          metadata: {},
          payload: { threadId: siblingId, activity: fixture.activities.get(siblingId)![0]! },
        });
        return yield* Fiber.join(waiting);
      }).pipe(Effect.provide(fixture.testLayer));
      expect(result.structuredContent).toMatchObject({ state: "error", messageId });
    }),
  ),
);

it.effect("pages thread messages and makes the rest of a long result retrievable", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture;
    fixture.messages.set(
      siblingId,
      Array.from({ length: 13 }, (_, index) => ({
        id: MessageId.make(`message-${index}`),
        role: "assistant" as const,
        text: "x".repeat(5_000),
        turnId: null,
        streaming: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
    yield* Effect.gen(function* () {
      const read = yield* call("threads_read", { threadId: siblingId });
      expect(read.isError).toBeFalsy();
      expect(read.structuredContent).toMatchObject({ approvals: [], questions: [] });
      const output = yield* decodeMessages(read.structuredContent);
      expect(output.messages).toHaveLength(10);
      expect(output.messages[0]?.messageId).toBe(MessageId.make("message-3"));
      expect(output.messages.every((entry) => entry.text.length === 1_500)).toBe(true);
      expect(read.structuredContent).toMatchObject({ nextMessageId: MessageId.make("message-3") });
      const older = yield* call("threads_read", {
        threadId: siblingId,
        beforeMessageId: MessageId.make("message-3"),
      });
      expect(older.structuredContent).toMatchObject({ nextMessageId: null });
      const olderMessages = yield* decodeMessages(older.structuredContent);
      expect(olderMessages.messages.map((entry) => entry.messageId)).toEqual([
        MessageId.make("message-0"),
        MessageId.make("message-1"),
        MessageId.make("message-2"),
      ]);
      const continued = yield* call("threads_read", {
        threadId: siblingId,
        messageId: MessageId.make("message-0"),
        textOffset: 1_500,
      });
      expect(continued.structuredContent).toMatchObject({
        expandedMessage: { text: "x".repeat(1_500), nextTextOffset: 3_000 },
      });
      expect(
        (yield* call("threads_read", { threadId: siblingId, textOffset: 1_500 })).isError,
      ).toBe(true);
    }).pipe(Effect.provide(fixture.testLayer));
  }),
);

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  AuthOrchestrationReadScope,
  AuthSessionId,
  EnvironmentId,
  OrchestrationV2ThreadShell,
  ProjectId,
  ProviderInstanceId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  type PairedNotificationRegistration,
} from "@t3tools/contracts";
import * as FcmClient from "@t3tools/shared/FcmClient";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as AuthSessions from "../persistence/AuthSessions.ts";
import * as NotificationStore from "./NotificationStore.ts";
import * as PairedNotifications from "./PairedNotifications.ts";

const NOW = DateTime.makeUnsafe("2026-10-10T12:00:00Z");
const SESSION = AuthSessionId.make("paired-phone");
const OTHER_SESSION = AuthSessionId.make("another-phone");
const ENVIRONMENT = EnvironmentId.make("private-environment");
const THREAD = ThreadId.make("private-thread");
const REGISTRATION: PairedNotificationRegistration = {
  registrationId: "5ea7c5d1-89c1-4e23-8b31-1ca2b4a9b8ef",
  pushToken: "phone-token",
  packageName: "com.t3tools.t3code.dev",
};

function threadShell(patch: Partial<OrchestrationV2ThreadShell> = {}): OrchestrationV2ThreadShell {
  return OrchestrationV2ThreadShell.make({
    createdBy: "user",
    creationSource: "mobile",
    id: THREAD,
    projectId: ProjectId.make("private-project"),
    title: "Sensitive thread title",
    providerInstanceId: ProviderInstanceId.make("codex"),
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "private-model" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    lineage: { rootThreadId: THREAD, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    activeProviderThreadId: null,
    latestRunId: RunId.make("run-one"),
    latestRunCompletedAt: null,
    activeRunId: RunId.make("run-one"),
    status: "running",
    pendingRuntimeRequest: null,
    latestVisibleMessage: null,
    latestUserMessageAt: NOW,
    hasActionableProposedPlan: false,
    pendingBackgroundTasks: [],
    providerInstanceHistory: [],
    itemCount: 0,
    visibleItemCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    ...patch,
  });
}

const fixture = Effect.fnUntraced(function* (configured = true) {
  yield* TestClock.setTime(NOW.epochMilliseconds);
  const persisted = yield* Layer.build(
    NotificationStore.layer.pipe(
      Layer.provideMerge(ServerSecretStore.layer),
      Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "paired-notifications-" })),
    ),
  );
  const store = Context.get(persisted, NotificationStore.NotificationStore);
  const secrets = Context.get(persisted, ServerSecretStore.ServerSecretStore);
  const state: {
    thread: OrchestrationV2ThreadShell;
    revoked: boolean;
    expiresAt: DateTime.Utc;
    failure: FcmClient.FcmClientError | null;
    unregistered: boolean;
    sent: Array<Parameters<FcmClient.FcmClient["Service"]["send"]>[0]>;
  } = {
    thread: threadShell(),
    revoked: false,
    expiresAt: DateTime.makeUnsafe("2027-10-10T12:00:00Z"),
    failure: null,
    unregistered: false,
    sent: [],
  };
  const dependencies = Layer.mergeAll(
    Layer.mock(AuthSessions.AuthSessionRepository)({
      getById: ({ sessionId }) =>
        Effect.succeedSome({
          sessionId,
          subject: "paired-client",
          scopes: [AuthOrchestrationReadScope],
          method: "bearer-access-token",
          client: {
            label: null,
            ipAddress: null,
            userAgent: null,
            deviceType: "mobile",
            os: "android",
            browser: null,
          },
          issuedAt: NOW,
          expiresAt: state.expiresAt,
          lastConnectedAt: null,
          revokedAt: state.revoked ? NOW : null,
        }),
    }),
    Layer.mock(ThreadManagement.ThreadManagementService)({
      getThreadShell: () => Effect.succeed(state.thread),
      getShellSnapshot: () =>
        Effect.succeed({
          schemaVersion: 2,
          snapshotSequence: 0,
          threads: [state.thread],
          archivedThreads: [],
        }),
      streamDomainEvents: Stream.empty,
    }),
    Layer.mock(ServerEnvironment.ServerEnvironment)({
      getEnvironmentId: Effect.succeed(ENVIRONMENT),
    }),
    Layer.succeed(FcmClient.FcmClient, {
      configured,
      send: (input) =>
        Effect.gen(function* () {
          state.sent.push(input);
          if (state.failure) return yield* state.failure;
          return { unregistered: state.unregistered };
        }),
    }),
  );
  const loadService = (notificationStore: NotificationStore.NotificationStore["Service"]) =>
    Layer.build(
      PairedNotifications.layer.pipe(
        Layer.provide(dependencies),
        Layer.provide(Layer.succeed(NotificationStore.NotificationStore, notificationStore)),
      ),
    ).pipe(Effect.map((context) => Context.get(context, PairedNotifications.PairedNotifications)));
  const notifications = yield* loadService(store);
  const restart = Effect.gen(function* () {
    const context = yield* Layer.build(
      NotificationStore.layer.pipe(
        Layer.provide(Layer.succeed(ServerSecretStore.ServerSecretStore, secrets)),
      ),
    );
    const restored = Context.get(context, NotificationStore.NotificationStore);
    return { notifications: yield* loadService(restored), store: restored };
  });
  return { notifications, store, state, restart };
});

describe("paired environment notifications", () => {
  it.effect("coalesces concurrent observations into one alert", () =>
    Effect.gen(function* () {
      const { notifications, state } = yield* fixture();
      yield* notifications.register(SESSION, REGISTRATION);
      state.thread = threadShell({ status: "failed", latestRunCompletedAt: NOW });
      yield* Effect.all(
        [notifications.publishThread(THREAD), notifications.publishThread(THREAD)],
        { concurrency: "unbounded" },
      );
      yield* notifications.drain;
      expect(state.sent).toHaveLength(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("does not retry superseded or expired alerts", () =>
    Effect.gen(function* () {
      const { notifications, state, restart } = yield* fixture();
      yield* notifications.register(SESSION, REGISTRATION);
      state.thread = threadShell({
        pendingRuntimeRequest: {
          id: RuntimeRequestId.make("request"),
          kind: "command",
          createdAt: NOW,
        },
      });
      state.failure = new FcmClient.FcmClientError({ operation: "send", status: 503 });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      state.failure = null;
      state.thread = threadShell();
      const resumed = yield* restart;
      yield* resumed.notifications.start();
      yield* resumed.notifications.drain;
      expect(state.sent).toHaveLength(1);
      state.thread = threadShell({ status: "failed", latestRunCompletedAt: NOW });
      state.failure = new FcmClient.FcmClientError({ operation: "send", status: 503 });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      state.failure = null;
      yield* TestClock.setTime(NOW.epochMilliseconds + 360_000);
      const expired = yield* restart;
      yield* expired.notifications.start();
      yield* expired.notifications.drain;
      expect(state.sent).toHaveLength(2);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "keeps registration IDs session-owned while allowing the same phone to pair again",
    () =>
      Effect.gen(function* () {
        const { notifications } = yield* fixture();
        yield* notifications.register(SESSION, REGISTRATION);
        expect(
          (yield* notifications.register(OTHER_SESSION, {
            ...REGISTRATION,
            pushToken: "other-phone",
          })).registrationId,
        ).toBeNull();
        expect((yield* notifications.status(SESSION)).registrationId).toBe(
          REGISTRATION.registrationId,
        );
        expect((yield* notifications.register(OTHER_SESSION, REGISTRATION)).registrationId).toBe(
          REGISTRATION.registrationId,
        );
        expect((yield* notifications.status(SESSION)).registrationId).toBeNull();
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "sends one generic completion and resolves its destination only for its paired owner",
    () =>
      Effect.gen(function* () {
        const { notifications, state } = yield* fixture();
        yield* notifications.register(SESSION, REGISTRATION);
        yield* notifications.publishThread(THREAD);
        state.thread = threadShell({
          status: "completed",
          latestRunCompletedAt: NOW,
          activeRunId: null,
        });
        yield* notifications.publishThread(THREAD);
        yield* notifications.drain;
        yield* notifications.publishThread(THREAD);
        yield* notifications.drain;
        expect(state.sent).toHaveLength(1);
        const message = state.sent[0]!;
        expect(Object.keys(message.data).sort()).toEqual([
          "notification_id",
          "phase",
          "registration_id",
          "t3_kind",
          "updated_at",
        ]);
        expect(JSON.stringify(message.data)).not.toContain("private");
        const reference = {
          registrationId: REGISTRATION.registrationId,
          notificationId: message.data.notification_id!,
        };
        expect(yield* notifications.resolve(SESSION, reference)).toEqual({
          environmentId: ENVIRONMENT,
          threadId: THREAD,
        });
        expect(yield* notifications.resolve(OTHER_SESSION, reference)).toBeNull();
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "delivers approval and input requests once each, including subsequent requests in the same run",
    () =>
      Effect.gen(function* () {
        const { notifications, state } = yield* fixture();
        yield* notifications.register(SESSION, REGISTRATION);
        for (const [kind, id] of [
          ["command", "approve-one"],
          ["user_input", "input-one"],
          ["user_input", "input-two"],
        ] as const) {
          state.thread = threadShell({
            pendingRuntimeRequest: { kind, id: RuntimeRequestId.make(id), createdAt: NOW },
          });
          yield* notifications.publishThread(THREAD);
          yield* notifications.drain;
          yield* notifications.publishThread(THREAD);
          yield* notifications.drain;
        }
        expect(state.sent.map((entry) => entry.data.phase)).toEqual([
          "waiting_for_approval",
          "waiting_for_input",
          "waiting_for_input",
        ]);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("replaces rotated tokens, removes invalid tokens, and supports opting out", () =>
    Effect.gen(function* () {
      const { notifications, state } = yield* fixture();
      yield* notifications.register(SESSION, REGISTRATION);
      yield* notifications.register(SESSION, { ...REGISTRATION, pushToken: "rotated-token" });
      state.unregistered = true;
      state.thread = threadShell({ status: "failed", latestRunCompletedAt: NOW });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      expect(state.sent.map((entry) => entry.token)).toEqual(["rotated-token"]);
      expect((yield* notifications.status(SESSION)).registrationId).toBeNull();
      yield* notifications.register(SESSION, REGISTRATION);
      yield* notifications.unregister(OTHER_SESSION, REGISTRATION.registrationId);
      expect((yield* notifications.status(SESSION)).registrationId).toBe(
        REGISTRATION.registrationId,
      );
      yield* notifications.unregister(SESSION, REGISTRATION.registrationId);
      expect((yield* notifications.status(SESSION)).registrationId).toBeNull();
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "retries persisted deliveries on restart without repeating already delivered alerts",
    () =>
      Effect.gen(function* () {
        const { notifications, state, restart } = yield* fixture();
        yield* notifications.register(SESSION, REGISTRATION);
        state.thread = threadShell({ status: "failed", latestRunCompletedAt: NOW });
        state.failure = new FcmClient.FcmClientError({ operation: "send", status: 503 });
        yield* notifications.publishThread(THREAD);
        yield* notifications.drain;
        state.failure = null;
        const restarted = yield* restart;
        yield* restarted.notifications.start();
        yield* restarted.notifications.drain;
        expect(state.sent).toHaveLength(2);
        expect(state.sent[1]!.data.notification_id).toBe(state.sent[0]!.data.notification_id);
        yield* restarted.notifications.publishThread(THREAD);
        yield* restarted.notifications.drain;
        expect(state.sent).toHaveLength(2);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("revocation or expiry prevents queued sends and reference resolution", () =>
    Effect.gen(function* () {
      const { notifications, state, restart } = yield* fixture();
      yield* notifications.register(SESSION, REGISTRATION);
      state.thread = threadShell({ status: "failed", latestRunCompletedAt: NOW });
      state.failure = new FcmClient.FcmClientError({ operation: "send", status: 503 });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      const reference = {
        registrationId: REGISTRATION.registrationId,
        notificationId: state.sent[0]!.data.notification_id!,
      };
      state.revoked = true;
      expect(yield* notifications.resolve(SESSION, reference)).toBeNull();
      const restarted = yield* restart;
      yield* restarted.notifications.start();
      yield* restarted.notifications.drain;
      expect(state.sent).toHaveLength(1);
      expect((yield* restarted.notifications.status(SESSION)).registrationId).toBeNull();
      state.revoked = false;
      state.expiresAt = NOW;
      expect((yield* notifications.register(SESSION, REGISTRATION)).registrationId).toBeNull();
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("does not replay old completed work or alert for subagents and archived threads", () =>
    Effect.gen(function* () {
      const { notifications, state } = yield* fixture();
      yield* notifications.register(SESSION, REGISTRATION);
      state.thread = threadShell({
        status: "completed",
        latestRunCompletedAt: DateTime.makeUnsafe(NOW.epochMilliseconds - 600_000),
      });
      yield* notifications.publishThread(THREAD);
      state.thread = threadShell({ status: "failed", latestRunCompletedAt: NOW, archivedAt: NOW });
      yield* notifications.publishThread(THREAD);
      state.thread = threadShell({
        status: "failed",
        latestRunCompletedAt: NOW,
        lineage: {
          rootThreadId: ThreadId.make("root"),
          parentThreadId: ThreadId.make("root"),
          relationshipToParent: "subagent",
        },
      });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      expect(state.sent).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("works as a disabled optional capability without Firebase credentials", () =>
    Effect.gen(function* () {
      const { notifications, state } = yield* fixture(false);
      expect(yield* notifications.register(SESSION, REGISTRATION)).toEqual({
        configured: false,
        registrationId: null,
      });
      state.thread = threadShell({ status: "failed", latestRunCompletedAt: NOW });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      expect(state.sent).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  AuthOrchestrationReadScope,
  AuthSessionId,
  EnvironmentId,
  OrchestrationV2ThreadShell,
  Project,
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
import * as Scope from "effect/Scope";
import * as Exit from "effect/Exit";
import * as TestClock from "effect/testing/TestClock";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as AuthSessions from "../persistence/AuthSessions.ts";
import * as NotificationStore from "./NotificationStore.ts";
import * as PairedNotifications from "./PairedNotifications.ts";
import { encryptionLayer, makePhoneKey, openNotification } from "./notificationTestUtils.ts";

const NOW = DateTime.makeUnsafe("2026-10-10T12:00:00Z");
const SESSION = AuthSessionId.make("paired-phone");
const OTHER_SESSION = AuthSessionId.make("another-phone");
const ENVIRONMENT = EnvironmentId.make("private-environment");
const THREAD = ThreadId.make("private-thread");
const phone = makePhoneKey();
const REGISTRATION: PairedNotificationRegistration = {
  registrationId: "5ea7c5d1-89c1-4e23-8b31-1ca2b4a9b8ef",
  pushToken: "phone-token",
  packageName: "com.t3tools.t3code.dev",
  encryptionPublicKey: phone.publicKey,
  preferences: {
    notificationsEnabled: true,
    liveActivitiesEnabled: true,
    notifyOnApproval: true,
    notifyOnInput: true,
    notifyOnCompletion: true,
    notifyOnFailure: true,
  },
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
    others: OrchestrationV2ThreadShell[];
    revoked: boolean;
    expiresAt: DateTime.Utc;
    failure: FcmClient.FcmClientError | null;
    unregistered: boolean;
    sent: Array<Parameters<FcmClient.FcmClient["Service"]["send"]>[0]>;
  } = {
    thread: threadShell(),
    others: [],
    revoked: false,
    expiresAt: DateTime.makeUnsafe("2027-10-10T12:00:00Z"),
    failure: null,
    unregistered: false,
    sent: [],
  };
  const dependencies = Layer.mergeAll(
    encryptionLayer,
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
      getThreadShell: (id) =>
        Effect.succeed(
          id === state.thread.id
            ? state.thread
            : (state.others.find((thread) => thread.id === id) ?? null),
        ),
      getShellSnapshot: () =>
        Effect.succeed({
          schemaVersion: 2,
          snapshotSequence: 0,
          threads: [state.thread, ...state.others],
          archivedThreads: [],
        }),
      streamDomainEvents: Stream.empty,
    }),
    Layer.mock(ProjectService.ProjectService)({
      getById: () =>
        Effect.succeedSome(
          Project.make({
            id: ProjectId.make("private-project"),
            title: "Private project",
            workspaceRoot: "/private/project",
            defaultModelSelection: null,
            scripts: [],
            createdAt: DateTime.formatIso(NOW),
            updatedAt: DateTime.formatIso(NOW),
            deletedAt: null,
          }),
        ),
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
  let serviceScope = yield* Scope.make();
  yield* Effect.addFinalizer(() => Scope.close(serviceScope, Exit.void));
  const loadService = (notificationStore: NotificationStore.NotificationStore["Service"]) =>
    Layer.build(
      PairedNotifications.layer.pipe(
        Layer.provide(dependencies),
        Layer.provide(Layer.succeed(NotificationStore.NotificationStore, notificationStore)),
      ),
    ).pipe(
      Effect.provideService(Scope.Scope, serviceScope),
      Effect.map((context) => Context.get(context, PairedNotifications.PairedNotifications)),
    );
  const notifications = yield* loadService(store);
  const restart = Effect.gen(function* () {
    yield* Scope.close(serviceScope, Exit.void);
    serviceScope = yield* Scope.make();
    const context = yield* Layer.build(
      NotificationStore.layer.pipe(
        Layer.provide(Layer.succeed(ServerSecretStore.ServerSecretStore, secrets)),
      ),
    );
    const restored = Context.get(context, NotificationStore.NotificationStore);
    return { notifications: yield* loadService(restored), store: restored };
  });
  const register = Effect.gen(function* () {
    yield* notifications.register(SESSION, REGISTRATION);
    yield* notifications.drain;
    state.sent.length = 0;
  });
  const payloads = (): ReadonlyArray<Record<string, string>> =>
    state.sent.map((entry) => openNotification(entry.data, phone.privateKey));
  return { notifications, store, secrets, state, restart, register, payloads };
});

describe("encrypted paired agent activity", () => {
  it.effect("silently establishes a rich ongoing card when registering", () =>
    Effect.gen(function* () {
      const { notifications, state, payloads } = yield* fixture();
      yield* notifications.register(SESSION, REGISTRATION);
      yield* notifications.drain;
      expect(state.sent).toHaveLength(1);
      expect(state.sent[0]?.alert).toBe(false);
      expect(payloads()[0]).toMatchObject({
        active: "true",
        activity_line_0: "Working\tSensitive thread title\tPrivate project",
        activity_path: "/threads/private-environment/private-thread",
      });
      expect(payloads()[0]?.alert_id).toBeUndefined();
      expect(JSON.stringify(state.sent[0]?.data)).not.toContain("private");
      expect(Object.keys(state.sent[0]!.data).sort()).toEqual([
        "ciphertext",
        "ephemeral_key",
        "message_id",
        "nonce",
        "registration_id",
        "t3_kind",
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("uses Connect's completion copy, finished card and replay deduplication", () =>
    Effect.gen(function* () {
      const { notifications, state, register, payloads } = yield* fixture();
      yield* register;
      state.thread = threadShell({
        status: "completed",
        activeRunId: null,
        latestRunCompletedAt: NOW,
      });
      yield* Effect.all(
        [notifications.publishThread(THREAD), notifications.publishThread(THREAD)],
        { concurrency: "unbounded" },
      );
      yield* notifications.drain;
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      expect(state.sent).toHaveLength(1);
      expect(state.sent[0]?.alert).toBe(true);
      expect(payloads()[0]).toMatchObject({
        alert_title: "Sensitive thread title",
        alert_body: "Done: Private project",
        alert_path: "/threads/private-environment/private-thread",
        active: "false",
        activity_line_0: "Done\tSensitive thread title\tPrivate project",
        activity_expires_at: String(NOW.epochMilliseconds + 900_000),
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("tracks all threads and gives approval/input priority over running work", () =>
    Effect.gen(function* () {
      const { notifications, state, register, payloads } = yield* fixture();
      state.others = [threadShell({ id: ThreadId.make("other"), title: "Other work" })];
      yield* register;
      state.thread = threadShell({
        pendingRuntimeRequest: {
          id: RuntimeRequestId.make("approval"),
          kind: "command",
          createdAt: NOW,
        },
      });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      expect(payloads()[0]).toMatchObject({
        alert_body: "Approval: Private project",
        activity_phase: "waiting_for_approval",
        activity_active_count: "2",
        activity_line_0: "Approval\tSensitive thread title\tPrivate project",
        activity_line_1: "Working\tOther work\tPrivate project",
      });
      state.thread = threadShell();
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      state.thread = threadShell({
        pendingRuntimeRequest: {
          id: RuntimeRequestId.make("input"),
          kind: "user_input",
          createdAt: NOW,
        },
      });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      expect(payloads().at(-1)?.alert_body).toBe("Input: Private project");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("honors event preferences and the ongoing activity toggle", () =>
    Effect.gen(function* () {
      const { notifications, state, payloads } = yield* fixture();
      yield* notifications.register(SESSION, {
        ...REGISTRATION,
        preferences: {
          ...REGISTRATION.preferences!,
          notifyOnCompletion: false,
          liveActivitiesEnabled: false,
        },
      });
      yield* notifications.drain;
      state.sent.length = 0;
      state.thread = threadShell({ status: "completed", latestRunCompletedAt: NOW });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      expect(payloads()[0]).toMatchObject({ active: "false", activity_expires_at: "0" });
      expect(payloads()[0]?.alert_id).toBeUndefined();
      state.thread = threadShell({ latestRunId: RunId.make("run-two") });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      state.thread = threadShell({ status: "failed", latestRunCompletedAt: NOW });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      expect(payloads().at(-1)?.alert_body).toBe("Failed: Private project");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps registrations session-owned and allows the same keyed phone to pair again", () =>
    Effect.gen(function* () {
      const { notifications, register } = yield* fixture();
      yield* register;
      expect(
        (yield* notifications.register(OTHER_SESSION, {
          ...REGISTRATION,
          pushToken: "other-phone",
        })).registrationId,
      ).toBeNull();
      expect(
        (yield* notifications.register(OTHER_SESSION, {
          ...REGISTRATION,
          encryptionPublicKey: makePhoneKey().publicKey,
        })).registrationId,
      ).toBeNull();
      expect((yield* notifications.register(OTHER_SESSION, REGISTRATION)).registrationId).toBe(
        REGISTRATION.registrationId,
      );
      expect((yield* notifications.status(SESSION)).registrationId).toBeNull();
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("replaces rotated tokens, removes invalid tokens and permits only owner opt-out", () =>
    Effect.gen(function* () {
      const { notifications, state, register } = yield* fixture();
      yield* register;
      yield* notifications.register(SESSION, { ...REGISTRATION, pushToken: "rotated-token" });
      yield* notifications.drain;
      state.sent.length = 0;
      state.unregistered = true;
      state.thread = threadShell({ status: "failed", latestRunCompletedAt: NOW });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      expect(state.sent.map((entry) => entry.token)).toEqual(["rotated-token"]);
      expect((yield* notifications.status(SESSION)).registrationId).toBeNull();
      state.unregistered = false;
      yield* notifications.register(SESSION, REGISTRATION);
      yield* notifications.unregister(OTHER_SESSION, REGISTRATION.registrationId);
      expect((yield* notifications.status(SESSION)).registrationId).toBe(
        REGISTRATION.registrationId,
      );
      yield* notifications.unregister(SESSION, REGISTRATION.registrationId);
      expect((yield* notifications.status(SESSION)).registrationId).toBeNull();
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("retries persisted encrypted deliveries without repeating delivered alerts", () =>
    Effect.gen(function* () {
      const { notifications, state, restart, register, payloads } = yield* fixture();
      yield* register;
      state.thread = threadShell({ status: "failed", latestRunCompletedAt: NOW });
      state.failure = new FcmClient.FcmClientError({ operation: "send", status: 503 });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      state.failure = null;
      const resumed = yield* restart;
      yield* resumed.notifications.start();
      yield* resumed.notifications.drain;
      expect(state.sent).toHaveLength(2);
      expect(state.sent[1]?.data.message_id).toBe(state.sent[0]?.data.message_id);
      expect(state.sent[1]?.data.ciphertext).not.toBe(state.sent[0]?.data.ciphertext);
      expect(payloads()[1]?.alert_id).toBe(payloads()[0]?.alert_id);
      yield* resumed.notifications.publishThread(THREAD);
      yield* resumed.notifications.drain;
      expect(state.sent).toHaveLength(2);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("drops stale queued alert content while updating the card to current work", () =>
    Effect.gen(function* () {
      const { notifications, state, restart, register, payloads } = yield* fixture();
      yield* register;
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
      expect(payloads().at(-1)?.alert_id).toBeUndefined();
      expect(payloads().at(-1)?.activity_phase).toBe("running");
      state.thread = threadShell({ status: "failed", latestRunCompletedAt: NOW });
      state.failure = new FcmClient.FcmClientError({ operation: "send", status: 503 });
      yield* resumed.notifications.publishThread(THREAD);
      yield* resumed.notifications.drain;
      const sentCount = state.sent.length;
      const expired = yield* restart;
      yield* TestClock.setTime(NOW.epochMilliseconds + 360_000);
      state.failure = null;
      yield* expired.notifications.start();
      yield* expired.notifications.drain;
      expect(state.sent).toHaveLength(sentCount);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("revocation and session expiry prevent queued delivery", () =>
    Effect.gen(function* () {
      const { notifications, state, restart, register } = yield* fixture();
      yield* register;
      state.thread = threadShell({ status: "failed", latestRunCompletedAt: NOW });
      state.failure = new FcmClient.FcmClientError({ operation: "send", status: 503 });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      state.revoked = true;
      const resumed = yield* restart;
      yield* resumed.notifications.start();
      yield* resumed.notifications.drain;
      expect(state.sent).toHaveLength(1);
      expect((yield* resumed.notifications.status(SESSION)).registrationId).toBeNull();
      state.revoked = false;
      state.expiresAt = NOW;
      expect((yield* notifications.register(SESSION, REGISTRATION)).registrationId).toBeNull();
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "silently clears archived work and does not alert for old completions or subagents",
    () =>
      Effect.gen(function* () {
        const { notifications, state, register, payloads } = yield* fixture();
        yield* register;
        state.thread = threadShell({
          status: "completed",
          latestRunCompletedAt: DateTime.makeUnsafe(NOW.epochMilliseconds - 600_000),
        });
        yield* notifications.publishThread(THREAD);
        yield* notifications.drain;
        expect(state.sent.every((entry) => !entry.alert)).toBe(true);
        state.thread = threadShell({ archivedAt: NOW });
        yield* notifications.publishThread(THREAD);
        yield* notifications.drain;
        expect(payloads().at(-1)?.activity_expires_at).toBe("0");
        const count = state.sent.length;
        state.thread = threadShell({
          lineage: {
            rootThreadId: ThreadId.make("root"),
            parentThreadId: ThreadId.make("root"),
            relationshipToParent: "subagent",
          },
        });
        yield* notifications.publishThread(THREAD);
        yield* notifications.drain;
        expect(state.sent).toHaveLength(count);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("requires an encryption-capable client and never falls back to rich plaintext", () =>
    Effect.gen(function* () {
      const { notifications, state } = yield* fixture();
      const { encryptionPublicKey: _key, ...legacy } = REGISTRATION;
      expect((yield* notifications.register(SESSION, legacy)).registrationId).toBeNull();
      state.thread = threadShell({ status: "failed", latestRunCompletedAt: NOW });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      expect(state.sent).toEqual([]);
      expect(
        (yield* Effect.result(
          notifications.register(SESSION, { ...REGISTRATION, encryptionPublicKey: "invalid-key" }),
        ))._tag,
      ).toBe("Failure");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("remains an optional capability without Firebase credentials", () =>
    Effect.gen(function* () {
      const { notifications, state } = yield* fixture(false);
      expect(yield* notifications.register(SESSION, REGISTRATION)).toEqual({
        configured: false,
        encryptedActivitySupported: true,
        registrationId: null,
      });
      yield* notifications.publishThread(THREAD);
      yield* notifications.drain;
      expect(state.sent).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("upgrades persisted generic registrations and keeps old taps authenticated", () =>
    Effect.gen(function* () {
      const { secrets, state, restart } = yield* fixture();
      const { encryptionPublicKey: _key, preferences: _preferences, ...legacy } = REGISTRATION;
      const notificationId = "447f043a-dbb1-4af2-a36c-8f2d9781f766";
      yield* secrets.set(
        "paired-notifications",
        new TextEncoder().encode(
          JSON.stringify({
            registrations: [{ ...legacy, sessionId: SESSION }],
            observations: [],
            notifications: [
              {
                id: notificationId,
                threadId: THREAD,
                identity: "legacy",
                phase: "completed",
                createdAt: NOW.epochMilliseconds,
                recipients: [{ registrationId: REGISTRATION.registrationId, delivered: true }],
              },
            ],
          }),
        ),
      );
      const restored = yield* restart;
      const reference = { registrationId: REGISTRATION.registrationId, notificationId };
      expect(yield* restored.notifications.resolve(SESSION, reference)).toEqual({
        environmentId: ENVIRONMENT,
        threadId: THREAD,
      });
      expect(yield* restored.notifications.resolve(OTHER_SESSION, reference)).toBeNull();
      yield* restored.notifications.register(SESSION, REGISTRATION);
      yield* restored.notifications.drain;
      expect((yield* restored.store.read).version).toBe(2);
      expect(
        state.sent.every((entry) => entry.data.t3_kind === "paired_activity_v1" && !entry.alert),
      ).toBe(true);
      state.thread = threadShell({ archivedAt: NOW });
      expect(yield* restored.notifications.resolve(SESSION, reference)).toBeNull();
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

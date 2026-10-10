import {
  AuthOrchestrationReadScope,
  type AuthSessionId,
  type PairedNotificationDestination,
  type PairedNotificationReference,
  type PairedNotificationRegistration,
  type PairedNotificationStatus,
  type OrchestrationV2ThreadShell,
  type ThreadId,
} from "@t3tools/contracts";
import type {
  RelayAgentActivityState,
  RelayAgentAwarenessPreferences,
} from "@t3tools/contracts/relay";
import {
  projectThreadAwarenessV2,
  resolveThreadAwarenessPhaseV2,
} from "@t3tools/shared/agentAwareness";
import {
  makeAggregateState,
  TERMINAL_AGENT_ACTIVITY_DISPLAY_TTL_MS,
} from "@t3tools/shared/agentActivityAggregate";
import {
  androidActivityData,
  androidAlertForAggregate,
} from "@t3tools/shared/agentActivityAndroid";
import { isExpiredAgentActivityState } from "@t3tools/shared/agentActivityPayloads";
import * as FcmClient from "@t3tools/shared/FcmClient";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import { stableStringify } from "@t3tools/shared/relaySigning";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import * as AuthSessions from "../persistence/AuthSessions.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { shouldPublishAgentAwarenessEvent } from "../relay/AgentAwarenessRelay.ts";
import { forkParked } from "../serverActivation.ts";
import * as NotificationStore from "./NotificationStore.ts";
import * as NotificationEncryption from "./NotificationEncryption.ts";

const DELIVERY_TTL_MS = 5 * 60_000;
const REFERENCE_TTL_MS = 7 * 24 * 60 * 60_000;
const DEFAULT_PREFERENCES: RelayAgentAwarenessPreferences = {
  liveActivitiesEnabled: true,
  notificationsEnabled: true,
  notifyOnApproval: true,
  notifyOnInput: true,
  notifyOnCompletion: true,
  notifyOnFailure: true,
};
type Registration = NotificationStore.NotificationState["registrations"][number];

export class PairedNotificationError extends Schema.TaggedError<PairedNotificationError>()(
  "PairedNotificationError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not update paired notifications.";
  }
}

export class PairedNotifications extends Context.Service<
  PairedNotifications,
  {
    readonly status: (sessionId: AuthSessionId) => Effect.Effect<PairedNotificationStatus>;
    readonly register: (
      sessionId: AuthSessionId,
      input: PairedNotificationRegistration,
    ) => Effect.Effect<PairedNotificationStatus, PairedNotificationError>;
    readonly unregister: (
      sessionId: AuthSessionId,
      registrationId: string,
    ) => Effect.Effect<PairedNotificationStatus, PairedNotificationError>;
    readonly resolve: (
      sessionId: AuthSessionId,
      reference: PairedNotificationReference,
    ) => Effect.Effect<PairedNotificationDestination | null, PairedNotificationError>;
    readonly publishThread: (threadId: ThreadId) => Effect.Effect<void, PairedNotificationError>;
    readonly drain: Effect.Effect<void>;
    readonly start: () => Effect.Effect<void, PairedNotificationError, Scope.Scope>;
  }
>()("t3/notifications/PairedNotifications") {}

const make = Effect.gen(function* () {
  const store = yield* NotificationStore.NotificationStore;
  const sessions = yield* AuthSessions.AuthSessionRepository;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const projects = yield* ProjectService.ProjectService;
  const environment = yield* ServerEnvironment.ServerEnvironment;
  const sender = yield* FcmClient.FcmClient;
  const encryption = yield* NotificationEncryption.NotificationEncryption;
  const crypto = yield* Crypto.Crypto;
  const configured = sender.configured;
  const observationLock = yield* Semaphore.make(1);
  const catchUpFinished = yield* Deferred.make<void>();
  let started = false;

  const authorized = Effect.fnUntraced(function* (sessionId: AuthSessionId) {
    const session = yield* sessions.getById({ sessionId });
    const now = yield* Clock.currentTimeMillis;
    return (
      Option.isSome(session) &&
      session.value.revokedAt === null &&
      session.value.expiresAt.epochMilliseconds > now &&
      session.value.scopes.includes(AuthOrchestrationReadScope) &&
      session.value.subject !== "mcp-client"
    );
  });

  const status: PairedNotifications["Service"]["status"] = Effect.fnUntraced(function* (sessionId) {
    const state = yield* store.read;
    return {
      configured,
      encryptedActivitySupported: true,
      registrationId:
        state.registrations.find(
          (entry) => entry.sessionId === sessionId && entry.encryptionPublicKey,
        )?.registrationId ?? null,
    };
  });

  // Only tracked live/recent threads are re-read, never the whole shell on a delivery.
  const currentActivities = Effect.fnUntraced(function* (now: number) {
    const state = yield* store.read;
    return yield* Effect.forEach(
      state.observations.filter(
        (entry) =>
          entry.activity !== null &&
          !isExpiredAgentActivityState(entry.activity, now) &&
          ((entry.activity.phase !== "completed" && entry.activity.phase !== "failed") ||
            now - Date.parse(entry.activity.updatedAt) <= TERMINAL_AGENT_ACTIVITY_DISPLAY_TTL_MS),
      ),
      (entry) =>
        Effect.gen(function* () {
          const thread = yield* threads.getThreadShell(entry.threadId);
          return thread &&
            thread.archivedAt === null &&
            notificationIdentity(thread) === entry.identity
            ? entry.activity
            : null;
        }),
    ).pipe(
      Effect.map((activities) =>
        activities.filter((activity): activity is RelayAgentActivityState => activity !== null),
      ),
    );
  });

  const deliverRecipient = Effect.fnUntraced(function* (registration: Registration) {
    const pending = registration.pending;
    if (
      !pending ||
      !registration.encryptionPublicKey ||
      !(yield* authorized(registration.sessionId))
    )
      return;
    const now = yield* Clock.currentTimeMillis;
    if (now - pending.queuedAt >= DELIVERY_TTL_MS) return;
    const aggregate = makeAggregateState({
      activeStates: yield* currentActivities(now),
      terminalState: null,
      nowMs: now,
    });
    const preferences = registration.preferences ?? DEFAULT_PREFERENCES;
    const previousAggregate = registration.lastAggregate ?? {
      title: "T3 Code",
      subtitle: "Agent work in progress",
      activeCount: 0,
      updatedAt: DateTime.formatIso(DateTime.makeUnsafe(now)),
      activities: [],
    };
    const alert =
      !pending.silent && aggregate
        ? androidAlertForAggregate({
            previousAggregate,
            nextAggregate: aggregate,
            preferences,
            nowMs: now,
          })
        : null;
    const data: Record<string, string> = {
      updated_at: String(pending.queuedAt),
      ...androidActivityData(
        preferences.notificationsEnabled && preferences.liveActivitiesEnabled ? aggregate : null,
      ),
      ...alert,
    };
    if (alert) {
      const digest = yield* crypto.digest("SHA-256", new TextEncoder().encode(alert.alert_id));
      data.alert_id = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    const sealed = yield* encryption.seal({
      publicKey: registration.encryptionPublicKey,
      registrationId: registration.registrationId,
      messageId: pending.id,
      data,
    });
    // Encryption can yield; recheck the current pairing and registration before handing off to FCM.
    const latest = (yield* store.read).registrations.find(
      (entry) => entry.registrationId === registration.registrationId,
    );
    if (
      !latest ||
      !sameRecipient(latest, registration) ||
      latest.pending?.id !== pending.id ||
      !(yield* authorized(registration.sessionId))
    )
      return;
    const result = yield* sender.send({
      token: registration.pushToken,
      packageName: registration.packageName,
      alert: alert !== null,
      data: sealed,
    });
    yield* store.update((current) => ({
      ...current,
      registrations: current.registrations.flatMap((entry) => {
        if (
          entry.registrationId !== registration.registrationId ||
          !sameRecipient(entry, registration)
        )
          return [entry];
        if (result.unregistered) return [];
        return [
          {
            ...entry,
            lastAggregate: aggregate,
            lastUpdatedAt: pending.queuedAt,
            pending: entry.pending?.id === pending.id ? null : entry.pending,
          },
        ];
      }),
    }));
  });

  const deliver = Effect.fnUntraced(function* () {
    const state = yield* store.read;
    const active = yield* Effect.filter(state.registrations, (registration) =>
      authorized(registration.sessionId),
    );
    if (active.length !== state.registrations.length) {
      yield* store.update((current) => ({
        ...current,
        registrations: current.registrations.filter(
          (registration) =>
            !state.registrations.includes(registration) || active.includes(registration),
        ),
      }));
    }
    yield* Effect.forEach(
      active,
      (registration) =>
        deliverRecipient(registration).pipe(
          Effect.catch((error) =>
            Effect.logWarning("Paired notification delivery will retry.", {
              errorTag: error._tag,
              ...(error._tag === "FcmClientError"
                ? { operation: error.operation, status: error.status }
                : {}),
            }),
          ),
        ),
      { discard: true },
    );
  });
  let queued = false;
  const worker = yield* makeDrainableWorker(() =>
    Effect.sync(() => {
      queued = false;
    }).pipe(
      Effect.andThen(deliver()),
      Effect.catch(() =>
        Effect.logWarning("Could not check paired notification deliveries; will retry."),
      ),
    ),
  );
  const enqueue = Effect.suspend(() => {
    if (queued) return Effect.void;
    queued = true;
    return worker.enqueue(undefined);
  });

  const observeThread = Effect.fn("PairedNotifications.observeThread")(
    function* (threadId: ThreadId, replay: boolean) {
      if (!configured) return;
      const state = yield* store.read;
      if (!state.registrations.some((entry) => entry.encryptionPublicKey)) return;
      const thread = yield* threads.getThreadShell(threadId);
      if (thread?.lineage.relationshipToParent === "subagent") return;
      const project =
        thread && thread.archivedAt === null
          ? yield* projects.getById(thread.projectId)
          : Option.none();
      const projected =
        thread && Option.isSome(project)
          ? projectThreadAwarenessV2({
              environmentId: yield* environment.getEnvironmentId,
              project: project.value,
              thread,
            })
          : null;
      const identity = thread ? notificationIdentity(thread) : "deleted";
      const previous = state.observations.find((entry) => entry.threadId === threadId);
      if (previous?.identity === identity && sameActivity(previous.activity, projected)) return;
      const now = yield* Clock.currentTimeMillis;
      const activity =
        projected &&
        (projected.phase === "completed" || projected.phase === "failed") &&
        thread?.latestRunCompletedAt
          ? { ...projected, updatedAt: DateTime.formatIso(thread.latestRunCompletedAt) }
          : projected;
      const id = yield* crypto.randomUUIDv4;
      yield* store.update((current) => ({
        ...current,
        observations: [
          ...current.observations.filter(
            (entry) =>
              entry.threadId !== threadId &&
              entry.activity !== null &&
              now - entry.observedAt < REFERENCE_TTL_MS,
          ),
          { threadId, identity, activity, observedAt: now },
        ],
        registrations: current.registrations.map((entry) =>
          entry.encryptionPublicKey
            ? {
                ...entry,
                pending: {
                  id,
                  queuedAt: Math.max(
                    now,
                    entry.lastUpdatedAt + 1,
                    (entry.pending?.queuedAt ?? 0) + 1,
                  ),
                  silent: replay ? (entry.pending?.silent ?? previous === undefined) : false,
                },
              }
            : entry,
        ),
        notifications: current.notifications.filter(
          (notice) => now - notice.createdAt < REFERENCE_TTL_MS,
        ),
      }));
      if (!replay) yield* enqueue;
    },
    observationLock.withPermit,
    Effect.mapError((cause) => new PairedNotificationError({ cause })),
  );
  const replay = Effect.gen(function* () {
    const snapshot = yield* threads.getShellSnapshot();
    yield* Effect.forEach(snapshot.threads, (thread) => observeThread(thread.id, true), {
      discard: true,
    });
    yield* enqueue;
  });

  const register: PairedNotifications["Service"]["register"] = Effect.fn(
    "PairedNotifications.register",
  )(
    function* (sessionId, input) {
      if (!configured || !input.encryptionPublicKey || !(yield* authorized(sessionId)))
        return { configured, encryptedActivitySupported: true, registrationId: null };
      yield* encryption.validatePublicKey(input.encryptionPublicKey);
      const id = yield* crypto.randomUUIDv4;
      const now = yield* Clock.currentTimeMillis;
      let changed = false;
      yield* store.update((state) => {
        const existing = state.registrations.find(
          (entry) => entry.registrationId === input.registrationId,
        );
        if (
          existing &&
          existing.sessionId !== sessionId &&
          (existing.pushToken !== input.pushToken ||
            existing.encryptionPublicKey !== input.encryptionPublicKey)
        )
          return state;
        if (
          existing?.sessionId === sessionId &&
          existing.pushToken === input.pushToken &&
          existing.packageName === input.packageName &&
          existing.encryptionPublicKey === input.encryptionPublicKey &&
          stableStringify(existing.preferences) === stableStringify(input.preferences)
        )
          return state;
        changed = true;
        return {
          ...state,
          registrations: [
            ...state.registrations.filter(
              (entry) =>
                entry.sessionId !== sessionId &&
                entry.pushToken !== input.pushToken &&
                entry.registrationId !== input.registrationId,
            ),
            {
              ...input,
              sessionId,
              lastAggregate: existing?.lastAggregate ?? null,
              lastUpdatedAt: existing?.lastUpdatedAt ?? 0,
              pending: {
                id,
                queuedAt: Math.max(now, (existing?.lastUpdatedAt ?? 0) + 1),
                silent: true,
              },
            },
          ],
        };
      });
      if (changed) yield* replay;
      return yield* status(sessionId);
    },
    Effect.mapError((cause) => new PairedNotificationError({ cause })),
  );

  const unregister: PairedNotifications["Service"]["unregister"] = Effect.fn(
    "PairedNotifications.unregister",
  )(
    function* (sessionId, registrationId) {
      yield* store.update((state) => ({
        ...state,
        registrations: state.registrations.filter(
          (entry) => entry.sessionId !== sessionId || entry.registrationId !== registrationId,
        ),
      }));
      return yield* status(sessionId);
    },
    Effect.mapError((cause) => new PairedNotificationError({ cause })),
  );

  const resolve: PairedNotifications["Service"]["resolve"] = Effect.fn(
    "PairedNotifications.resolve",
  )(
    function* (sessionId, reference) {
      if (!(yield* authorized(sessionId))) return null;
      const state = yield* store.read;
      if (
        !state.registrations.some(
          (entry) =>
            entry.sessionId === sessionId && entry.registrationId === reference.registrationId,
        )
      )
        return null;
      const now = yield* Clock.currentTimeMillis;
      const notice = state.notifications.find(
        (entry) =>
          entry.id === reference.notificationId &&
          now - entry.createdAt < REFERENCE_TTL_MS &&
          entry.recipients.some(
            (recipient) => recipient.registrationId === reference.registrationId,
          ),
      );
      const thread = notice ? yield* threads.getThreadShell(notice.threadId) : null;
      return notice && thread && thread.archivedAt === null
        ? { environmentId: yield* environment.getEnvironmentId, threadId: notice.threadId }
        : null;
    },
    Effect.mapError((cause) => new PairedNotificationError({ cause })),
  );

  const publishThread: PairedNotifications["Service"]["publishThread"] = (threadId) =>
    observeThread(threadId, false);
  const start: PairedNotifications["Service"]["start"] = Effect.fn("PairedNotifications.start")(
    function* () {
      if (!configured || started) return;
      started = true;
      yield* forkParked(
        Stream.runForEach(threads.streamDomainEvents, (event) =>
          shouldPublishAgentAwarenessEvent(event)
            ? publishThread(event.threadId).pipe(
                Effect.catch(() => Effect.logWarning("Could not queue paired agent activity.")),
              )
            : Effect.void,
        ),
      );
      yield* forkParked(
        Effect.gen(function* () {
          yield* replay.pipe(
            Effect.catch(() => Effect.logWarning("Could not restore paired agent activity.")),
            Effect.ensuring(Deferred.succeed(catchUpFinished, undefined)),
          );
          return yield* Effect.sleep("30 seconds").pipe(Effect.andThen(enqueue), Effect.forever);
        }),
      );
    },
  );
  const drain = Effect.gen(function* () {
    if (started) yield* Deferred.await(catchUpFinished);
    yield* worker.drain;
  });
  return PairedNotifications.of({
    status,
    register,
    unregister,
    resolve,
    publishThread,
    drain,
    start,
  });
});

function notificationIdentity(thread: OrchestrationV2ThreadShell): string {
  return JSON.stringify([
    thread.latestRunId,
    resolveThreadAwarenessPhaseV2(thread),
    thread.pendingRuntimeRequest?.id ?? null,
  ]);
}

function sameRecipient(left: Registration, right: Registration): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.pushToken === right.pushToken &&
    left.packageName === right.packageName &&
    left.encryptionPublicKey === right.encryptionPublicKey &&
    stableStringify(left.preferences) === stableStringify(right.preferences)
  );
}

function sameActivity(
  left: RelayAgentActivityState | null,
  right: RelayAgentActivityState | null,
): boolean {
  if (!left || !right) return left === right;
  const { updatedAt: _leftUpdatedAt, ...leftContent } = left;
  const { updatedAt: _rightUpdatedAt, ...rightContent } = right;
  return stableStringify(leftContent) === stableStringify(rightContent);
}

export const layer = Layer.effect(PairedNotifications, make);

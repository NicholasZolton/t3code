import {
  AuthOrchestrationReadScope,
  type AuthSessionId,
  type PairedNotificationDestination,
  PairedNotificationPhase,
  type PairedNotificationReference,
  type PairedNotificationRegistration,
  type PairedNotificationStatus,
  type OrchestrationV2ThreadShell,
  type ThreadId,
} from "@t3tools/contracts";
import { resolveThreadAwarenessPhaseV2 } from "@t3tools/shared/agentAwareness";
import * as FcmClient from "@t3tools/shared/FcmClient";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
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
import { shouldPublishAgentAwarenessEvent } from "../relay/AgentAwarenessRelay.ts";
import { forkParked } from "../serverActivation.ts";
import * as NotificationStore from "./NotificationStore.ts";

const DELIVERY_TTL_MS = 5 * 60_000;
const REFERENCE_TTL_MS = 7 * 24 * 60 * 60_000;
const COMPLETION_ALERT_TTL_MS = 2 * 60_000;
const MAX_NOTIFICATIONS = 2000;
const isAlertPhase = Schema.is(PairedNotificationPhase);

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
  const environment = yield* ServerEnvironment.ServerEnvironment;
  const sender = yield* FcmClient.FcmClient;
  const crypto = yield* Crypto.Crypto;
  const configured = sender.configured;
  const observationLock = yield* Semaphore.make(1);
  const startedAt = yield* Clock.currentTimeMillis;
  const catchUpFinished = yield* Deferred.make<void>();
  let started = false;

  const authorized = Effect.fnUntraced(function* (sessionId: AuthSessionId) {
    const session = yield* sessions.getById({ sessionId });
    const now = yield* DateTime.now;
    return (
      Option.isSome(session) &&
      session.value.revokedAt === null &&
      session.value.expiresAt.epochMilliseconds > now.epochMilliseconds &&
      session.value.scopes.includes(AuthOrchestrationReadScope) &&
      session.value.subject !== "mcp-client"
    );
  });

  const status = Effect.fnUntraced(function* (sessionId: AuthSessionId) {
    const state = yield* store.read;
    return {
      configured,
      registrationId:
        state.registrations.find((entry) => entry.sessionId === sessionId)?.registrationId ?? null,
    };
  });

  const register: PairedNotifications["Service"]["register"] = Effect.fn(
    "PairedNotifications.register",
  )(
    function* (sessionId, input) {
      if (!configured || !(yield* authorized(sessionId)))
        return { configured, registrationId: null };
      yield* store.update((state) => {
        const existing = state.registrations.find(
          (entry) => entry.registrationId === input.registrationId,
        );
        if (
          existing?.sessionId === sessionId &&
          existing.pushToken === input.pushToken &&
          existing.packageName === input.packageName
        )
          return state;
        if (existing && existing.sessionId !== sessionId && existing.pushToken !== input.pushToken)
          return state;
        return {
          ...state,
          registrations: [
            ...state.registrations.filter(
              (entry) =>
                entry.sessionId !== sessionId &&
                entry.pushToken !== input.pushToken &&
                entry.registrationId !== input.registrationId,
            ),
            { ...input, sessionId },
          ],
        };
      });
      return yield* status(sessionId);
    },
    Effect.mapError((cause) => new PairedNotificationError({ cause })),
  );

  const unregister: PairedNotifications["Service"]["unregister"] = Effect.fn(
    "PairedNotifications.unregister",
  )(
    function* (sessionId, registrationId) {
      yield* store.update((state) => {
        const registrations = state.registrations.filter(
          (entry) => entry.sessionId !== sessionId || entry.registrationId !== registrationId,
        );
        return registrations.length === state.registrations.length
          ? state
          : { ...state, registrations };
      });
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
      const ownsRegistration = state.registrations.some(
        (entry) =>
          entry.sessionId === sessionId && entry.registrationId === reference.registrationId,
      );
      if (!ownsRegistration) return null;
      const now = yield* Clock.currentTimeMillis;
      const notification = state.notifications.find(
        (entry) =>
          entry.id === reference.notificationId &&
          now - entry.createdAt < REFERENCE_TTL_MS &&
          entry.recipients.some(
            (recipient) => recipient.registrationId === reference.registrationId,
          ),
      );
      if (!notification) return null;
      return {
        environmentId: yield* environment.getEnvironmentId,
        threadId: notification.threadId,
      };
    },
    Effect.mapError((cause) => new PairedNotificationError({ cause })),
  );

  const deliverRecipient = Effect.fnUntraced(function* (
    notice: NotificationStore.NotificationState["notifications"][number],
    registrationId: string,
  ) {
    const current = yield* store.read;
    const registration = current.registrations.find(
      (entry) => entry.registrationId === registrationId,
    );
    if (!registration || !(yield* authorized(registration.sessionId))) return;
    const now = yield* Clock.currentTimeMillis;
    if (now - notice.createdAt >= DELIVERY_TTL_MS) return;
    const thread = yield* threads.getThreadShell(notice.threadId);
    if (!thread || thread.archivedAt !== null || notificationIdentity(thread) !== notice.identity)
      return;
    const result = yield* sender.send({
      token: registration.pushToken,
      packageName: registration.packageName,
      alert: true,
      data: {
        t3_kind: "paired_alert",
        registration_id: registration.registrationId,
        notification_id: notice.id,
        phase: notice.phase,
        updated_at: String(notice.createdAt),
      },
    });
    yield* store.update((latest) => {
      const currentToken = latest.registrations.find(
        (entry) => entry.registrationId === registrationId,
      )?.pushToken;
      if (currentToken && currentToken !== registration.pushToken) return latest;
      return {
        ...latest,
        registrations: result.unregistered
          ? latest.registrations.filter((entry) => entry.pushToken !== registration.pushToken)
          : latest.registrations,
        notifications: latest.notifications.map((entry) =>
          entry.id === notice.id
            ? {
                ...entry,
                recipients: entry.recipients.map((target) =>
                  target.registrationId === registrationId
                    ? { ...target, delivered: true }
                    : target,
                ),
              }
            : entry,
        ),
      };
    });
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
    const now = yield* Clock.currentTimeMillis;
    const pending = state.notifications
      .filter((notice) => now - notice.createdAt < DELIVERY_TTL_MS)
      .flatMap((notice) =>
        notice.recipients
          .filter((recipient) => !recipient.delivered)
          .map((recipient) => ({ notice, registrationId: recipient.registrationId })),
      );
    yield* Effect.forEach(
      pending,
      ({ notice, registrationId }) =>
        deliverRecipient(notice, registrationId).pipe(
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
  const worker = yield* makeDrainableWorker(() =>
    deliver().pipe(
      Effect.catch(() =>
        Effect.logWarning("Could not check paired notification deliveries; will retry."),
      ),
    ),
  );

  const observeThread = Effect.fn("PairedNotifications.observeThread")(
    function* (threadId: ThreadId, catchUp: boolean) {
      if (!configured) return;
      const state = yield* store.read;
      if (state.registrations.length === 0) return;
      const thread = yield* threads.getThreadShell(threadId);
      if (
        !thread ||
        thread.archivedAt !== null ||
        thread.lineage.relationshipToParent === "subagent"
      )
        return;
      const phase = resolveThreadAwarenessPhaseV2(thread);
      const identity = notificationIdentity(thread);
      const previous = state.observations.find((entry) => entry.threadId === threadId);
      if (previous?.identity === identity) return;
      const now = yield* Clock.currentTimeMillis;
      const terminal = phase === "completed" || phase === "failed";
      const completedAt = thread.latestRunCompletedAt?.epochMilliseconds;
      const shouldAlert =
        isAlertPhase(phase) &&
        (!terminal ||
          (catchUp
            ? completedAt !== undefined &&
              now - completedAt < COMPLETION_ALERT_TTL_MS &&
              previous !== undefined
            : previous !== undefined || (completedAt !== undefined && completedAt >= startedAt)));
      const id = yield* crypto.randomUUIDv4;
      yield* store.update((current) => ({
        registrations: current.registrations,
        observations: [
          ...current.observations.filter(
            (entry) => entry.threadId !== threadId && now - entry.observedAt < REFERENCE_TTL_MS,
          ),
          { threadId, identity, phase, observedAt: now },
        ],
        notifications: [
          ...current.notifications
            .filter((entry) => now - entry.createdAt < REFERENCE_TTL_MS)
            .slice(-(MAX_NOTIFICATIONS - 1)),
          ...(shouldAlert
            ? [
                {
                  id,
                  threadId,
                  identity,
                  phase,
                  createdAt: now,
                  recipients: current.registrations.map((entry) => ({
                    registrationId: entry.registrationId,
                    delivered: false,
                  })),
                },
              ]
            : []),
        ],
      }));
      if (shouldAlert) yield* worker.enqueue(undefined);
    },
    observationLock.withPermit,
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
                Effect.catch(() => Effect.logWarning("Could not queue a paired notification.")),
              )
            : Effect.void,
        ),
      );
      yield* forkParked(
        Effect.gen(function* () {
          yield* Effect.gen(function* () {
            const snapshot = yield* threads.getShellSnapshot();
            yield* Effect.forEach(snapshot.threads, (thread) => observeThread(thread.id, true), {
              discard: true,
            });
            yield* worker.enqueue(undefined);
          }).pipe(
            Effect.catch(() =>
              Effect.logWarning("Could not restore paired notification deliveries."),
            ),
            Effect.ensuring(Deferred.succeed(catchUpFinished, undefined)),
          );
          return yield* Effect.sleep("30 seconds").pipe(
            Effect.andThen(worker.enqueue(undefined)),
            Effect.forever,
          );
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

function notificationIdentity(
  thread: Pick<
    OrchestrationV2ThreadShell,
    | "latestRunId"
    | "pendingRuntimeRequest"
    | "activityRunStatus"
    | "status"
    | "lineage"
    | "pendingBackgroundTasks"
  >,
): string {
  return JSON.stringify([
    thread.latestRunId,
    resolveThreadAwarenessPhaseV2(thread),
    thread.pendingRuntimeRequest?.id ?? null,
  ]);
}

export const layer = Layer.effect(PairedNotifications, make);

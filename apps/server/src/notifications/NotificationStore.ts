import {
  AuthSessionId,
  PairedNotificationId,
  PairedNotificationPhase,
  PairedNotificationRegistration,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import {
  RelayAgentActivityState,
  RelayAgentActivityAggregateState,
} from "@t3tools/contracts/relay";

const LegacyRegistration = Schema.Struct({
  ...PairedNotificationRegistration.fields,
  sessionId: AuthSessionId,
});
const LegacyObservation = Schema.Struct({
  threadId: ThreadId,
  identity: Schema.String,
  phase: Schema.NullOr(Schema.String),
  observedAt: Schema.Number,
});
const Notification = Schema.Struct({
  id: PairedNotificationId,
  threadId: ThreadId,
  identity: Schema.String,
  phase: PairedNotificationPhase,
  createdAt: Schema.Number,
  recipients: Schema.Array(
    Schema.Struct({ registrationId: PairedNotificationId, delivered: Schema.Boolean }),
  ),
});
const LegacyState = Schema.Struct({
  version: Schema.optionalKey(Schema.Never),
  registrations: Schema.Array(LegacyRegistration),
  observations: Schema.Array(LegacyObservation),
  notifications: Schema.Array(Notification),
});
const PendingDelivery = Schema.Struct({
  id: PairedNotificationId,
  queuedAt: Schema.Number,
  silent: Schema.Boolean,
});
const Registration = Schema.Struct({
  ...LegacyRegistration.fields,
  lastAggregate: Schema.NullOr(RelayAgentActivityAggregateState),
  lastUpdatedAt: Schema.Number,
  pending: Schema.NullOr(PendingDelivery),
});
const Observation = Schema.Struct({
  threadId: ThreadId,
  identity: Schema.String,
  activity: Schema.NullOr(RelayAgentActivityState),
  observedAt: Schema.Number,
});
const State = Schema.Struct({
  version: Schema.Literal(2),
  registrations: Schema.Array(Registration),
  observations: Schema.Array(Observation),
  // Keep old opaque tap references until their normal expiry; new payloads contain authenticated routes.
  notifications: Schema.Array(Notification),
});
export type NotificationState = typeof State.Type;
const emptyState: NotificationState = {
  version: 2,
  registrations: [],
  observations: [],
  notifications: [],
};
const KEY = "paired-notifications";
const decode = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Union([State, LegacyState])),
);
const encode = Schema.encodeEffect(Schema.fromJsonString(State));

export class NotificationStoreError extends Schema.TaggedError<NotificationStoreError>()(
  "NotificationStoreError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not persist paired notification state.";
  }
}

// Device tokens and pending deliveries use the existing atomic, private file store.
export class NotificationStore extends Context.Service<
  NotificationStore,
  {
    readonly read: Effect.Effect<NotificationState>;
    readonly update: (
      transform: (state: NotificationState) => NotificationState,
    ) => Effect.Effect<void, NotificationStoreError>;
  }
>()("t3/notifications/NotificationStore") {}

const make = Effect.gen(function* () {
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const lock = yield* Semaphore.make(1);
  const stored = yield* secrets
    .get(KEY)
    .pipe(Effect.mapError((cause) => new NotificationStoreError({ cause })));
  const decoded = Option.isSome(stored)
    ? yield* decode(new TextDecoder().decode(stored.value)).pipe(
        Effect.mapError((cause) => new NotificationStoreError({ cause })),
      )
    : emptyState;
  let state: NotificationState =
    decoded.version === 2
      ? decoded
      : {
          ...emptyState,
          registrations: decoded.registrations.map((entry) => ({
            ...entry,
            lastAggregate: null,
            lastUpdatedAt: 0,
            pending: null,
          })),
          notifications: decoded.notifications,
        };
  return NotificationStore.of({
    read: Effect.sync(() => state),
    update: (transform) =>
      lock.withPermit(
        Effect.gen(function* () {
          const next = transform(state);
          if (next === state) return;
          const json = yield* encode(next);
          yield* secrets.set(KEY, new TextEncoder().encode(json));
          state = next;
        }).pipe(Effect.mapError((cause) => new NotificationStoreError({ cause }))),
      ),
  });
});

export const layer = Layer.effect(NotificationStore, make);

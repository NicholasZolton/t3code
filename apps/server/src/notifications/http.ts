import { AuthOrchestrationReadScope, EnvironmentHttpApi } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";

import { failEnvironmentInternal, requireEnvironmentScope } from "../auth/http.ts";
import * as PairedNotifications from "./PairedNotifications.ts";

export const layer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "notifications",
  Effect.fnUntraced(function* (handlers) {
    const notifications = yield* PairedNotifications.PairedNotifications;
    // A client may manage only its own subscription to activity it can already read.
    const principal = requireEnvironmentScope(AuthOrchestrationReadScope);
    return handlers
      .handle("status", () =>
        principal.pipe(Effect.flatMap((session) => notifications.status(session.sessionId))),
      )
      .handle("register", ({ payload }) =>
        principal.pipe(
          Effect.flatMap((session) => notifications.register(session.sessionId, payload)),
          Effect.catchTags({
            PairedNotificationError: (error) => failEnvironmentInternal("internal_error", error),
          }),
        ),
      )
      .handle("unregister", ({ payload }) =>
        principal.pipe(
          Effect.flatMap((session) =>
            notifications.unregister(session.sessionId, payload.registrationId),
          ),
          Effect.catchTags({
            PairedNotificationError: (error) => failEnvironmentInternal("internal_error", error),
          }),
        ),
      )
      .handle("resolve", ({ payload }) =>
        principal.pipe(
          Effect.flatMap((session) => notifications.resolve(session.sessionId, payload)),
          Effect.catchTags({
            PairedNotificationError: (error) => failEnvironmentInternal("internal_error", error),
          }),
        ),
      );
  }),
);

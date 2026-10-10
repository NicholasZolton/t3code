import type {
  PairedNotificationRegistration,
  PairedNotificationReference,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { makeEnvironmentHttpApiClient } from "./http.ts";

export interface PairedNotificationConnection {
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
}

export class PairedNotificationRequestError extends Schema.TaggedError<PairedNotificationRequestError>()(
  "PairedNotificationRequestError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not reach this environment's notification service. Check the connection and server version.";
  }
}

const clientFor = (connection: PairedNotificationConnection) =>
  makeEnvironmentHttpApiClient(connection.httpBaseUrl);
const headersFor = (
  connection: PairedNotificationConnection,
): { readonly authorization: string } => ({ authorization: `Bearer ${connection.bearerToken}` });
const request = <A, E, R>(
  operation: Effect.Effect<A, E, R>,
): Effect.Effect<A, PairedNotificationRequestError, R> =>
  operation.pipe(
    Effect.timeout("15 seconds"),
    Effect.mapError((cause) => new PairedNotificationRequestError({ cause })),
  );

export const getPairedNotificationStatus = (connection: PairedNotificationConnection) =>
  request(
    clientFor(connection).pipe(
      Effect.flatMap((client) => client.notifications.status({ headers: headersFor(connection) })),
    ),
  );

export const registerPairedNotifications = (
  connection: PairedNotificationConnection,
  payload: PairedNotificationRegistration,
) =>
  request(
    clientFor(connection).pipe(
      Effect.flatMap((client) =>
        client.notifications.register({ headers: headersFor(connection), payload }),
      ),
    ),
  );

export const unregisterPairedNotifications = (
  connection: PairedNotificationConnection,
  registrationId: string,
) =>
  request(
    clientFor(connection).pipe(
      Effect.flatMap((client) =>
        client.notifications.unregister({
          headers: headersFor(connection),
          payload: { registrationId },
        }),
      ),
    ),
  );

export const resolvePairedNotification = (
  connection: PairedNotificationConnection,
  payload: PairedNotificationReference,
) =>
  request(
    clientFor(connection).pipe(
      Effect.flatMap((client) =>
        client.notifications.resolve({ headers: headersFor(connection), payload }),
      ),
    ),
  );

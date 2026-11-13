import { TRICKET_RPC_METHODS, TricketError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { TricketIntegration } from "./TricketIntegration.ts";

// Transport errors never serialize the HTTP request that holds a bearer credential.
const publicError = (error: TricketError): TricketError =>
  new TricketError({ reason: error.reason });

export function handlers(integration: TricketIntegration["Service"]) {
  return {
    [TRICKET_RPC_METHODS.get]: () => integration.state.pipe(Effect.mapError(publicError)),
    [TRICKET_RPC_METHODS.update]: (input: Parameters<TricketIntegration["Service"]["update"]>[0]) =>
      integration.update(input).pipe(Effect.mapError(publicError)),
    [TRICKET_RPC_METHODS.reconcile]: () =>
      integration.reconcile.pipe(Effect.andThen(integration.state), Effect.mapError(publicError)),
  };
}

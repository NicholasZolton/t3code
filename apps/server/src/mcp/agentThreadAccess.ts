import { DEFAULT_SERVER_SETTINGS, OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as ServerSettings from "../serverSettings.ts";
import type { McpInvocationScope } from "./McpInvocationContext.ts";

/** Capture settings at service construction, then read them for each invocation. */
export const makeThreadAccess = Effect.gen(function* () {
  const settings = yield* Effect.serviceOption(ServerSettings.ServerSettingsService);
  const mode = Option.isSome(settings)
    ? settings.value.getSettings.pipe(
        Effect.map((value) => value.agentThreadAccess),
        Effect.mapError(
          () =>
            new OrchestratorMcpFailure({
              code: "orchestration_error",
              message: "Could not read agent thread access settings.",
            }),
        ),
      )
    : Effect.succeed(DEFAULT_SERVER_SETTINGS.agentThreadAccess);
  const requireAccess = Effect.fn("mcp.requireThreadAccess")(function* (scope: McpInvocationScope) {
    const access = yield* mode;
    if (!scope.capabilities.has("orchestration") || access === "none") {
      return yield* new OrchestratorMcpFailure({
        code: "capability_denied",
        message: "This credential cannot control threads. Enable agent thread access in Settings.",
      });
    }
    return access;
  });
  return { mode, requireAccess };
});

export const requireThreadAccess = (scope: McpInvocationScope) =>
  makeThreadAccess.pipe(Effect.flatMap((access) => access.requireAccess(scope)));

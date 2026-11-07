import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as ProcessRunner from "./processRunner.ts";

const FNOX_EXPORT_TIMEOUT = "10 seconds";

const FnoxExport = Schema.fromJsonString(
  Schema.Struct({ secrets: Schema.Record(Schema.String, Schema.String) }),
);
const decodeFnoxExport = Schema.decodeUnknownEffect(FnoxExport);

class FnoxExportError extends Schema.TaggedError<FnoxExportError>()("FnoxExportError", {
  reason: Schema.String,
}) {
  override get message(): string {
    return this.reason;
  }
}

// fnox loads secrets from a shell prompt hook, which a GUI launch or login-shell probe never runs.
// Provider processes inherit what a new terminal would get; values the server inherited win.
export const hydrateFnoxSecrets = Effect.fn("hydrateFnoxSecrets")(
  function* (): Effect.fn.Return<
    void,
    ProcessRunner.ProcessRunError | FnoxExportError,
    ProcessRunner.ProcessRunner
  > {
    const env = yield* HostProcess.Environment;
    const secrets = yield* readFnoxSecrets(env);
    const missing = Object.fromEntries(
      Object.entries(secrets).filter(([name]) => env[name] === undefined),
    );
    Object.assign(env, missing);
    const names = Object.keys(missing);
    if (names.length === 0) return;
    yield* Effect.logInfo("Loaded fnox secrets", { names });
  },
  // fnox is not installed.
  Effect.catchTags({ ProcessSpawnError: () => Effect.void }),
  Effect.catch((error) => Effect.logWarning(`Could not load fnox secrets: ${error.message}`)),
);

const readFnoxSecrets = Effect.fn("readFnoxSecrets")(function* (
  env: NodeJS.ProcessEnv,
): Effect.fn.Return<
  Record<string, string>,
  ProcessRunner.ProcessRunError | FnoxExportError,
  ProcessRunner.ProcessRunner
> {
  const runner = yield* ProcessRunner.ProcessRunner;
  const output = yield* runner.run({
    command: "fnox",
    args: ["export", "--format", "json"],
    // Home keeps a project's fnox.toml from applying server-wide.
    cwd: yield* HostProcess.HomeDirectory,
    env,
    timeout: FNOX_EXPORT_TIMEOUT,
  });
  if (output.code !== 0) {
    return yield* new FnoxExportError({ reason: `fnox export exited with code ${output.code}` });
  }
  const exported = yield* decodeFnoxExport(output.stdout).pipe(
    // Schema issues quote the input, which holds secret values.
    Effect.mapError(() => new FnoxExportError({ reason: "fnox export printed unexpected output" })),
  );
  return exported.secrets;
});

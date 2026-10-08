import { PortSchema } from "@t3tools/contracts";
import {
  DEFAULT_TAILSCALE_SERVE_PORT,
  disableTailscaleServe,
  ensureTailscaleServe,
  type TailscaleCommandError,
} from "@t3tools/tailscale";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { ChildProcessSpawner } from "effect/process";

import { writeFileStringAtomically } from "../atomicWrite.ts";
import { formatHostForUrl, isLoopbackHost, isWildcardHost } from "../startupAccess.ts";

const Settings = Schema.Struct({ servePort: PortSchema });
type Settings = typeof Settings.Type;
const decodeSettings = Schema.decodeUnknownEffect(Schema.fromJsonString(Settings));
const encodeSettings = Schema.encodeEffect(Schema.fromJsonString(Settings));

export class TailscaleServeSettingsError extends Schema.TaggedError<TailscaleServeSettingsError>()(
  "TailscaleServeSettingsError",
  {
    operation: Schema.Literals(["read", "remember", "forget"]),
    settingsPath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} Tailscale Serve settings at ${this.settingsPath}.`;
  }
}

export class DevServerNotProxiableError extends Schema.TaggedError<DevServerNotProxiableError>()(
  "DevServerNotProxiableError",
  { devUrl: Schema.String },
) {
  override get message(): string {
    return `Tailscale Serve can only proxy plain-HTTP local targets, and this dev server runs at ${this.devUrl}. Pair without --tailscale instead.`;
  }
}

const isDevServerNotProxiableError = Schema.is(DevServerNotProxiableError);

interface ServerTarget {
  readonly port: number;
  readonly host: string | undefined;
  readonly devUrl: URL | undefined;
}

interface LocalTarget {
  readonly localPort: number;
  readonly localHost?: string;
}

// Dev servers publish the web origin so Vite's backend proxy stays single-origin.
export function resolveLocalTarget(target: ServerTarget): LocalTarget | DevServerNotProxiableError {
  if (target.devUrl !== undefined) {
    const devUrl = target.devUrl;
    if (devUrl.protocol !== "http:") {
      return new DevServerNotProxiableError({ devUrl: devUrl.toString() });
    }
    const localPort = devUrl.port.length > 0 ? Number.parseInt(devUrl.port, 10) : 80;
    return isLoopbackHost(devUrl.hostname)
      ? { localPort }
      : { localPort, localHost: devUrl.hostname };
  }
  if (target.host !== undefined && !isWildcardHost(target.host) && !isLoopbackHost(target.host)) {
    return { localPort: target.port, localHost: formatHostForUrl(target.host) };
  }
  return { localPort: target.port };
}

export class TailscaleServe extends Context.Service<
  TailscaleServe,
  {
    readonly readSettings: (
      stateDir: string,
    ) => Effect.Effect<Option.Option<Settings>, TailscaleServeSettingsError>;
    readonly remember: (
      stateDir: string,
      servePort: number,
    ) => Effect.Effect<void, TailscaleServeSettingsError>;
    readonly disable: (input: {
      readonly stateDir: string;
      readonly servePort?: number;
    }) => Effect.Effect<void, TailscaleServeSettingsError | TailscaleCommandError>;
    readonly publish: (
      input: ServerTarget & { readonly servePort: number },
    ) => Effect.Effect<LocalTarget, TailscaleCommandError | DevServerNotProxiableError>;
  }
>()("t3/environment/TailscaleServe") {}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const settingsPathFor = (stateDir: string): string => path.join(stateDir, "tailscale-serve.json");

  const readSettings = Effect.fn("TailscaleServe.readSettings")(function* (
    stateDir: string,
  ): Effect.fn.Return<Option.Option<Settings>, TailscaleServeSettingsError> {
    const settingsPath = settingsPathFor(stateDir);
    return yield* fs.readFileString(settingsPath).pipe(
      Effect.flatMap(decodeSettings),
      Effect.asSome,
      Effect.catchTags({
        PlatformError: (cause) =>
          cause.reason._tag === "NotFound"
            ? Effect.succeed(Option.none<Settings>())
            : Effect.fail(cause),
      }),
      Effect.mapError(
        (cause) => new TailscaleServeSettingsError({ operation: "read", settingsPath, cause }),
      ),
    );
  });

  const remember = Effect.fn("TailscaleServe.remember")(function* (
    stateDir: string,
    servePort: number,
  ): Effect.fn.Return<void, TailscaleServeSettingsError> {
    const settingsPath = settingsPathFor(stateDir);
    yield* Effect.gen(function* () {
      const encoded = yield* encodeSettings({ servePort });
      yield* writeFileStringAtomically({ filePath: settingsPath, contents: `${encoded}\n` });
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.mapError(
        (cause) => new TailscaleServeSettingsError({ operation: "remember", settingsPath, cause }),
      ),
    );
  });

  const disable = Effect.fn("TailscaleServe.disable")(function* (input: {
    readonly stateDir: string;
    readonly servePort?: number;
  }): Effect.fn.Return<void, TailscaleServeSettingsError | TailscaleCommandError> {
    const settings = yield* readSettings(input.stateDir);
    const servePort =
      input.servePort ?? Option.getOrUndefined(settings)?.servePort ?? DEFAULT_TAILSCALE_SERVE_PORT;
    yield* disableTailscaleServe({ servePort }).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      Effect.catchTags({
        TailscaleCommandExitError: (error) =>
          error.stderrDiagnostic === "no-existing-handler" ? Effect.void : Effect.fail(error),
      }),
    );
    if (Option.isSome(settings) && settings.value.servePort !== servePort) {
      return;
    }
    const settingsPath = settingsPathFor(input.stateDir);
    yield* fs
      .remove(settingsPath, { force: true })
      .pipe(
        Effect.mapError(
          (cause) => new TailscaleServeSettingsError({ operation: "forget", settingsPath, cause }),
        ),
      );
  });

  const publish = Effect.fn("TailscaleServe.publish")(function* (
    input: ServerTarget & { readonly servePort: number },
  ): Effect.fn.Return<LocalTarget, TailscaleCommandError | DevServerNotProxiableError> {
    const target = resolveLocalTarget(input);
    if (isDevServerNotProxiableError(target)) {
      return yield* target;
    }
    yield* ensureTailscaleServe({ ...target, servePort: input.servePort }).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );
    return target;
  });

  return TailscaleServe.of({ readSettings, remember, disable, publish });
});

export const layer = Layer.effect(TailscaleServe, make);

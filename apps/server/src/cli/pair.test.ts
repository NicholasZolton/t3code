// @effect-diagnostics nodeBuiltinImport:off - CLI integration exercises Node HTTP and filesystem boundaries.
import * as NodeHttp from "node:http";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { AuthStandardClientScopes } from "@t3tools/contracts";
import * as NetService from "@t3tools/shared/Net";
import { HostProcessEnvironment, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { assert, describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as TestConsole from "effect/testing/TestConsole";
import { Command, CliError } from "effect/cli";
import { FetchHttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";

import { cli } from "../binCli.ts";
import {
  SERVICE_LAUNCHER_CONTEXT_ENV,
  SERVICE_LAUNCHER_PROTOCOL,
} from "../cloud/serviceProtocol.ts";
import * as ServiceLauncherClient from "../cloud/serviceLauncherClient.ts";
import {
  makePersistedServerRuntimeState,
  persistServerRuntimeState,
  type PersistedServerRuntimeState,
} from "../serverRuntimeState.ts";
import { resolveDirectPairingBaseUrl } from "./pair.ts";
import { type CliServerFlags, resolveServerConfig } from "./config.ts";
import * as TailscaleServe from "../environment/TailscaleServe.ts";
import { DevServerNotProxiableError, resolveLocalTarget } from "../environment/TailscaleServe.ts";

import packageJson from "../../package.json" with { type: "json" };

const layerCliRuntime = Layer.mergeAll(NodeServices.layer, NetService.layer);

const baseState = {
  version: 1,
  pid: 123,
  port: 3_773,
  origin: "http://127.0.0.1:3773",
  startedAt: "2026-06-20T00:00:00.000Z",
} as const satisfies PersistedServerRuntimeState;

describe("pair base URL selection", () => {
  it("pairs through the dev web origin when the server fronts a dev server", () => {
    expect(resolveDirectPairingBaseUrl({ ...baseState, devUrl: "http://localhost:5733/" })).toBe(
      "http://localhost:5733/",
    );
  });

  it("pairs through the bound host when there is no dev server", () => {
    expect(resolveDirectPairingBaseUrl({ ...baseState, host: "100.64.0.7" })).toBe(
      "http://100.64.0.7:3773",
    );
    expect(resolveDirectPairingBaseUrl(baseState)).toBe("http://localhost:3773");
  });
});

describe("pair tailscale local target", () => {
  const target = { port: baseState.port, host: undefined, devUrl: undefined };
  it("proxies the dev web port for dev servers", () => {
    expect(resolveLocalTarget({ ...target, devUrl: new URL("http://localhost:5733/") })).toEqual({
      localPort: 5_733,
    });
    // A dev server on a non-loopback interface must be proxied at that
    // interface; tailscale serve defaults to 127.0.0.1 otherwise.
    expect(resolveLocalTarget({ ...target, devUrl: new URL("http://192.168.1.10:5733/") })).toEqual(
      { localPort: 5_733, localHost: "192.168.1.10" },
    );
    // URL.hostname keeps IPv6 brackets, so the serve target stays valid.
    expect(
      resolveLocalTarget({ ...target, devUrl: new URL("http://[fd7a:115c::1]:5733/") }),
    ).toEqual({ localPort: 5_733, localHost: "[fd7a:115c::1]" });
  });

  it("rejects HTTPS dev URLs, which tailscale serve cannot proxy", () => {
    expect(
      resolveLocalTarget({ ...target, devUrl: new URL("https://localhost:5733/") }),
    ).toBeInstanceOf(DevServerNotProxiableError);
  });

  it("proxies the backend port directly otherwise", () => {
    expect(resolveLocalTarget(target)).toEqual({ localPort: 3_773 });
    expect(resolveLocalTarget({ ...target, host: "0.0.0.0" })).toEqual({
      localPort: 3_773,
    });
    expect(resolveLocalTarget({ ...target, host: "192.168.1.42" })).toEqual({
      localPort: 3_773,
      localHost: "192.168.1.42",
    });
  });
});

const runCli = (args: ReadonlyArray<string>) => Command.runWith(cli, { version: "0.0.0" })(args);

const provideCliTestLayers = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.provide(effect, Layer.mergeAll(layerCliRuntime, TestConsole.layer));

// Console output accumulates across CLI runs within a test, and each
// Console.log call is one entry — so the latest command's output is the last
// entry, even when it spans many lines.
const captureStdout = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  provideCliTestLayers(
    Effect.gen(function* () {
      yield* effect;
      return (
        (yield* TestConsole.logLines).findLast(
          (line): line is string => typeof line === "string",
        ) ?? ""
      );
    }),
  );

const testDescriptor = {
  environmentId: "pair-test-environment",
  label: "pair-test",
  platform: { os: "linux", arch: "x64" },
  serverVersion: "0.0.1",
  capabilities: { repositoryIdentity: true },
};

const withDescriptorServer = <A, E, R>(run: (origin: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.callback<NodeHttp.Server>((resume) => {
      const server = NodeHttp.createServer((request, response) => {
        if (request.url === "/.well-known/t3/environment") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify(testDescriptor));
          return;
        }
        response.writeHead(404);
        response.end();
      });
      server.listen(0, "127.0.0.1", () => resume(Effect.succeed(server)));
    }),
    (server) => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        return Effect.die(new Error("Expected a TCP address"));
      }
      return run(`http://127.0.0.1:${String(address.port)}`);
    },
    (server) => Effect.sync(() => server.close()),
  );

const TAILNET_HOST = "pair-test.tail.ts.net";
const TAILNET_PORT = 6768;
const TAILNET_ORIGIN = `https://${TAILNET_HOST}:${TAILNET_PORT}`;

// Replace only the daemon and its HTTPS transport; descriptor requests use real local HTTP.
function makeTailscaleHarness(): {
  readonly mappings: Map<number, string>;
  readonly fetch: typeof globalThis.fetch;
  readonly layer: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner>;
} {
  const mappings = new Map<number, string>();
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname !== TAILNET_HOST) {
      // @effect-diagnostics-next-line globalFetch:off - Exercise the configured Fetch implementation against the real HTTP fixture.
      return globalThis.fetch(input, init);
    }
    const target = mappings.get(Number(url.port) || 443);
    if (target === undefined) {
      return new Response("Bad Gateway", { status: 502 });
    }
    try {
      // @effect-diagnostics-next-line globalFetch:off - Stand in for Tailscale's HTTPS proxy while keeping its backend real.
      return await globalThis.fetch(new URL(`${url.pathname}${url.search}`, target), init);
    } catch {
      return new Response("Bad Gateway", { status: 502 });
    }
  };
  const spawner = ChildProcessSpawner.make((command) => {
    if (command._tag !== "StandardCommand" || command.command !== "tailscale") {
      return Effect.die("Unexpected process in Tailscale pairing test");
    }
    const args = command.args;
    let stdout = "";
    if (args[0] === "status") {
      stdout = JSON.stringify({ Self: { DNSName: `${TAILNET_HOST}.` } });
    } else if (args[0] === "serve") {
      const servePort = Number(args.find((arg) => arg.startsWith("--https="))?.split("=")[1]);
      const target = args.at(-1);
      if (target === "off") {
        mappings.delete(servePort);
      } else if (target?.startsWith("http://")) {
        mappings.set(servePort, target);
      } else {
        return Effect.die("Unexpected Tailscale Serve target");
      }
    } else {
      return Effect.die("Unexpected Tailscale command");
    }
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        unref: Effect.succeed(Effect.void),
        stdin: Sink.drain,
        stdout: Stream.make(new TextEncoder().encode(stdout)),
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      }),
    );
  });
  return {
    mappings,
    fetch,
    layer: Layer.mergeAll(
      Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
      Layer.succeed(HostProcessPlatform, "linux"),
    ),
  };
}

function restartFlags(baseDir: string, port: number): CliServerFlags {
  return {
    mode: Option.none(),
    port: Option.some(port),
    host: Option.some("127.0.0.1"),
    baseDir: Option.some(baseDir),
    cwd: Option.none(),
    devUrl: Option.none(),
    noBrowser: Option.none(),
    bootstrapFd: Option.none(),
    autoBootstrapProjectFromCwd: Option.none(),
    logWebSocketEvents: Option.none(),
    tailscaleServeEnabled: Option.none(),
    tailscaleServePort: Option.none(),
  };
}

const tailscaleRuntimeLayer = (layer: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner>) =>
  Layer.mergeAll(layerCliRuntime, layer, ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })));

describe("Tailscale pairing across restarts", () => {
  it.effect("restores a remembered custom HTTPS port to the new backend port", () => {
    const tailscale = makeTailscaleHarness();
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-pair-restart-" });
      const statePath = NodePath.join(baseDir, "userdata", "server-runtime.json");
      yield* withDescriptorServer((origin) =>
        Effect.gen(function* () {
          yield* persistServerRuntimeState({
            path: statePath,
            state: yield* makePersistedServerRuntimeState({
              config: { host: "127.0.0.1", devUrl: undefined },
              port: Number(new URL(origin).port),
            }),
          });
          const output = yield* captureStdout(
            runCli([
              "pair",
              "--base-dir",
              baseDir,
              "--tailscale",
              "--tailscale-serve-port",
              String(TAILNET_PORT),
            ]).pipe(Effect.provide(tailscale.layer)),
          );
          assert.include(output, `Pairing URL: ${TAILNET_ORIGIN}/pair#token=`);
          assert.equal(
            (yield* Effect.promise(() =>
              tailscale.fetch(`${TAILNET_ORIGIN}/.well-known/t3/environment`),
            )).status,
            200,
          );
        }),
      );

      assert.equal(
        (yield* Effect.promise(() =>
          tailscale.fetch(`${TAILNET_ORIGIN}/.well-known/t3/environment`),
        )).status,
        502,
      );
      yield* withDescriptorServer((origin) =>
        Effect.gen(function* () {
          const config = yield* resolveServerConfig(
            restartFlags(baseDir, Number(new URL(origin).port)),
            Option.none(),
          );
          assert.isTrue(config.tailscaleServeEnabled);
          assert.equal(config.tailscaleServePort, TAILNET_PORT);
          const service = yield* TailscaleServe.TailscaleServe;
          yield* service.publish({
            port: config.port,
            host: config.host,
            devUrl: config.devUrl,
            servePort: config.tailscaleServePort,
          });
          const response = yield* Effect.promise(() =>
            tailscale.fetch(`${TAILNET_ORIGIN}/.well-known/t3/environment`),
          );
          assert.equal(response.status, 200);
          assert.deepEqual(yield* Effect.promise(() => response.json()), testDescriptor);
        }),
      );
    }).pipe(
      Effect.provideService(FetchHttpClient.Fetch, tailscale.fetch),
      Effect.provide(
        TailscaleServe.layer.pipe(Layer.provideMerge(tailscaleRuntimeLayer(tailscale.layer))),
      ),
    );
  });

  it.effect("remembers a route that already reaches this environment", () => {
    const tailscale = makeTailscaleHarness();
    return withDescriptorServer((origin) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-pair-reuse-" });
        tailscale.mappings.set(TAILNET_PORT, origin);
        yield* persistServerRuntimeState({
          path: NodePath.join(baseDir, "userdata", "server-runtime.json"),
          state: yield* makePersistedServerRuntimeState({
            config: { host: "127.0.0.1", devUrl: undefined },
            port: Number(new URL(origin).port),
          }),
        });
        yield* captureStdout(
          runCli([
            "pair",
            "--base-dir",
            baseDir,
            "--tailscale",
            "--tailscale-serve-port",
            String(TAILNET_PORT),
          ]).pipe(Effect.provide(tailscale.layer)),
        );
        const config = yield* resolveServerConfig(
          restartFlags(baseDir, Number(new URL(origin).port)),
          Option.none(),
        );
        assert.isTrue(config.tailscaleServeEnabled);
        assert.equal(config.tailscaleServePort, TAILNET_PORT);
      }),
    ).pipe(
      Effect.provideService(FetchHttpClient.Fetch, tailscale.fetch),
      Effect.provide(tailscaleRuntimeLayer(tailscale.layer)),
    );
  });

  it.effect("disables the remembered route and stops restoring it", () => {
    const tailscale = makeTailscaleHarness();
    return withDescriptorServer((origin) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-pair-disable-" });
        yield* persistServerRuntimeState({
          path: NodePath.join(baseDir, "userdata", "server-runtime.json"),
          state: yield* makePersistedServerRuntimeState({
            config: { host: "127.0.0.1", devUrl: undefined },
            port: Number(new URL(origin).port),
          }),
        });
        yield* captureStdout(
          runCli([
            "pair",
            "--base-dir",
            baseDir,
            "--tailscale",
            "--tailscale-serve-port",
            String(TAILNET_PORT),
          ]).pipe(Effect.provide(tailscale.layer)),
        );
        const output = yield* captureStdout(
          runCli(["pair", "--base-dir", baseDir, "--tailscale=false"]).pipe(
            Effect.provide(tailscale.layer),
          ),
        );
        assert.include(output, "Tailscale HTTPS disabled");
        assert.notInclude(output, "Pairing URL:");
        assert.equal(
          (yield* Effect.promise(() =>
            tailscale.fetch(`${TAILNET_ORIGIN}/.well-known/t3/environment`),
          )).status,
          502,
        );
        const config = yield* resolveServerConfig(
          restartFlags(baseDir, Number(new URL(origin).port)),
          Option.none(),
        );
        assert.isFalse(config.tailscaleServeEnabled);
      }),
    ).pipe(
      Effect.provideService(FetchHttpClient.Fetch, tailscale.fetch),
      Effect.provide(tailscaleRuntimeLayer(tailscale.layer)),
    );
  });
});

describe("t3 pair", () => {
  it.effect("mints a token and prints a QR pairing URL for a live server", () =>
    withDescriptorServer((origin) =>
      Effect.gen(function* () {
        const baseDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-pair-test-"));
        const port = Number(new URL(origin).port);
        const statePath = NodePath.join(baseDir, "userdata", "server-runtime.json");
        yield* persistServerRuntimeState({
          path: statePath,
          state: yield* makePersistedServerRuntimeState({
            config: { host: "127.0.0.1", devUrl: undefined },
            port,
          }),
        });

        const output = yield* captureStdout(runCli(["pair", "--base-dir", baseDir]));

        assert.include(output, `Pairing with pair-test (${origin})`);
        assert.include(output, `Pairing URL: ${origin}/pair#token=`);
        assert.isTrue(output.includes("█") || output.includes("▀") || output.includes("▄"));
        // Loopback origins are not reachable from a phone; the output must say so.
        assert.include(output, "only reachable from this machine");

        const token = /#token=([A-Z2-9]+)/.exec(output)?.[1];
        assert.isString(token);

        // The token must be in the same store the running server reads.
        const listed = yield* captureStdout(
          runCli(["auth", "pairing", "list", "--base-dir", baseDir, "--json"]),
        );
        const credentials = JSON.parse(listed) as ReadonlyArray<{
          readonly label?: string;
          readonly scopes: ReadonlyArray<string>;
        }>;
        assert.equal(credentials.length, 1);
        assert.equal(credentials[0]?.label, "t3 pair");
        assert.deepEqual(credentials[0]?.scopes, AuthStandardClientScopes);
      }),
    ).pipe(
      Effect.provide(NodeServices.layer),
      Effect.provideService(HostProcessEnvironment, {
        ...process.env,
        [SERVICE_LAUNCHER_CONTEXT_ENV]: JSON.stringify({
          protocol: SERVICE_LAUNCHER_PROTOCOL,
          childVersion: packageJson.version,
        }),
      }),
      Effect.provideService(ServiceLauncherClient.ServiceLauncherHostProcess, {
        connected: false,
        send: () => false,
        on: () => undefined,
        off: () => undefined,
      }),
    ),
  );

  it.effect("mints a pairing grant with only the selected scopes", () =>
    withDescriptorServer((origin) =>
      Effect.gen(function* () {
        const baseDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-pair-scopes-test-"));
        yield* persistServerRuntimeState({
          path: NodePath.join(baseDir, "userdata", "server-runtime.json"),
          state: yield* makePersistedServerRuntimeState({
            config: { host: "127.0.0.1", devUrl: undefined },
            port: Number(new URL(origin).port),
          }),
        });

        yield* captureStdout(
          runCli([
            "pair",
            "--base-dir",
            baseDir,
            "--scope",
            "orchestration:read",
            "--scope",
            "relay:read",
            "--scope",
            "orchestration:read",
          ]),
        );
        const listed = yield* captureStdout(
          runCli(["auth", "pairing", "list", "--base-dir", baseDir, "--json"]),
        );
        const credentials = JSON.parse(listed) as ReadonlyArray<{
          readonly scopes: ReadonlyArray<string>;
        }>;
        assert.lengthOf(credentials, 1);
        assert.deepEqual(credentials[0]?.scopes, ["orchestration:read", "relay:read"]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("pairs through the recorded dev web URL for dev servers", () =>
    withDescriptorServer((origin) =>
      Effect.gen(function* () {
        const baseDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-pair-dev-test-"));
        const port = Number(new URL(origin).port);
        const statePath = NodePath.join(baseDir, "dev", "server-runtime.json");
        yield* persistServerRuntimeState({
          path: statePath,
          state: yield* makePersistedServerRuntimeState({
            config: { host: undefined, devUrl: new URL("http://localhost:5733") },
            port,
          }),
        });

        const output = yield* captureStdout(runCli(["pair", "--base-dir", baseDir]));

        assert.include(output, "Pairing URL: http://localhost:5733/pair#token=");
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("directs to t3 serve or t3 connect when no server is running", () =>
    Effect.gen(function* () {
      const baseDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-pair-none-test-"));

      const error = yield* provideCliTestLayers(
        runCli(["pair", "--base-dir", baseDir]).pipe(Effect.flip),
      );

      const rendered = String(
        typeof error === "object" && error !== null && "cause" in error ? error.cause : error,
      );
      assert.include(rendered, "No running T3 Code server found.");
      assert.include(rendered, "npx t3 serve");
      assert.include(rendered, "npx t3 connect");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("ignores runtime state whose recorded pid is no longer alive", () =>
    withDescriptorServer((origin) =>
      Effect.gen(function* () {
        const baseDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-pair-pid-test-"));
        const statePath = NodePath.join(baseDir, "userdata", "server-runtime.json");
        // The origin answers (another server reused the port), but the pid
        // that wrote this state file is dead — pairing must not mint a token
        // into the dead server's database.
        const state = yield* makePersistedServerRuntimeState({
          config: { host: "127.0.0.1", devUrl: undefined },
          port: Number(new URL(origin).port),
        });
        yield* persistServerRuntimeState({
          path: statePath,
          // pid 2**22 + 1 exceeds any default Linux/macOS pid range.
          state: { ...state, pid: 4_194_305 },
        });

        const error = yield* provideCliTestLayers(
          runCli(["pair", "--base-dir", baseDir]).pipe(Effect.flip),
        );

        const rendered = String(
          typeof error === "object" && error !== null && "cause" in error ? error.cause : error,
        );
        assert.include(rendered, "No running T3 Code server found.");
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("ignores stale runtime state pointing at a dead server", () =>
    Effect.gen(function* () {
      const baseDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-pair-stale-test-"));
      const statePath = NodePath.join(baseDir, "userdata", "server-runtime.json");
      // A port from the dynamic range with nothing listening: the probe fails
      // fast with ECONNREFUSED and discovery moves on.
      yield* persistServerRuntimeState({
        path: statePath,
        state: yield* makePersistedServerRuntimeState({
          config: { host: "127.0.0.1", devUrl: undefined },
          port: 1,
        }),
      });

      const error = yield* provideCliTestLayers(
        runCli(["pair", "--base-dir", baseDir]).pipe(Effect.flip),
      );

      const rendered = String(
        typeof error === "object" && error !== null && "cause" in error ? error.cause : error,
      );
      assert.include(rendered, "No running T3 Code server found.");
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("auth scope options", () => {
  it.effect.each([
    { group: "pairing", action: "create" },
    { group: "session", action: "issue" },
  ] as const)(
    "issues and persists only the selected scopes for auth $group $action",
    ({ group, action }) =>
      Effect.gen(function* () {
        const baseDir = NodeFS.mkdtempSync(
          NodePath.join(NodeOS.tmpdir(), "t3-cli-auth-scopes-test-"),
        );
        const output = yield* captureStdout(
          runCli([
            "auth",
            group,
            action,
            "--base-dir",
            baseDir,
            "--json",
            "--scope",
            "orchestration:read",
            "--scope",
            "access:read",
            "--scope",
            "orchestration:read",
          ]),
        );
        const issued = JSON.parse(output) as { readonly scopes: ReadonlyArray<string> };
        const listOutput = yield* captureStdout(
          runCli(["auth", group, "list", "--base-dir", baseDir, "--json"]),
        );
        const listed = JSON.parse(listOutput) as ReadonlyArray<{
          readonly scopes: ReadonlyArray<string>;
        }>;

        assert.deepEqual(issued.scopes, ["orchestration:read", "access:read"]);
        assert.lengthOf(listed, 1);
        assert.deepEqual(listed[0]?.scopes, issued.scopes);
      }),
  );

  it.effect.each(
    [["pair"], ["auth", "pairing", "create"], ["auth", "session", "issue"]].map((command) => ({
      command,
      label: command.join(" "),
    })),
  )("rejects invalid scopes before running $label", ({ command }) =>
    Effect.gen(function* () {
      const error = yield* runCli([
        ...command,
        "--scope",
        "orchestration:read",
        "--scope",
        "admin",
      ]).pipe(Effect.provide(layerCliRuntime), Effect.flip);

      if (!CliError.isCliError(error) || error._tag !== "ShowHelp") {
        assert.fail(`Expected ShowHelp, got ${String(error)}`);
      }
      assert.deepEqual(error.commandPath, ["t3", ...command]);
      const scopeError = error.errors[0];
      if (scopeError?._tag !== "InvalidValue") {
        assert.fail(`Expected InvalidValue, got ${String(scopeError?._tag)}`);
      }
      assert.equal(scopeError.option, "scope");
      assert.equal(scopeError.value, "admin");
    }),
  );
});

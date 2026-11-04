import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import * as NodeNet from "node:net";

import { captureLaunchScript } from "./launchScript.fixture.ts";
import { buildRemoteT3RunnerScript } from "./tunnel.ts";

const Started = Schema.Struct({
  pid: Schema.Number,
  port: Schema.Number,
  args: Schema.Array(Schema.String),
});
const decodeStarted = Schema.decodeUnknownSync(Schema.fromJsonString(Started));
const LaunchResult = Schema.Struct({
  remotePort: Schema.Number,
  serverKind: Schema.Literals(["managed", "external"]),
});
const decodeLaunchResult = Schema.decodeUnknownSync(Schema.fromJsonString(LaunchResult));
const encodeJsonString = Schema.encodeSync(Schema.fromJsonString(Schema.String));
const encodeRuntime = Schema.encodeSync(
  Schema.fromJsonString(
    Schema.Struct({
      pid: Schema.Number,
      port: Schema.Number,
      origin: Schema.String,
    }),
  ),
);

describe.skipIf(HostProcess.Platform.defaultValue() === "win32")(
  "remote runner process ownership",
  () => {
    it.live("keeps the server PID and graceful shutdown through the node-script runner", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const fixture = yield* fs.makeTempDirectoryScoped({ prefix: "t3-runner-" });
        const bin = path.join(fixture, "bin");
        const cliPath = path.join(fixture, "installed cli.mjs");
        yield* fs.makeDirectory(bin);
        yield* fs.symlink(process.execPath, path.join(bin, "node"));
        yield* fs.writeFileString(
          cliPath,
          `#!/usr/bin/env node
import * as net from "node:net";
const server = net.createServer((socket) => {
  socket.end();
  server.close();
});
process.on("SIGTERM", () => server.close(() => {
  process.stdout.write("graceful shutdown\\n");
}));
server.listen(Number(process.env.T3_TEST_PORT ?? 0), "127.0.0.1", () => {
  process.stdout.write(JSON.stringify({
    pid: process.pid,
    port: server.address().port,
    args: process.argv.slice(2),
  }) + "\\n");
});
`,
        );
        yield* fs.chmod(cliPath, 0o700);

        const runServer = (port = 0) =>
          Effect.gen(function* () {
            const child = yield* spawner.spawn(
              ChildProcess.make("/bin/sh", ["-s", "--", "serve", "a path with spaces"], {
                cwd: fixture,
                env: {
                  PATH: bin,
                  T3_TEST_PORT: String(port),
                },
                detached: false,
                stdin: Stream.make(
                  new TextEncoder().encode(buildRemoteT3RunnerScript({ nodeScriptPath: cliPath })),
                ),
              }),
            );
            const ready = yield* Deferred.make<typeof Started.Type>();
            const stdout: string[] = [];
            const output = yield* child.stdout.pipe(
              Stream.decodeText(),
              Stream.splitLines,
              Stream.runForEach((line) =>
                Effect.gen(function* () {
                  stdout.push(line);
                  if (stdout.length === 1) {
                    yield* Deferred.succeed(ready, decodeStarted(line));
                  }
                }),
              ),
              Effect.forkScoped,
            );
            const stderr = yield* child.stderr.pipe(
              Stream.decodeText(),
              Stream.mkString,
              Effect.forkScoped,
            );
            const receipt = yield* Effect.raceFirst(
              Deferred.await(ready),
              Fiber.join(output).pipe(
                Effect.flatMap(() => Fiber.join(stderr)),
                Effect.flatMap((message) =>
                  Effect.die(new Error(`Runner exited before listening: ${message}`)),
                ),
              ),
            );
            // A failed PID assertion must still close the owned fixture server.
            yield* Effect.addFinalizer(() =>
              Effect.gen(function* () {
                if (yield* child.isRunning) {
                  yield* Effect.callback<void>((resume) => {
                    const connection = NodeNet.connect(receipt.port, "127.0.0.1");
                    connection.on("error", () => undefined);
                    connection.once("close", () => resume(Effect.void));
                    return Effect.sync(() => connection.destroy());
                  });
                  yield* child.exitCode;
                }
              }).pipe(Effect.orDie),
            );
            assert.equal(receipt.pid, child.pid);
            assert.deepEqual(receipt.args, ["serve", "a path with spaces"]);
            yield* child.kill({ killSignal: "SIGTERM" });
            assert.equal(yield* child.exitCode, 0);
            yield* Fiber.join(output);
            assert.include(stdout, "graceful shutdown");
            return receipt.port;
          }).pipe(Effect.scoped);

        const port = yield* runServer();
        assert.equal(yield* runServer(port), port);
      }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
    );
  },
);

describe.skipIf(HostProcess.Platform.defaultValue() === "win32")(
  "remote launch readiness recovery",
  () => {
    it.live.each(["managed", "external", "discovered"] as const)(
      "preserves an unresponsive %s server and reuses it after recovery",
      (ownership) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-launch-recovery-" });
          const bin = path.join(home, "bin");
          const cliPath = path.join(home, "server.mjs");
          const stateDir = path.join(home, ".t3", "ssh-launch", "fixture");
          const holdPath = path.join(home, "hold");
          const signalsPath = path.join(home, "signals");
          const launchesPath = path.join(home, "launches");
          yield* fs.makeDirectory(bin);
          yield* fs.makeDirectory(stateDir, { recursive: true });
          yield* fs.symlink(process.execPath, path.join(bin, "node"));
          yield* fs.writeFileString(
            cliPath,
            `import * as fs from "node:fs";
import * as http from "node:http";
if (process.argv[2] === "serve") {
  fs.appendFileSync(${encodeJsonString(launchesPath)}, "launch\\n");
  process.exit(1);
}
const server = http.createServer((_request, response) => {
  if (!fs.existsSync(${encodeJsonString(holdPath)})) response.end("ready");
});
process.on("SIGTERM", () => {
  fs.writeFileSync(${encodeJsonString(signalsPath)}, "terminated");
  process.exit(0);
});
server.listen(0, "127.0.0.1", () => {
  process.stdout.write(JSON.stringify({ pid: process.pid, port: server.address().port, args: [] }) + "\\n");
});
`,
          );
          const server = yield* spawner.spawn(
            ChildProcess.make(process.execPath, [cliPath, "fixture-server"], { detached: false }),
          );
          yield* Effect.addFinalizer(() =>
            server.kill({ killSignal: "SIGKILL" }).pipe(Effect.ignore),
          );
          const started = decodeStarted(
            yield* server.stdout.pipe(
              Stream.decodeText(),
              Stream.splitLines,
              Stream.take(1),
              Stream.mkString,
            ),
          );
          const savedState: Readonly<Record<string, string>> =
            ownership === "discovered"
              ? {}
              : {
                  port: `${started.port}\n`,
                  managed: `${ownership}\n`,
                  ...(ownership === "managed" ? { pid: `${server.pid}\n` } : {}),
                };
          yield* Effect.forEach(Object.entries(savedState), ([name, contents]) =>
            fs.writeFileString(path.join(stateDir, name), contents),
          );
          const launchScript = (yield* captureLaunchScript(cliPath)).replaceAll(
            'wait_ready "60000"',
            'wait_ready "1500"',
          );
          const embeddedRunner = launchScript.match(
            /cat >"\$RUNNER_NEXT" <<'SH'\n([\s\S]*?)\nSH\n/u,
          )?.[1];
          if (embeddedRunner === undefined)
            return yield* Effect.die(new Error("Launch fixture has no embedded runner."));
          yield* fs.writeFileString(path.join(stateDir, "run-t3.sh"), `${embeddedRunner}\n`);
          const runtimeDir = path.join(home, ".t3", "userdata");
          const runtimePath = path.join(runtimeDir, "server-runtime.json");
          const runtime = encodeRuntime({
            pid: server.pid,
            port: started.port,
            origin: `http://127.0.0.1:${started.port}`,
          });
          if (ownership !== "external") {
            yield* fs.makeDirectory(runtimeDir);
            yield* fs.writeFileString(runtimePath, runtime);
          }
          yield* fs.writeFileString(holdPath, "");
          const launch = Effect.fn("test.remoteLaunchRecovery")(function* () {
            const child = yield* spawner.spawn(
              ChildProcess.make("/bin/sh", ["-s", "--", "fixture"], {
                cwd: home,
                env: { HOME: home, PATH: `${bin}:/usr/bin:/bin` },
                extendEnv: false,
                stdin: Stream.make(new TextEncoder().encode(launchScript)),
              }),
            );
            return yield* Effect.all(
              {
                stdout: child.stdout.pipe(Stream.decodeText(), Stream.mkString),
                stderr: child.stderr.pipe(Stream.decodeText(), Stream.mkString),
                exitCode: child.exitCode,
              },
              { concurrency: "unbounded" },
            );
          }, Effect.scoped);

          const unavailable = yield* launch();
          assert.equal(unavailable.exitCode, 1);
          assert.include(
            unavailable.stderr,
            ownership === "managed"
              ? "Retry the connection; the server was left running."
              : "It was not stopped or replaced; retry the connection.",
          );
          assert.equal(unavailable.stdout, "");
          assert.isTrue(yield* server.isRunning);
          assert.isFalse(yield* fs.exists(signalsPath));
          assert.isFalse(yield* fs.exists(launchesPath));
          for (const [name, contents] of Object.entries(savedState)) {
            assert.equal(yield* fs.readFileString(path.join(stateDir, name)), contents);
          }
          if (ownership === "discovered") {
            assert.isFalse(yield* fs.exists(path.join(stateDir, "pid")));
            assert.isFalse(yield* fs.exists(path.join(stateDir, "port")));
            assert.isFalse(yield* fs.exists(path.join(stateDir, "managed")));
          }
          if (ownership !== "external")
            assert.equal(yield* fs.readFileString(runtimePath), runtime);

          yield* fs.remove(holdPath);
          const recovered = yield* launch();
          assert.equal(recovered.exitCode, 0, recovered.stderr);
          assert.deepEqual(decodeLaunchResult(recovered.stdout.trim()), {
            remotePort: started.port,
            serverKind: ownership === "managed" ? "managed" : "external",
          });
          assert.isTrue(yield* server.isRunning);
          assert.isFalse(yield* fs.exists(signalsPath));
          assert.isFalse(yield* fs.exists(launchesPath));
          if (ownership === "managed")
            assert.equal(yield* fs.readFileString(path.join(stateDir, "pid")), `${server.pid}\n`);
        }).pipe(
          Effect.provide(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
          Effect.scoped,
        ),
    );
  },
);

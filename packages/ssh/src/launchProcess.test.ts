// @effect-diagnostics nodeBuiltinImport:off - Exercise the SSH launch shell against an owned HTTP process.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { buildRemoteLaunchScript } from "./tunnel.ts";

const Started = Schema.Struct({ pid: Schema.Int, port: Schema.Int });
const decodeStarted = Schema.decodeUnknownEffect(Schema.fromJsonString(Started));
const encodeRuntime = Schema.encodeEffect(
  Schema.fromJsonString(Schema.Struct({ ...Started.fields, origin: Schema.String })),
);
const LaunchResult = Schema.Struct({ remotePort: Schema.Int, serverKind: Schema.String });
const decodeLaunchResult = Schema.decodeUnknownEffect(Schema.fromJsonString(LaunchResult));

describe.skipIf(HostProcessPlatform.defaultValue() === "win32")(
  "SSH default-home server reuse",
  () => {
    it.live.each(["managed", "missing-pid"] as const)(
      "keeps a healthy default-home server alive with %s ownership state",
      (ownership) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const fixture = yield* fs.makeTempDirectoryScoped({ prefix: "t3-launch-reuse-" });
          const stateDir = path.join(fixture, "launcher");
          const serverHome = path.join(fixture, "home");
          const cliPath = path.join(fixture, "fixture.mjs");
          yield* fs.makeDirectory(stateDir);
          yield* fs.makeDirectory(path.join(serverHome, "userdata"), { recursive: true });
          yield* fs.writeFileString(
            cliPath,
            `import * as http from "node:http";
if (process.argv[2] === "serve") throw new Error("Unexpected replacement server");
const server = http.createServer((_request, response) => response.end("ready"));
process.on("SIGTERM", () => server.close());
server.listen(0, "127.0.0.1", () => process.stdout.write(JSON.stringify({ pid: process.pid, port: server.address().port }) + "\\n"));
`,
          );
          const child = yield* spawner.spawn(
            ChildProcess.make(process.execPath, [cliPath], { detached: false }),
          );
          yield* Effect.addFinalizer(() =>
            child.kill({ killSignal: "SIGKILL" }).pipe(Effect.ignore),
          );
          const started = yield* child.stdout.pipe(
            Stream.decodeText(),
            Stream.splitLines,
            Stream.take(1),
            Stream.mkString,
            Effect.flatMap(decodeStarted),
          );
          assert.equal(started.pid, child.pid);
          const runner = { nodeScriptPath: cliPath };
          const script = buildRemoteLaunchScript(runner)
            .replace(/^STATE_DIR=.*$/mu, 'STATE_DIR="$T3_TEST_STATE_DIR"')
            .replace(/^DEFAULT_SERVER_HOME=.*$/mu, 'DEFAULT_SERVER_HOME="$T3_TEST_SERVER_HOME"');
          const runnerContents = script
            .split("cat >\"$RUNNER_NEXT\" <<'SH'\n")[1]
            ?.split("\nSH\n")[0];
          if (runnerContents === undefined) {
            return yield* Effect.die("Launch script did not contain its runner");
          }
          yield* fs.writeFileString(path.join(stateDir, "run-t3.sh"), `${runnerContents}\n`);
          yield* fs.writeFileString(path.join(stateDir, "port"), `${started.port}\n`);
          yield* fs.writeFileString(path.join(stateDir, "managed"), "managed\n");
          if (ownership === "managed") {
            yield* fs.writeFileString(path.join(stateDir, "pid"), `${started.pid}\n`);
          }
          yield* fs.writeFileString(
            path.join(serverHome, "userdata", "server-runtime.json"),
            yield* encodeRuntime({
              pid: started.pid,
              port: started.port,
              origin: `http://127.0.0.1:${started.port}`,
            }),
          );
          const launch = Effect.scoped(
            Effect.gen(function* () {
              const shell = yield* spawner.spawn(
                ChildProcess.make("/bin/sh", ["-s", "--", "fixture"], {
                  cwd: fixture,
                  env: {
                    HOME: serverHome,
                    PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
                    T3_TEST_STATE_DIR: stateDir,
                    T3_TEST_SERVER_HOME: serverHome,
                  },
                  stdin: Stream.make(new TextEncoder().encode(script)),
                }),
              );
              return yield* Effect.all(
                {
                  stdout: shell.stdout.pipe(Stream.decodeText(), Stream.mkString),
                  stderr: shell.stderr.pipe(Stream.decodeText(), Stream.mkString),
                  exitCode: shell.exitCode,
                },
                { concurrency: "unbounded" },
              );
            }),
          );
          const result = yield* Effect.raceFirst(
            launch,
            child.exitCode.pipe(
              Effect.andThen(Effect.die("SSH reconnection stopped the healthy server")),
            ),
          );
          assert.equal(result.exitCode, 0, result.stderr);
          assert.equal(result.stderr, "");
          const receipt = yield* decodeLaunchResult(result.stdout.trim());
          assert.equal(receipt.remotePort, started.port);
          assert.equal(receipt.serverKind, ownership === "managed" ? "managed" : "external");
          assert.isTrue(yield* child.isRunning);
          if (ownership === "managed") {
            assert.equal(yield* fs.readFileString(path.join(stateDir, "pid")), `${started.pid}\n`);
          } else {
            assert.isFalse(yield* fs.exists(path.join(stateDir, "pid")));
          }
        }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
    );
  },
);

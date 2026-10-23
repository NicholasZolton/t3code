import * as Effect from "effect/Effect";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/process";

import { launchOrReuseRemoteServer } from "./tunnel.ts";

// Exercise the public launch API without opening an SSH connection or exporting script internals.
export const captureLaunchScript = Effect.fn("test.captureLaunchScript")(function* (
  nodeScriptPath: string,
) {
  let script = "";
  const spawner = ChildProcessSpawner.make((command) =>
    Effect.gen(function* () {
      const stdin = command._tag === "StandardCommand" ? command.options.stdin : undefined;
      if (
        typeof stdin !== "object" ||
        stdin === null ||
        !("stream" in stdin) ||
        stdin.stream === undefined ||
        typeof stdin.stream === "string"
      ) {
        return yield* Effect.die("Launch command did not supply a script");
      }
      script = yield* stdin.stream.pipe(Stream.decodeText(), Stream.mkString);
      const stdout = Stream.make(
        new TextEncoder().encode('{"remotePort":3773,"serverKind":"managed"}\n'),
      );
      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(123),
        stdout,
        stderr: Stream.empty,
        all: stdout,
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: Sink.drain,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      });
    }),
  );
  yield* launchOrReuseRemoteServer(
    { alias: "fixture", hostname: "fixture", username: null, port: null },
    undefined,
    { nodeScriptPath },
  ).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner));
  return script;
});

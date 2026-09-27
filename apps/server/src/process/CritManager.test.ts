// @effect-diagnostics nodeBuiltinImport:off - drives a real fake CLI process and loopback health server.
import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeHttp from "node:http";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { CheckpointRef, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { afterEach, it } from "@effect/vitest";
import { createCritManager } from "./CritManager.ts";

const decodeArguments = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(Schema.String)),
);
const fixtures: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of fixtures.splice(0).toReversed()) await cleanup();
});

it.effect("opens the selected scope and stops only its CLI after the browser disconnects", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.promise(() =>
      NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-crit-test-")),
    );
    fixtures.push(() => NodeFSP.rm(directory, { recursive: true, force: true }));
    let healthRequests = 0;
    let stopCommands = 0;
    let stopHome: string | undefined;
    let notifyStop: (args: ReadonlyArray<string>) => void = () => undefined;
    const stopped = new Promise<ReadonlyArray<string>>((resolve) => {
      notifyStop = resolve;
    });
    const server = NodeHttp.createServer((request, response) => {
      if (request.url === "/api/health") {
        healthRequests += 1;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ status: "ok", browser_clients: healthRequests <= 2 }));
        return;
      }
      if (request.url === "/stopped") {
        let body = "";
        request.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        request.on("end", () => {
          notifyStop(decodeArguments(body));
          response.end("ok");
        });
      }
      if (request.url === "/stop-command") {
        stopCommands += 1;
        const header = request.headers["x-crit-home"];
        stopHome = typeof header === "string" ? header : undefined;
        response.end("ok");
      }
    });
    yield* Effect.promise(
      () => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)),
    );
    fixtures.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const address = server.address();
    NodeAssert.ok(address && typeof address !== "string");
    const port = address.port;
    const command = NodePath.join(directory, "crit");
    yield* Effect.promise(() =>
      NodeFSP.writeFile(
        command,
        `#!${process.execPath}\n` +
          `const port=${port};\n` +
          `if(process.argv.includes('stop')){fetch('http://127.0.0.1:'+port+'/stop-command',{headers:{'x-crit-home':process.env.HOME}}).then(()=>process.exit(0));return;}\n` +
          `process.stderr.write('Started crit daemon at http://127.0.0.1:'+port+' (session test, PID '+process.pid+')\\n');\n` +
          `if(!process.argv.includes('stop'))setInterval(()=>{},1000);\n` +
          `process.on('SIGTERM',()=>{fetch('http://127.0.0.1:'+port+'/stopped',{method:'POST',body:JSON.stringify(process.argv.slice(2))}).then(()=>process.exit(0))});\n`,
      ),
    );
    yield* Effect.promise(() => NodeFSP.chmod(command, 0o755));
    const manager = createCritManager({
      command,
      outputDir: directory,
      browserCheckIntervalMs: 10,
      browserDisconnectGraceMs: 0,
    });
    fixtures.push(() => manager.dispose());

    yield* manager.open({ cwd: process.cwd(), scope: { kind: "working-tree" } });
    const args = yield* Effect.promise(() => stopped);
    NodeAssert.ok(healthRequests > 2);
    NodeAssert.deepEqual(args.slice(4), ["--base-branch", "HEAD"]);
    const outputDir = args[3];
    NodeAssert.deepEqual(args.slice(0, 3), ["--host", "127.0.0.1", "--output"]);
    NodeAssert.equal(outputDir, directory);
    yield* Effect.promise(() => manager.dispose());
    NodeAssert.equal(stopCommands, 1);
    NodeAssert.ok(stopHome);
    NodeAssert.notEqual(stopHome, outputDir);
    NodeAssert.equal(NodeFS.existsSync(stopHome), false);
    NodeAssert.equal(NodeFS.existsSync(outputDir), true);
  }),
);

it.effect("maps branch and turn selections to Crit ranges", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.promise(() =>
      NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-crit-args-test-")),
    );
    fixtures.push(() => NodeFSP.rm(directory, { recursive: true, force: true }));
    const command = NodePath.join(directory, "crit");
    const output = NodePath.join(directory, "args.jsonl");
    yield* Effect.promise(() =>
      NodeFSP.writeFile(
        command,
        `#!${process.execPath}\n` +
          `if(!process.argv.includes('stop'))require('node:fs').appendFileSync(require('node:path').join(process.argv[5],'args.jsonl'),JSON.stringify(process.argv.slice(2))+'\\n');\n` +
          `process.stderr.write('Started crit daemon at http://127.0.0.1:1 (session test, PID '+process.pid+')\\n');\n` +
          `if(!process.argv.includes('stop'))setInterval(()=>{},1000);\n` +
          `process.on('SIGTERM',()=>process.exit(0));\n`,
      ),
    );
    yield* Effect.promise(() => NodeFSP.chmod(command, 0o755));
    const manager = createCritManager({ command, outputDir: directory });
    fixtures.push(() => manager.dispose());
    const cwd = process.cwd();
    yield* manager.open({ cwd, scope: { kind: "branch", baseRef: "HEAD" } });
    yield* manager.open({
      cwd,
      scope: {
        kind: "turn",
        threadId: ThreadId.make("turn-test"),
        fromTurnCount: 0,
        toRef: CheckpointRef.make("refs/t3/checkpoints/dHVybi10ZXN0/turn/2"),
      },
    });
    yield* manager.open({
      cwd,
      scope: {
        kind: "turn",
        threadId: ThreadId.make("turn-test"),
        fromTurnCount: 1,
        fromRef: CheckpointRef.make("refs/custom/previous"),
        toRef: CheckpointRef.make("refs/custom/current"),
      },
    });
    yield* Effect.promise(() => manager.dispose());
    const args = (yield* Effect.promise(() => NodeFSP.readFile(output, "utf8")))
      .trim()
      .split("\n")
      .map((line) => decodeArguments(line));
    const head = NodeChildProcess.execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
    }).trim();
    const branchArgs = args[0];
    NodeAssert.ok(branchArgs);
    NodeAssert.deepEqual(branchArgs.slice(4), ["--range", `${head}..HEAD`]);
    const turnRange = args[1]?.[5];
    NodeAssert.ok(turnRange);
    NodeAssert.match(
      turnRange,
      /^refs\/t3\/checkpoints\/[^/]+\/turn\/0\.\.refs\/t3\/checkpoints\/[^/]+\/turn\/2$/,
    );
    NodeAssert.deepEqual(args[2]?.slice(4), [
      "--range",
      "refs/custom/previous..refs/custom/current",
    ]);
  }),
);

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
const encodeJsonString = Schema.encodeSync(Schema.fromJsonString(Schema.String));
const decodeAlias = Schema.decodeSync(
  Schema.fromJsonString(Schema.Struct({ args: Schema.Array(Schema.String), port: Schema.String })),
);
const decodeEnvironment = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      ghRepo: Schema.optional(Schema.String),
      home: Schema.String,
    }),
  ),
);
const fixtures: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of fixtures.splice(0).toReversed()) await cleanup();
});

for (const stopReason of ["browser disconnect", "one-hour lifetime"] as const)
  it.effect(`opens the selected scope and stops only its CLI after ${stopReason}`, () =>
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
          response.end(
            JSON.stringify({
              status: "ok",
              browser_clients: stopReason === "one-hour lifetime" || healthRequests <= 2,
            }),
          );
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
        ...(stopReason === "one-hour lifetime" ? { maxReviewLifetimeMs: 500 } : {}),
      });
      fixtures.push(() => manager.dispose());

      yield* manager.open({ cwd: process.cwd(), scope: { kind: "working-tree" } });
      const args = yield* Effect.promise(() => stopped);
      NodeAssert.ok(healthRequests > (stopReason === "one-hour lifetime" ? 0 : 2));
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

it.effect("maps branch, turn, pull request, and commit selections to Crit scopes", () =>
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
          `if(!process.argv.includes('stop'))require('node:fs').appendFileSync(require('node:path').join(process.argv[5],'env.jsonl'),JSON.stringify({ghRepo:process.env.GH_REPO,home:process.env.HOME})+'\\n');\n` +
          `process.stderr.write('Started crit daemon at http://127.0.0.1:1 (session test, PID '+process.pid+')\\n');\n` +
          `if(!process.argv.includes('stop'))setInterval(()=>{},1000);\n` +
          `process.on('SIGTERM',()=>process.exit(0));\n`,
      ),
    );
    yield* Effect.promise(() => NodeFSP.chmod(command, 0o755));
    const manager = createCritManager({ command, outputDir: directory });
    fixtures.push(() => manager.dispose());
    const cwd = process.cwd();
    const head = NodeChildProcess.execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
    }).trim();
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
    const githubUrl = "https://github.com/NicholasZolton/t3code/pull/9";
    yield* manager.open({
      cwd,
      scope: { kind: "pull-request", provider: "github", url: githubUrl, number: 9 },
    });
    const gitlabUrl = "https://gitlab.example.org/team/app/-/merge_requests/12";
    yield* manager.open({
      cwd,
      scope: { kind: "pull-request", provider: "gitlab", url: gitlabUrl, number: 12 },
    });
    yield* manager.open({
      cwd,
      scope: { kind: "pull-request", provider: "github", url: githubUrl, number: 9, commit: head },
    });
    yield* Effect.promise(() => manager.dispose());
    const args = (yield* Effect.promise(() => NodeFSP.readFile(output, "utf8")))
      .trim()
      .split("\n")
      .map((line) => decodeArguments(line));
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
    NodeAssert.deepEqual(args[3]?.slice(4), ["--pr", githubUrl]);
    NodeAssert.deepEqual(args[4]?.slice(4), ["--mr", gitlabUrl, "--remote"]);
    NodeAssert.deepEqual(args[5]?.slice(4), ["--range", `${head}^..${head}`]);
    const environments = (yield* Effect.promise(() =>
      NodeFSP.readFile(NodePath.join(directory, "env.jsonl"), "utf8"),
    ))
      .trim()
      .split("\n")
      .map((line) => decodeEnvironment(line));
    NodeAssert.equal(environments[3]?.ghRepo, "github.com/NicholasZolton/t3code");
    NodeAssert.notEqual(environments[3]?.home, NodeOS.homedir());
  }),
);

it.effect("fetches a pull request commit absent from the local checkout", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.promise(() =>
      NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-crit-pr-test-")),
    );
    fixtures.push(() => NodeFSP.rm(directory, { recursive: true, force: true }));
    const git = (cwd: string, ...args: string[]): string =>
      NodeChildProcess.execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    const origin = NodePath.join(directory, "origin.git");
    const author = NodePath.join(directory, "author");
    const checkout = NodePath.join(directory, "checkout");
    git(directory, "init", "--bare", "-b", "main", origin);
    git(directory, "clone", origin, author);
    git(
      author,
      "-c",
      "user.name=T3",
      "-c",
      "user.email=t3@example.test",
      "commit",
      "--allow-empty",
      "-m",
      "base",
    );
    git(author, "push", "origin", "HEAD:main");
    git(directory, "clone", origin, checkout);
    yield* Effect.promise(() => NodeFSP.writeFile(NodePath.join(author, "change.txt"), "change\n"));
    git(author, "add", "change.txt");
    git(author, "-c", "user.name=T3", "-c", "user.email=t3@example.test", "commit", "-m", "change");
    const commit = git(author, "rev-parse", "HEAD");
    git(author, "push", "origin", "HEAD:refs/pull/9/head");
    NodeAssert.notEqual(
      NodeChildProcess.spawnSync("git", ["cat-file", "-e", commit], { cwd: checkout }).status,
      0,
    );

    const command = NodePath.join(directory, "crit");
    yield* Effect.promise(() =>
      NodeFSP.writeFile(
        command,
        `#!${process.execPath}\n` +
          `if(process.argv.includes('stop'))process.exit(0);\n` +
          `require('node:fs').writeFileSync(require('node:path').join(process.argv[5],'args.json'),JSON.stringify(process.argv.slice(2)));\n` +
          `process.stderr.write('Started crit daemon at http://127.0.0.1:1\\n');\n` +
          `setInterval(()=>{},1000);\n`,
      ),
    );
    yield* Effect.promise(() => NodeFSP.chmod(command, 0o755));
    const manager = createCritManager({ command, outputDir: directory });
    fixtures.push(() => manager.dispose());
    yield* manager.open({
      cwd: checkout,
      scope: {
        kind: "pull-request",
        provider: "github",
        url: "https://github.com/example/repo/pull/9",
        number: 9,
        commit,
      },
    });
    yield* Effect.promise(() => manager.dispose());
    NodeAssert.equal(git(checkout, "rev-parse", "HEAD"), git(author, "rev-parse", "HEAD^"));
    NodeAssert.equal(git(checkout, "cat-file", "-t", commit), "commit");
    const args = decodeArguments(
      yield* Effect.promise(() => NodeFSP.readFile(NodePath.join(directory, "args.json"), "utf8")),
    );
    NodeAssert.deepEqual(args.slice(4), ["--range", `${commit}^..${commit}`]);
  }),
);

it.effect(
  "registers remote reviews on the forwarded Portless gateway and removes the route on close",
  () =>
    Effect.gen(function* () {
      const directory = yield* Effect.promise(() =>
        NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-crit-portless-test-")),
      );
      fixtures.push(() => NodeFSP.rm(directory, { recursive: true, force: true }));
      const command = NodePath.join(directory, "crit");
      const portlessCommand = NodePath.join(directory, "portless");
      const aliasLog = NodePath.join(directory, "aliases.jsonl");
      const argsLog = NodePath.join(directory, "args.json");
      yield* Effect.promise(() =>
        Promise.all([
          NodeFSP.writeFile(
            command,
            `#!${process.execPath}\n` +
              `if(process.argv.includes('stop'))process.exit(0);\n` +
              `if(process.argv.includes('status')){process.stdout.write('{"sessions":[{"port":41234}]}');process.exit(0);}\n` +
              `require('node:fs').writeFileSync(${encodeJsonString(argsLog)},JSON.stringify(process.argv.slice(2)));\n` +
              `process.stderr.write('Started crit daemon at '+process.argv[process.argv.indexOf('--public-url')+1]+' (session test, PID '+process.pid+')\\n');\n` +
              `setInterval(()=>{},1000);\n` +
              `process.on('SIGTERM',()=>process.exit(0));\n`,
            { mode: 0o755 },
          ),
          NodeFSP.writeFile(
            portlessCommand,
            `#!${process.execPath}\n` +
              `require('node:fs').appendFileSync(${encodeJsonString(aliasLog)},JSON.stringify({args:process.argv.slice(2),port:process.env.PORTLESS_PORT})+'\\n');\n`,
            { mode: 0o755 },
          ),
        ]),
      );
      const manager = createCritManager({ command, portlessCommand, outputDir: directory });
      fixtures.push(() => manager.dispose());
      const url = yield* manager.open({
        cwd: process.cwd(),
        portlessPort: 58345,
        scope: { kind: "working-tree" },
      });
      NodeAssert.ok(url);
      NodeAssert.match(url, /^https:\/\/t3-crit-[a-f0-9-]+\.localhost:58345$/);
      const args = decodeArguments(yield* Effect.promise(() => NodeFSP.readFile(argsLog, "utf8")));
      NodeAssert.deepEqual(args.slice(4), [
        "--no-open",
        "--public-url",
        url,
        "--allow-unauthenticated-network",
        "--base-branch",
        "HEAD",
      ]);
      yield* Effect.promise(() => manager.dispose());
      const aliases = (yield* Effect.promise(() => NodeFSP.readFile(aliasLog, "utf8")))
        .trim()
        .split("\n")
        .map((line) => decodeAlias(line));
      const name = new URL(url).hostname.slice(0, -".localhost".length);
      NodeAssert.deepEqual(aliases, [
        { args: ["alias", name, "41234"], port: "58345" },
        { args: ["alias", "--remove", name], port: "58345" },
      ]);
    }),
);

// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off globalFetch:off - supervises an external CLI and its loopback health endpoint.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import { CritOpenError, type CritOpenInput } from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { checkpointRefForThreadTurn } from "../checkpointing/Utils.ts";

const execFile = NodeUtil.promisify(NodeChildProcess.execFile);
const READY =
  /(?:Started crit daemon at|Connected to crit daemon at) http:\/\/(?:127\.0\.0\.1|localhost):(\d+)/;
const decodeCritStatus = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ sessions: Schema.Array(Schema.Struct({ port: Schema.Number })) }),
  ),
);
const BROWSER_START_TIMEOUT_MS = 60_000;
const BROWSER_CHECK_INTERVAL_MS = 2_000;
const MAX_REVIEW_LIFETIME_MS = 60 * 60 * 1_000;
const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

async function portlessAlias(command: string, args: string[], port: number): Promise<void> {
  const env = { ...process.env, PORTLESS_PORT: String(port), PORTLESS_SYNC_HOSTS: "0" };
  try {
    await execFile(command, args, { env, timeout: 10_000 });
  } catch (error) {
    if (
      !(
        command === "portless" &&
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      )
    )
      throw error;
    await execFile(
      NodePath.join(NodeOS.homedir(), ".local/bin/mise"),
      ["exec", "--", "portless", ...args],
      { env, timeout: 10_000 },
    );
  }
}

async function critArgs(input: CritOpenInput): Promise<string[]> {
  switch (input.scope.kind) {
    case "working-tree":
      return ["--base-branch", "HEAD"];
    case "branch": {
      const { stdout } = await execFile("git", ["merge-base", "--", input.scope.baseRef, "HEAD"], {
        cwd: input.cwd,
      });
      return ["--range", `${stdout.trim()}..HEAD`];
    }
    case "pull-request": {
      if (input.scope.commit) {
        const commit = input.scope.commit;
        try {
          await execFile("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: input.cwd });
        } catch {
          const ref =
            input.scope.provider === "github"
              ? `refs/pull/${input.scope.number}/head`
              : `refs/merge-requests/${input.scope.number}/head`;
          await execFile("git", ["fetch", "--quiet", "--no-tags", "origin", ref], {
            cwd: input.cwd,
            timeout: 30_000,
          });
          await execFile("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: input.cwd });
        }
        return ["--range", `${commit}^..${commit}`];
      }
      return input.scope.provider === "github"
        ? ["--pr", input.scope.url]
        : ["--mr", input.scope.url, "--remote"];
    }
    case "turn":
      if (input.scope.fromTurnCount !== 0 && !input.scope.fromRef) {
        throw new Error("The previous turn checkpoint is unavailable.");
      }
      return [
        "--range",
        `${input.scope.fromRef ?? checkpointRefForThreadTurn(input.scope.threadId, 0)}..${input.scope.toRef}`,
      ];
  }
}

interface ManagedReview {
  stop: () => Promise<void>;
}

/** Isolate Crit's daemon registry per launch while leaving reviews in Crit's normal data root. */
export function createCritManager(
  options: {
    readonly command?: string;
    readonly portlessCommand?: string;
    readonly outputDir?: string;
    readonly browserCheckIntervalMs?: number;
    readonly browserDisconnectGraceMs?: number;
    readonly maxReviewLifetimeMs?: number;
  } = {},
) {
  const command = options.command ?? "crit";
  const portlessCommand = options.portlessCommand ?? "portless";
  const outputDir = options.outputDir ?? NodePath.join(NodeOS.homedir(), ".crit");
  const isWindows = HostProcessPlatform.defaultValue() === "win32";
  const reviews = new Set<ManagedReview>();

  const open = async (input: CritOpenInput): Promise<string | null> => {
    const args = await critArgs(input);
    let githubRepository: string | undefined;
    if (input.scope.kind === "pull-request" && input.scope.provider === "github") {
      const url = new URL(input.scope.url);
      const repository = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/);
      if (
        url.protocol !== "https:" ||
        !repository ||
        Number(repository[3]) !== input.scope.number
      ) {
        throw new Error("Crit needs a GitHub pull request URL for this review.");
      }
      githubRepository = `${url.hostname}/${repository[1]}/${repository[2]}`;
    }
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-crit-"));
    const alias = input.portlessPort ? `t3-crit-${NodeCrypto.randomUUID()}` : null;
    const reviewUrl = alias ? `https://${alias}.localhost:${input.portlessPort}` : null;
    const providerBin = NodePath.join(root, "bin");
    if (input.scope.kind === "pull-request" && !isWindows) {
      try {
        await NodeFSP.mkdir(providerBin);
        // The daemon keeps its own HOME; forge and git CLIs need the environment's normal login.
        for (const tool of ["gh", "glab", "git"]) {
          await NodeFSP.writeFile(
            NodePath.join(providerBin, tool),
            `#!/bin/sh\nHOME=${shellQuote(NodeOS.homedir())} USERPROFILE=${shellQuote(NodeOS.homedir())} PATH=${shellQuote(process.env.PATH ?? "")} exec ${tool} "$@"\n`,
            { mode: 0o755 },
          );
        }
      } catch (error) {
        await NodeFSP.rm(root, { recursive: true, force: true });
        throw error;
      }
    }
    const env = {
      ...process.env,
      HOME: root,
      USERPROFILE: root,
      ...(input.scope.kind === "pull-request" && !isWindows
        ? { PATH: `${providerBin}${NodePath.delimiter}${process.env.PATH ?? ""}` }
        : {}),
      ...(githubRepository ? { GH_REPO: githubRepository } : {}),
      CRIT_NO_INTEGRATION_CHECK: "1",
      CRIT_NO_UPDATE_CHECK: "1",
    };
    const child = NodeChildProcess.spawn(
      command,
      [
        "--host",
        "127.0.0.1",
        "--output",
        outputDir,
        ...(reviewUrl
          ? ["--no-open", "--public-url", reviewUrl, "--allow-unauthenticated-network"]
          : []),
        ...args,
      ],
      {
        cwd: input.cwd,
        stdio: ["ignore", "ignore", "pipe"],
        env,
      },
    );
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let startupTimeout: ReturnType<typeof setTimeout> | undefined;
    let lifetimeTimeout: ReturnType<typeof setTimeout> | undefined;
    let resolveExit: () => void = () => undefined;
    const exited = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    child.once("exit", resolveExit);
    child.once("error", resolveExit);
    let stopPromise: Promise<void> | undefined;
    let aliased = false;
    const review: ManagedReview = {
      stop: () => {
        stopPromise ??= (async () => {
          stopped = true;
          if (timer) clearInterval(timer);
          if (startupTimeout) clearTimeout(startupTimeout);
          if (lifetimeTimeout) clearTimeout(lifetimeTimeout);
          if (aliased && alias && input.portlessPort) {
            await portlessAlias(
              portlessCommand,
              ["alias", "--remove", alias],
              input.portlessPort,
            ).catch(() => undefined);
          }
          // Crit's session registry is confined to this launch's HOME, even if
          // its CLI has already exited without stopping the daemon.
          try {
            await execFile(command, ["stop", "--all"], { cwd: input.cwd, env, timeout: 5_000 });
          } catch {
            // A failed launch or approved review may have no daemon to stop.
          }
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
          await exited;
          await NodeFSP.rm(root, { recursive: true, force: true });
          reviews.delete(review);
        })();
        return stopPromise;
      },
    };
    reviews.add(review);

    try {
      const announcedPort = await new Promise<number | null>((resolve, reject) => {
        let stderr = "";
        const fail = (message: string): void => reject(new Error(message));
        startupTimeout = setTimeout(() => fail("Crit did not start a review in time."), 30_000);
        child.stderr?.on("data", (chunk: Buffer) => {
          stderr = (stderr + chunk.toString()).slice(-4_096);
          const match = READY.exec(stderr);
          const publicReady =
            reviewUrl !== null &&
            (stderr.includes(`Started crit daemon at ${reviewUrl} (session `) ||
              stderr.includes(`Connected to crit daemon at ${reviewUrl} (session `));
          if (match || publicReady) {
            if (startupTimeout) clearTimeout(startupTimeout);
            resolve(match ? Number(match[1]) : null);
          }
        });
        child.once("error", (error) => fail(`Could not start crit: ${error.message}`));
        child.once("exit", () => fail(stderr.trim() || "Crit exited before opening a review."));
      });
      // With --public-url Crit announces the proxy URL; its isolated HOME has exactly one session.
      const port =
        announcedPort ??
        decodeCritStatus(
          (
            await execFile(command, ["status", "--json"], {
              cwd: input.cwd,
              env,
              timeout: 5_000,
            })
          ).stdout,
        ).sessions[0]?.port;
      if (!port || !Number.isInteger(port) || port > 65_535) {
        throw new Error("Could not determine Crit's listening port.");
      }
      if (alias && input.portlessPort) {
        await portlessAlias(portlessCommand, ["alias", alias, String(port)], input.portlessPort);
        aliased = true;
      }
      const started = Date.now();
      lifetimeTimeout = setTimeout(
        () => void review.stop().catch(() => undefined),
        options.maxReviewLifetimeMs ?? MAX_REVIEW_LIFETIME_MS,
      );
      let connected = false;
      let absentSince: number | null = null;
      let checking = false;
      timer = setInterval(() => {
        if (checking || stopped) return;
        checking = true;
        void (async () => {
          try {
            const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
              signal: AbortSignal.timeout(1_000),
            });
            if (response.ok) {
              const health: unknown = await response.json();
              if (
                typeof health === "object" &&
                health !== null &&
                "status" in health &&
                health.status === "ok" &&
                "browser_clients" in health &&
                typeof health.browser_clients === "boolean"
              ) {
                if (health.browser_clients) {
                  connected = true;
                  absentSince = null;
                } else if (absentSince === null) {
                  absentSince = Date.now();
                }
              }
            }
          } catch {
            // A transient failed health check is not proof the browser closed.
          } finally {
            checking = false;
          }
          if (
            (connected &&
              absentSince !== null &&
              Date.now() - absentSince >= (options.browserDisconnectGraceMs ?? 4_000)) ||
            (!connected && Date.now() - started >= BROWSER_START_TIMEOUT_MS)
          )
            void review.stop().catch(() => undefined);
        })();
      }, options.browserCheckIntervalMs ?? BROWSER_CHECK_INTERVAL_MS);
      void exited.then(() => review.stop()).catch(() => undefined);
      return reviewUrl;
    } catch (error) {
      await review.stop();
      throw error;
    }
  };

  return {
    open: (input: CritOpenInput): Effect.Effect<string | null, CritOpenError> =>
      Effect.tryPromise({
        try: () => open(input),
        catch: (cause) =>
          new CritOpenError({
            message: cause instanceof Error ? cause.message : "Could not open Crit.",
          }),
      }),
    dispose: async (): Promise<void> => {
      await Promise.all([...reviews].map((review) => review.stop()));
    },
  };
}

export class CritManager extends Context.Service<
  CritManager,
  ReturnType<typeof createCritManager>
>()("t3/process/CritManager") {}

export const layer = Layer.effect(
  CritManager,
  Effect.acquireRelease(Effect.sync(createCritManager), (manager) =>
    Effect.promise(() => manager.dispose()),
  ),
);

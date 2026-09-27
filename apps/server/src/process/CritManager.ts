// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off globalFetch:off - supervises an external CLI and its loopback health endpoint.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import { CritOpenError, type CritOpenInput } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { checkpointRefForThreadTurn } from "../checkpointing/Utils.ts";

const execFile = NodeUtil.promisify(NodeChildProcess.execFile);
const READY =
  /(?:Started crit daemon at|Connected to crit daemon at) http:\/\/(?:127\.0\.0\.1|localhost):(\d+)/;
const BROWSER_START_TIMEOUT_MS = 60_000;
const BROWSER_CHECK_INTERVAL_MS = 2_000;

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
    readonly outputDir?: string;
    readonly browserCheckIntervalMs?: number;
    readonly browserDisconnectGraceMs?: number;
  } = {},
) {
  const command = options.command ?? "crit";
  const outputDir = options.outputDir ?? NodePath.join(NodeOS.homedir(), ".crit");
  const reviews = new Set<ManagedReview>();

  const open = async (input: CritOpenInput): Promise<void> => {
    const args = await critArgs(input);
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-crit-"));
    const env = {
      ...process.env,
      HOME: root,
      USERPROFILE: root,
      CRIT_NO_INTEGRATION_CHECK: "1",
      CRIT_NO_UPDATE_CHECK: "1",
    };
    const child = NodeChildProcess.spawn(
      command,
      ["--host", "127.0.0.1", "--output", outputDir, ...args],
      {
        cwd: input.cwd,
        stdio: ["ignore", "ignore", "pipe"],
        env,
      },
    );
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let startupTimeout: ReturnType<typeof setTimeout> | undefined;
    let resolveExit: () => void = () => undefined;
    const exited = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    child.once("exit", resolveExit);
    child.once("error", resolveExit);
    let stopPromise: Promise<void> | undefined;
    const review: ManagedReview = {
      stop: () => {
        stopPromise ??= (async () => {
          stopped = true;
          if (timer) clearInterval(timer);
          if (startupTimeout) clearTimeout(startupTimeout);
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
      const port = await new Promise<number>((resolve, reject) => {
        let stderr = "";
        const fail = (message: string): void => reject(new Error(message));
        startupTimeout = setTimeout(() => fail("Crit did not start a review in time."), 30_000);
        child.stderr?.on("data", (chunk: Buffer) => {
          stderr = (stderr + chunk.toString()).slice(-4_096);
          const match = READY.exec(stderr);
          if (match) {
            if (startupTimeout) clearTimeout(startupTimeout);
            resolve(Number(match[1]));
          }
        });
        child.once("error", (error) => fail(`Could not start crit: ${error.message}`));
        child.once("exit", () => fail(stderr.trim() || "Crit exited before opening a review."));
      });
      const started = Date.now();
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
    } catch (error) {
      await review.stop();
      throw error;
    }
  };

  return {
    open: (input: CritOpenInput): Effect.Effect<void, CritOpenError> =>
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

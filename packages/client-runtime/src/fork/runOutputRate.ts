import type {
  OrchestrationV2ProviderTurn,
  OrchestrationV2Run,
  OrchestrationV2RunAttempt,
  RunId,
} from "@t3tools/contracts";
import { formatDuration } from "@t3tools/shared/orchestrationTimingCopy";
import * as DateTime from "effect/DateTime";
import { mFallback, msg } from "gt-i18n";
import type { MFunctionType } from "gt-i18n/types";

interface RunOutputRate {
  readonly elapsedMs: number;
  readonly tokensPerSecond: number;
}

export type RunOutputRates = ReadonlyMap<RunId, RunOutputRate>;

type RunTiming = Pick<OrchestrationV2Run, "id" | "status" | "startedAt" | "completedAt">;
type RootAttempt = Pick<OrchestrationV2RunAttempt, "id" | "runId" | "rootNodeId">;
type MeteredTurn = Pick<
  OrchestrationV2ProviderTurn,
  "runAttemptId" | "nodeId" | "turnTokenUsage" | "promptDropped"
>;

/** Average main-agent output over the full run, including time spent on tools. */
export function deriveRunOutputRates(
  runs: ReadonlyArray<RunTiming> | undefined,
  attempts: ReadonlyArray<RootAttempt> | undefined,
  turns: ReadonlyArray<MeteredTurn> | undefined,
): RunOutputRates | undefined {
  if (!runs?.length || !attempts?.length || !turns?.length) return undefined;

  const attemptsById: ReadonlyMap<RootAttempt["id"], RootAttempt> = new Map(
    attempts.map((attempt) => [attempt.id, attempt]),
  );
  const outputByRun = new Map<RunId, number | null>();
  for (const turn of turns) {
    const attempt = turn.runAttemptId === null ? undefined : attemptsById.get(turn.runAttemptId);
    if (attempt === undefined || attempt.rootNodeId !== turn.nodeId || turn.promptDropped) continue;
    const usage = turn.turnTokenUsage;
    if (usage?.localCommand) continue;
    const previous = outputByRun.get(attempt.runId);
    outputByRun.set(
      attempt.runId,
      previous === null || usage?.usageStatus !== "complete"
        ? null
        : (previous ?? 0) + usage.outputTokens,
    );
  }

  const rates = new Map<RunId, RunOutputRate>();
  for (const run of runs) {
    if (run.status !== "completed" || run.startedAt === null || run.completedAt === null) continue;
    const outputTokens = outputByRun.get(run.id);
    if (!outputTokens) continue;
    const elapsedMs =
      DateTime.toEpochMillis(run.completedAt) - DateTime.toEpochMillis(run.startedAt);
    if (elapsedMs > 0) {
      rates.set(run.id, { elapsedMs, tokensPerSecond: outputTokens / (elapsedMs / 1_000) });
    }
  }
  return rates.size === 0 ? undefined : rates;
}

const rateFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export function formatRunOutputRateLabel(
  rate: RunOutputRate | undefined,
  resolve: MFunctionType = mFallback,
): string | undefined {
  if (rate === undefined) return undefined;
  return resolve(
    msg("Worked for {duration} · {rate} tok/s avg", {
      duration: formatDuration(rate.elapsedMs, resolve),
      rate: rateFormatter.format(rate.tokensPerSecond),
    }),
  );
}

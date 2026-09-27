import type { EnvironmentId, ThreadId, WorktreeSetupSnapshot } from "@t3tools/contracts";
import {
  findRecordedWorktreeSetup,
  resolveVisibleWorktreeSetup,
  shouldSubscribeToWorktreeSetup,
} from "@t3tools/client-runtime/worktree-setup";
import { useEffect, useState } from "react";
import { useEnvironmentQuery } from "../../state/query";
import { vcsEnvironment } from "../../state/vcs";

/** Retain the last live snapshot when its subscription closes after setup. */
export function useWorktreeSetup(input: {
  environmentId: EnvironmentId | null;
  threadId: ThreadId | null;
  activities: ReadonlyArray<{ kind: string; payload: unknown }>;
  preparing: boolean;
  turnStarted: boolean;
  followUpSent: boolean;
}) {
  const key = JSON.stringify([input.environmentId, input.threadId]);
  const [held, setHeld] = useState<{ key: string; snapshot: WorktreeSetupSnapshot } | null>(null);
  const live = held?.key === key ? held.snapshot : null;
  const recorded = input.threadId
    ? findRecordedWorktreeSetup(input.activities, input.threadId)
    : null;
  const query = useEnvironmentQuery(
    input.environmentId &&
      input.threadId &&
      shouldSubscribeToWorktreeSetup({ live, recorded, preparing: input.preparing })
      ? vcsEnvironment.worktreeSetup({
          environmentId: input.environmentId,
          input: { threadId: input.threadId },
        })
      : null,
  );
  useEffect(() => {
    if (query.data?.threadId === input.threadId) setHeld({ key, snapshot: query.data });
  }, [key, input.threadId, query.data]);
  return resolveVisibleWorktreeSetup({
    live: query.data ?? live,
    recorded,
    turnStarted: input.turnStarted,
    followUpSent: input.followUpSent,
  });
}

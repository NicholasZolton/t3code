import { type ThreadId } from "@t3tools/contracts";
import {
  hasProjectSettingsOverrides,
  resolveProjectSettings,
} from "@t3tools/shared/projectSettings";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import { ServerSettingsService } from "../serverSettings.ts";

/** Keep optional project queries available after a service's construction layer closes. */
export const makeWorkspaceQueries = Effect.gen(function* () {
  const threads = yield* Effect.serviceOption(ProjectionStore.ProjectionStoreV2);
  const projects = yield* Effect.serviceOption(ProjectStore.ProjectStoreV2);
  return <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    const withThreads = Option.isSome(threads)
      ? effect.pipe(Effect.provideService(ProjectionStore.ProjectionStoreV2, threads.value))
      : effect;
    return Option.isSome(projects)
      ? withThreads.pipe(Effect.provideService(ProjectStore.ProjectStoreV2, projects.value))
      : withThreads;
  };
});

/** Workspace operations also run without orchestration, where environment settings apply. */
export const workspaceSettings = Effect.fnUntraced(function* (input: {
  readonly cwd: string;
  readonly threadId?: ThreadId | undefined;
}) {
  const service = yield* ServerSettingsService;
  const settings = yield* service.getSettings;
  if (!hasProjectSettingsOverrides(settings)) return settings;
  const threads = yield* Effect.serviceOption(ProjectionStore.ProjectionStoreV2);
  const projects = yield* Effect.serviceOption(ProjectStore.ProjectStoreV2);
  const projectId = yield* Effect.gen(function* () {
    if (input.threadId !== undefined && Option.isSome(threads)) {
      return (yield* threads.value.getThreadShell(input.threadId))?.projectId ?? null;
    }
    if (Option.isSome(projects)) {
      return (
        Option.getOrNull(yield* projects.value.findActiveByWorkspaceRoot(input.cwd))?.projectId ??
        null
      );
    }
    return null;
  }).pipe(Effect.orElseSucceed(() => null));
  return resolveProjectSettings(settings, projectId).settings;
});

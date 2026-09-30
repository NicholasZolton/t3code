import { type ProjectId, type ThreadId } from "@t3tools/contracts";
import {
  hasProjectSettingsOverrides,
  resolveProjectSettings,
} from "@t3tools/shared/projectSettings";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ServerSettingsService } from "../serverSettings.ts";

/** Workspace operations also run without orchestration, where environment settings apply. */
export const workspaceSettings = Effect.fnUntraced(function* (input: {
  readonly cwd: string;
  readonly threadId?: ThreadId | undefined;
}) {
  const service = yield* ServerSettingsService;
  const settings = yield* service.getSettings;
  const query = yield* Effect.serviceOption(ProjectionSnapshotQuery.ProjectionSnapshotQuery);
  if (!hasProjectSettingsOverrides(settings) || Option.isNone(query)) return settings;
  const projectId = yield* (
    input.threadId === undefined
      ? query.value
          .getActiveProjectByWorkspaceRoot(input.cwd)
          .pipe(Effect.map(Option.map((project) => project.id)))
      : query.value
          .getThreadShellById(input.threadId)
          .pipe(Effect.map(Option.map((thread) => thread.projectId)))
  ).pipe(Effect.orElseSucceed(() => Option.none<ProjectId>()));
  return resolveProjectSettings(settings, Option.getOrNull(projectId)).settings;
});

import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import { hydrateFnoxSecrets } from "./fnoxSecrets.ts";
import * as ProcessRunner from "./processRunner.ts";

it.live("adds the fnox secrets a terminal in home would get, keeping inherited values", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-fnox-home-" });
    const bin = yield* fs.makeTempDirectoryScoped({ prefix: "t3-fnox-bin-" });
    // The relative read succeeds only when fnox runs from home.
    yield* fs.writeFileString(`${bin}/fnox`, "#!/bin/sh\nexec /bin/cat export.json\n", {
      mode: 0o755,
    });
    yield* fs.writeFileString(
      `${home}/export.json`,
      JSON.stringify({ secrets: { LINEAR_TOKEN: "from-fnox", INHERITED: "from-fnox" } }),
    );
    const env: NodeJS.ProcessEnv = { PATH: `${bin}:/usr/bin:/bin`, INHERITED: "from-server" };

    yield* hydrateFnoxSecrets().pipe(
      Effect.provideService(HostProcess.Environment, env),
      Effect.provideService(HostProcess.HomeDirectory, home),
    );

    expect(env).toMatchObject({ LINEAR_TOKEN: "from-fnox", INHERITED: "from-server" });
  }).pipe(
    Effect.scoped,
    Effect.provide(ProcessRunner.layer.pipe(Layer.provideMerge(NodeServices.layer))),
  ),
);

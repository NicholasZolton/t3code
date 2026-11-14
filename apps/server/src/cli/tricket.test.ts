import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as NetService from "@t3tools/shared/Net";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Command } from "effect/cli";

import { tricketCommand } from "./tricket.ts";

it.effect(
  "requires a thread identity before opening local authentication or enrolling an agent",
  () =>
    Effect.gen(function* () {
      const error = yield* Command.runWith(tricketCommand, { version: "test" })(["join"]).pipe(
        Effect.flip,
      );
      assert.equal(error._tag, "UserError");
      assert.include(error.message, "--thread");
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          NodeCrypto.layer,
          NodeServices.layer,
          NetService.layer,
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })),
        ),
      ),
    ),
);

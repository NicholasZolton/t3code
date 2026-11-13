import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerRuntimeStartup from "../../serverRuntimeStartup.ts";
import * as TricketClient from "./TricketClient.ts";
import * as TricketIntegration from "./TricketIntegration.ts";
import * as TricketRepository from "./TricketRepository.ts";

export const layer = TricketIntegration.layer.pipe(
  Layer.provide(TricketClient.layer),
  Layer.provide(TricketRepository.layerConfig),
);

export const worker = Layer.effectDiscard(
  Effect.gen(function* () {
    const startup = yield* ServerRuntimeStartup.ServerRuntimeStartup;
    const integration = yield* TricketIntegration.TricketIntegration;
    yield* startup.awaitCommandReady.pipe(
      Effect.orDie,
      Effect.andThen(integration.run),
      Effect.forkScoped,
    );
  }),
);

import { TRICKET_WEBHOOK_PATH } from "@t3tools/contracts";
import * as ByteSize from "effect/ByteSize";
import * as Effect from "effect/Effect";
import * as HttpIncomingMessage from "effect/http/HttpIncomingMessage";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";

import * as TricketIntegration from "./TricketIntegration.ts";

const MAX_BODY_BYTES = 1024 * 1024;

export const layer = HttpRouter.add(
  "POST",
  TRICKET_WEBHOOK_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const integration = yield* TricketIntegration.TricketIntegration;
    const body = yield* request.arrayBuffer.pipe(
      Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(MAX_BODY_BYTES)),
      Effect.map((buffer) => new Uint8Array(buffer)),
    );
    if (body.length > MAX_BODY_BYTES) return HttpServerResponse.empty({ status: 413 });
    return yield* integration.receive({ body, headers: request.headers }).pipe(
      Effect.map((result) =>
        HttpServerResponse.empty({
          status: result === "accepted" ? 202 : result === "invalid" ? 401 : 503,
        }),
      ),
      Effect.orElseSucceed(() => HttpServerResponse.empty({ status: 503 })),
    );
  }),
);

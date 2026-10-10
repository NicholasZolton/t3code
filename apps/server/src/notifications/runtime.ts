import * as FcmClient from "@t3tools/shared/FcmClient";
import * as FcmAssertionSigner from "@t3tools/shared/FcmAssertionSigner";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import * as AuthSessions from "../persistence/AuthSessions.ts";
import * as NotificationStore from "./NotificationStore.ts";
import * as PairedNotifications from "./PairedNotifications.ts";
import * as NotificationEncryption from "./NotificationEncryption.ts";

const layerFcmConfiguration = Layer.effect(
  FcmClient.FcmConfiguration,
  Config.option(Config.Redacted("T3CODE_FCM_SERVICE_ACCOUNT")).pipe(
    Effect.map((account) => ({ fcmServiceAccount: Option.getOrNull(account) })),
  ),
);

const layerNotifications = PairedNotifications.layer.pipe(
  Layer.provide(
    NotificationEncryption.layer.pipe(
      Layer.provide(
        Layer.succeed(NotificationEncryption.NotificationWebCrypto, {
          subtle: globalThis.crypto.subtle,
        }),
      ),
    ),
  ),
  Layer.provide(NotificationStore.layer),
  Layer.provide(AuthSessions.layer),
  Layer.provide(
    FcmClient.layer.pipe(
      Layer.provide(
        FcmAssertionSigner.layer.pipe(
          Layer.provide(
            Layer.succeed(FcmAssertionSigner.WebCrypto, { subtle: globalThis.crypto.subtle }),
          ),
        ),
      ),
      Layer.provide(FetchHttpClient.layer),
    ),
  ),
  Layer.provide(layerFcmConfiguration),
);

export const layer = Layer.effectDiscard(
  PairedNotifications.PairedNotifications.pipe(Effect.flatMap((service) => service.start())),
).pipe(Layer.provideMerge(layerNotifications));

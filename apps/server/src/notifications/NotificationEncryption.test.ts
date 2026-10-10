import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NotificationEncryption from "./NotificationEncryption.ts";
import { encryptionLayer, makePhoneKey, openNotification } from "./notificationTestUtils.ts";

const registrationId = "5ea7c5d1-89c1-4e23-8b31-1ca2b4a9b8ef";
const messageId = "a0a6d16c-ac7b-4e3d-b5b6-0fbf7917c64a";

describe("paired payload encryption", () => {
  it.effect("hides rich content and binds it to the receiving registration and message", () =>
    Effect.gen(function* () {
      const encryption = yield* NotificationEncryption.NotificationEncryption;
      const phone = makePhoneKey();
      const data = {
        alert_title: "Private project 🌱",
        alert_body: "Done: Private thread",
        alert_path: "/threads/environment/thread",
        updated_at: "1234",
      };
      const envelope = yield* encryption.seal({
        publicKey: phone.publicKey,
        registrationId,
        messageId,
        data,
      });
      expect(openNotification(envelope, phone.privateKey)).toEqual(data);
      expect(JSON.stringify(envelope)).not.toContain("Private");
      expect(() => openNotification(envelope, makePhoneKey().privateKey)).toThrow();
      expect(() =>
        openNotification(
          { ...envelope, registration_id: "another-registration" },
          phone.privateKey,
        ),
      ).toThrow();
      expect(() =>
        openNotification({ ...envelope, message_id: "another-message" }, phone.privateKey),
      ).toThrow();
      const modified = Buffer.from(envelope.ciphertext!, "base64");
      modified[0] = modified[0]! ^ 1;
      expect(() =>
        openNotification(
          { ...envelope, ciphertext: modified.toString("base64") },
          phone.privateKey,
        ),
      ).toThrow();
    }).pipe(Effect.provide(encryptionLayer.pipe(Layer.provideMerge(NodeServices.layer)))),
  );

  it.effect(
    "fits encrypted Unicode summaries within FCM's budget without truncating destinations",
    () =>
      Effect.gen(function* () {
        const encryption = yield* NotificationEncryption.NotificationEncryption;
        const phone = makePhoneKey();
        const data = {
          alert_title: "5 agents finished",
          alert_body: "長いタイトル🌱".repeat(120),
          alert_path: "/threads/private-environment/private-thread",
          updated_at: "1234",
          ...Object.fromEntries(
            Array.from({ length: 5 }, (_, index) => [
              `activity_line_${index}`,
              `Working\t${"長いスレッド🌱".repeat(120)}\t${"事業🌱".repeat(120)}`,
            ]),
          ),
        };
        const envelope = yield* encryption.seal({
          publicKey: phone.publicKey,
          registrationId,
          messageId,
          data,
        });
        expect(new TextEncoder().encode(JSON.stringify(envelope)).length).toBeLessThanOrEqual(3800);
        const decoded = openNotification(envelope, phone.privateKey);
        expect(decoded.alert_path).toBe(data.alert_path);
        expect(
          Array.from({ length: 5 }, (_, index) => decoded[`activity_line_${index}`]?.split("\t")),
        ).toEqual(expect.arrayContaining([expect.arrayContaining(["Working"])]));
        expect(decoded.alert_body).not.toContain("�");
      }).pipe(Effect.provide(encryptionLayer.pipe(Layer.provideMerge(NodeServices.layer)))),
  );
});

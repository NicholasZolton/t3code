package expo.modules.t3agentnotifications

import android.util.Base64
import java.security.KeyFactory
import java.security.PrivateKey
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONObject

/** P-256 ECDH, HKDF-SHA256 and AES-256-GCM match the server's versioned envelope. */
internal object PairedNotificationCrypto {
  fun open(privateKey: PrivateKey, envelope: Map<String, String>): Map<String, String>? =
    runCatching {
      require(envelope["t3_kind"] == "paired_activity_v1")
      val registration = requireNotNull(envelope["registration_id"])
      val message = requireNotNull(envelope["message_id"])
      val binding = "paired_activity_v1\n$registration\n$message".toByteArray(Charsets.UTF_8)
      val nonce = decode(requireNotNull(envelope["nonce"]))
      require(nonce.size == 12)
      val ephemeral =
        KeyFactory.getInstance("EC")
          .generatePublic(X509EncodedKeySpec(decode(requireNotNull(envelope["ephemeral_key"]))))
      val agreement = KeyAgreement.getInstance("ECDH")
      agreement.init(privateKey)
      agreement.doPhase(ephemeral, true)
      val shared = agreement.generateSecret()
      val mac = Mac.getInstance("HmacSHA256")
      mac.init(SecretKeySpec(nonce, "HmacSHA256"))
      val extracted = mac.doFinal(shared)
      shared.fill(0)
      mac.init(SecretKeySpec(extracted, "HmacSHA256"))
      val key = mac.doFinal(binding + byteArrayOf(1))
      extracted.fill(0)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
      key.fill(0)
      cipher.updateAAD(binding)
      val ciphertext = decode(requireNotNull(envelope["ciphertext"]))
      require(ciphertext.size in 16..3000)
      val decoded = JSONObject(String(cipher.doFinal(ciphertext), Charsets.UTF_8))
      decoded.keys().asSequence().associateWith { name ->
        val value = decoded.get(name)
        require(value is String)
        value
      }
    }
      .getOrNull()

  private fun decode(value: String): ByteArray = Base64.decode(value, Base64.NO_WRAP)
}

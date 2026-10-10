package expo.modules.t3agentnotifications

import android.util.Base64
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.PrivateKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [24, 26, 33, 36], manifest = Config.NONE)
class PairedNotificationCryptoTest {
  private val fixture =
    JSONObject(requireNotNull(javaClass.getResource("/paired-notification-v1.json")).readText())
  private val envelope = strings(fixture.getJSONObject("envelope"))
  private val privateKey: PrivateKey =
    KeyFactory.getInstance("EC")
      .generatePrivate(
        PKCS8EncodedKeySpec(Base64.decode(fixture.getString("privateKey"), Base64.NO_WRAP))
      )

  @Test
  fun opensAnEnvelopeProducedByTheActualServerIncludingUnicodeAndRoutes() {
    assertEquals(
      strings(fixture.getJSONObject("plaintext")),
      PairedNotificationCrypto.open(privateKey, envelope),
    )
  }

  @Test
  fun rejectsModifiedCiphertextIdentityVersionAndInvalidEnvelopeFields() {
    val ciphertext = Base64.decode(envelope.getValue("ciphertext"), Base64.NO_WRAP)
    ciphertext[0] = (ciphertext[0].toInt() xor 1).toByte()
    val invalid =
      listOf(
        envelope + ("ciphertext" to Base64.encodeToString(ciphertext, Base64.NO_WRAP)),
        envelope + ("registration_id" to "another-registration"),
        envelope + ("message_id" to "another-message"),
        envelope + ("t3_kind" to "paired_activity_v2"),
        envelope + ("nonce" to "invalid"),
        envelope + ("ephemeral_key" to "invalid"),
        envelope - "ciphertext",
      )
    invalid.forEach { assertNull(PairedNotificationCrypto.open(privateKey, it)) }
  }

  @Test
  fun aDifferentPhoneCannotDecryptTheMessage() {
    val generator = KeyPairGenerator.getInstance("EC")
    generator.initialize(ECGenParameterSpec("secp256r1"))
    assertNull(PairedNotificationCrypto.open(generator.generateKeyPair().private, envelope))
  }

  private fun strings(json: JSONObject): Map<String, String> =
    json.keys().asSequence().associateWith { json.getString(it) }
}

package expo.modules.t3agentnotifications

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Only public keys cross the bridge. ECDH keys are wrapped by Android Keystore for cold-start
 * delivery.
 */
internal object PairedNotificationKeys {
  private const val STORE = "t3-paired-notification-keys"
  private const val PREFIX = "t3-paired-notification:"

  @Synchronized
  fun publicKey(context: Context, registrationId: String): String {
    require(registrationId.matches(Regex("[0-9a-fA-F-]{36}")))
    val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
    val stored = prefs.getString("$registrationId:public", null)
    if (stored != null && privateKey(context, registrationId) != null) return stored
    val generator = KeyPairGenerator.getInstance("EC")
    generator.initialize(ECGenParameterSpec("secp256r1"))
    val pair = generator.generateKeyPair()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, wrappingKey(registrationId))
    cipher.updateAAD(registrationId.toByteArray(Charsets.UTF_8))
    val privateBytes = pair.private.encoded
    val encrypted = cipher.doFinal(privateBytes)
    privateBytes.fill(0)
    val publicKey = encode(pair.public.encoded)
    check(
      prefs
        .edit()
        .putString("$registrationId:public", publicKey)
        .putString("$registrationId:private", encode(encrypted))
        .putString("$registrationId:nonce", encode(cipher.iv))
        .commit()
    )
    return publicKey
  }

  @Synchronized
  fun privateKey(context: Context, registrationId: String): PrivateKey? = runCatching {
    val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
    val encrypted = prefs.getString("$registrationId:private", null) ?: return null
    val nonce = requireNotNull(prefs.getString("$registrationId:nonce", null))
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(
      Cipher.DECRYPT_MODE,
      wrappingKey(registrationId),
      GCMParameterSpec(128, decode(nonce)),
    )
    cipher.updateAAD(registrationId.toByteArray(Charsets.UTF_8))
    val bytes = cipher.doFinal(decode(encrypted))
    try {
      KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(bytes))
    } finally {
      bytes.fill(0)
    }
  }
    .getOrNull()

  @Synchronized
  fun remove(context: Context, registrationId: String) {
    val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
    if (!prefs.contains("$registrationId:public")) return
    prefs
      .edit()
      .remove("$registrationId:public")
      .remove("$registrationId:private")
      .remove("$registrationId:nonce")
      .commit()
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    store.deleteEntry("$PREFIX$registrationId")
  }

  private fun wrappingKey(registrationId: String): SecretKey {
    val alias = "$PREFIX$registrationId"
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val existing = store.getKey(alias, null)
    if (existing is SecretKey) return existing
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        alias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setKeySize(256)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build()
    )
    return generator.generateKey()
  }

  private fun encode(value: ByteArray): String = Base64.encodeToString(value, Base64.NO_WRAP)

  private fun decode(value: String): ByteArray = Base64.decode(value, Base64.NO_WRAP)
}

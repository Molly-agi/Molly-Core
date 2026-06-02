package dev.molly.app.auth

import android.content.Context
import android.util.Base64
import java.nio.charset.StandardCharsets
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** HMAC-SHA256 signer used during bridge hello/auth handshake. */
class HmacSigner(context: Context) {
  private val secure = KeystoreManager(context)

  fun isProvisioned(): Boolean = !secure.getBridgeSecret().isNullOrBlank()

  fun setBridgeSecret(secret: String) = secure.setBridgeSecret(secret)

  fun sign(payload: String): String {
    val secret = secure.getBridgeSecret()
      ?: throw IllegalStateException("Bridge secret missing; provision device first")
    val mac = Mac.getInstance(ALGO)
    val key = SecretKeySpec(secret.toByteArray(StandardCharsets.UTF_8), ALGO)
    mac.init(key)
    val bytes = mac.doFinal(payload.toByteArray(StandardCharsets.UTF_8))
    return Base64.encodeToString(bytes, Base64.NO_WRAP)
  }

  companion object {
    private const val ALGO = "HmacSHA256"
  }
}

package com.wifizone.app

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.SystemClock
import android.util.Log
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

/**
 * VpnBlockerModule — pont React Native vers VpnBlockerService.
 *
 * Commandes de contrôle :
 * - prepare()          : consentement Android (VpnService.prepare + boîte
 *                        de dialogue officielle).
 * - startBlocking()    : lance le service, établit le tunnel de blocage.
 * - setAuthorized()    : autorise pour une durée MAXIMALE (composée côté
 *                        serveur : allowed_until - server_time), jamais
 *                        au-delà de la validité serveur.
 * - blockNow()         : coupe immédiatement.
 * - invalidateGeneration() : incrémente la génération de session → toute
 *                        réponse ALLOWED tardive est rejetée.
 * - getStatus()        : état honnête (consentement, service, tunnel,
 *                        échéance native, génération).
 * - stop()             : arrêt propre.
 *
 * Aucune autre application ne peut piloter ce module : il n'expose aucun
 * intent exporté et le service est protégé par BIND_VPN_SERVICE.
 */
class VpnBlockerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext),
  ActivityEventListener {

  companion object {
    const val NAME = "VpnBlocker"
    private const val VPN_PREPARE_REQUEST = 284759
  }

  private var pendingPrepare: Promise? = null

  init {
    VpnBlockerEvents.attach(reactContext)
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    VpnBlockerEvents.attach(reactApplicationContext)
  }

  override fun onCatalystInstanceDestroy() {
    VpnBlockerEvents.detach(reactApplicationContext)
    reactApplicationContext.removeActivityEventListener(this)
    super.onCatalystInstanceDestroy()
  }

  // ————————————————————————————————————————————————————————
  // Consentement (boîte de dialogue Android officielle)
  // ————————————————————————————————————————————————————————

  @ReactMethod
  fun isConsentGranted(promise: Promise) {
    val intent = VpnService.prepare(reactApplicationContext)
    promise.resolve(
      Arguments.createMap().apply {
        putBoolean("granted", intent == null)
      }
    )
  }

  @ReactMethod
  fun prepare(promise: Promise) {
    val ctx = reactApplicationContext
    val prepareIntent = VpnService.prepare(ctx)
    if (prepareIntent == null) {
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("granted", true)
          putBoolean("cancelled", false)
        }
      )
      return
    }

    val activity = ctx.currentActivity
    if (activity == null) {
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("granted", false)
          putBoolean("cancelled", false)
          putString("error", "no_activity")
        }
      )
      return
    }

    if (pendingPrepare != null) {
      promise.reject("PENDING", "Un dialogue de consentement est déjà en cours.")
      return
    }

    pendingPrepare = promise
    try {
      activity.startActivityForResult(prepareIntent, VPN_PREPARE_REQUEST)
    } catch (e: Exception) {
      pendingPrepare = null
      promise.reject("PREPARE_FAILED", "Impossible d'ouvrir le consentement VPN", e)
    }
  }

  override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != VPN_PREPARE_REQUEST) return
    val promise = pendingPrepare ?: return
    pendingPrepare = null
    val granted = resultCode == Activity.RESULT_OK
    promise.resolve(
      Arguments.createMap().apply {
        putBoolean("granted", granted)
        putBoolean("cancelled", !granted)
      }
    )
  }

  override fun onNewIntent(intent: Intent?) {
    // requis par l'interface ActivityEventListener
  }

  // ————————————————————————————————————————————————————————
  // Contrôle du tunnel
  // ————————————————————————————————————————————————————————

  @ReactMethod
  fun startBlocking(promise: Promise) {
    val ctx = reactApplicationContext
    if (VpnService.prepare(ctx) != null) {
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("ok", false)
          putString("state", VpnBlockerState.PERMISSION_REQUIRED)
        }
      )
      return
    }

    val intent = Intent(ctx, VpnBlockerService::class.java)
      .setAction(VpnBlockerService.ACTION_START_BLOCKING)

    try {
      val started = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(intent)
      } else {
        ctx.startService(intent)
      }
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("ok", true)
          putString("state", VpnBlockerState.BLOCKING)
        }
      )
    } catch (e: Exception) {
      promise.reject("START_FAILED", "Impossible de démarrer le contrôle", e)
    }
  }

  /**
   * Autorise le trafic pour une durée bornée.
   *
   * @param generation génération de session (incrémentée à chaque
   *                   pause / logout / redémarrage de session).
   * @param ttlMs      durée restante en millisecondes, calculée côté JS =
   *                   allowed_until (serveur) - server_time (serveur).
   *                   Plafonnée à MAX_AUTH_TTL_MS (jamais au-delà de la
   *                   validité serveur).
   */
  @ReactMethod
  fun setAuthorized(generation: Double, ttlMs: Double, promise: Promise) {
    val gen = generation.toLong()
    val ttl = ttlMs.toLong().coerceIn(0L, VpnBlockerService.MAX_AUTH_TTL_MS)

    // Rejet de toute réponse d'une génération obsolète.
    if (VpnBlockerState.generation != 0L && gen < VpnBlockerState.generation) {
      Log.i(VpnBlockerService.TAG, "TRACE setAuthorized REJECTED reason=stale_generation gen=$gen current=${VpnBlockerState.generation}")
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("ok", false)
          putString("reason", "stale_generation")
          putDouble("generation", gen.toDouble())
          putDouble("currentGeneration", VpnBlockerState.generation.toDouble())
        }
      )
      return
    }

    VpnBlockerState.generation = gen
    Log.i(VpnBlockerService.TAG, "TRACE setAuthorized gen=$gen ttlMs=$ttl")
    if (ttl <= 0L) {
      VpnBlockerState.authExpiresAtMs = 0L
      emitBlockNowIfServiceRunning()
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("ok", true)
          putDouble("generation", gen.toDouble())
        }
      )
      return
    }

    VpnBlockerState.authExpiresAtMs = SystemClock.elapsedRealtime() + ttl
    ensureServiceRunning { ok ->
      if (ok) {
        promise.resolve(
          Arguments.createMap().apply {
            putBoolean("ok", true)
            putDouble("authExpiresAt", VpnBlockerState.authExpiresAtMs.toDouble())
            putDouble("generation", VpnBlockerState.generation.toDouble())
          }
        )
      } else {
        promise.resolve(
          Arguments.createMap().apply {
            putBoolean("ok", false)
            putString("reason", "service_required")
          }
        )
      }
    }
  }

  private fun emitBlockNowIfServiceRunning() {
    val intent = Intent(reactApplicationContext, VpnBlockerService::class.java)
      .setAction(VpnBlockerService.ACTION_BLOCK_NOW)
    reactApplicationContext.startService(intent)
  }

  private fun ensureServiceRunning(callback: (Boolean) -> Unit) {
    val ctx = reactApplicationContext
    if (VpnBlockerState.serviceRunning) {
      ctx.startService(
        Intent(ctx, VpnBlockerService::class.java)
          .setAction(VpnBlockerService.ACTION_UPDATE_AUTH)
          .putExtra(VpnBlockerEvents.EXTRA_GENERATION, VpnBlockerState.generation)
          .putExtra(VpnBlockerEvents.EXTRA_AUTH_EXPIRES_AT, VpnBlockerState.authExpiresAtMs)
      )
      callback(true)
      return
    }

    val intent = Intent(ctx, VpnBlockerService::class.java)
      .setAction(VpnBlockerService.ACTION_START_BLOCKING)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(intent)
      } else {
        ctx.startService(intent)
      }
      ctx.startService(
        Intent(ctx, VpnBlockerService::class.java)
          .setAction(VpnBlockerService.ACTION_UPDATE_AUTH)
          .putExtra(VpnBlockerEvents.EXTRA_GENERATION, VpnBlockerState.generation)
          .putExtra(VpnBlockerEvents.EXTRA_AUTH_EXPIRES_AT, VpnBlockerState.authExpiresAtMs)
      )
      callback(true)
    } catch (e: Exception) {
      callback(false)
    }
  }

  /**
   * Trace de diagnostic du flux JS via logcat natif (fiable en release).
   * N'a aucun effet sur le contrôle réseau.
   */
  @ReactMethod
  fun logTrace(message: String) {
    Log.i(VpnBlockerService.TAG, "TRACEJS ${System.currentTimeMillis()} $message")
  }

  /** Coupe immédiatement le trafic (pause, arrière-plan, expiration). */
  @ReactMethod
  fun blockNow(promise: Promise) {
    Log.i(VpnBlockerService.TAG, "TRACE blockNow gen=${VpnBlockerState.generation}")
    VpnBlockerState.authExpiresAtMs = 0L
    emitBlockNowIfServiceRunning()
    promise.resolve(
      Arguments.createMap().apply {
        putBoolean("ok", true)
        putString("state", VpnBlockerState.BLOCKING)
      }
    )
  }

  /** Invalide la génération courante : toute autorisation tardive est rejetée. */
  @ReactMethod
  fun invalidateGeneration(promise: Promise) {
    val next = VpnBlockerState.generation + 1L
    VpnBlockerState.generation = next
    VpnBlockerState.authExpiresAtMs = 0L
    emitBlockNowIfServiceRunning()
    promise.resolve(
      Arguments.createMap().apply {
        putBoolean("ok", true)
        putDouble("generation", next.toDouble())
        putString("state", VpnBlockerState.BLOCKING)
      }
    )
  }

  /** État honnête pour le diagnostic. */
  @ReactMethod
  fun getStatus(promise: Promise) {
    val consentIntent = VpnService.prepare(reactApplicationContext)
    val now = SystemClock.elapsedRealtime()
    val authTtlMs = (VpnBlockerState.authExpiresAtMs - now).coerceAtLeast(0L)

    val map: WritableMap = Arguments.createMap().apply {
      putBoolean("consentGranted", consentIntent == null)
      putString("state", VpnBlockerState.state)
      putBoolean("tunnelUp", VpnBlockerState.tunnelUp)
      putBoolean("serviceRunning", VpnBlockerState.serviceRunning)
      putDouble("generation", VpnBlockerState.generation.toDouble())
      putDouble("authTtlMs", authTtlMs.toDouble())
    }
    promise.resolve(map)
  }

  /** Arrêt propre de la démonstration. */
  @ReactMethod
  fun stop(promise: Promise) {
    VpnBlockerState.authExpiresAtMs = 0L
    val intent = Intent(reactApplicationContext, VpnBlockerService::class.java)
      .setAction(VpnBlockerService.ACTION_STOP)
    reactApplicationContext.startService(intent)
    promise.resolve(
      Arguments.createMap().apply {
        putBoolean("ok", true)
      }
    )
  }
}
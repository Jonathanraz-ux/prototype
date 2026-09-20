package com.wifizone.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.FileInputStream
import java.io.InputStream
import kotlin.concurrent.thread

/**
 * VpnBlockerService — VpnService local de la démonstration Android.
 *
 * Rôle : créer un tunnel TUN qui capture tout le trafic IPv4/IPv6 de
 * l'appareil (sauf WiFi Zone, exclue via addDisallowedApplication) et le
 * JETTE. Le tunnel est présent uniquement pendant BLOCKED. Pendant ALLOWED,
 * le tunnel est retiré et le trafic repasse par la vraie connexion Wi-Fi.
 *
 * Aucune interception TLS, aucun contenu de paquet conservé, aucun proxy,
 * aucun serveur distant. La boucle lit et abandonne les paquets.
 *
 * Décisions contractuelles Android :
 * - Service protégé par BIND_VPN_SERVICE + intent-filter android.net.VpnService,
 *   conformément à la documentation VpnService.
 * - type de foreground service : SPECIAL_USE (justifié par la propriété
 *   android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE). Ni dataSync, ni
 *   mediaPlayback : ce serait une exemption mensongère.
 * - On ne restaure JAMAIS ALLOWED depuis un booléen persistant : l'état
 *   autorisé n'existe qu'en mémoire, s'éteint à la mort du service, et
 *   exige une nouvelle commande générationnelle côté JS.
 */
class VpnBlockerService : VpnService() {

  companion object {
    const val TAG = "VpnBlocker"

    const val ACTION_START_BLOCKING = "com.wifizone.app.VPN_START_BLOCKING"
    const val ACTION_UPDATE_AUTH = "com.wifizone.app.VPN_UPDATE_AUTH"
    const val ACTION_BLOCK_NOW = "com.wifizone.app.VPN_BLOCK_NOW"
    const val ACTION_STOP = "com.wifizone.app.VPN_STOP"

    const val CHANNEL_ID = "wifizone_demo_channel"
    private const val NOTIFICATION_ID = 1826

    /** Plafond d'anti-fuite : jamais plus de 30 s d'autorisation native. */
    const val MAX_AUTH_TTL_MS = 30_000L
  }

  @Volatile private var running = false
  @Volatile private var packetStream: InputStream? = null
  @Volatile private var mInterface: ParcelFileDescriptor? = null
  @Volatile private var intentionalStop = false

  private val watchdog = Handler(Looper.getMainLooper())

  private var emitter: ReactApplicationContext? = VpnBlockerEvents.emitter

  // ————————————————————————————————————————————————————————————
  // Cycle de vie
  // ————————————————————————————————————————————————————————————

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START_BLOCKING -> applyDesiredState()
      ACTION_UPDATE_AUTH -> {
        val generation = intent.getLongExtra(VpnBlockerEvents.EXTRA_GENERATION, 0L)
        val expiresAt = intent.getLongExtra(VpnBlockerEvents.EXTRA_AUTH_EXPIRES_AT, 0L)
        VpnBlockerState.generation = generation
        // Ne JAMAIS étendre au-delà : on prend le MINIMUM entre la nouvelle
        // échéance et le plafond fixé par la validité serveur.
        val now = SystemClock.elapsedRealtime()
        val ttl = (expiresAt - now).coerceIn(0L, MAX_AUTH_TTL_MS)
        VpnBlockerState.authExpiresAtMs = now + ttl
        applyDesiredState()
      }
      ACTION_BLOCK_NOW -> {
        VpnBlockerState.authExpiresAtMs = 0L
        applyDesiredState()
      }
      ACTION_STOP -> {
        intentionalStop = true
        stopSelf()
      }
    }
    // START_STICKY : le système peut recréer le service ; l'état est alors
    // recalculé (génération vide → BLOCKED, jamais ALLOWED restauré).
    return START_STICKY
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    startForegroundCompat()
    // Watchdog natif : si l'autorisation expire (horloge monotone) ou si
    // l'état est incohérent, on re-blocket. Tourne 2x/s, coût minime.
    periodicWatchdog()
  }

  override fun onDestroy() {
    running = false
    watchdog.removeCallbacksAndMessages(null)
    closeTunnel()
    intentionalStop = false
    VpnBlockerState.serviceRunning = false
    VpnBlockerState.generation = 0L
    VpnBlockerState.authExpiresAtMs = 0L
    emitState(if (VpnBlockerState.state == VpnBlockerState.ERROR) VpnBlockerState.ERROR else VpnBlockerState.DISABLED)
    super.onDestroy()
  }

  override fun onRevoke() {
    closeTunnel()
    VpnBlockerState.serviceRunning = false
    emitState(VpnBlockerState.DISABLED)
    super.onRevoke()
  }

  // ————————————————————————————————————————————————————————————
  // États désirés
  // ————————————————————————————————————————————————————————————

  private fun applyDesiredState() {
    VpnBlockerState.serviceRunning = true

    // Vérifie le consentement avant tout establish() : pas d'état
    // « BLOCKED » invoqué sans consentement réel.
    if (VpnService.prepare(this) != null) {
      emitState(VpnBlockerState.PERMISSION_REQUIRED)
      return
    }

    val now = SystemClock.elapsedRealtime()
    val authValid = VpnBlockerState.generation > 0L && VpnBlockerState.authExpiresAtMs > now

    synchronized(this) {
      if (authValid && isTunnelUp()) {
        // ALLOWED : retirer proprement le tunnel. Le service de
        // surveillance (notification) reste au premier plan.
        closeTunnel()
        emitState(VpnBlockerState.ALLOWED)
      } else if (!authValid && !isTunnelUp()) {
        // Re-blocage après expiration ou initialisation :
        // fermer proprement tout résidu de tunnel ALLOWED, puis
        // établir le tunnel de capture avec la boucle de paquets.
        closeTunnel()
        establishBlockingTunnel()
      } else if (!authValid && isTunnelUp()) {
        // Déjà bloqué, auth expirée : s'assurer que le tunnel
        // et la boucle de paquets sont bien actifs.
        emitState(VpnBlockerState.BLOCKED)
      }
    }
  }

  private fun isTunnelUp(): Boolean = mInterface != null

  private fun establishBlockingTunnel() {
    emitState(VpnBlockerState.BLOCKING)

    try {
      val builder = Builder()
        .setSession("WiFi Zone Démo")
        .addAddress("10.246.247.1", 32)
        .addAddress("fd00:0:246::1", 126)
        .addRoute("0.0.0.0", 0)
        .addRoute("::", 0)

      // EXCLUSION ESSENTIELLE : uniquement WiFi Zone (addDisallowedApplication).
      // Ni Chrome ni liste arbitraire. Ne pas combiner avec
      // addAllowedApplication. allowBypass reste à false.
      try {
        builder.addDisallowedApplication(packageName)
      } catch (e: Exception) {
        Log.w(TAG, "addDisallowedApplication refusé", e)
        emitState(VpnBlockerState.ERROR)
        return
      }

      val pfd = builder.establish()
      if (pfd == null) {
        Log.e(TAG, "establish() a renvoyé null : consentement absent ou refus")
        emitState(VpnBlockerState.PERMISSION_REQUIRED)
        return
      }

      mInterface = pfd
      running = true
      packetStream = FileInputStream(pfd.fileDescriptor)

      startPacketLoop()
      emitState(VpnBlockerState.BLOCKED)
      Log.i(TAG, "Tunnel de blocage établi (BLOCKED)")
    } catch (e: Exception) {
      Log.e(TAG, "Échec establish()", e)
      closeTunnel()
      emitState(VpnBlockerState.ERROR)
    }
  }

  private fun startPacketLoop() {
    thread(name = "vpn-packet-drain", isDaemon = true) {
      val stream = packetStream
      val buffer = ByteArray(4096)
      try {
        while (running) {
          // Lecture bloquante : pas de busy loop. Les paquets capturés
          // sont abandonnés volontairement (aucun contenu conservé).
          val n = stream?.read(buffer) ?: -1
          if (n < 0) {
            if (running) Thread.sleep(20)
          }
        }
      } catch (e: Exception) {
        if (running) Log.d(TAG, "boucle de lecture arrêtée: ${e.message}")
      } finally {
        if (running) {
          // Si la boucle se termine de façon inattendue alors que le
          // service tourne encore → ERROR (contrôle non fiable).
          closeTunnel()
          emitState(VpnBlockerState.ERROR)
        }
      }
    }
  }

  private fun closeTunnel() {
    synchronized(this) {
      running = false
      try {
        packetStream?.close()
      } catch (e: Exception) {
        // ignore
      }
      packetStream = null
      try {
        mInterface?.close()
      } catch (e: Exception) {
        // ignore
      }
      mInterface = null
    }
  }

  // ————————————————————————————————————————————————————————————
  // Watchdog natif : re-block si l'autorisation expire.
  // ————————————————————————————————————————————————————————————

  private fun periodicWatchdog() {
    watchdog.postDelayed(object : Runnable {
      override fun run() {
        // Watchdog natif : si le service tourne mais l'autorisation a expiré
        // (ou n'existe pas), on re-bloque. Ne dépend JAMAIS uniquement du
        // flag `running` ni de l'état du tunnel : une autorisation expirée
        // doit provoquer le blocage même si le service est vivant et le
        // tunnel actuellement retiré (état ALLOWED).
        if (VpnBlockerState.serviceRunning) {
          val authActive = VpnBlockerState.generation > 0L &&
            VpnBlockerState.authExpiresAtMs > SystemClock.elapsedRealtime()
          if (!authActive) {
            applyDesiredState()
          }
        }
        watchdog.postDelayed(this, 500)
      }
    }, 500)
  }

  // ————————————————————————————————————————————————————————————
  // Notification / foreground
  // ————————————————————————————————————————————————————————————

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Contrôle Internet local",
        NotificationManager.IMPORTANCE_LOW
      ).apply { setShowBadge(false) }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  private fun startForegroundCompat() {
    val notification = buildNotification("Contrôle Internet actif")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(text: String): Notification {
    val title = if (mInterface != null) "Internet suspendu (démo)" else "Contrôle Internet (démo)"

    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification: Notification
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      notification = Notification.Builder(this, CHANNEL_ID)
        .setContentTitle(title)
        .setContentText(text)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setOngoing(true)
        .setContentIntent(pendingIntent)
        .build()
    } else {
      @Suppress("DEPRECATION")
      notification = Notification.Builder(this)
        .setContentTitle(title)
        .setContentText(text)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setOngoing(true)
        .setContentIntent(pendingIntent)
        .build()
    }
    return notification
  }

  // ————————————————————————————————————————————————————————————
  // Émission d'événements vers React Native
  // ————————————————————————————————————————————————————————————

  private fun emitState(state: String) {
    VpnBlockerState.state = state
    VpnBlockerState.tunnelUp = isTunnelUp()
    val gen = VpnBlockerState.generation
    val authMs = VpnBlockerState.authExpiresAtMs
    // Trace native fiable (logcat) : horodatage réel + raison d'état.
    val ttlLeft = (authMs - SystemClock.elapsedRealtime()).coerceAtLeast(0L)
    Log.i(TAG, "TRACE state=$state gen=$gen ttlLeftMs=$ttlLeft tunnelUp=${isTunnelUp()} ${System.currentTimeMillis()}")
    VpnBlockerEvents.emit(
      Arguments.createMap().apply {
        putString("state", state)
        putBoolean("tunnelUp", isTunnelUp())
        putDouble("authExpiresAt", authMs.toDouble())
        putDouble("ttlLeftMs", ttlLeft.toDouble())
        putDouble("generation", gen.toDouble())
      }
    )
  }
}

/**
 * État partagé entre le service VPN et le module RN, et pont d'événements.
 * Tout vit en mémoire : rien n'est persisté → jamais de restauration
 * ALLOWED après redémarrage/force-stop.
 */
object VpnBlockerState {
  const val DISABLED = "DISABLED"
  const val PERMISSION_REQUIRED = "PERMISSION_REQUIRED"
  const val BLOCKING = "BLOCKING"
  const val BLOCKED = "BLOCKED"
  const val ALLOWING = "ALLOWING"
  const val ALLOWED = "ALLOWED"
  const val ERROR = "ERROR"

  @Volatile var state: String = DISABLED
  @Volatile var tunnelUp: Boolean = false
  @Volatile var serviceRunning: Boolean = false
  @Volatile var generation: Long = 0L
  @Volatile var authExpiresAtMs: Long = 0L
}

object VpnBlockerEvents {
  const val EVENT = "VpnBlockerStateChange"
  const val EXTRA_GENERATION = "generation"
  const val EXTRA_AUTH_EXPIRES_AT = "authExpiresAt"

  @Volatile var emitter: ReactApplicationContext? = null

  fun attach(ctx: ReactApplicationContext) {
    emitter = ctx
  }

  fun detach(ctx: ReactApplicationContext) {
    if (emitter === ctx) emitter = null
  }

  fun emit(map: WritableMap) {
    val ctx = emitter
    if (ctx != null && ctx.hasActiveReactInstance()) {
      try {
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT, map)
      } catch (e: Exception) {
        Log.w(VpnBlockerService.TAG, "Émission d'événement impossible", e)
      }
    }
  }
}
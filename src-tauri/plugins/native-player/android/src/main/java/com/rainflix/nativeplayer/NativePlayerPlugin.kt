package com.rainflix.nativeplayer

import android.app.Activity
import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.lang.ref.WeakReference

internal object PlayerBridge {
    var session: JSONObject? = null
    var activity: PlayerActivity? = null
    var emit: ((JSObject) -> Unit)? = null
    var webView: WeakReference<WebView>? = null
    var restoreOrientation: (() -> Unit)? = null
    fun event(kind: String, values: JSONObject = JSONObject()) {
        val id = session?.optString("sessionId") ?: return
        values.put("sessionId", id).put("kind", kind)
        emit?.invoke(JSObject(values.toString()))
    }
}

@TauriPlugin
class NativePlayerPlugin(private val host: Activity) : Plugin(host) {
    private var pendingLink: String? = null
    override fun load(webView: WebView) { PlayerBridge.webView = WeakReference(webView); receiveLink(host.intent) }
    override fun onNewIntent(intent: Intent) { receiveLink(intent) }
    private fun receiveLink(intent: Intent) {
        val value = intent.dataString ?: return
        val uri = Uri.parse(value)
        if (value.length > 16384 || uri.scheme !in listOf("stremio", "rainflix") ||
            uri.host.isNullOrBlank() || uri.userInfo != null || uri.fragment != null ||
            uri.path?.endsWith("/manifest.json") != true) return
        pendingLink = value
        trigger("rainflix:addon-install", JSObject().put("url", value))
    }
    @Command fun takeInstallLink(invoke: Invoke) {
        invoke.resolve(JSObject().put("url", pendingLink))
        pendingLink = null
    }
    @Command fun setOrientation(invoke: Invoke) {
        val landscape = invoke.getArgs().optBoolean("landscape")
        host.runOnUiThread {
            host.requestedOrientation = if (landscape) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                else ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
            androidx.core.view.WindowCompat.setDecorFitsSystemWindows(host.window, false)
            val content = host.findViewById<android.view.View>(android.R.id.content)
            androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
                val bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars() or androidx.core.view.WindowInsetsCompat.Type.displayCutout())
                if (landscape) view.setPadding(0, 0, 0, 0)
                else view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                androidx.core.view.WindowInsetsCompat.CONSUMED
            }
            if (landscape) content.setPadding(0, 0, 0, 0)
            androidx.core.view.ViewCompat.requestApplyInsets(content)
            if (android.os.Build.VERSION.SDK_INT >= 28) {
                host.window.attributes = host.window.attributes.apply {
                    layoutInDisplayCutoutMode = if (landscape) android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                        else android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT
                }
            }
            androidx.core.view.WindowInsetsControllerCompat(host.window, host.window.decorView).apply {
                if (landscape) hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
                else show(androidx.core.view.WindowInsetsCompat.Type.systemBars())
                systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
            invoke.resolve()
        }
    }
    @Command fun start(invoke: Invoke) {
        val args = invoke.getArgs()
        host.runOnUiThread {
            PlayerBridge.activity?.close(false)
            PlayerBridge.session = args
            PlayerBridge.emit = { trigger("rainflix:native-torrent", it) }
            val orientation = host.requestedOrientation
            PlayerBridge.restoreOrientation = { host.requestedOrientation = orientation }
            // A translucent player must inherit orientation (Android 8 compatibility).
            host.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            host.startActivity(Intent(host, PlayerActivity::class.java))
            invoke.resolve()
        }
    }
    @Command fun setSource(invoke: Invoke) = update(invoke) { it.setSource(invoke.getArgs()) }
    @Command fun stop(invoke: Invoke) = update(invoke) { it.close(false) }
    @Command fun updateEpisodes(invoke: Invoke) = update(invoke) { it.updateEpisodes(invoke.getArgs()) }
    @Command fun updateStreams(invoke: Invoke) = update(invoke) { it.updateStreams(invoke.getArgs()) }
    @Command fun updateSubtitles(invoke: Invoke) = update(invoke) { it.updateSubtitles(invoke.getArgs()) }
    @Command fun loadSubtitle(invoke: Invoke) = update(invoke) { it.loadSubtitle(invoke.getArgs()) }
    @Command fun updatePreload(invoke: Invoke) = update(invoke) { it.updatePreload(invoke.getArgs()) }
    @Command fun updateNavigation(invoke: Invoke) = update(invoke) { it.updateNavigation(invoke.getArgs()) }
    private fun update(invoke: Invoke, action: (PlayerActivity) -> Unit) {
        val args = invoke.getArgs()
        host.runOnUiThread {
            if (PlayerBridge.session?.optString("sessionId") == args.optString("sessionId")) {
                val player = PlayerBridge.activity
                if (player != null) action(player)
                else if (args.has("url")) {
                    PlayerBridge.session?.put("url", args.optString("url"))
                    if (args.has("startAt")) PlayerBridge.session?.put("startAt", args.optDouble("startAt"))
                }
            }
            invoke.resolve()
        }
    }
}

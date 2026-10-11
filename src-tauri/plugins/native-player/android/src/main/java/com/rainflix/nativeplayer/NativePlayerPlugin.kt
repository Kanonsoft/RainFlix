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

internal object PlayerBridge {
    var session: JSONObject? = null
    var activity: PlayerActivity? = null
    var emit: ((JSObject) -> Unit)? = null
    fun event(kind: String, values: JSONObject = JSONObject()) {
        val id = session?.optString("sessionId") ?: return
        values.put("sessionId", id).put("kind", kind)
        emit?.invoke(JSObject(values.toString()))
    }
}

@TauriPlugin
class NativePlayerPlugin(private val host: Activity) : Plugin(host) {
    private var pendingLink: String? = null
    override fun load(webView: WebView) { receiveLink(host.intent) }
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
            invoke.resolve()
        }
    }
    @Command fun start(invoke: Invoke) {
        val args = invoke.getArgs()
        host.runOnUiThread {
            PlayerBridge.activity?.close(false)
            PlayerBridge.session = args
            PlayerBridge.emit = { trigger("rainflix:native-torrent", it) }
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

package com.rainflix.nativeplayer

import android.app.Activity
import android.app.AlertDialog
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.MotionEvent
import android.os.SystemClock
import android.view.WindowManager
import android.widget.*
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.*
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.ui.PlayerView
import androidx.media3.ui.SubtitleView
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.extractor.metadata.id3.ChapterFrame
import androidx.media3.extractor.metadata.id3.TextInformationFrame
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors

@UnstableApi
class PlayerActivity : Activity() {
    private lateinit var player: ExoPlayer
    private lateinit var surface: PlayerView
    private lateinit var root: FrameLayout
    private lateinit var loading: FrameLayout
    private lateinit var logo: ImageView
    private lateinit var progress: ProgressBar
    private lateinit var title: TextView
    private lateinit var controls: LinearLayout
    private var backdrop: ImageView? = null
    private var drawer: LinearLayout? = null
    private var drawerShade: View? = null
    private var drawerScroll: ScrollView? = null
    private var ui = JSONObject()
    private var episodes = JSONArray()
    private var subtitles = JSONArray()
    private var streams = JSONArray()
    private var browsedSeason = 1
    private var chosenVideo = ""
    private var requestId = ""
    private var ready = false
    private var closed = false
    private var complete = false
    private var sourceUrl: String? = null
    private var externalSub: MediaItem.SubtitleConfiguration? = null
    private var savedTracks = JSONObject()
    private var tracksRestored = false
    private var logoPulse: ObjectAnimator? = null
    private var episodeRevision = 0L
    private var lastTapAt = 0L
    private var lastTapSide = 0
    private var seekTotal = 0
    private lateinit var seekFeedback: TextView
    private lateinit var skipButton: TextView
    private lateinit var nextCard: LinearLayout
    private lateinit var nextImage: ImageView
    private lateinit var nextLabel: TextView
    private var previewVideo = ""
    private var preloadVideo = ""
    private var preloadStatus = ""
    private var introSkipped = false
    private val chapters = mutableListOf<Triple<String, Long, Long>>()
    private val hideSeekFeedback = Runnable { seekFeedback.visibility = View.GONE; seekTotal = 0 }
    private val handler = Handler(Looper.getMainLooper())
    private val images = Executors.newFixedThreadPool(2)
    private val imageCache = android.util.LruCache<String, android.graphics.Bitmap>(32)
    private val pulse = object : Runnable {
        override fun run() {
            if (closed) return
            if (ready && player.duration > 0 && player.duration != C.TIME_UNSET) {
                PlayerBridge.event("progress", JSONObject().put("position", player.currentPosition / 1000.0)
                    .put("duration", player.duration / 1000.0))
            }
            val remaining = player.duration - player.currentPosition
            val target = minOf(5000L, maxOf(1L, remaining))
            val fraction = ((player.bufferedPosition - player.currentPosition).toFloat() / target).coerceIn(0f, 1f)
            progress.progress = (fraction * 100).toInt()
            progress.isIndeterminate = player.playbackState == Player.STATE_BUFFERING && (player.duration == C.TIME_UNSET || player.bufferedPosition <= player.currentPosition)
            logo.imageAlpha = (90 + fraction * 165).toInt()
            updatePlaybackActions()
            handler.postDelayed(this, 1000)
        }
    }
    private fun dp(value: Int) = (resources.displayMetrics.density * value).toInt()
    private fun background(color: Int, radius: Int = 8) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radius).toFloat()
    }
    private fun text(value: String, size: Float = 16f) = TextView(this).apply {
        this.text = value; textSize = size; setTextColor(Color.WHITE)
        setPadding(dp(12), dp(10), dp(12), dp(10))
    }
    private fun button(value: String, action: () -> Unit) = text(value).apply {
        gravity = Gravity.CENTER; minHeight = dp(48); isFocusable = true
        background = background(0x22222222.toInt())
        setOnClickListener { action() }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val session = PlayerBridge.session
        if (session == null) { finish(); return }
        PlayerBridge.activity = this
        ui = session.optJSONObject("ui") ?: JSONObject()
        savedTracks = ui.optJSONObject("tracks") ?: JSONObject()
        episodes = ui.optJSONArray("episodes") ?: JSONArray()
        browsedSeason = ui.optInt("season", 1)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        player = ExoPlayer.Builder(this, DefaultRenderersFactory(this).setEnableDecoderFallback(true))
            .setLoadControl(DefaultLoadControl.Builder().setBufferDurationsMs(15000, 50000, 2500, 5000).build())
            .setSeekBackIncrementMs(10000).setSeekForwardIncrementMs(10000).build()
        player.setAudioAttributes(AudioAttributes.DEFAULT, true)
        player.setHandleAudioBecomingNoisy(true)
        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        surface = layoutInflater.inflate(com.rainflix.nativeplayer.R.layout.rainflix_player, root, false) as PlayerView
        surface.apply {
            player = this@PlayerActivity.player
            controllerShowTimeoutMs = 6000
            setShowNextButton(false); setShowPreviousButton(false)
            setShowSubtitleButton(false); setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
        }
        root.addView(surface, FrameLayout.LayoutParams(-1, -1))
        applySubtitleStyle()
        loading = FrameLayout(this).apply { setBackgroundColor(0x99000000.toInt()) }
        backdrop = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP; alpha = .4f }
        loading.addView(backdrop, FrameLayout.LayoutParams(-1, -1))
        logo = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        logo.setImageResource(com.rainflix.nativeplayer.R.drawable.rainflix_r)
        loading.addView(logo, FrameLayout.LayoutParams(dp(220), dp(100), Gravity.CENTER))
        val brand = ui.optString("logoUrl").takeIf { it.isNotBlank() }
        val fallback = ui.optString("fallbackLogoUrl").takeIf { it.isNotBlank() }
        if (brand != null) loadImage(brand, logo, fallback)
        else if (fallback != null && !fallback.contains("tauri.localhost")) loadImage(fallback, logo)
        ui.optString("backdropUrl").takeIf { it.isNotBlank() }?.let { loadImage(it, backdrop!!) }
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100; progressTintList = android.content.res.ColorStateList.valueOf(0xff38bdf8.toInt())
            indeterminateTintList = android.content.res.ColorStateList.valueOf(0xff38bdf8.toInt())
            isIndeterminate = true
        }
        loading.addView(progress, FrameLayout.LayoutParams(dp(180), dp(4), Gravity.CENTER).apply { topMargin = dp(120) })
        (surface.overlayFrameLayout ?: root).addView(loading, FrameLayout.LayoutParams(-1, -1))
        val touch = View(this)
        var downX = 0f
        var downY = 0f
        var downAt = 0L
        touch.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> { downX = event.x; downY = event.y; downAt = SystemClock.uptimeMillis() }
                MotionEvent.ACTION_UP -> {
                    val now = SystemClock.uptimeMillis()
                    if (now - downAt < 300 && kotlin.math.abs(event.x - downX) < dp(24) && kotlin.math.abs(event.y - downY) < dp(24)) {
                        val side = if (event.x < touch.width * .35f) -1 else if (event.x > touch.width * .65f) 1 else 0
                        if (side != 0 && side == lastTapSide && now - lastTapAt < 700) seekBy(side * 5000L)
                        else { seekTotal = 0; surface.showController() }
                        lastTapAt = now; lastTapSide = side
                        touch.performClick()
                    }
                }
            }
            true
        }
        (surface.overlayFrameLayout ?: root).addView(touch, FrameLayout.LayoutParams(-1, -1))
        seekFeedback = text("", 24f).apply {
            gravity = Gravity.CENTER; visibility = View.GONE
            background = background(0x55333333, 8)
        }
        root.addView(seekFeedback, FrameLayout.LayoutParams(dp(150), dp(80), Gravity.CENTER))
        logoPulse = ObjectAnimator.ofFloat(logo, View.ALPHA, .65f, 1f).apply {
            duration = 1800; repeatCount = ValueAnimator.INFINITE; repeatMode = ValueAnimator.REVERSE; start()
        }
        controls = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(12), dp(10), dp(12), 0)
            background = android.graphics.drawable.GradientDrawable(
                android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(0xbb000000.toInt(), 0x00000000))
        }
        val heading = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        heading.addView(ImageButton(this).apply {
            setImageResource(androidx.media3.ui.R.drawable.exo_ic_chevron_left)
            imageTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
            setBackgroundColor(Color.TRANSPARENT)
            contentDescription = "Back to title"
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setOnClickListener { close(true) }
        }, LinearLayout.LayoutParams(dp(48), dp(48)))
        title = text(ui.optString("title", "RainFlix"), 18f).apply { maxLines = 2 }
        heading.addView(title, LinearLayout.LayoutParams(0, -2, 1f))
        controls.addView(heading)
        surface.findViewById<View>(com.rainflix.nativeplayer.R.id.rainflix_speed).setOnClickListener { speedMenu() }
        surface.findViewById<View>(com.rainflix.nativeplayer.R.id.rainflix_audio).setOnClickListener { tracksMenu(C.TRACK_TYPE_AUDIO) }
        surface.findViewById<View>(com.rainflix.nativeplayer.R.id.rainflix_subtitles).setOnClickListener { tracksMenu(C.TRACK_TYPE_TEXT) }
        surface.findViewById<View>(com.rainflix.nativeplayer.R.id.rainflix_rewind).setOnClickListener { seekBy(-5000) }
        surface.findViewById<View>(com.rainflix.nativeplayer.R.id.rainflix_forward).setOnClickListener { seekBy(5000) }
        val hasEpisodes = (ui.optJSONArray("seasons")?.length() ?: 0) > 0 || episodes.length() > 0
        for ((id, action) in listOf(
            com.rainflix.nativeplayer.R.id.rainflix_previous to { adjacent(false) },
            com.rainflix.nativeplayer.R.id.rainflix_next to { adjacent(true) },
            com.rainflix.nativeplayer.R.id.rainflix_episodes to { episodeDrawer() })) {
            surface.findViewById<View>(id).apply { visibility = if (hasEpisodes) View.VISIBLE else View.GONE; setOnClickListener { action() } }
        }
        root.addView(controls, FrameLayout.LayoutParams(-1, -2, Gravity.TOP))
        skipButton = button("Skip intro") { skipCurrentSegment() }.apply { visibility = View.GONE; background = background(0x66333333) }
        root.addView(skipButton, FrameLayout.LayoutParams(-2, dp(48), Gravity.END or Gravity.BOTTOM).apply { rightMargin = dp(20); bottomMargin = dp(112) })
        nextCard = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(8), dp(8), dp(8), dp(8))
            background = background(0xdd151b24.toInt()); visibility = View.GONE; setOnClickListener { adjacent(true) }
        }
        nextImage = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        nextLabel = text("Up next", 16f)
        nextCard.addView(nextImage, LinearLayout.LayoutParams(dp(120), dp(72)))
        nextCard.addView(nextLabel, LinearLayout.LayoutParams(0, -2, 1f))
        root.addView(nextCard, FrameLayout.LayoutParams(minOf(dp(340), resources.displayMetrics.widthPixels / 2), -2, Gravity.END or Gravity.BOTTOM).apply { rightMargin = dp(18); bottomMargin = dp(112) })
        surface.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { visibility ->
            controls.visibility = visibility
        })
        setContentView(root)
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_BUFFERING) {
                    loading.visibility = View.VISIBLE
                    progress.visibility = View.VISIBLE
                    if (logoPulse?.isStarted != true) logoPulse?.start()
                    if (ready) backdrop?.visibility = View.GONE
                } else if (state == Player.STATE_READY) {
                    if (ready) { loading.visibility = View.GONE; logoPulse?.cancel() }
                } else if (state == Player.STATE_ENDED && !complete) {
                    complete = true
                    PlayerBridge.event("complete")
                }
            }
            override fun onRenderedFirstFrame() { ready = true; loading.visibility = View.GONE; logoPulse?.cancel() }
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) {
                    if (ready) { loading.visibility = View.GONE; logoPulse?.cancel() }
                    PlayerBridge.event("playing")
                } else if (ready && player.playbackState == Player.STATE_READY && !complete) {
                    backdrop?.visibility = View.GONE
                    progress.visibility = View.GONE
                    logo.imageAlpha = 255; logo.alpha = 1f
                    loading.visibility = View.VISIBLE
                    surface.showController()
                }
            }
            override fun onPlayerError(error: PlaybackException) {
                PlayerBridge.event("error", JSONObject().put("message", "This source could not play: ${error.errorCodeName}"))
                close(false)
            }
            override fun onTracksChanged(tracks: Tracks) { restoreTracks(tracks) }
            override fun onMetadata(metadata: Metadata) {
                for (index in 0 until metadata.length()) {
                    val frame = metadata[index] as? ChapterFrame ?: continue
                    var name = frame.chapterId
                    for (sub in 0 until frame.subFrameCount) {
                        val text = frame.getSubFrame(sub) as? TextInformationFrame
                        if (text?.id == "TIT2") name = text.values.firstOrNull() ?: name
                    }
                    if (frame.endTimeMs > frame.startTimeMs) chapters.add(Triple(name, frame.startTimeMs.toLong(), frame.endTimeMs.toLong()))
                }
            }
        })
        PlayerBridge.event("opened")
        handler.post(pulse)
        session.optString("url").takeIf { it.isNotBlank() }?.let { setSource(session) }
    }
    private fun nextEpisode(): JSONObject? {
        val ordered = orderedEpisodes()
        val index = ordered.indexOfFirst { it.optString("id") == ui.optString("currentVideoId") }
        return if (index >= 0) ordered.getOrNull(index + 1) else null
    }
    private fun currentSegment(): Triple<String, Long, Long>? {
        val position = player.currentPosition
        val marker = chapters.firstOrNull { position >= it.second && position < it.third && Regex("(?i)\\b(intro|opening|op\\d*|outro|ending|credits|ed\\d*)\\b").containsMatchIn(it.first) }
        if (marker != null) return marker
        if (ui.optString("currentVideoId").isBlank() || ui.optJSONArray("seasons")?.length() == 0 || player.duration <= 180000 || player.duration == C.TIME_UNSET) return null
        val intro = savedTracks.optInt("introSeconds", 90).coerceIn(0, 300) * 1000L
        val outro = savedTracks.optInt("outroSeconds", 60).coerceIn(0, 300) * 1000L
        if (position < intro && intro > 0) return Triple("intro", 0L, intro)
        if (outro > 0 && position >= player.duration - outro) return Triple("ending", player.duration - outro, player.duration)
        return null
    }
    private fun skipCurrentSegment() {
        val segment = currentSegment() ?: return
        introSkipped = true
        player.seekTo(segment.third.coerceAtMost(player.duration))
    }
    private fun updatePlaybackActions() {
        if (!::nextCard.isInitialized) return
        val segment = if (ready) currentSegment() else null
        val ending = segment?.first?.let { Regex("(?i)\\b(outro|ending|credits|ed\\d*)\\b").containsMatchIn(it) } == true
        skipButton.visibility = if (segment != null && !nextCard.isShown) View.VISIBLE else View.GONE
        skipButton.text = if (ending) "Skip ending" else "Skip intro"
        if (player.isPlaying && segment != null && ((ending && savedTracks.optBoolean("skipOutro")) || (!ending && !introSkipped && savedTracks.optBoolean("skipIntro")))) skipCurrentSegment()
        val next = nextEpisode()
        if (next != null && player.isPlaying && player.playbackState == Player.STATE_READY && player.bufferedPosition - player.currentPosition >= 5000 && savedTracks.optBoolean("preloadNext", true) && preloadVideo.isBlank()) {
            preloadVideo = next.optString("id")
            PlayerBridge.event("episode", JSONObject().put("mode", "preload").put("videoId", preloadVideo))
        }
        val showNext = next != null && ready && player.duration > 0 && player.duration - player.currentPosition <= 45000 && savedTracks.optBoolean("nextPreview", true) && drawer == null
        nextCard.visibility = if (showNext) View.VISIBLE else View.GONE
        if (showNext && next != null) {
            val id = next.optString("id")
            if (previewVideo != id) { previewVideo = id; nextImage.setImageDrawable(null); next.optString("imageUrl").takeIf { it.startsWith("https://") }?.let { loadImage(it, nextImage) } }
            nextLabel.text = "Up next · S${next.optInt("season")} E${next.optInt("episode")}\n${next.optString("title")}\n$preloadStatus"
        }
    }
    fun updatePreload(args: JSONObject) {
        preloadStatus = when (args.optString("status")) {
            "ready" -> "Prefetched"
            "lookup", "metadata", "buffering" -> "Preparing next episode"
            "failed", "unavailable" -> "Next will retry"
            else -> ""
        }
        updatePlaybackActions()
    }
    private fun seekBy(delta: Long) {
        if (!player.isCurrentMediaItemSeekable) { surface.showController(); return }
        val limit = player.duration.takeIf { it > 0 && it != C.TIME_UNSET } ?: Long.MAX_VALUE
        val target = (player.currentPosition + delta).coerceIn(0L, limit)
        player.seekTo(target)
        seekTotal = if ((seekTotal < 0) == (delta < 0)) seekTotal + (delta / 1000).toInt() else (delta / 1000).toInt()
        seekFeedback.text = (if (seekTotal > 0) "+" else "") + "$seekTotal s"
        seekFeedback.layoutParams = FrameLayout.LayoutParams(dp(150), dp(80), Gravity.CENTER_VERTICAL or if (delta < 0) Gravity.START else Gravity.END).apply {
            leftMargin = dp(60); rightMargin = dp(60)
        }
        seekFeedback.visibility = View.VISIBLE
        handler.removeCallbacks(hideSeekFeedback); handler.postDelayed(hideSeekFeedback, 800)
        surface.showController()
    }
    fun setSource(args: JSONObject) {
        val url = args.optString("url")
        if (!url.startsWith("http://") && !url.startsWith("https://")) return
        sourceUrl = url
        val item = MediaItem.Builder().setUri(url)
        externalSub?.let { item.setSubtitleConfigurations(listOf(it)) }
        player.setMediaItem(item.build(), (args.optDouble("startAt", 0.0) * 1000).toLong())
        player.prepare(); player.playWhenReady = true
    }
    private fun language(code: String?): String {
        if (code.isNullOrBlank() || code == "und") return "Unknown language"
        val aliases = mapOf("eng" to "en", "jpn" to "ja", "kor" to "ko", "chi" to "zh", "zho" to "zh", "spa" to "es", "fra" to "fr", "fre" to "fr", "ger" to "de", "deu" to "de", "por" to "pt", "ind" to "id", "tha" to "th", "fil" to "tl")
        val normalized = code.lowercase(Locale.ROOT).replace('_', '-')
        val locale = Locale.forLanguageTag(aliases[normalized] ?: normalized)
        return locale.getDisplayName(Locale.ENGLISH).replaceFirstChar { it.uppercase() }.ifBlank { code }
    }
    private fun trackLabel(format: Format): String = listOfNotNull(
        format.label?.takeIf { it.isNotBlank() }, language(format.language),
        (format.sampleMimeType ?: format.codecs)?.let {
            when (it) {
                MimeTypes.TEXT_SSA -> "ASS"
                MimeTypes.TEXT_VTT -> "WebVTT"
                MimeTypes.APPLICATION_SUBRIP -> "SRT"
                MimeTypes.AUDIO_AAC -> "AAC"
                MimeTypes.AUDIO_FLAC -> "FLAC"
                MimeTypes.AUDIO_OPUS -> "Opus"
                else -> it.substringAfterLast('/').uppercase(Locale.ROOT)
            }
        }).distinct().joinToString(" · ")
    private fun restoreTracks(tracks: Tracks) {
        if (tracksRestored || tracks.groups.isEmpty()) return
        tracksRestored = true
        val builder = player.trackSelectionParameters.buildUpon()
        for ((key, type) in listOf("sub" to C.TRACK_TYPE_TEXT, "audio" to C.TRACK_TYPE_AUDIO)) {
            val saved = savedTracks.optJSONObject(key) ?: continue
            if (saved.optBoolean("off")) { builder.setTrackTypeDisabled(type, true); continue }
            val match = tracks.groups.filter { it.type == type }.flatMap { group ->
                (0 until group.length).map { group to it }
            }.firstOrNull { (group, index) ->
                val format = group.getTrackFormat(index)
                (!saved.optString("label").isBlank() && format.label == saved.optString("label")) ||
                    (!saved.optString("lang").isBlank() && language(format.language) == language(saved.optString("lang")))
            }
            if (match != null) builder.setOverrideForType(TrackSelectionOverride(match.first.mediaTrackGroup, match.second))
        }
        savedTracks.optDouble("speed", 1.0).toFloat().takeIf { it in .25f..3f }?.let { player.setPlaybackSpeed(it) }
        player.trackSelectionParameters = builder.build()
    }
    private fun tracksMenu(type: Int) {
        val choices = player.currentTracks.groups.filter { it.type == type }.flatMap { group ->
            (0 until group.length).filter { group.isTrackSupported(it) }.map { group to it }
        }
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val scroll = ScrollView(this).apply { addView(content) }
        val container = FrameLayout(this).apply {
            addView(scroll, FrameLayout.LayoutParams(-1, minOf(dp(240), resources.displayMetrics.heightPixels - dp(170))))
        }
        val dialog = AlertDialog.Builder(this).setTitle(if (type == C.TRACK_TYPE_TEXT) "Subtitles" else "Audio tracks")
            .setView(container).create()
        val embedded = choices.groupBy { language(it.first.getTrackFormat(it.second).language) }
        val addon = if (type == C.TRACK_TYPE_TEXT) arrayItems(subtitles).groupBy { language(it.optString("lang")) } else emptyMap()
        val languages = (embedded.keys + addon.keys).sorted()
        lateinit var showLanguages: () -> Unit
        fun showVariants(lang: String) {
            content.removeAllViews()
            content.addView(button("Back to languages") { showLanguages() })
            content.addView(text(lang, 18f).apply { setTextColor(0xff38bdf8.toInt()) })
            for ((group, index) in embedded[lang].orEmpty()) {
                val format = group.getTrackFormat(index)
                content.addView(button((if (group.isTrackSelected(index)) "Selected · " else "") + trackLabel(format)) {
                        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
                            .setTrackTypeDisabled(type, false).setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, index)).build()
                        savedTracks.put(if (type == C.TRACK_TYPE_TEXT) "sub" else "audio", JSONObject()
                            .put("lang", format.language ?: "und").put("label", format.label ?: "").put("title", format.label ?: "").put("off", false))
                        preferences(); dialog.dismiss()
                })
            }
            for (sub in addon[lang].orEmpty()) content.addView(button(sub.optString("label", "Add-on subtitle")) {
                PlayerBridge.event("subtitle", JSONObject().put("subtitleId", sub.optString("id"))); dialog.dismiss()
            })
        }
        showLanguages = {
            content.removeAllViews()
            if (type == C.TRACK_TYPE_TEXT) {
                content.addView(button("Off") {
                    player.trackSelectionParameters = player.trackSelectionParameters.buildUpon().setTrackTypeDisabled(type, true).build()
                    savedTracks.put("sub", JSONObject().put("off", true)); preferences(); dialog.dismiss()
                })
                content.addView(button("Subtitle appearance") { dialog.dismiss(); subtitleSettings() })
            }
            for (lang in languages) content.addView(button(lang) { showVariants(lang) })
            if (languages.isEmpty()) content.addView(text("No tracks available"))
        }
        showLanguages()
        showDialog(dialog)
    }
    private fun applySubtitleStyle() {
        surface.subtitleView?.apply {
            val scale = savedTracks.optDouble("scale", 1.0).toFloat().coerceIn(.5f, 2.5f)
            setApplyEmbeddedStyles(savedTracks.optBoolean("embeddedStyles", true))
            setApplyEmbeddedFontSizes(false)
            setFractionalTextSize(SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * scale)
            setBottomPaddingFraction((1f - savedTracks.optDouble("position", 92.0).toFloat() / 100).coerceIn(0f, .5f))
            setStyle(CaptionStyleCompat(Color.WHITE, if (savedTracks.optBoolean("subtitleBackground", false)) 0x99000000.toInt() else Color.TRANSPARENT,
                Color.TRANSPARENT, CaptionStyleCompat.EDGE_TYPE_OUTLINE, Color.BLACK, null))
        }
    }
    private fun subtitleSettings() {
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(12), 0, dp(12), dp(12)) }
        fun setting(label: String, key: String, default: Float, min: Float, max: Float, step: Float, display: (Float) -> String) {
            content.addView(text(label, 14f).apply { setTextColor(0xff94a3b8.toInt()) })
            val row = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
            val value = text(display(savedTracks.optDouble(key, default.toDouble()).toFloat())).apply { gravity = Gravity.CENTER }
            fun change(delta: Float) {
                val changed = (savedTracks.optDouble(key, default.toDouble()).toFloat() + delta).coerceIn(min, max)
                savedTracks.put(key, changed); value.text = display(changed); applySubtitleStyle(); preferences()
            }
            row.addView(button("-") { change(-step) }, LinearLayout.LayoutParams(dp(48), dp(48)))
            row.addView(value, LinearLayout.LayoutParams(0, dp(48), 1f))
            row.addView(button("+") { change(step) }, LinearLayout.LayoutParams(dp(48), dp(48)))
            content.addView(row)
        }
        setting("Size", "scale", 1f, .5f, 2.5f, .1f) { "${(it * 100).toInt()}%" }
        setting("Raise subtitles", "position", 92f, 50f, 100f, -2f) { "${(100 - it).toInt()}%" }
        for ((key, label, default) in listOf(Triple("subtitleBackground", "Subtitle background", false), Triple("embeddedStyles", "Use embedded styling", true))) {
            content.addView(Switch(this).apply {
                text = label; textSize = 16f; setTextColor(Color.WHITE); minHeight = dp(48)
                isChecked = savedTracks.optBoolean(key, default)
                setOnCheckedChangeListener { _, checked -> savedTracks.put(key, checked); applySubtitleStyle(); preferences() }
            })
        }
        val scroll = ScrollView(this).apply { addView(content) }
        val container = FrameLayout(this).apply {
            addView(scroll, FrameLayout.LayoutParams(-1, minOf(dp(240), resources.displayMetrics.heightPixels - dp(170))))
        }
        showDialog(AlertDialog.Builder(this).setTitle("Subtitle appearance").setView(container).create())
    }
    private fun preferences() { PlayerBridge.event("preferences", JSONObject().put("tracks", savedTracks)) }
    private fun speedMenu() {
        val speeds = floatArrayOf(.5f, .75f, 1f, 1.25f, 1.5f, 2f)
        showDialog(AlertDialog.Builder(this).setTitle("Playback speed").setSingleChoiceItems(
            speeds.map { "${it}×" }.toTypedArray(), speeds.toList().indexOf(player.playbackParameters.speed)) { dialog, index ->
            player.setPlaybackSpeed(speeds[index]); savedTracks.put("speed", speeds[index]); preferences(); dialog.dismiss()
        }.create())
    }
    private fun showDialog(dialog: AlertDialog) {
        dialog.show()
        dialog.setCanceledOnTouchOutside(true)
        dialog.window?.apply {
            setBackgroundDrawable(background(0xff11151c.toInt()))
            setDimAmount(.25f)
            setLayout(minOf(dp(560), resources.displayMetrics.widthPixels - dp(40)), -2)
            setGravity(Gravity.END or Gravity.BOTTOM)
            attributes = attributes.apply { x = dp(18); y = dp(100) }
        }
    }
    private fun arrayItems(array: JSONArray) = (0 until array.length()).mapNotNull { array.optJSONObject(it) }
    private fun orderedEpisodes() = arrayItems(episodes).sortedWith(compareBy({ it.optInt("season") }, { it.optInt("episode") }))
    private fun adjacent(next: Boolean) {
        val ordered = orderedEpisodes()
        val index = ordered.indexOfFirst { it.optString("id") == ui.optString("currentVideoId") }
        val entry = ordered.getOrNull(index + if (next) 1 else -1) ?: return
        PlayerBridge.event("episode", JSONObject().put("mode", if (next) "next" else "prev").put("videoId", entry.optString("id")))
    }
    private fun drawerBase(heading: String): LinearLayout {
        drawer?.let { root.removeView(it) }
        if (drawerShade == null) {
            drawerShade = View(this).apply { setBackgroundColor(0x22000000); setOnClickListener { dismissDrawer() } }
            root.addView(drawerShade, FrameLayout.LayoutParams(-1, -1))
        }
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(12), dp(8), dp(12), dp(12))
            background = background(0xf2181b22.toInt())
        }
        val header = LinearLayout(this)
        header.addView(button("‹") {
            if (heading == "Episodes") dismissDrawer()
            else if (heading == "Streams") episodeDrawer()
            else updateStreams(JSONObject().put("requestId", requestId).put("videoId", chosenVideo).put("streams", streams))
        })
        header.addView(text(heading, 18f), LinearLayout.LayoutParams(0, -2, 1f))
        panel.addView(header)
        root.addView(panel, FrameLayout.LayoutParams(minOf(dp(380), resources.displayMetrics.widthPixels * 3 / 4), -1, Gravity.END))
        drawer = panel
        return panel
    }
    private fun dismissDrawer() {
        drawer?.let { root.removeView(it) }; drawer = null
        drawerShade?.let { root.removeView(it) }; drawerShade = null
        chosenVideo = ""
    }
    private fun episodeDrawer() {
        chosenVideo = ""
        val panel = drawerBase("Episodes")
        val seasons = (arrayItems(ui.optJSONArray("seasons") ?: JSONArray()).map { it.optInt("season", it.optInt("season_number")) } +
            arrayItems(episodes).map { it.optInt("season") }).distinct().sorted()
        val select = Spinner(this).apply { adapter = ArrayAdapter(this@PlayerActivity, android.R.layout.simple_spinner_dropdown_item, seasons.map { "Season $it" }) }
        select.setSelection(maxOf(0, seasons.indexOf(browsedSeason)))
        panel.addView(select)
        select.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: AdapterView<*>?) {}
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val selected = seasons.getOrNull(position) ?: return
                if (selected != browsedSeason) {
                    browsedSeason = selected
                    PlayerBridge.event("episode", JSONObject().put("mode", "season").put("videoId", selected.toString()))
                    episodeRows(panel, "loading")
                }
            }
        }
        episodeRows(panel)
    }
    private fun episodeRows(panel: LinearLayout, status: String = "ready") {
        drawerScroll?.let { if (it.parent == panel) panel.removeView(it) }
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val scroll = ScrollView(this).apply { addView(list) }
        drawerScroll = scroll; panel.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        if (status == "loading") list.addView(text("Loading episodes..."))
        val rows = orderedEpisodes().filter { it.optInt("season") == browsedSeason }
        for (ep in rows) {
            val row = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(6), 0, dp(6)); minimumHeight = dp(70) }
            val image = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
            row.addView(image, LinearLayout.LayoutParams(dp(104), dp(60)))
            val imageUrl = ep.optString("imageUrl")
            if (imageUrl.startsWith("https://")) loadImage(imageUrl, image)
            row.addView(text("${ep.optInt("episode")}. ${ep.optString("title")}", 16f), LinearLayout.LayoutParams(0, -2, 1f))
            if (ep.optString("id") == ui.optString("currentVideoId")) row.background = background(0x5538bdf8)
            row.isFocusable = true
            row.setOnClickListener {
                chosenVideo = ep.optString("id"); requestId = java.util.UUID.randomUUID().toString()
                drawerBase("Streams").addView(text("Finding available streams..."))
                PlayerBridge.event("episode", JSONObject().put("mode", "choose").put("videoId", chosenVideo).put("choiceId", requestId))
            }
            list.addView(row)
            if (ep.optString("id") == ui.optString("currentVideoId")) scroll.post { scroll.smoothScrollTo(0, row.top) }
        }
        if (rows.isEmpty() && status != "loading") list.addView(text(if (status == "error") "Could not load episodes" else "No episodes available"))
        if (status == "error") list.addView(button("Retry") {
            PlayerBridge.event("episode", JSONObject().put("mode", "season").put("videoId", browsedSeason.toString()))
        })
    }
    fun updateEpisodes(args: JSONObject) {
        val revision = args.optLong("revision", episodeRevision)
        if (revision < episodeRevision) return
        episodeRevision = revision
        episodes = args.optJSONArray("episodes") ?: episodes
        if (args.has("season")) browsedSeason = args.optInt("season")
        drawer?.let { if (chosenVideo.isEmpty()) episodeRows(it, args.optString("status", "ready")) }
    }
    fun updateStreams(args: JSONObject) {
        if (args.optString("requestId") != requestId || args.optString("videoId") != chosenVideo) return
        streams = args.optJSONArray("streams") ?: JSONArray()
        if (streams.length() == 1) { selectStream(streams.getJSONObject(0)); return }
        val panel = drawerBase("Streams")
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        panel.addView(ScrollView(this).apply { addView(list) }, LinearLayout.LayoutParams(-1, 0, 1f))
        val providers = arrayItems(streams).groupBy { it.optString("providerId") }
        for ((_, entries) in providers) {
            val entry = entries[0]
            val row = LinearLayout(this).apply {
                gravity = Gravity.CENTER_VERTICAL; minimumHeight = dp(76); setPadding(dp(8), dp(12), dp(8), dp(12))
                background = background(0x15222222); isFocusable = true
            }
            val image = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_CENTER; setImageResource(com.rainflix.nativeplayer.R.drawable.rainflix_r) }
            row.addView(image, LinearLayout.LayoutParams(dp(44), dp(44)))
            entry.optString("providerLogo").takeIf { it.startsWith("https://") }?.let { loadImage(it, image) }
            val description = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            description.addView(text(entry.optString("providerLabel", "Streams"), 18f))
            description.addView(text("${entries.size} sources", 13f).apply { setPadding(dp(12), 0, dp(12), 0); setTextColor(0xff94a3b8.toInt()) })
            row.addView(description, LinearLayout.LayoutParams(0, -2, 1f))
            row.setOnClickListener {
            val sources = drawerBase(entries[0].optString("providerLabel", "Streams"))
            val sourceList = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            sources.addView(ScrollView(this).apply { addView(sourceList) }, LinearLayout.LayoutParams(-1, 0, 1f))
            for (source in entries) {
                val sourceRow = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL; setPadding(dp(8), dp(12), dp(8), dp(12)); minimumHeight = dp(64)
                    isFocusable = true; background = background(0x10222222)
                    setOnClickListener { selectStream(source) }
                }
                sourceRow.addView(text(source.optString("heading", source.optString("label", "Stream")), 16f))
                val tags = source.optJSONArray("badges")
                if (tags != null && tags.length() > 0) sourceRow.addView(text((0 until tags.length()).joinToString("  ·  ") { tags.optString(it) }, 13f).apply {
                    setPadding(dp(12), 0, dp(12), dp(6)); setTextColor(0xff38bdf8.toInt())
                })
                source.optString("details").takeIf { it.isNotBlank() }?.let { value ->
                    sourceRow.addView(text(value, 13f).apply { setTextColor(0xffa7b0be.toInt()); setPadding(dp(12), 0, dp(12), dp(4)) })
                }
                sourceList.addView(sourceRow); divider(sourceList)
            }
            }
            list.addView(row); divider(list)
        }
        if (streams.length() == 0) list.addView(text("No streams available"))
    }
    private fun divider(list: LinearLayout) {
        list.addView(View(this).apply { setBackgroundColor(0x25ffffff) }, LinearLayout.LayoutParams(-1, dp(1)).apply { leftMargin = dp(12); rightMargin = dp(12) })
    }
    private fun selectStream(stream: JSONObject) {
        PlayerBridge.event("episode", JSONObject().put("mode", "source").put("videoId", chosenVideo).put("choiceId", stream.optString("id")))
    }
    fun updateSubtitles(args: JSONObject) { subtitles = args.optJSONArray("subtitles") ?: JSONArray() }
    fun loadSubtitle(args: JSONObject) {
        val url = args.optString("url")
        if (!url.startsWith("https://") && !url.startsWith("http://")) return
        val mime = when { url.substringBefore('?').endsWith(".srt") -> MimeTypes.APPLICATION_SUBRIP
            url.substringBefore('?').endsWith(".ass") || url.substringBefore('?').endsWith(".ssa") -> MimeTypes.TEXT_SSA
            else -> MimeTypes.TEXT_VTT }
        externalSub = MediaItem.SubtitleConfiguration.Builder(android.net.Uri.parse(url))
            .setMimeType(mime).setLanguage(args.optString("lang", "und")).setLabel(args.optString("label"))
            .setSelectionFlags(C.SELECTION_FLAG_DEFAULT).build()
        val position = player.currentPosition / 1000.0
        savedTracks.put("sub", JSONObject().put("lang", args.optString("lang")).put("label", args.optString("label")).put("title", args.optString("label")).put("off", false))
        preferences(); sourceUrl?.let { setSource(JSONObject().put("url", it).put("startAt", position)) }
    }
    private fun loadImage(url: String, view: ImageView, fallback: String? = null) {
        imageCache.get(url)?.let { view.setImageBitmap(it); return }
        if (!url.startsWith("http://") && !url.startsWith("https://")) return
        images.execute {
            var connection: HttpURLConnection? = null
            val bitmap = try {
                connection = URL(url).openConnection() as HttpURLConnection
                connection.connectTimeout = 5000; connection.readTimeout = 5000
                connection.inputStream.use { input -> android.graphics.BitmapFactory.decodeStream(input) }
            } catch (_: Exception) { null } finally { connection?.disconnect() }
            handler.post {
                if (closed) return@post
                if (bitmap != null) { imageCache.put(url, bitmap); view.setImageBitmap(bitmap) }
                else if (fallback != null && fallback != url) loadImage(fallback, view)
            }
        }
    }
    @Deprecated("Deprecated in Java") override fun onBackPressed() {
        if (drawer != null) dismissDrawer()
        else close(true)
    }
    override fun onPause() {
        super.onPause()
        if (!closed && ::player.isInitialized) {
            player.pause()
            PlayerBridge.event("episode", JSONObject().put("mode", "cancel-preload"))
            preloadVideo = ""
        }
    }
    fun close(notify: Boolean) {
        if (closed) return
        if (notify) PlayerBridge.event("closed")
        closed = true; logoPulse?.cancel(); handler.removeCallbacksAndMessages(null); images.shutdownNow()
        if (::player.isInitialized) { surface.player = null; player.release() }
        if (PlayerBridge.activity === this) PlayerBridge.activity = null
        finish()
    }
    override fun onDestroy() { close(!complete); super.onDestroy() }
}

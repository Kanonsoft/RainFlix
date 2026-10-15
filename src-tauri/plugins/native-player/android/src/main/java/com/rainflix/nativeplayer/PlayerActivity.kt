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
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import androidx.media3.ui.SubtitleView
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.extractor.metadata.id3.ChapterFrame
import androidx.media3.extractor.metadata.id3.TextInformationFrame
import androidx.media3.extractor.metadata.Chapter
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
    private var chosenProvider = ""
    private var requestId = ""
    private var ready = false
    private var closed = false
    private var complete = false
    private var navigating = false
    private var sourceUrl: String? = null
    private var externalSub: MediaItem.SubtitleConfiguration? = null
    private var selectedExternalId = ""
    private var subtitleRevision = 0L
    private var savedTracks = JSONObject()
    private val restoredTrackTypes = mutableSetOf<Int>()
    private var logoPulse: ObjectAnimator? = null
    private var episodeRevision = 0L
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
            progress.isIndeterminate = navigating || (player.playbackState == Player.STATE_BUFFERING && (player.duration == C.TIME_UNSET || player.bufferedPosition <= player.currentPosition))
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
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        val subtitleParsers = DelayedSubtitleParserFactory { (savedTracks.optDouble("delay", 0.0) * 1000000).toLong() }
        player = ExoPlayer.Builder(this, DefaultRenderersFactory(this).setEnableDecoderFallback(true))
            .setMediaSourceFactory(DefaultMediaSourceFactory(this, RainFlixExtractorsFactory(subtitleParsers)).setSubtitleParserFactory(subtitleParsers))
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
                        if (surface.isControllerFullyVisible) surface.hideController() else surface.showController()
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
        surface.findViewById<View>(com.rainflix.nativeplayer.R.id.rainflix_settings).setOnClickListener { playbackSettings() }
        surface.findViewById<View>(com.rainflix.nativeplayer.R.id.rainflix_bottom_rewind).setOnClickListener { seekBy(-5000) }
        surface.findViewById<View>(com.rainflix.nativeplayer.R.id.rainflix_bottom_forward).setOnClickListener { seekBy(5000) }
        val bottomPlay = surface.findViewById<ImageButton>(com.rainflix.nativeplayer.R.id.rainflix_bottom_play_pause)
        bottomPlay.setOnClickListener { if (player.isPlaying) player.pause() else player.play() }
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
            isFocusable = true; contentDescription = "Play next episode"
        }
        nextImage = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        nextLabel = text("Up next", 16f)
        nextCard.addView(nextImage, LinearLayout.LayoutParams(dp(120), dp(72)))
        nextCard.addView(nextLabel, LinearLayout.LayoutParams(0, -2, 1f))
        root.addView(nextCard, FrameLayout.LayoutParams(minOf(dp(340), resources.displayMetrics.widthPixels / 2), -2, Gravity.END or Gravity.BOTTOM).apply { rightMargin = dp(18); bottomMargin = dp(112) })
        surface.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { visibility ->
            controls.visibility = visibility
            if (visibility == View.VISIBLE) updatePlaybackActions()
            else skipButton.visibility = View.GONE
        })
        updateEpisodeNavigation()
        setContentView(root)
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_BUFFERING) {
                    loading.visibility = View.VISIBLE
                    progress.visibility = View.VISIBLE
                    if (logoPulse?.isStarted != true) logoPulse?.start()
                    if (ready) backdrop?.visibility = View.GONE
                } else if (state == Player.STATE_READY) {
                    updateReadyOverlay()
                } else if (state == Player.STATE_ENDED && !complete) {
                    complete = true
                    PlayerBridge.event("complete", JSONObject().put("nextVideoId", nextEpisode()?.optString("id"))
                        .put("position", player.currentPosition / 1000.0).put("duration", player.duration / 1000.0))
                }
            }
            override fun onRenderedFirstFrame() { ready = true; updateReadyOverlay() }
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                bottomPlay.setImageResource(if (isPlaying) androidx.media3.ui.R.drawable.exo_icon_pause else androidx.media3.ui.R.drawable.exo_icon_play)
                bottomPlay.contentDescription = if (isPlaying) "Pause" else "Play"
                if (isPlaying) {
                    updateReadyOverlay()
                    PlayerBridge.event("playing")
                } else if (ready && player.playbackState == Player.STATE_READY && !complete) {
                    updateReadyOverlay()
                    surface.showController()
                }
            }
            override fun onPlayerError(error: PlaybackException) {
                PlayerBridge.event("error", JSONObject().put("message", "This source could not play: ${error.errorCodeName}"))
                close(false)
            }
            override fun onTracksChanged(tracks: Tracks) {
                for (group in tracks.groups) for (index in 0 until group.length) group.getTrackFormat(index).metadata?.let { collectChapters(it) }
                restoreTracks(tracks)
            }
            override fun onMetadata(metadata: Metadata) {
                collectChapters(metadata)
            }
        })
        PlayerBridge.event("opened")
        handler.post(pulse)
        session.optString("url").takeIf { it.isNotBlank() }?.let { setSource(session) }
    }
    private fun updateReadyOverlay() {
        if (navigating) return
        if (!ready || player.playbackState != Player.STATE_READY) return
        logoPulse?.cancel()
        if (player.playWhenReady) {
            loading.visibility = View.GONE
        } else {
            backdrop?.visibility = View.GONE
            progress.visibility = View.GONE
            logo.imageAlpha = 255; logo.alpha = 1f
            loading.visibility = View.VISIBLE
        }
    }
    private fun nextEpisode(): JSONObject? {
        return adjacentEpisode(true)
    }
    private fun collectChapters(metadata: Metadata) {
        val offset = if (player.currentTimeline.isEmpty) 0L else player.currentTimeline.getWindow(player.currentMediaItemIndex, Timeline.Window()).positionInFirstPeriodUs / 1000
        for (index in 0 until metadata.length()) {
            val entry = metadata[index]
            val chapter = when (entry) {
                is Chapter -> {
                    if (entry.isHidden || entry.startTimeMs == C.TIME_UNSET) continue
                    Triple(entry.title?.value ?: "", entry.startTimeMs - offset, if (entry.endTimeMs == C.TIME_UNSET) C.TIME_UNSET else entry.endTimeMs - offset)
                }
                is ChapterFrame -> {
                    var name = entry.chapterId
                    for (sub in 0 until entry.subFrameCount) {
                        val text = entry.getSubFrame(sub) as? TextInformationFrame
                        if (text?.id == "TIT2") name = text.values.firstOrNull() ?: name
                    }
                    Triple(name, entry.startTimeMs.toLong(), entry.endTimeMs.toLong())
                }
                else -> continue
            }
            if (chapter.second < 0) continue
            chapters.removeAll { it.first == chapter.first && it.second == chapter.second }
            chapters.add(chapter)
        }
        chapters.sortBy { it.second }
    }
    private fun currentSegment(): Triple<String, Long, Long>? {
        val position = player.currentPosition
        return chapters.mapIndexed { index, chapter ->
            val end = if (chapter.third > chapter.second) chapter.third else chapters.getOrNull(index + 1)?.second ?: player.duration
            Triple(chapter.first, chapter.second, end)
        }.firstOrNull { position >= it.second && position < it.third && Regex("(?i)\\b(intro|opening|op\\d*|outro|ending|end|credits|ed\\d*)\\b").containsMatchIn(it.first) && ChapterSkipGuard.isSafe(it.first, it.second, it.third, player.duration) }
    }
    private fun skipCurrentSegment() {
        val segment = currentSegment() ?: return
        introSkipped = true
        player.seekTo(segment.third.coerceAtMost(player.duration))
    }
    private fun updatePlaybackActions() {
        if (!::nextCard.isInitialized) return
        val segment = if (ready) currentSegment() else null
        val ending = segment?.first?.let { Regex("(?i)\\b(outro|ending|end|credits|ed\\d*)\\b").containsMatchIn(it) } == true
        skipButton.visibility = if (segment != null && drawer == null && !nextCard.isShown && surface.isControllerFullyVisible) View.VISIBLE else View.GONE
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
            val remaining = ((player.duration - player.currentPosition).coerceAtLeast(0) / 1000)
            nextLabel.text = "Up next · S${next.optInt("season")} E${next.optInt("episode")}\n${next.optString("title")}\n${String.format(Locale.ENGLISH, "%02d:%02d", remaining / 60, remaining % 60)} remaining"
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
    fun replaceSession(args: JSONObject) {
        navigating = false
        ready = false; complete = false
        player.stop(); player.clearMediaItems()
        dismissDrawer()
        ui = args.optJSONObject("ui") ?: JSONObject()
        savedTracks = ui.optJSONObject("tracks") ?: JSONObject()
        episodes = ui.optJSONArray("episodes") ?: JSONArray()
        subtitles = JSONArray(); streams = JSONArray()
        browsedSeason = ui.optInt("season", 1)
        chosenVideo = ""; chosenProvider = ""; requestId = ""
        previewVideo = ""; preloadVideo = ""; preloadStatus = ""
        sourceUrl = null; externalSub = null; selectedExternalId = ""
        subtitleRevision++; episodeRevision++
        restoredTrackTypes.clear(); chapters.clear(); introSkipped = false
        title.text = ui.optString("title", "RainFlix")
        nextCard.visibility = View.GONE; skipButton.visibility = View.GONE
        loading.visibility = View.VISIBLE; progress.visibility = View.VISIBLE
        progress.isIndeterminate = true; backdrop?.visibility = View.VISIBLE
        applySubtitleStyle(); updateEpisodeNavigation()
        surface.showController()
        PlayerBridge.event("opened")
        args.optString("url").takeIf { it.isNotBlank() }?.let { setSource(args) }
    }
    fun setSource(args: JSONObject) {
        val url = args.optString("url")
        if (!url.startsWith("http://") && !url.startsWith("https://")) return
        chapters.clear()
        introSkipped = false
        skipButton.visibility = View.GONE
        restoredTrackTypes.clear()
        subtitleRevision++
        if (sourceUrl != null && sourceUrl != url) { externalSub = null; selectedExternalId = "" }
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
                MimeTypes.APPLICATION_MEDIA3_CUES -> "Embedded"
                else -> it.substringAfterLast('/').uppercase(Locale.ROOT)
            }
        }).distinct().joinToString(" · ")
    private fun restoreTracks(tracks: Tracks) {
        if (tracks.groups.isEmpty()) return
        val builder = player.trackSelectionParameters.buildUpon()
        for ((key, type) in listOf("sub" to C.TRACK_TYPE_TEXT, "audio" to C.TRACK_TYPE_AUDIO)) {
            if (type in restoredTrackTypes) continue
            val saved = savedTracks.optJSONObject(key) ?: continue
            if (saved.optBoolean("off")) { builder.setTrackTypeDisabled(type, true); restoredTrackTypes.add(type); continue }
            val available = tracks.groups.filter { it.type == type }.flatMap { group ->
                (0 until group.length).filter { group.isTrackSupported(it) }.map { group to it }
            }
            if (available.isEmpty()) continue
            val match = available.firstOrNull { (group, index) ->
                !saved.optString("label").isBlank() && group.getTrackFormat(index).label == saved.optString("label")
            } ?: available.firstOrNull { (group, index) ->
                val format = group.getTrackFormat(index)
                !saved.optString("lang").isBlank() && language(format.language) == language(saved.optString("lang"))
            }
            builder.setTrackTypeDisabled(type, false).clearOverridesOfType(type)
            if (match != null) {
                builder.setOverrideForType(TrackSelectionOverride(match.first.mediaTrackGroup, match.second))
                restoredTrackTypes.add(type)
            } else if (type == C.TRACK_TYPE_TEXT) {
                builder.setPreferredTextLanguage(saved.optString("lang").takeIf { it.isNotBlank() })
            }
        }
        savedTracks.optDouble("speed", 1.0).toFloat().takeIf { it in .25f..3f }?.let { player.setPlaybackSpeed(it) }
        player.trackSelectionParameters = builder.build()
    }
    private fun trackChoice(label: String, selected: Boolean, action: () -> Unit): View {
        return LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), 0, dp(12), 0)
            background = background(if (selected) 0xff163f50.toInt() else 0x221b232b)
            isFocusable = true; contentDescription = if (selected) "$label, selected" else label
            addView(text(label, 14f).apply { minHeight = dp(48); setPadding(dp(8), dp(6), dp(8), dp(6)) }, LinearLayout.LayoutParams(0, -2, 1f))
            if (selected) addView(View(this@PlayerActivity).apply { background = background(0xff38bdf8.toInt(), 4) }, LinearLayout.LayoutParams(dp(8), dp(8)))
            setOnClickListener { action() }
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(4) }
        }
    }
    private fun tracksMenu(type: Int) {
        val choices = player.currentTracks.groups.filter { it.type == type }.flatMap { group ->
            (0 until group.length).filter { group.isTrackSupported(it) }.map { group to it }
        }
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val scroll = ScrollView(this).apply { addView(content) }
        val container = FrameLayout(this).apply {
            addView(scroll, FrameLayout.LayoutParams(-1, -2))
        }
        val heading = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL; setPadding(dp(8), 0, dp(8), 0) }
        heading.addView(text(if (type == C.TRACK_TYPE_TEXT) "Subtitles" else "Audio tracks", 16f), LinearLayout.LayoutParams(0, dp(48), 1f))
        val dialog = AlertDialog.Builder(this).setCustomTitle(heading).setView(container).create()
        if (type == C.TRACK_TYPE_TEXT) heading.addView(text("Subtitle settings", 13f).apply {
            gravity = Gravity.CENTER; minHeight = dp(48); isFocusable = true; setTextColor(0xff38bdf8.toInt())
            setPadding(dp(6), dp(8), dp(6), dp(8))
            setOnClickListener { dialog.dismiss(); subtitleSettings() }
        })
        fun fitRows() {
            scroll.layoutParams = FrameLayout.LayoutParams(-1, minOf(dp(180), resources.displayMetrics.heightPixels - dp(150), dp(content.childCount * 60)))
        }
        val embedded = choices.groupBy { language(it.first.getTrackFormat(it.second).language) }
        val addon = if (type == C.TRACK_TYPE_TEXT) arrayItems(subtitles).groupBy { language(it.optString("lang")) } else emptyMap()
        val languages = (embedded.keys + addon.keys).sorted()
        lateinit var showLanguages: () -> Unit
        fun showVariants(lang: String) {
            content.removeAllViews()
            scroll.scrollTo(0, 0)
            content.addView(button("Back to languages") { showLanguages() })
            content.addView(text(lang, 18f).apply { setTextColor(0xff38bdf8.toInt()) })
            for ((group, index) in embedded[lang].orEmpty()) {
                val format = group.getTrackFormat(index)
                content.addView(trackChoice(trackLabel(format), group.isTrackSelected(index)) {
                        if (type == C.TRACK_TYPE_TEXT) { subtitleRevision++; selectedExternalId = "" }
                        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
                            .setTrackTypeDisabled(type, false).clearOverridesOfType(type).setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, index)).build()
                        restoredTrackTypes.add(type)
                        savedTracks.put(if (type == C.TRACK_TYPE_TEXT) "sub" else "audio", JSONObject()
                            .put("lang", format.language ?: "und").put("label", format.label ?: "").put("title", format.label ?: "").put("off", false))
                        preferences(); dialog.dismiss()
                })
            }
            for (sub in addon[lang].orEmpty()) content.addView(trackChoice(sub.optString("label", "Add-on subtitle") + "\nExternal", selectedExternalId == sub.optString("id") && choices.any { it.first.isTrackSelected(it.second) && it.first.getTrackFormat(it.second).label == externalSub?.label }) {
                PlayerBridge.event("subtitle", JSONObject().put("subtitleId", sub.optString("id"))); dialog.dismiss()
            })
            fitRows()
        }
        showLanguages = {
            content.removeAllViews()
            scroll.scrollTo(0, 0)
            if (type == C.TRACK_TYPE_TEXT) {
                content.addView(trackChoice("Off", choices.none { it.first.isTrackSelected(it.second) }) {
                    subtitleRevision++; selectedExternalId = ""
                    player.trackSelectionParameters = player.trackSelectionParameters.buildUpon().clearOverridesOfType(type).setTrackTypeDisabled(type, true).build()
                    restoredTrackTypes.add(type)
                    savedTracks.put("sub", JSONObject().put("off", true)); preferences(); dialog.dismiss()
                })
            }
            for (lang in languages) content.addView(trackChoice("$lang\n${embedded[lang].orEmpty().size + addon[lang].orEmpty().size} tracks", embedded[lang].orEmpty().any { it.first.isTrackSelected(it.second) }) { showVariants(lang) })
            if (languages.isEmpty()) content.addView(text("No tracks available"))
            fitRows()
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
                if (key == "delay") reloadSource()
            }
            row.addView(button("-") { change(-step) }, LinearLayout.LayoutParams(dp(48), dp(48)))
            row.addView(value, LinearLayout.LayoutParams(0, dp(48), 1f))
            row.addView(button("+") { change(step) }, LinearLayout.LayoutParams(dp(48), dp(48)))
            content.addView(row)
        }
        setting("Delay", "delay", 0f, -10f, 10f, .1f) { String.format(Locale.ENGLISH, "%+.2f s", it) }
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
            addView(scroll, FrameLayout.LayoutParams(-1, minOf(dp(210), resources.displayMetrics.heightPixels - dp(150))))
        }
        showDialog(AlertDialog.Builder(this).setCustomTitle(text("Subtitle settings", 16f)).setView(container).create())
    }
    private fun playbackSettings() {
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(8), dp(16), dp(8)) }
        for ((key, label, default) in listOf(
            Triple("skipIntro", "Auto-skip intro", false), Triple("skipOutro", "Auto-skip outro", false))) {
            content.addView(Switch(this).apply {
                text = label; textSize = 14f; setTextColor(Color.WHITE); minHeight = dp(48)
                thumbTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
                trackTintList = android.content.res.ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(0xff38bdf8.toInt(), 0xff343b43.toInt()))
                isChecked = savedTracks.optBoolean(key, default)
                setOnCheckedChangeListener { _, checked ->
                    savedTracks.put(key, checked)
                    PlayerBridge.event("settings", JSONObject().put("settings", JSONObject().put(key, checked)))
                    updatePlaybackActions()
                }
            })
        }
        showDialog(AlertDialog.Builder(this).setCustomTitle(text("Playback settings", 16f)).setView(content).create())
    }
    private fun reloadSource() {
        val play = player.playWhenReady
        val position = player.currentPosition / 1000.0
        sourceUrl?.let { setSource(JSONObject().put("url", it).put("startAt", position)); player.playWhenReady = play }
    }
    private fun preferences() {
        val titleTracks = JSONObject(savedTracks.toString())
        for (key in listOf("skipIntro", "skipOutro", "nextPreview", "preloadNext", "autoNext")) titleTracks.remove(key)
        PlayerBridge.event("preferences", JSONObject().put("tracks", titleTracks))
    }
    private fun speedMenu() {
        val speeds = floatArrayOf(.5f, .75f, 1f, 1.25f, 1.5f, 2f)
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(8), 0, dp(8), dp(8)) }
        val dialog = AlertDialog.Builder(this).setCustomTitle(text("Playback speed", 16f)).setView(content).create()
        for (pair in speeds.toList().chunked(2)) {
            val row = LinearLayout(this)
            for (speed in pair) row.addView(trackChoice("${speed}x", kotlin.math.abs(speed - player.playbackParameters.speed) < .01f) {
                player.setPlaybackSpeed(speed); savedTracks.put("speed", speed); preferences(); dialog.dismiss()
            }, LinearLayout.LayoutParams(0, -2, 1f).apply { setMargins(dp(2), dp(2), dp(2), dp(2)) })
            content.addView(row)
        }
        showDialog(dialog, 260)
    }
    private fun showDialog(dialog: AlertDialog, width: Int = 330) {
        dialog.show()
        dialog.setCanceledOnTouchOutside(true)
        dialog.window?.apply {
            setBackgroundDrawable(background(0xff11151c.toInt()))
            setDimAmount(.25f)
            setLayout(minOf(dp(width), resources.displayMetrics.widthPixels - dp(32)), -2)
            setGravity(Gravity.END or Gravity.BOTTOM)
            attributes = attributes.apply { x = dp(14); y = dp(92) }
        }
    }
    private fun arrayItems(array: JSONArray) = (0 until array.length()).mapNotNull { array.optJSONObject(it) }
    private fun orderedEpisodes(): List<JSONObject> {
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(java.util.Date())
        return arrayItems(episodes).filter {
            val date = it.optString("date").take(10)
            !Regex("\\d{4}-\\d{2}-\\d{2}").matches(date) || date <= today
        }.sortedWith(compareBy({ it.optInt("season") }, { it.optInt("episode") }))
    }
    private fun adjacentEpisode(next: Boolean): JSONObject? {
        val ordered = orderedEpisodes()
        val index = ordered.indexOfFirst { it.optString("id") == ui.optString("currentVideoId") }
        return if (index >= 0) ordered.getOrNull(index + if (next) 1 else -1) else null
    }
    private fun updateEpisodeNavigation() {
        surface.findViewById<View>(com.rainflix.nativeplayer.R.id.rainflix_previous).visibility =
            if (adjacentEpisode(false) != null) View.VISIBLE else View.GONE
        surface.findViewById<View>(com.rainflix.nativeplayer.R.id.rainflix_next).visibility =
            if (adjacentEpisode(true) != null) View.VISIBLE else View.GONE
    }
    private fun adjacent(next: Boolean) {
        val entry = adjacentEpisode(next) ?: return
        PlayerBridge.event("episode", JSONObject().put("mode", if (next) "next" else "prev").put("videoId", entry.optString("id")))
    }
    fun updateNavigation(args: JSONObject) {
        if (args.optString("status") == "loading") {
            navigating = true
            player.pause()
            dismissDrawer()
            loading.visibility = View.VISIBLE
            backdrop?.visibility = View.VISIBLE
            progress.visibility = View.VISIBLE; progress.isIndeterminate = true
            logoPulse?.start()
            return
        }
        if (args.optString("status") != "error") return
        navigating = false
        updateReadyOverlay()
        Toast.makeText(this, args.optString("message", "Could not open this episode. Try again."), Toast.LENGTH_LONG).show()
        val entry = arrayItems(episodes).firstOrNull { it.optString("id") == args.optString("videoId") }
        if (entry != null) chooseEpisode(entry.optString("id"))
    }
    private fun chooseEpisode(id: String) {
        chosenVideo = id; chosenProvider = ""; requestId = ""
        val providers = arrayItems(ui.optJSONArray("providers") ?: JSONArray())
        if (providers.isEmpty()) { requestStreams(); return }
        val panel = drawerBase("Streams")
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        panel.addView(ScrollView(this).apply { addView(list) }, LinearLayout.LayoutParams(-1, 0, 1f))
        for (provider in providers) {
            val row = LinearLayout(this).apply {
                gravity = Gravity.CENTER_VERTICAL; minimumHeight = dp(76); setPadding(dp(8), dp(12), dp(8), dp(12))
                isFocusable = true
                setOnClickListener { requestStreams(provider.optString("id"), provider.optString("label", "Streams")) }
            }
            val image = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_CENTER; setImageResource(R.drawable.rainflix_r) }
            row.addView(image, LinearLayout.LayoutParams(dp(44), dp(44)))
            provider.optString("logo").takeIf { it.isNotBlank() }?.let { loadImage(it, image) }
            row.addView(text(provider.optString("label", "Streams"), 18f), LinearLayout.LayoutParams(0, -2, 1f))
            list.addView(row); divider(list)
        }
    }
    private fun requestStreams(provider: String = "", label: String = "Streams") {
        chosenProvider = provider; requestId = java.util.UUID.randomUUID().toString()
        streams = JSONArray()
        drawerBase(label).addView(text("Finding available streams..."))
        PlayerBridge.event("episode", JSONObject().put("mode", "choose").put("videoId", chosenVideo).put("choiceId", requestId).put("providerId", provider))
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
            else if (chosenProvider.isNotEmpty()) chooseEpisode(chosenVideo)
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
        chosenVideo = ""; chosenProvider = ""; requestId = ""
    }
    private fun episodeDrawer() {
        chosenVideo = ""; chosenProvider = ""; requestId = ""
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
                chooseEpisode(ep.optString("id"))
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
        updateEpisodeNavigation()
        if (args.has("season")) browsedSeason = args.optInt("season")
        drawer?.let { if (chosenVideo.isEmpty()) episodeRows(it, args.optString("status", "ready")) }
    }
    fun updateStreams(args: JSONObject) {
        if (args.optString("requestId") != requestId || args.optString("videoId") != chosenVideo) return
        streams = args.optJSONArray("streams") ?: JSONArray()
        if (streams.length() == 1) { selectStream(streams.getJSONObject(0)); return }
        if (chosenProvider.isNotEmpty()) {
            val label = arrayItems(ui.optJSONArray("providers") ?: JSONArray()).firstOrNull { it.optString("id") == chosenProvider }?.optString("label") ?: "Streams"
            showSources(arrayItems(streams), label)
            return
        }
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
            entry.optString("providerLogo").takeIf { it.startsWith("https://") || it.startsWith("data:image/png;base64,") }?.let { loadImage(it, image) }
            val description = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            description.addView(text(entry.optString("providerLabel", "Streams"), 18f))
            description.addView(text("${entries.size} sources", 13f).apply { setPadding(dp(12), 0, dp(12), 0); setTextColor(0xff94a3b8.toInt()) })
            row.addView(description, LinearLayout.LayoutParams(0, -2, 1f))
            row.setOnClickListener {
                showSources(entries, entries[0].optString("providerLabel", "Streams"))
            }
            list.addView(row); divider(list)
        }
        if (streams.length() == 0) {
            list.addView(text("No streams available"))
            list.addView(button("Retry") { chooseEpisode(chosenVideo) })
        }
    }
    private fun showSources(entries: List<JSONObject>, label: String) {
            val sources = drawerBase(label)
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
            if (entries.isEmpty()) {
                sourceList.addView(text("No streams available"))
                sourceList.addView(button("Retry") { requestStreams(chosenProvider, label) })
            }
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
        val generation = ++subtitleRevision
        images.execute {
            var connection: HttpURLConnection? = null
            val mime = try {
                connection = URL(url).openConnection() as HttpURLConnection
                connection.connectTimeout = 10000; connection.readTimeout = 10000
                val bytes = connection.inputStream.use { input ->
                    val buffer = ByteArray(4096)
                    var count = 0
                    while (count < buffer.size) { val read = input.read(buffer, count, buffer.size - count); if (read < 0) break; count += read }
                    buffer.copyOf(count)
                }
                SubtitleContent.mimeType(bytes)
            } catch (_: Exception) { null } finally { connection?.disconnect() }
            handler.post {
                if (closed || generation != subtitleRevision) return@post
                if (mime == null) { Toast.makeText(this, "This subtitle could not be loaded", Toast.LENGTH_SHORT).show(); return@post }
                externalSub = MediaItem.SubtitleConfiguration.Builder(android.net.Uri.parse(url))
                    .setId("rainflix-sub:${args.optString("id")}")
                    .setMimeType(mime).setLanguage(args.optString("lang", "und")).setLabel(args.optString("label"))
                    .setSelectionFlags(C.SELECTION_FLAG_DEFAULT).build()
                selectedExternalId = args.optString("id")
                savedTracks.put("sub", JSONObject().put("lang", args.optString("lang")).put("label", args.optString("label")).put("title", args.optString("label")).put("off", false))
                preferences(); reloadSource()
            }
        }
    }
    private fun loadImage(url: String, view: ImageView, fallback: String? = null) {
        imageCache.get(url)?.let { view.setImageBitmap(it); return }
        if (url.startsWith("data:image/png;base64,") && url.length < 200000) {
            try {
                val bytes = android.util.Base64.decode(url.substringAfter(','), android.util.Base64.DEFAULT)
                android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.let { imageCache.put(url, it); view.setImageBitmap(it) }
            } catch (_: Exception) { }
            return
        }
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
        PlayerBridge.webView?.get()?.onPause()
        if (!closed && ::player.isInitialized) {
            player.pause()
            PlayerBridge.event("episode", JSONObject().put("mode", "cancel-preload"))
            preloadVideo = ""
        }
    }
    override fun onResume() {
        super.onResume()
        // Keep the catalog bridge active only while RainFlix's own player is foreground.
        PlayerBridge.webView?.get()?.onResume()
    }
    fun close(notify: Boolean) {
        if (closed) return
        if (notify) PlayerBridge.event("closed")
        closed = true; logoPulse?.cancel(); handler.removeCallbacksAndMessages(null); images.shutdownNow()
        if (::player.isInitialized) { surface.player = null; player.release() }
        if (PlayerBridge.activity === this) PlayerBridge.activity = null
        PlayerBridge.restoreOrientation?.invoke(); PlayerBridge.restoreOrientation = null
        finish()
    }
    override fun onDestroy() { close(!complete); super.onDestroy() }
}

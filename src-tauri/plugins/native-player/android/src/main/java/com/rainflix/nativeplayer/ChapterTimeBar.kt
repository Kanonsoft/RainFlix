package com.rainflix.nativeplayer

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.DefaultTimeBar
import androidx.media3.ui.TimeBar

@UnstableApi
class ChapterTimeBar @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : DefaultTimeBar(context, attrs) {
    private val rangePaint = Paint().apply { color = Color.rgb(250, 204, 21) }
    internal var chapterRanges = emptyList<Pair<Long, Long>>()
        private set
    private var timelineDuration = 0L
    private var playbackPosition = 0L
    private var scrubPosition: Long? = null
    private val barHeight: Int
    private val enabledSize: Int
    private val disabledSize: Int
    private val draggedSize: Int

    init {
        val density = resources.displayMetrics.density
        val attributes = context.obtainStyledAttributes(attrs, androidx.media3.ui.R.styleable.DefaultTimeBar)
        try {
            barHeight = attributes.getDimensionPixelSize(androidx.media3.ui.R.styleable.DefaultTimeBar_bar_height, (4 * density + .5f).toInt())
            enabledSize = attributes.getDimensionPixelSize(androidx.media3.ui.R.styleable.DefaultTimeBar_scrubber_enabled_size, (12 * density + .5f).toInt())
            disabledSize = attributes.getDimensionPixelSize(androidx.media3.ui.R.styleable.DefaultTimeBar_scrubber_disabled_size, 0)
            draggedSize = attributes.getDimensionPixelSize(androidx.media3.ui.R.styleable.DefaultTimeBar_scrubber_dragged_size, (16 * density + .5f).toInt())
        } finally { attributes.recycle() }
        addListener(object : TimeBar.OnScrubListener {
            override fun onScrubStart(timeBar: TimeBar, position: Long) { scrubPosition = position; invalidate() }
            override fun onScrubMove(timeBar: TimeBar, position: Long) { scrubPosition = position; invalidate() }
            override fun onScrubStop(timeBar: TimeBar, position: Long, canceled: Boolean) { scrubPosition = null; invalidate() }
        })
    }

    fun setChapterRanges(ranges: List<Pair<Long, Long>>) {
        val valid = ranges.filter { it.first >= 0 && it.second > it.first }
        if (chapterRanges == valid) return
        chapterRanges = valid
        invalidate()
    }

    override fun setDuration(duration: Long) {
        timelineDuration = duration
        super.setDuration(duration)
    }

    override fun setPosition(position: Long) {
        playbackPosition = position
        super.setPosition(position)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (timelineDuration <= 0 || chapterRanges.isEmpty()) return
        // Match the centered DefaultTimeBar geometry used by rainflix_player_controls.xml.
        val inset = (maxOf(enabledSize, disabledSize, draggedSize) + 1) / 2
        val left = (paddingLeft + inset).toFloat()
        val right = (width - paddingRight - inset).toFloat()
        if (right <= left) return
        val top = ((height - barHeight) / 2).toFloat()
        val thumbSize = if (!isEnabled) disabledSize else if (scrubPosition != null || isFocused) draggedSize else enabledSize
        val thumb = left + (right - left) * ((scrubPosition ?: playbackPosition).toDouble() / timelineDuration).coerceIn(0.0, 1.0).toFloat()
        val thumbLeft = thumb - thumbSize / 2f
        val thumbRight = thumb + thumbSize / 2f
        for ((start, end) in chapterRanges) {
            val a = left + (right - left) * (start.toDouble() / timelineDuration).coerceIn(0.0, 1.0).toFloat()
            val b = left + (right - left) * (end.toDouble() / timelineDuration).coerceIn(0.0, 1.0).toFloat()
            // Preserve the stock scrubber above the yellow range, including during touch seeking.
            if (a < minOf(b, thumbLeft)) canvas.drawRect(a, top, minOf(b, thumbLeft), top + barHeight, rangePaint)
            if (maxOf(a, thumbRight) < b) canvas.drawRect(maxOf(a, thumbRight), top, b, top + barHeight, rangePaint)
        }
    }
}

package com.rainflix.nativeplayer

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.view.MotionEvent
import android.view.View
import org.robolectric.RuntimeEnvironment
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], qualifiers = "mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ChapterTimeBarTest {
    private val yellow = Color.rgb(250, 204, 21)
    private fun bar() = ChapterTimeBar(RuntimeEnvironment.getApplication()).apply {
        measure(View.MeasureSpec.makeMeasureSpec(400, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(40, View.MeasureSpec.EXACTLY))
        layout(0, 0, 400, 40)
        setDuration(1000)
        setPosition(500)
        setBufferedPosition(750)
        setChapterRanges(listOf(100L to 300L, 800L to 950L))
    }
    private fun render(bar: ChapterTimeBar) = Bitmap.createBitmap(400, 40, Bitmap.Config.ARGB_8888).apply { bar.draw(Canvas(this)) }

    @Test fun fillsWholeIntervalsRatherThanOnlyTheirEndpoints() {
        val bitmap = render(bar())
        for (x in 50..120) assertEquals("Intro pixel $x", yellow, bitmap.getPixel(x, 20))
        for (x in 320..370) assertEquals("Ending pixel $x", yellow, bitmap.getPixel(x, 20))
        assertNotEquals(yellow, bitmap.getPixel(30, 20))
        assertNotEquals(yellow, bitmap.getPixel(250, 20))
        assertNotEquals(yellow, bitmap.getPixel(385, 20))
        assertNotEquals(yellow, bitmap.getPixel(90, 15))
    }
    @Test fun keepsSeekHandleVisibleWhenPlayingAndScrubbingInsideAnIntro() {
        val bar = bar()
        bar.setPosition(200)
        assertEquals(Color.WHITE, render(bar).getPixel(85, 20))
        val down = MotionEvent.obtain(0, 0, MotionEvent.ACTION_DOWN, 100f, 20f, 0)
        try {
            assertTrue(bar.onTouchEvent(down))
            assertEquals(Color.WHITE, render(bar).getPixel(100, 20))
            assertEquals(yellow, render(bar).getPixel(60, 20))
        } finally {
            down.recycle()
            val up = MotionEvent.obtain(0, 1, MotionEvent.ACTION_UP, 100f, 20f, 0)
            bar.onTouchEvent(up); up.recycle()
        }
    }
    @Test fun clearsRangesAndHandlesUnknownDuration() {
        val bar = bar()
        bar.setChapterRanges(emptyList())
        assertNotEquals(yellow, render(bar).getPixel(90, 20))
        bar.setChapterRanges(listOf(100L to 300L))
        bar.setDuration(0)
        assertNotEquals(yellow, render(bar).getPixel(90, 20))
    }
}

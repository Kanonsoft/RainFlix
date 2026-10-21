package com.rainflix.nativeplayer

import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowAlertDialog

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], qualifiers = "w900dp-h400dp-land")
class PlayerUiTest {
    @Test fun episodeHandoffReusesActivityAndResetsCompletion() {
        PlayerBridge.session = JSONObject().put("sessionId", "first").put("ui", JSONObject().put("title", "First episode"))
        val controller = Robolectric.buildActivity(PlayerActivity::class.java).create().start().resume().visible()
        val activity = controller.get()
        try {
            val complete = PlayerActivity::class.java.getDeclaredField("complete").apply { isAccessible = true }
            complete.setBoolean(activity, true)
            activity.updateNavigation(JSONObject().put("status", "loading").put("videoId", "next"))
            val backdrop = PlayerActivity::class.java.getDeclaredField("backdrop").apply { isAccessible = true }.get(activity) as View
            assertEquals(View.VISIBLE, backdrop.visibility)
            val next = JSONObject().put("sessionId", "second").put("ui", JSONObject().put("title", "S2 E1: Next episode").put("season", 2))
            PlayerBridge.session = next
            activity.replaceSession(next)
            assertSame(activity, PlayerBridge.activity)
            assertFalse(activity.isFinishing)
            assertFalse(complete.getBoolean(activity))
            assertNotNull(findText(activity.window.decorView, "S2 E1: Next episode"))
        } finally { controller.pause().stop().destroy(); PlayerBridge.session = null; PlayerBridge.emit = null }
    }
    @Test fun unknownDurationNeverOffersAnUnsafeSkip() {
        PlayerBridge.session = JSONObject().put("sessionId", "skip-test").put("ui", JSONObject())
        val controller = Robolectric.buildActivity(PlayerActivity::class.java).create().start().resume().visible()
        val activity = controller.get()
        try {
            PlayerActivity::class.java.getDeclaredField("ready").apply { isAccessible = true }.setBoolean(activity, true)
            @Suppress("UNCHECKED_CAST")
            val chapters = PlayerActivity::class.java.getDeclaredField("chapters").apply { isAccessible = true }.get(activity) as MutableList<Triple<String, Long, Long>>
            chapters.add(Triple("Opening", 0L, 60000L))
            val update = PlayerActivity::class.java.getDeclaredMethod("updatePlaybackActions").apply { isAccessible = true }
            val button = PlayerActivity::class.java.getDeclaredField("skipButton").apply { isAccessible = true }.get(activity) as View
            update.invoke(activity)
            assertEquals(View.GONE, button.visibility)
        } finally { controller.pause().stop().destroy(); PlayerBridge.session = null; PlayerBridge.emit = null }
    }
    @Test fun rejectsWholeEpisodeAndMisplacedIntroOutroMetadata() {
        val duration = 1440000L
        assertTrue(ChapterSkipGuard.isSafe("Opening", 0, 90000, duration))
        assertTrue(ChapterSkipGuard.isSafe("Ending", 1320000, duration, duration))
        assertFalse(ChapterSkipGuard.isSafe("Opening", 0, duration, duration))
        assertFalse(ChapterSkipGuard.isSafe("Ending", 0, duration, duration))
        assertFalse(ChapterSkipGuard.isSafe("Opening", 800000, 890000, duration))
        assertFalse(ChapterSkipGuard.isSafe("Opening", 0, 90000, -1))
        assertFalse(ChapterSkipGuard.isSafe("Ending", 1320000, duration + 1, duration))
        for (name in listOf("Recap", "Opening / Recap", "Opening scene", "Previously - OP", "ED / Next episode preview", "End of recap", "Credits - Story", "OP + ED")) {
            assertNull("Ambiguous chapter: $name", ChapterSkipGuard.kind(name))
            assertFalse(ChapterSkipGuard.isSafe(name, 0, 90000, duration))
        }
        assertFalse(ChapterSkipGuard.isSafe("Opening", 240000, 420000, duration))
        assertFalse(ChapterSkipGuard.isSafe("Intro", 0, 240000, duration))
        assertTrue(ChapterSkipGuard.isSafe("OP2", 60000, 150000, duration))
        assertTrue(ChapterSkipGuard.isSafe("End Credits", 1320000, duration, duration))
    }
    @Test fun yellowTimelineRangesUseOnlySafeIntroAndEndingIntervals() {
        PlayerBridge.session = JSONObject().put("sessionId", "marker-test").put("ui", JSONObject())
        val controller = Robolectric.buildActivity(PlayerActivity::class.java).create().start().resume().visible()
        val activity = controller.get()
        try {
            val timeBar = activity.findViewById<ChapterTimeBar>(androidx.media3.ui.R.id.exo_progress)
            assertNotNull(timeBar)
            @Suppress("UNCHECKED_CAST")
            val chapters = PlayerActivity::class.java.getDeclaredField("chapters").apply { isAccessible = true }.get(activity) as MutableList<Triple<String, Long, Long>>
            chapters.addAll(listOf(Triple("Recap", 0L, 60000L), Triple("OP2", 60000L, 150000L), Triple("Story", 150000L, 1320000L), Triple("End Credits", 1320000L, 1440000L)))
            val update = PlayerActivity::class.java.getDeclaredMethod("updateChapterRanges", Long::class.javaPrimitiveType).apply { isAccessible = true }
            update.invoke(activity, 1440000L)
            assertEquals(listOf(60000L to 150000L, 1320000L to 1440000L), timeBar.chapterRanges)
            chapters.clear()
            update.invoke(activity, 1440000L)
            assertTrue(timeBar.chapterRanges.isEmpty())
        } finally { controller.pause().stop().destroy(); PlayerBridge.session = null; PlayerBridge.emit = null }
    }
    private fun findText(view: View, value: String): TextView? {
        if (view is TextView && view.text.toString() == value) return view
        if (view is ViewGroup) for (index in 0 until view.childCount) {
            findText(view.getChildAt(index), value)?.let { return it }
        }
        return null
    }
    @Test fun episodePickerRequestsOnlyTheExplicitProvider() {
        val events = mutableListOf<JSONObject>()
        PlayerBridge.emit = { events.add(JSONObject(it.toString())) }
        PlayerBridge.session = JSONObject().put("sessionId", "provider-test").put("ui", JSONObject()
            .put("providers", JSONArray().put(JSONObject().put("id", "provider-a").put("label", "Provider A"))))
        val controller = Robolectric.buildActivity(PlayerActivity::class.java).create().start().resume().visible()
        val activity = controller.get()
        try {
            PlayerActivity::class.java.getDeclaredMethod("chooseEpisode", String::class.java).apply { isAccessible = true }.invoke(activity, "tt123:2:1")
            assertTrue(events.none { it.optString("mode") == "choose" })
            val root = activity.window.decorView
            val label = findText(root, "Provider A")!!
            (label.parent as View).performClick()
            val request = events.single { it.optString("mode") == "choose" }
            assertEquals("provider-a", request.optString("providerId"))
            assertEquals("tt123:2:1", request.optString("videoId"))
            activity.updateStreams(JSONObject().put("requestId", request.optString("choiceId")).put("videoId", "tt123:2:1")
                .put("streams", JSONArray().put(JSONObject().put("id", "0").put("providerId", "provider-a"))))
            assertEquals("0", events.single { it.optString("mode") == "source" }.optString("choiceId"))
        } finally {
            controller.pause().stop().destroy()
            PlayerBridge.session = null; PlayerBridge.emit = null
        }
    }
    private fun labels(view: View): List<String> = when (view) {
        is TextView -> listOf(view.text.toString())
        is ViewGroup -> (0 until view.childCount).flatMap { labels(view.getChildAt(it)) }
        else -> emptyList()
    }
    @Test fun compactPanelsAndEpisodeActionsUseTheSameNeighbors() {
        val events = mutableListOf<JSONObject>()
        PlayerBridge.emit = { events.add(JSONObject(it.toString())) }
        val episodes = JSONArray((1..3).map { index -> JSONObject().put("id", "test:1:$index").put("season", 1).put("episode", index).put("title", "Episode $index") })
        episodes.put(JSONObject().put("id", "test:1:4").put("season", 1).put("episode", 4).put("date", "2999-01-01"))
        PlayerBridge.session = JSONObject().put("sessionId", "ui-test").put("ui", JSONObject()
            .put("title", "Test title").put("currentVideoId", "test:1:2").put("season", 1).put("episodes", episodes))
        val controller = Robolectric.buildActivity(PlayerActivity::class.java).create().start().resume().visible()
        val activity = controller.get()
        try {
            activity.findViewById<View>(R.id.rainflix_next).performClick()
            activity.findViewById<View>(R.id.rainflix_previous).performClick()
            val card = PlayerActivity::class.java.getDeclaredField("nextCard").apply { isAccessible = true }.get(activity) as View
            assertTrue(card.isClickable)
            card.performClick()
            assertEquals(listOf("test:1:3", "test:1:1", "test:1:3"), events.filter { it.optString("kind") == "episode" && it.optString("mode") in listOf("next", "prev") }.map { it.optString("videoId") })
            activity.findViewById<View>(R.id.rainflix_subtitles).performClick()
            var dialog = ShadowAlertDialog.getLatestAlertDialog()
            val density = activity.resources.displayMetrics.density
            assertTrue(dialog.window!!.attributes.width <= (330 * density).toInt())
            val text = labels(dialog.window!!.decorView)
            assertEquals(1, text.count { it == "Subtitle settings" })
            assertFalse(text.contains("Subtitle appearance"))
            dialog.dismiss()
            activity.findViewById<View>(R.id.rainflix_settings).performClick()
            dialog = ShadowAlertDialog.getLatestAlertDialog()
            val playbackLabels = labels(dialog.window!!.decorView)
            assertTrue(playbackLabels.contains("Auto-skip intro"))
            assertTrue(playbackLabels.contains("Auto-skip outro"))
            assertFalse(playbackLabels.contains("Next episode preview"))
            assertFalse(playbackLabels.contains("Preload next episode"))
            (findText(dialog.window!!.decorView, "Auto-skip intro") as android.widget.Switch).isChecked = true
            (findText(dialog.window!!.decorView, "Auto-skip outro") as android.widget.Switch).isChecked = true
            val settings = events.filter { it.optString("kind") == "settings" }.map { it.getJSONObject("settings") }
            assertTrue(settings.any { it.optBoolean("skipIntro") })
            assertTrue(settings.any { it.optBoolean("skipOutro") })
            dialog.dismiss()
            activity.findViewById<View>(R.id.rainflix_speed).performClick()
            dialog = ShadowAlertDialog.getLatestAlertDialog()
            assertTrue(dialog.window!!.attributes.width <= (260 * density).toInt())
            assertTrue(labels(dialog.window!!.decorView).contains("1.0x"))
            dialog.dismiss()
        } finally {
            controller.pause().stop().destroy()
            PlayerBridge.session = null; PlayerBridge.emit = null
        }
    }
}

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
    @Test fun skipPromptExpiresAndReturnsWithControls() {
        PlayerBridge.session = JSONObject().put("sessionId", "skip-test").put("ui", JSONObject())
        val controller = Robolectric.buildActivity(PlayerActivity::class.java).create().start().resume().visible()
        val activity = controller.get()
        try {
            PlayerActivity::class.java.getDeclaredField("ready").apply { isAccessible = true }.setBoolean(activity, true)
            @Suppress("UNCHECKED_CAST")
            val chapters = PlayerActivity::class.java.getDeclaredField("chapters").apply { isAccessible = true }.get(activity) as MutableList<Triple<String, Long, Long>>
            chapters.add(Triple("Opening", 0L, 60000L))
            val update = PlayerActivity::class.java.getDeclaredMethod("updatePlaybackActions").apply { isAccessible = true }
            val reveal = PlayerActivity::class.java.getDeclaredMethod("revealSkipPrompt").apply { isAccessible = true }
            val button = PlayerActivity::class.java.getDeclaredField("skipButton").apply { isAccessible = true }.get(activity) as View
            update.invoke(activity)
            assertEquals(View.VISIBLE, button.visibility)
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(3100))
            update.invoke(activity)
            assertEquals(View.GONE, button.visibility)
            reveal.invoke(activity)
            assertEquals(View.VISIBLE, button.visibility)
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(3100))
            assertEquals(View.GONE, button.visibility)
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

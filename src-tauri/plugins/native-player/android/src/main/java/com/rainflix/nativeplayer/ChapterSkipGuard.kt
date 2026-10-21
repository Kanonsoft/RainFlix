package com.rainflix.nativeplayer

internal object ChapterSkipGuard {
    fun kind(title: String): String? {
        val words = title.lowercase(java.util.Locale.ROOT).split(Regex("[^a-z0-9]+")).filter { it.isNotEmpty() }
        // Narrative segments must never inherit an intro/outro auto-skip setting.
        if (words.any { it in setOf("recap", "previously", "previous", "preview", "next", "teaser", "prologue", "epilogue", "scene", "story") }) return null
        val intro = words.any { it == "intro" || it == "opening" || it.matches(Regex("op\\d*")) }
        val outro = words.any { it in setOf("ending", "outro", "closing") || it.matches(Regex("ed\\d*")) } || words == listOf("end") || words == listOf("credits") || words == listOf("end", "credits")
        return if (intro == outro) null else if (intro) "intro" else "outro"
    }
    fun isSafe(title: String, start: Long, end: Long, duration: Long): Boolean {
        val kind = kind(title) ?: return false
        if (duration <= 0 || start < 0 || end <= start || end > duration) return false
        val length = end - start
        if (length > minOf(if (kind == "outro") 300000L else 180000L, duration / 4)) return false
        return if (kind == "outro") start >= duration * .65 else start <= minOf(300000L, duration / 4) && end <= minOf(360000L, duration * 3 / 10) && end < duration - minOf(30000L, duration / 20)
    }
}

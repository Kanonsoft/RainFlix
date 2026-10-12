package com.rainflix.nativeplayer

internal object ChapterSkipGuard {
    fun isSafe(title: String, start: Long, end: Long, duration: Long): Boolean {
        if (duration <= 0 || start < 0 || end <= start || end > duration) return false
        val length = end - start
        if (length > minOf(300000L, duration / 4)) return false
        val ending = Regex("(?i)\\b(outro|ending|end|credits|ed\\d*)\\b").containsMatchIn(title)
        return if (ending) start >= duration * .65 else start <= minOf(300000L, duration / 4) && end < duration - minOf(30000L, duration / 20)
    }
}

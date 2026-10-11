package com.rainflix.nativeplayer

import androidx.media3.common.MimeTypes

object SubtitleContent {
    fun mimeType(bytes: ByteArray): String? {
        val text = bytes.toString(Charsets.UTF_8).trimStart('\uFEFF', ' ', '\r', '\n', '\t')
        return when {
            text.startsWith("WEBVTT") -> MimeTypes.TEXT_VTT
            text.contains("[Script Info]", true) || text.contains("[Events]", true) -> MimeTypes.TEXT_SSA
            Regex("\\d{1,2}:\\d{2}:\\d{2}[,.]\\d{3}\\s*-->").containsMatchIn(text) -> MimeTypes.APPLICATION_SUBRIP
            else -> null
        }
    }
}

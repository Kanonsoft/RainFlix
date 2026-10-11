package com.rainflix.nativeplayer

import java.io.ByteArrayOutputStream
import java.util.zip.DataFormatException
import java.util.zip.Inflater

object MatroskaSubtitleCompression {
    fun isCompressedAss(data: ByteArray, offset: Int, length: Int) = payloadOffset(data, offset, length) != null

    private fun payloadOffset(data: ByteArray, offset: Int, length: Int): Int? {
        if (length < 32 || String(data, offset, 10, Charsets.US_ASCII) != "Dialogue: ") return null
        var commas = 0
        var payload = offset
        while (payload < offset + minOf(length, 64)) {
            if (data[payload++] == ','.code.toByte() && ++commas == 2) break
        }
        if (commas != 2 || payload + 2 > offset + length) return null
        val header = (data[payload].toInt() and 255) * 256 + (data[payload + 1].toInt() and 255)
        if ((header shr 8) and 15 != 8 || header % 31 != 0) return null
        if (data[payload + 1].toInt() and 32 != 0) return null
        return payload
    }

    fun decodeAss(data: ByteArray, offset: Int, length: Int): ByteArray? {
        val payload = payloadOffset(data, offset, length) ?: return null
        // The extractor can strip a NUL ending the deflate stream or its checksum as text padding.
        // Decode the complete raw deflate stream after its validated zlib header instead.
        val inflater = Inflater(true)
        return try {
            inflater.setInput(data.copyOfRange(payload + 2, offset + length) + byteArrayOf(0))
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(4096)
            while (!inflater.finished()) {
                val count = inflater.inflate(buffer)
                if (count == 0 || output.size() + count > 1024 * 1024) return null
                output.write(buffer, 0, count)
            }
            // Keep the extractor's sample-relative timestamps and restore only the ASS fields.
            data.copyOfRange(offset, payload) + output.toByteArray()
        } catch (_: DataFormatException) {
            null
        } finally {
            inflater.end()
        }
    }
}

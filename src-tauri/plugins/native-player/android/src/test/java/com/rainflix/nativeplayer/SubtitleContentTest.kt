package com.rainflix.nativeplayer

import androidx.media3.common.Format
import androidx.media3.common.MimeTypes
import androidx.media3.extractor.text.CuesWithTiming
import androidx.media3.extractor.text.SubtitleParser
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.zip.Deflater

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class SubtitleContentTest {
    @Test fun decompressesAssPacketsAndPreservesPlainPackets() {
        val payload = "0,0,Default,,0,0,0,,Hello".toByteArray()
        val compressor = Deflater()
        val compressed = try {
            compressor.setInput(payload); compressor.finish()
            val buffer = ByteArray(1024)
            buffer.copyOf(compressor.deflate(buffer))
        } finally { compressor.end() }
        val prefix = "Dialogue: 0:00:00:00,0:00:02:00,".toByteArray()
        val packet = prefix + compressed
        assertArrayEquals(prefix + payload, MatroskaSubtitleCompression.decodeAss(packet, 0, packet.size))
        val strippedChecksum = prefix + compressed.copyOf(compressed.size - 4)
        assertArrayEquals(prefix + payload, MatroskaSubtitleCompression.decodeAss(strippedChecksum, 0, strippedChecksum.size))
        val nulTrimmed = prefix + compressed.takeWhile { it != 0.toByte() }.toByteArray()
        assertArrayEquals(prefix + payload, MatroskaSubtitleCompression.decodeAss(nulTrimmed, 0, nulTrimmed.size))
        val plain = prefix + payload
        assertNull(MatroskaSubtitleCompression.decodeAss(plain, 0, plain.size))
        assertNull(MatroskaSubtitleCompression.decodeAss(prefix + compressed.copyOf(3), 0, prefix.size + 3))
        val parser = DelayedSubtitleParserFactory { 0L }.create(Format.Builder()
            .setSampleMimeType(MimeTypes.TEXT_SSA).setInitializationData(listOf(
                "Format: Start, End, ReadOrder, Layer, Style, Name, MarginL, MarginR, MarginV, Effect, Text".toByteArray(),
                "[Script Info]\nPlayResX: 1920\nPlayResY: 1080\n".toByteArray())).build())
        val cues = mutableListOf<CuesWithTiming>()
        parser.parse(packet, SubtitleParser.OutputOptions.allCues()) { cues.add(it) }
        assertEquals("Hello", cues.first { it.cues.isNotEmpty() }.cues.first().text.toString())
    }
    @Test fun detectsSubtitleContentWithoutFilename() {
        assertEquals(MimeTypes.APPLICATION_SUBRIP, SubtitleContent.mimeType("\uFEFF1\n00:00:01,000 --> 00:00:03,000\nHello".toByteArray()))
        assertEquals(MimeTypes.TEXT_VTT, SubtitleContent.mimeType("WEBVTT\n\n00:01.000 --> 00:03.000\nHello".toByteArray()))
        assertEquals(MimeTypes.TEXT_SSA, SubtitleContent.mimeType("[Script Info]\nTitle: Test\n[Events]".toByteArray()))
        assertNull(SubtitleContent.mimeType("<html>Unavailable</html>".toByteArray()))
        assertNull(SubtitleContent.mimeType(byteArrayOf(0x50, 0x4b, 0x03, 0x04)))
    }

    @Test fun shiftsSubtitleTimingWithoutChangingTextOrDuration() {
        for (delay in listOf(500000L, -500000L, 0L)) {
            val parser = DelayedSubtitleParserFactory { delay }.create(Format.Builder().setSampleMimeType(MimeTypes.APPLICATION_SUBRIP).build())
            val cues = mutableListOf<CuesWithTiming>()
            parser.parse("1\n00:00:01,000 --> 00:00:03,000\nHello\n\n".toByteArray(), SubtitleParser.OutputOptions.allCues()) { cues.add(it) }
            val result = cues.first { it.cues.isNotEmpty() }
            assertEquals(1000000L + delay, result.startTimeUs)
            assertEquals(2000000L, result.durationUs)
            assertEquals("Hello", result.cues.first().text.toString())
        }
    }
}

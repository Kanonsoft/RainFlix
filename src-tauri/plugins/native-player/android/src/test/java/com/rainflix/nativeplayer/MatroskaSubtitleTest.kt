package com.rainflix.nativeplayer

import android.net.Uri
import androidx.media3.common.Format
import androidx.media3.common.util.ParsableByteArray
import androidx.media3.datasource.ByteArrayDataSource
import androidx.media3.common.DataReader
import androidx.media3.datasource.DataSpec
import androidx.media3.extractor.DefaultExtractorInput
import androidx.media3.extractor.Extractor
import androidx.media3.extractor.ExtractorOutput
import androidx.media3.extractor.PositionHolder
import androidx.media3.extractor.SeekMap
import androidx.media3.extractor.TrackOutput
import androidx.media3.extractor.mkv.RainFlixMatroskaExtractor
import androidx.media3.extractor.text.CuesWithTiming
import androidx.media3.extractor.text.SubtitleParser
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.util.zip.Deflater

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class MatroskaSubtitleTest {
    private fun element(id: String, data: ByteArray): ByteArray {
        val key = id.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val size = data.size
        val length = if (size < 127) byteArrayOf((0x80 or size).toByte())
            else byteArrayOf((0x40 or (size shr 8)).toByte(), size.toByte())
        return key + length + data
    }
    private fun number(id: String, value: Int): ByteArray {
        val bytes = when {
            value <= 255 -> byteArrayOf(value.toByte())
            value <= 65535 -> byteArrayOf((value shr 8).toByte(), value.toByte())
            else -> byteArrayOf((value shr 16).toByte(), (value shr 8).toByte(), value.toByte())
        }
        return element(id, bytes)
    }
    @Test fun preservesEveryCompressedDialogueIncludingInteriorZeroBytes() {
        val cues = mutableListOf<CuesWithTiming>()
        val delegate = DelayedSubtitleParserFactory { 0L }
        val factory = object : SubtitleParser.Factory {
            override fun supportsFormat(format: Format) = delegate.supportsFormat(format)
            override fun getCueReplacementBehavior(format: Format) = delegate.getCueReplacementBehavior(format)
            override fun create(format: Format): SubtitleParser {
                val parser = delegate.create(format)
                return object : SubtitleParser {
                    override fun getCueReplacementBehavior() = parser.cueReplacementBehavior
                    override fun parse(data: ByteArray, offset: Int, length: Int, options: SubtitleParser.OutputOptions, output: androidx.media3.common.util.Consumer<CuesWithTiming>) {
                        parser.parse(data, offset, length, options) { cues.add(it); output.accept(it) }
                    }
                }
            }
        }
        val header = "[Script Info]\nScriptType: v4.00+\nPlayResX: 320\nPlayResY: 180\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n".toByteArray()
        val encoding = element("6D80", element("6240", number("5032", 1) + element("5034", number("4254", 0))))
        val tracks = element("1654AE6B", element("AE", number("D7", 1) + number("73C5", 1) + number("83", 17)
            + element("86", "S_TEXT/ASS".toByteArray()) + element("63A2", header) + encoding))
        val lines = listOf("First line", "Second line", "Third line")
        val blocks = lines.mapIndexed { index, line ->
            val compressor = Deflater(Deflater.NO_COMPRESSION)
            val payload = "$index,0,Default,,0,0,0,,$line".toByteArray()
            val compressed = try {
                compressor.setInput(payload); compressor.finish()
                val buffer = ByteArray(1024)
                buffer.copyOf(compressor.deflate(buffer))
            } finally { compressor.end() }
            assertTrue(compressed.drop(2).any { it == 0.toByte() })
            val time = index * 2000
            element("A0", element("A1", byteArrayOf(0x81.toByte(), (time shr 8).toByte(), time.toByte(), 0) + compressed) + number("9B", 1800))
        }.fold(ByteArray(0)) { all, block -> all + block }
        val bytes = element("1A45DFA3", number("42F7", 1) + element("4282", "matroska".toByteArray()) + number("4285", 2)) +
            element("18538067", element("1549A966", number("2AD7B1", 1000000)) + tracks + element("1F43B675", number("E7", 0) + blocks))
        val reader = ByteArrayDataSource(bytes)
        reader.open(DataSpec(Uri.EMPTY))
        val input = DefaultExtractorInput(reader, 0, bytes.size.toLong())
        val extractor = RainFlixMatroskaExtractor(factory)
        extractor.init(object : ExtractorOutput {
            override fun track(id: Int, type: Int): TrackOutput = object : TrackOutput {
                override fun format(format: Format) {}
                override fun sampleData(input: DataReader, length: Int, allowEndOfInput: Boolean, part: Int) = input.read(ByteArray(length), 0, length)
                override fun sampleData(data: ParsableByteArray, length: Int, part: Int) { data.skipBytes(length) }
                override fun sampleMetadata(timeUs: Long, flags: Int, size: Int, offset: Int, crypto: TrackOutput.CryptoData?) {}
            }
            override fun endTracks() {}
            override fun seekMap(seekMap: SeekMap) {}
        })
        try {
            var result = Extractor.RESULT_CONTINUE
            var reads = 0
            while (result == Extractor.RESULT_CONTINUE && reads++ < 100) result = extractor.read(input, PositionHolder())
            assertEquals(Extractor.RESULT_END_OF_INPUT, result)
            assertEquals(lines, cues.flatMap { it.cues }.map { it.text.toString() })
            // Generated local fixture also exercises the bundled Windows decoder.
            File("build/compressed-subtitles.mks").apply { parentFile.mkdirs(); writeBytes(bytes) }
        } finally { reader.close(); extractor.release() }
    }
}

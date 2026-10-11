package com.rainflix.nativeplayer

import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.Consumer
import androidx.media3.common.util.UnstableApi
import androidx.media3.extractor.text.CuesWithTiming
import androidx.media3.extractor.text.DefaultSubtitleParserFactory
import androidx.media3.extractor.text.SubtitleParser

@UnstableApi
class DelayedSubtitleParserFactory(private val delayUs: () -> Long) : SubtitleParser.Factory {
    private val delegate = DefaultSubtitleParserFactory()
    override fun supportsFormat(format: Format) = delegate.supportsFormat(format)
    override fun getCueReplacementBehavior(format: Format) = delegate.getCueReplacementBehavior(format)
    override fun create(format: Format): SubtitleParser {
        val parser = delegate.create(format)
        return object : SubtitleParser {
            override fun getCueReplacementBehavior() = parser.cueReplacementBehavior
            override fun reset() = parser.reset()
            override fun parse(data: ByteArray, offset: Int, length: Int, outputOptions: SubtitleParser.OutputOptions, output: Consumer<CuesWithTiming>) {
                // TIME_UNSET means the cue starts at its container sample timestamp.
                val delay = delayUs()
                val options = if (outputOptions.startTimeUs == C.TIME_UNSET) outputOptions else if (outputOptions.outputAllCues)
                    SubtitleParser.OutputOptions.cuesAfterThenRemainingCuesBefore(outputOptions.startTimeUs - delay)
                else SubtitleParser.OutputOptions.onlyCuesAfter(outputOptions.startTimeUs - delay)
                val decoded = if (format.sampleMimeType == MimeTypes.TEXT_SSA && format.initializationData.isNotEmpty())
                    MatroskaSubtitleCompression.decodeAss(data, offset, length) else null
                parser.parse(decoded ?: data, if (decoded == null) offset else 0, decoded?.size ?: length, options) { cues ->
                    val start = if (cues.startTimeUs == C.TIME_UNSET) delay else cues.startTimeUs + delay
                    output.accept(CuesWithTiming(cues.cues, start, cues.durationUs))
                }
            }
        }
    }
}

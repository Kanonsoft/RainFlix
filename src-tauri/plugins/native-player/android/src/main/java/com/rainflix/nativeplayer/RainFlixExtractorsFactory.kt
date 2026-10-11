package com.rainflix.nativeplayer

import android.net.Uri
import androidx.media3.common.util.UnstableApi
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.Extractor
import androidx.media3.extractor.ExtractorsFactory
import androidx.media3.extractor.mkv.MatroskaExtractor
import androidx.media3.extractor.mkv.RainFlixMatroskaExtractor
import androidx.media3.extractor.text.SubtitleParser

@UnstableApi
class RainFlixExtractorsFactory(private var subtitles: SubtitleParser.Factory) : ExtractorsFactory {
    private val delegate = DefaultExtractorsFactory().setSubtitleParserFactory(subtitles)
    private fun preserveCompressedSubtitles(extractors: Array<Extractor>) = extractors.map {
        if (it is MatroskaExtractor) RainFlixMatroskaExtractor(subtitles) else it
    }.toTypedArray()
    override fun createExtractors() = preserveCompressedSubtitles(delegate.createExtractors())
    override fun createExtractors(uri: Uri, responseHeaders: Map<String, List<String>>) =
        preserveCompressedSubtitles(delegate.createExtractors(uri, responseHeaders))
    override fun setSubtitleParserFactory(subtitleParserFactory: SubtitleParser.Factory): ExtractorsFactory {
        subtitles = subtitleParserFactory
        delegate.setSubtitleParserFactory(subtitleParserFactory)
        return this
    }
}

# RainFlix - Chapter Markers and Mobile Performance

- Continuous yellow timeline segments span the complete intro and ending chapters on Windows and Android, with the seek handle kept visible above them.
- More conservative skip matching excludes recaps, previews, narrative scenes and ambiguous labels. Invalid or oversized chapter ranges never qualify for skipping.
- Startup waits for one cached artwork snapshot instead of swapping poster walls while loading.
- Hidden startup artwork and animations are removed after loading finishes.
- Smoother mobile browsing with simpler hero fades, isolated dynamic backgrounds and fewer live blur effects while scrolling.

Skip timings still depend on source metadata; RainFlix does not estimate missing intro/outro chapters.

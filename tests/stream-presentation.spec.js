import { test, expect } from "@playwright/test";
import { streamPresentation } from "../src/lib/stream-presentation.js";

test("stream headings separate metadata without dropping release details", () => {
  const details = "Example.S01E01.1080p.HEVC.mkv 2.4 GB 120 seeders";
  expect(streamPresentation(`Torrentio 1080p - ${details}`)).toEqual({
    heading: "Torrentio 1080p",
    details,
    badges: ["1080p", "HEVC", "2.4 GB", "120 peers"],
  });
  expect(streamPresentation("Direct video")).toEqual({
    heading: "Direct video",
    details: "",
    badges: [],
  });
  expect(streamPresentation().heading).toBe("Stream");
  expect(streamPresentation("1080p - 2 GB \u{1F464} 42").badges).toEqual([
    "1080p",
    "2 GB",
    "42 peers",
  ]);
  expect(streamPresentation("720p - 900 MB", { peers: 0 }).badges).toEqual([
    "720p",
    "900 MB",
    "0 peers",
  ]);
});

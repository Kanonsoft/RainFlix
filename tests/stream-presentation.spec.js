import { test, expect } from "@playwright/test";
import { streamPresentation } from "../src/lib/stream-presentation.js";

test("stream headings separate metadata without dropping release details", () => {
  const details = "Example.S01E01.1080p.HEVC.mkv 2.4 GB 120 seeders";
  expect(streamPresentation(`Torrentio 1080p - ${details}`)).toEqual({
    heading: "Torrentio 1080p",
    details,
    badges: ["1080p", "HEVC", "2.4 GB"],
  });
  expect(streamPresentation("Direct video")).toEqual({
    heading: "Direct video",
    details: "",
    badges: [],
  });
  expect(streamPresentation().heading).toBe("Stream");
});

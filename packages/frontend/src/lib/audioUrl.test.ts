import { describe, it, expect } from "vitest";
import { isAudioUrl, parseAudioSize } from "./audioUrl";

describe("isAudioUrl", () => {
  it("returns true for common audio extensions", () => {
    expect(isAudioUrl("track.mp3")).toBe(true);
    expect(isAudioUrl("track.wav")).toBe(true);
    expect(isAudioUrl("track.flac")).toBe(true);
    expect(isAudioUrl("track.ogg")).toBe(true);
    expect(isAudioUrl("track.oga")).toBe(true);
    expect(isAudioUrl("track.m4a")).toBe(true);
    expect(isAudioUrl("track.aac")).toBe(true);
    expect(isAudioUrl("track.opus")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAudioUrl("Track.MP3")).toBe(true);
    expect(isAudioUrl("song.FLAC")).toBe(true);
  });

  it("returns false for images and other types", () => {
    expect(isAudioUrl("photo.png")).toBe(false);
    expect(isAudioUrl("doc.pdf")).toBe(false);
    expect(isAudioUrl("clip.mp4")).toBe(false);
    expect(isAudioUrl("notes.txt")).toBe(false);
  });

  it("returns false for empty/missing inputs", () => {
    expect(isAudioUrl("")).toBe(false);
    expect(isAudioUrl(undefined)).toBe(false);
    expect(isAudioUrl(null)).toBe(false);
  });

  it("ignores query strings and fragments", () => {
    expect(isAudioUrl("track.mp3?v=2")).toBe(true);
    expect(isAudioUrl("track.flac#t=10")).toBe(true);
    expect(isAudioUrl("/api/files/abc.mp3?projectId=x")).toBe(true);
  });

  it("handles full URLs", () => {
    expect(isAudioUrl("https://example.com/path/song.mp3")).toBe(true);
    expect(isAudioUrl("https://example.com/song")).toBe(false);
  });
});

describe("parseAudioSize", () => {
  it("returns 'small' for 'small'", () => {
    expect(parseAudioSize("small")).toBe("small");
  });

  it("defaults to 'full' for anything else", () => {
    expect(parseAudioSize("full")).toBe("full");
    expect(parseAudioSize(undefined)).toBe("full");
    expect(parseAudioSize(null)).toBe("full");
    expect(parseAudioSize("")).toBe("full");
    expect(parseAudioSize("jumbo")).toBe("full");
  });
});

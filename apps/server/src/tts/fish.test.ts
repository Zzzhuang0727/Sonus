import { describe, expect, it } from "vitest";
import { ttsCacheName } from "./fish";

describe("ttsCacheName", () => {
  it("is stable and mp3-shaped", () => {
    expect(ttsCacheName("今晚慢慢听", "voice-a")).toBe(ttsCacheName("今晚慢慢听", "voice-a"));
    expect(ttsCacheName("今晚慢慢听", "voice-a")).toMatch(/^[a-f0-9]{24}\.mp3$/);
  });
});

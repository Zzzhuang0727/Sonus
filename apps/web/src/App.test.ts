import { describe, expect, it } from "vitest";
import { getCurrentLyricIndex, parseLyric } from "./App";

describe("Sonus web app", () => {
  it("has a test harness", () => {
    expect("Sonus").toContain("Sonus");
  });

  it("parses timed lyrics and finds the active line", () => {
    const lines = parseLyric("[00:01.00]first line\n[00:03.50]second line\nplain line");

    expect(lines).toEqual([
      { id: "0-0-first line", time: 1, text: "first line" },
      { id: "1-0-second line", time: 3.5, text: "second line" },
      { id: "plain-2", time: undefined, text: "plain line" }
    ]);
    expect(getCurrentLyricIndex(lines, 0)).toBe(0);
    expect(getCurrentLyricIndex(lines, 3.6)).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { SonusPlanSchema } from "./index";

describe("SonusPlanSchema", () => {
  it("accepts a valid daily plan", () => {
    const plan = SonusPlanSchema.parse({
      id: "plan-1",
      date: "2026-05-23",
      theme: "Gentle Night Flight",
      opening: "We will begin softly.",
      blocks: [
        {
          title: "Opening",
          intent: "Relax",
          hostNote: "Keep the volume low.",
          tracks: [
            {
              id: "mock-1",
              title: "Moonlight",
              artist: "Sonus",
              source: "mock"
            }
          ]
        }
      ],
      createdAt: "2026-05-23T12:00:00.000Z"
    });

    expect(plan.blocks[0]?.tracks[0]?.source).toBe("mock");
  });
});

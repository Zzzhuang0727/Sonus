import { describe, expect, it } from "vitest";
import { buildContext } from "../src/context/context";
import { NowStateSchema } from "@sonus/shared";

describe("buildContext", () => {
  it("assembles persona and user profile", async () => {
    const context = await buildContext(
      { message: "I want something soft and late-night in English." },
      NowStateSchema.parse({
        queue: [],
        hostStatus: "idle",
        progressMs: 0,
        updatedAt: new Date().toISOString()
      })
    );

    expect(context.system).toContain("Sonus");
    expect(context.userProfile).toContain("Registered User Profile");
    expect(context.userProfile).toContain("Recent Song Preference File");
    expect(context.system).toContain("Reply to the user only in English");
    expect(context.environment.calendar).toEqual([]);
    expect(context.memory).toEqual([]);
  });
});

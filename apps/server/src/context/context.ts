import fs from "node:fs/promises";
import path from "node:path";
import type { ChatRequest, NowState } from "@sonus/shared";
import { paths } from "../config/env";
import { readTodayCalendar, type CalendarEventSummary } from "../scheduler/calendar";
import { readWeatherSummary } from "../scheduler/weather";
import { stateStore } from "../state/store";
import { userStore } from "../users/store";

export interface SonusContext {
  system: string;
  userProfile: string;
  environment: {
    weather?: string;
    calendar: CalendarEventSummary[];
  };
  memory: Array<{
    say: string;
    reason: string;
    createdAt: string;
  }>;
  nowState: NowState;
  userRequest: ChatRequest;
}

export async function buildContext(request: ChatRequest, nowState: NowState, userId?: string): Promise<SonusContext> {
  const [persona, profile, weather, calendar] = await Promise.all([
    fs.readFile(path.join(paths.prompts, "sonus-persona.md"), "utf8"),
    userStore.buildUserProfileContext(userId),
    readWeatherSummary(),
    readTodayCalendar()
  ]);

  return {
    system: persona,
    userProfile: profile,
    environment: {
      weather,
      calendar
    },
    memory: stateStore.getTurns(5).map((turn) => ({
      say: turn.say,
      reason: turn.reason,
      createdAt: turn.createdAt
    })),
    nowState,
    userRequest: request
  };
}

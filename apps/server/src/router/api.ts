import type { FastifyInstance } from "fastify";
import {
  ChatRequestSchema,
  PlanRequestSchema,
  TasteUpdateSchema,
  UserLoginSchema,
  UserRegistrationSchema,
  type DJTurn,
  type QueueItem,
  type SonusPlan,
  type Track
} from "@sonus/shared";
import { brain } from "../brain/openai";
import { buildContext } from "../context/context";
import { musicAdapter } from "../music/netease";
import { readTodayCalendar } from "../scheduler/calendar";
import { readWeatherSummary } from "../scheduler/weather";
import { stateStore } from "../state/store";
import { synthesizeSpeech } from "../tts/fish";
import { userStore } from "../users/store";
import { createId } from "../utils/id";
import { addStreamClient, publishEvent } from "./events";

export async function registerApiRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, name: "sonus" }));

  app.get("/api/now", async () => stateStore.getNow());

  app.get("/api/history", async () => {
    const turns = stateStore.getTurns(20);
    return turns.flatMap((turn) => {
      const firstTrack = turn.queue[0]?.track;
      return [
        ...(turn.userMessage
          ? [
              {
                id: `${turn.id}-user`,
                role: "user" as const,
                text: turn.userMessage,
                createdAt: turn.createdAt
              }
            ]
          : []),
        {
          id: `${turn.id}-sonus`,
          role: "sonus" as const,
          text: turn.say,
          createdAt: turn.createdAt,
          speechUrl: turn.speechUrl,
          nowPlaying: firstTrack ? `${firstTrack.title} · ${firstTrack.artist}` : undefined,
          suggestions: turn.queue
        }
      ];
    });
  });

  app.delete("/api/history", async () => {
    await stateStore.clearTurns();
    publishEvent({ type: "now-playing", data: stateStore.getNow() });
    return { ok: true };
  });

  app.get("/api/stream", async (_request, reply) => {
    addStreamClient(reply);
    publishEvent({ type: "now-playing", data: stateStore.getNow() });
  });

  app.post("/api/users/register", async (request, reply) => {
    const input = UserRegistrationSchema.parse(request.body);
    try {
      const user = await userStore.register(input);
      reply.header("Set-Cookie", userStore.buildSessionCookie(user.id));
      return user;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not register Sonus user.";
      return reply.code(409).send({ message });
    }
  });

  app.post("/api/users/login", async (request, reply) => {
    const input = UserLoginSchema.parse(request.body);
    const user = await userStore.login(input);
    if (!user) {
      return reply.code(404).send({ message: "No local Sonus user matches that username, phone, or email." });
    }

    reply.header("Set-Cookie", userStore.buildSessionCookie(user.id));
    return user;
  });

  app.get("/api/users/me", async (request) => userStore.getCurrentUser(request.headers.cookie));

  app.get("/api/users/preferences", async (request) => {
    const user = await userStore.getCurrentUser(request.headers.cookie);
    const preferenceFile = await userStore.readPreferenceFile(user.id);
    return {
      ...preferenceFile,
      choices: preferenceFile.choices.slice(0, 20)
    };
  });

  app.post("/api/users/logout", async (_request, reply) => {
    reply.header("Set-Cookie", userStore.clearSessionCookie());
    return { ok: true };
  });

  app.get("/api/taste", async (request) => {
    const user = await userStore.getCurrentUser(request.headers.cookie);
    return userStore.readTasteProfileForUser(user.id);
  });

  app.put("/api/taste", async (request) => {
    const update = TasteUpdateSchema.parse(request.body);
    const user = await userStore.getCurrentUser(request.headers.cookie);
    return userStore.updateTasteProfileForUser(user.id, update);
  });

  app.post("/api/chat", async (request, reply) => {
    const input = ChatRequestSchema.parse(request.body);
    const user = await userStore.getCurrentUser(request.headers.cookie);
    await stateStore.setHostStatus("thinking");

    try {
      const context = await buildContext(input, stateStore.getNow(), user.id);
      const output = await brain.plan(context);
      const queue = await resolveQueue(output.queue, output.searches);
      const say = sanitizeHostCopy(output.say, input.mood);
      const reason = sanitizeEnglishCopy(output.reason);
      const segue = output.segue ? sanitizeHostCopy(output.segue, input.mood) : undefined;
      const speechUrl = await synthesizeSpeech(say).catch((error) => {
        console.warn("Sonus TTS fallback:", error instanceof Error ? error.message : error);
        publishEvent({
          type: "error",
          data: {
            message: "TTS 暂时不可用，已跳过主播语音音频。"
          }
        });
        return undefined;
      });
      const turn: DJTurn = {
        id: createId("turn"),
        userMessage: input.message,
        say,
        reason,
        segue,
        speechUrl,
        queue,
        createdAt: new Date().toISOString()
      };

      await stateStore.addTurn(turn);
      if (speechUrl) {
        publishEvent({ type: "speech-ready", data: { url: speechUrl, text: say } });
      }
      publishEvent({ type: "now-playing", data: stateStore.getNow() });

      return turn;
    } catch (error) {
      await stateStore.setHostStatus("error");
      const message = error instanceof Error ? error.message : "Unknown Sonus error.";
      publishEvent({ type: "error", data: { message } });
      return reply.code(500).send({ message });
    }
  });

  app.post("/api/play/:id", async (request) => {
    const params = request.params as { id: string };
    const user = await userStore.getCurrentUser(request.headers.cookie);
    await stateStore.playQueueItem(params.id);
    const now = stateStore.getNow();
    if (now.current?.id === params.id) {
      await userStore.recordSelection(user.id, now.current.track);
    }

    publishEvent({ type: "now-playing", data: now });
    return now;
  });

  app.post("/api/plan/today", async (request) => {
    const input = PlanRequestSchema.parse(request.body ?? {});
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    const user = await userStore.getCurrentUser(request.headers.cookie);
    const [taste, calendar, weather] = await Promise.all([userStore.readTasteProfileForUser(user.id), readTodayCalendar(new Date(date)), readWeatherSummary()]);
    const seed = sanitizeMusicQuery(input.mood ?? taste.playlists[0]?.seeds[0] ?? user.preferredArtists[0] ?? user.preferredGenres[0]);
    const tracks = await musicAdapter.recommend(seed, 5);
    const planTracks = tracks.filter(isAllowedTrack).slice(0, 4);
    const safePlanTracks: Track[] = planTracks.length
      ? planTracks
      : [
          {
            id: createId("fallback-track"),
            title: "ambient instrumental focus",
            artist: "International Instrumental",
            source: "mock"
          }
        ];
    const hydrated = await Promise.all(safePlanTracks.map((track) => musicAdapter.hydrateAudio(track)));
    const plan: SonusPlan = {
      id: createId("plan"),
      date,
      theme: input.mood ? `${input.mood} · Gentle Night Flight` : "Gentle Night Flight",
      opening: buildPlanOpening(weather, calendar.length),
      blocks: [
        {
          title: "Opening Set",
          timeHint: "now",
          intent: "Settle the mood first, then move into English songs or non-Chinese instrumentals.",
          tracks: hydrated,
          hostNote: calendar.length ? `There are ${calendar.length} calendar items today, so Sonus will keep the set less intrusive.` : "Today starts in gentle night-flight mode."
        }
      ],
      createdAt: new Date().toISOString()
    };
    await stateStore.savePlan(plan);
    return plan;
  });
}

async function resolveQueue(
  plannedQueue: Array<{ title: string; artist?: string; reason: string }>,
  searches: string[]
): Promise<QueueItem[]> {
  const queue: QueueItem[] = [];
  const fallbackPlans = [
    { title: "late night English indie soft", artist: "", reason: "A soft English-language option for a low-lit room." },
    { title: "ambient instrumental focus", artist: "", reason: "A non-Chinese instrumental choice for steady focus." },
    { title: "dream pop English mellow", artist: "", reason: "A mellow English dream-pop choice with a gentle glow." },
    { title: "quiet English folk", artist: "", reason: "A close, human English-language option with less pressure." },
    { title: "soft post rock instrumental", artist: "", reason: "A spacious non-Chinese instrumental option." }
  ];
  const plans = [...plannedQueue, ...fallbackPlans].slice(0, 5);

  for (const [index, planned] of plans.entries()) {
    const query = sanitizeMusicQuery([planned.title, planned.artist].filter(Boolean).join(" ").trim() || searches[index] || searches[0]);
    const found = await musicAdapter.search(query, 1).catch((): Track[] => []);
    const safeTrack = found.find(isAllowedTrack);
    const track = safeTrack ?? {
      id: createId("fallback-track"),
      title: query,
      artist: planned.artist && !containsCjk(planned.artist) ? planned.artist : "International Instrumental",
      source: "mock" as const
    };
    const hydrated = await musicAdapter.hydrateAudio(track).catch(() => track);
    const lyric = await musicAdapter.lyric(hydrated).catch(() => undefined);

    const usedFallbackAudio = hydrated.audioUrl?.includes("soundhelix.com") && hydrated.source !== "mock";
    queue.push({
      id: createId("queue"),
      track: {
        ...hydrated,
        lyric: lyric ?? hydrated.lyric
      },
      reason: usedFallbackAudio
        ? `${sanitizeEnglishCopy(planned.reason)} The original playback URL is unavailable, so Sonus is using a playable fallback.`
        : sanitizeEnglishCopy(planned.reason),
      segue: index === 0 ? "Let's start here." : undefined,
      requestedBy: "sonus",
      status: "queued"
    });
  }

  return queue;
}

function buildPlanOpening(weather: string | undefined, calendarCount: number) {
  const weatherPart = weather ? `Weather: ${weather} ` : "";
  const calendarPart = calendarCount ? `There are ${calendarCount} calendar items today. ` : "";
  return `${weatherPart}${calendarPart}We will begin with English songs and non-Chinese instrumentals in gentle night-flight mode.`;
}

function sanitizeMusicQuery(query: string | undefined) {
  if (!query || containsCjk(query)) {
    return "late night English indie soft ambient instrumental";
  }

  return query;
}

function sanitizeEnglishCopy(copy: string | undefined) {
  if (!copy || containsCjk(copy)) {
    return "It fits the late-night English or non-Chinese instrumental direction.";
  }

  return copy;
}

function sanitizeHostCopy(copy: string | undefined, mood?: string) {
  if (!copy || containsCjk(copy)) {
    const moodPart = mood && !containsCjk(mood) ? ` with a ${mood} tint` : "";
    return `I hear you. I will keep this set soft${moodPart}, staying with English songs and non-Chinese instrumentals so the room can stay open and unhurried.`;
  }

  return copy;
}

function isAllowedTrack(track: Track) {
  return !containsCjk(`${track.title} ${track.artist}`);
}

function containsCjk(value: string) {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(value);
}

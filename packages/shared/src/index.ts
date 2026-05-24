import { z } from "zod";

export const TrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
  durationMs: z.number().int().positive().optional(),
  artworkUrl: z.string().url().optional(),
  audioUrl: z.string().url().optional(),
  lyric: z.string().optional(),
  source: z.enum(["netease", "local", "mock"]).default("netease")
});

export const QueueItemSchema = z.object({
  id: z.string(),
  track: TrackSchema,
  reason: z.string(),
  segue: z.string().optional(),
  requestedBy: z.enum(["user", "sonus", "plan"]).default("sonus"),
  status: z.enum(["queued", "playing", "played", "skipped"]).default("queued")
});

export const ChatRequestSchema = z.object({
  message: z.string().min(1),
  mood: z.string().optional(),
  constraints: z.array(z.string()).optional()
});

export const DJTurnSchema = z.object({
  id: z.string(),
  userMessage: z.string().optional(),
  say: z.string(),
  reason: z.string(),
  segue: z.string().optional(),
  speechUrl: z.string().optional(),
  queue: z.array(QueueItemSchema),
  createdAt: z.string()
});

export const ChatHistoryItemSchema = z.discriminatedUnion("role", [
  z.object({
    id: z.string(),
    role: z.literal("user"),
    text: z.string(),
    createdAt: z.string()
  }),
  z.object({
    id: z.string(),
    role: z.literal("sonus"),
    text: z.string(),
    createdAt: z.string(),
    speechUrl: z.string().optional(),
    nowPlaying: z.string().optional(),
    suggestions: z.array(QueueItemSchema).optional()
  })
]);

export const ChatHistorySchema = z.array(ChatHistoryItemSchema);

export const NowStateSchema = z.object({
  current: QueueItemSchema.optional(),
  next: QueueItemSchema.optional(),
  queue: z.array(QueueItemSchema),
  hostStatus: z.enum(["idle", "thinking", "speaking", "playing", "error"]),
  progressMs: z.number().int().nonnegative().default(0),
  lastSegue: z.string().optional(),
  lastSpeechUrl: z.string().optional(),
  updatedAt: z.string()
});

export const TasteProfileSchema = z.object({
  tasteMd: z.string(),
  routinesMd: z.string(),
  moodRulesMd: z.string(),
  playlists: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      seeds: z.array(z.string()).default([])
    })
  )
});

export const TasteUpdateSchema = z.object({
  tasteMd: z.string().optional(),
  routinesMd: z.string().optional(),
  moodRulesMd: z.string().optional(),
  playlists: TasteProfileSchema.shape.playlists.optional()
});

export const UserRegistrationSchema = z.object({
  username: z.string().min(1),
  phone: z.string().min(3),
  email: z.string().email(),
  name: z.string().optional().default(""),
  age: z.number().int().positive().max(130).optional(),
  birthMonthDay: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).optional(),
  preferredGenres: z.array(z.string().min(1)).default([]),
  preferredArtists: z.array(z.string().min(1)).default([])
});

export const UserLoginSchema = z.object({
  identity: z.string().min(1)
});

export const UserProfileSchema = UserRegistrationSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const UserPreferenceChoiceSchema = z.object({
  trackId: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
  source: TrackSchema.shape.source,
  chosenAt: z.string()
});

export const UserPreferenceFileSchema = z.object({
  userId: z.string(),
  updatedAt: z.string(),
  choices: z.array(UserPreferenceChoiceSchema)
});

export const PlanRequestSchema = z.object({
  date: z.string().optional(),
  mood: z.string().optional()
});

export const SonusPlanSchema = z.object({
  id: z.string(),
  date: z.string(),
  theme: z.string(),
  opening: z.string(),
  blocks: z.array(
    z.object({
      title: z.string(),
      timeHint: z.string().optional(),
      intent: z.string(),
      tracks: z.array(TrackSchema),
      hostNote: z.string()
    })
  ),
  createdAt: z.string()
});

export const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("now-playing"), data: NowStateSchema }),
  z.object({ type: z.literal("queue-updated"), data: z.array(QueueItemSchema) }),
  z.object({ type: z.literal("speech-ready"), data: z.object({ url: z.string(), text: z.string() }) }),
  z.object({ type: z.literal("error"), data: z.object({ message: z.string() }) })
]);

export type Track = z.infer<typeof TrackSchema>;
export type QueueItem = z.infer<typeof QueueItemSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type DJTurn = z.infer<typeof DJTurnSchema>;
export type ChatHistoryItem = z.infer<typeof ChatHistoryItemSchema>;
export type ChatHistory = z.infer<typeof ChatHistorySchema>;
export type NowState = z.infer<typeof NowStateSchema>;
export type TasteProfile = z.infer<typeof TasteProfileSchema>;
export type TasteUpdate = z.infer<typeof TasteUpdateSchema>;
export type UserRegistration = z.infer<typeof UserRegistrationSchema>;
export type UserLogin = z.infer<typeof UserLoginSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type UserPreferenceChoice = z.infer<typeof UserPreferenceChoiceSchema>;
export type UserPreferenceFile = z.infer<typeof UserPreferenceFileSchema>;
export type PlanRequest = z.infer<typeof PlanRequestSchema>;
export type SonusPlan = z.infer<typeof SonusPlanSchema>;
export type StreamEvent = z.infer<typeof StreamEventSchema>;

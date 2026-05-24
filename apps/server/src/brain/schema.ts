import { z } from "zod";

export const BrainQueueItemSchema = z.object({
  title: z.string(),
  artist: z.string().optional().default(""),
  reason: z.string()
});

export const BrainOutputSchema = z.object({
  say: z.string(),
  reason: z.string(),
  segue: z.string().optional(),
  searches: z.array(z.string()).default([]),
  queue: z.array(BrainQueueItemSchema).min(1).max(8)
});

export type BrainOutput = z.infer<typeof BrainOutputSchema>;

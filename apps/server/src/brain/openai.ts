import type { SonusContext } from "../context/context";
import { env } from "../config/env";
import { fetchJson } from "../utils/http";
import { BrainOutputSchema, type BrainOutput } from "./schema";

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

export interface Brain {
  plan(context: SonusContext): Promise<BrainOutput>;
}

export class DeepSeekBrain implements Brain {
  async plan(context: SonusContext): Promise<BrainOutput> {
    if (env.SONUS_MOCK_AI || !env.DEEPSEEK_API_KEY) {
      return mockBrainOutput(context);
    }

    const thinkingOptions =
      env.DEEPSEEK_THINKING === "enabled"
        ? {
            thinking: {
              type: env.DEEPSEEK_THINKING
            },
            reasoning_effort: env.DEEPSEEK_REASONING_EFFORT
          }
        : {
            thinking: {
              type: env.DEEPSEEK_THINKING
            }
          };

    const data = await fetchJson<DeepSeekResponse>(`${env.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL,
        messages: [
          {
            role: "system",
            content: `${context.system}\n\nYou must output only valid JSON. Do not output Markdown or explanatory text. All user-facing text and reasons must be in English.`
          },
          {
            role: "user",
            content: buildUserPrompt(context)
          }
        ],
        response_format: {
          type: "json_object"
        },
        temperature: 0.8,
        stream: false,
        ...thinkingOptions
      })
    });

    const text = extractDeepSeekText(data);
    return BrainOutputSchema.parse(JSON.parse(text));
  }
}

const sonusJsonShape = {
  say: "English host narration in a gentle late-night style",
  reason: "Why this round is planned this way, in English",
  segue: "Short English transition into the first track",
  searches: ["English songs or non-Chinese instrumental search terms"],
  queue: [
    {
      title: "English song title or non-Chinese instrumental search target",
      artist: "Artist name, or empty string",
      reason: "Recommendation reason in English"
    }
  ]
};

function buildUserPrompt(context: SonusContext) {
  return [
    "# User Request",
    JSON.stringify(context.userRequest, null, 2),
    "# User Profile",
    context.userProfile,
    "# Environment Context",
    JSON.stringify(context.environment, null, 2),
    "# Current Playback State",
    JSON.stringify(context.nowState, null, 2),
    "# Recent Memory",
    JSON.stringify(context.memory, null, 2),
    "# Output Requirements",
    "Output exactly one JSON object matching the fields below. queue must contain exactly 5 track choices.",
    "Hard rules: reply in English only; recommend only English-language songs or non-Chinese international instrumental music; avoid Chinese-language songs and tracks whose title or artist is primarily Chinese text.",
    JSON.stringify(sonusJsonShape, null, 2),
    "Plan this Sonus DJ turn."
  ].join("\n\n");
}

function extractDeepSeekText(data: DeepSeekResponse) {
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("DeepSeek response did not contain message content.");
  }

  return stripJsonFence(text);
}

function stripJsonFence(text: string) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match?.[1]) {
    return match[1].trim();
  }

  return text;
}

function mockBrainOutput(context: SonusContext): BrainOutput {
  const message = context.userRequest.message;
  const mood = context.userRequest.mood ? ` with a ${context.userRequest.mood} tint` : "";
  return BrainOutputSchema.parse({
    say: `I hear you. I will keep the room soft${mood}, with English songs and non-Chinese instrumentals that leave space around your thoughts. We will start with something low-lit and unhurried.`,
    reason: `The user asked for "${message}", so Sonus is choosing a low-distraction late-night queue in English or non-Chinese instrumental territory.`,
    segue: "Let's dim the edges a little and let the first track breathe in.",
    searches: [message, "late night English indie soft", "ambient instrumental focus", "dream pop English mellow", "quiet English folk", "soft post rock instrumental"],
    queue: [
      { title: "late night English indie soft", artist: "", reason: "Soft English-language indie keeps the mood intimate without crowding the room." },
      { title: "ambient instrumental focus", artist: "", reason: "A non-Chinese instrumental stretch keeps the rhythm steady for thinking." },
      { title: "dream pop English mellow", artist: "", reason: "Mellow English dream pop adds warmth while staying low-pressure." },
      { title: "quiet English folk", artist: "", reason: "A gentle English folk option keeps the request human and close." },
      { title: "soft post rock instrumental", artist: "", reason: "A non-Chinese instrumental choice gives the set a wider, wordless space." }
    ]
  });
}

export const brain = new DeepSeekBrain();

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { env, paths } from "../config/env";

interface FishResponse {
  audio?: string;
}

export function ttsCacheName(text: string, voiceId = env.FISH_VOICE_ID ?? "mock") {
  const hash = createHash("sha256").update(`${voiceId}:${text}`).digest("hex").slice(0, 24);
  return `${hash}.mp3`;
}

export async function synthesizeSpeech(text: string): Promise<string | undefined> {
  if (env.SONUS_MOCK_TTS || !env.FISH_API_KEY || !env.FISH_VOICE_ID) {
    return undefined;
  }

  await fs.mkdir(paths.ttsCache, { recursive: true });
  const filename = ttsCacheName(text);
  const filePath = path.join(paths.ttsCache, filename);
  const publicUrl = `/tts/${filename}`;

  try {
    await fs.access(filePath);
    return publicUrl;
  } catch {
    // Continue and synthesize/cache.
  }

  let response: Response;
  try {
    response = await fetch(`${env.FISH_BASE_URL.replace(/\/$/, "")}/v1/tts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.FISH_API_KEY}`,
        "Content-Type": "application/json",
        model: "s2-pro"
      },
      body: JSON.stringify({
        text,
        reference_id: env.FISH_VOICE_ID,
        format: "mp3"
      })
    });
  } catch (error) {
    throw new Error(`Fish Audio TTS network request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Fish Audio TTS failed: ${response.status} ${detail.slice(0, 300)}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await response.json()) as FishResponse;
    if (!data.audio) {
      throw new Error("Fish Audio JSON response did not include audio.");
    }
    await fs.writeFile(filePath, Buffer.from(data.audio, "base64"));
  } else {
    await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  }

  return publicUrl;
}

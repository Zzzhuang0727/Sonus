import { env } from "../config/env";

async function main() {
  if (!env.FISH_API_KEY || !env.FISH_VOICE_ID) {
    console.log("Fish Audio config: missing FISH_API_KEY or FISH_VOICE_ID.");
    return;
  }

  const endpoint = `${env.FISH_BASE_URL.replace(/\/$/, "")}/v1/tts`;
  console.log(`Fish Audio endpoint: ${redactEndpoint(endpoint)}`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.FISH_API_KEY}`,
        "Content-Type": "application/json",
        model: "s2-pro"
      },
      body: JSON.stringify({
        text: "你好，我是 Sonus。",
        reference_id: env.FISH_VOICE_ID,
        format: "mp3"
      })
    });

    console.log(`Fish Audio status: ${response.status} ${response.statusText}`);
    console.log(`Fish Audio content-type: ${response.headers.get("content-type") ?? "unknown"}`);
    if (!response.ok) {
      console.log((await response.text()).slice(0, 800));
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`Fish Audio response bytes: ${buffer.length}`);
  } catch (error) {
    console.log(`Fish Audio network error: ${error instanceof Error ? error.message : String(error)}`);
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause) {
      console.log(`Cause: ${String(cause)}`);
    }
  }
}

function redactEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return `${url.origin}${url.pathname}`;
  } catch {
    return endpoint;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

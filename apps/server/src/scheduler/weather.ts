import { env } from "../config/env";
import { fetchJson } from "../utils/http";

interface WeatherResponse {
  weather?: Array<{ description?: string }>;
  main?: { temp?: number; feels_like?: number };
}

export async function readWeatherSummary(): Promise<string | undefined> {
  if (!env.OPENWEATHER_API_KEY) {
    return undefined;
  }

  try {
    const params = new URLSearchParams({
      q: env.OPENWEATHER_LOCATION,
      appid: env.OPENWEATHER_API_KEY,
      units: "metric",
      lang: "zh_cn"
    });
    const data = await fetchJson<WeatherResponse>(`https://api.openweathermap.org/data/2.5/weather?${params.toString()}`);
    const description = data.weather?.[0]?.description ?? "天气未知";
    const temp = data.main?.temp === undefined ? "" : `${Math.round(data.main.temp)}°C`;
    return `${env.OPENWEATHER_LOCATION}: ${description} ${temp}`.trim();
  } catch (error) {
    console.warn("Failed to read weather", error);
    return undefined;
  }
}

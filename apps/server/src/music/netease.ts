import type { Track } from "@sonus/shared";
import { env } from "../config/env";
import { fetchJson } from "../utils/http";
import { mockTracks } from "./mock";

interface SearchResult {
  result?: {
    songs?: Array<{
      id: number;
      name: string;
      duration?: number;
      artists?: Array<{ name: string }>;
      album?: { name?: string; picUrl?: string };
    }>;
  };
}

interface SongUrlResult {
  data?: Array<{ id: number; url?: string | null; code?: number }>;
  code?: number;
  msg?: string;
}

interface LyricResult {
  lrc?: { lyric?: string };
}

export interface MusicAdapter {
  search(query: string, limit?: number): Promise<Track[]>;
  hydrateAudio(track: Track): Promise<Track>;
  lyric(track: Track): Promise<string | undefined>;
  recommend(seed: string, limit?: number): Promise<Track[]>;
}

export class NeteaseMusicAdapter implements MusicAdapter {
  async search(query: string, limit = 5): Promise<Track[]> {
    if (env.SONUS_MOCK_MUSIC) {
      return mockTracks.slice(0, limit).map((track, index) => ({
        ...track,
        id: `${track.id}-${encodeURIComponent(query)}-${index}`,
        title: query ? `${query} · ${track.title}` : track.title
      }));
    }

    const params = new URLSearchParams({
      s: query,
      type: "1",
      limit: String(limit)
    });

    const data = await fetchJson<SearchResult>(`${env.NETEASE_BASE_URL}/api/search/get/web?${params.toString()}`, {
      headers: this.headers()
    });

    return (data.result?.songs ?? []).map((song) => ({
      id: String(song.id),
      title: song.name,
      artist: song.artists?.map((artist) => artist.name).join(" / ") || "Unknown",
      album: song.album?.name,
      durationMs: song.duration,
      artworkUrl: song.album?.picUrl,
      source: "netease" as const
    }));
  }

  async hydrateAudio(track: Track): Promise<Track> {
    if (env.SONUS_MOCK_MUSIC || track.source === "mock") {
      return track.audioUrl ? track : mockTracks[0]!;
    }

    try {
      const params = new URLSearchParams({ ids: JSON.stringify([Number(track.id)]), br: "320000" });
      const data = await fetchJson<SongUrlResult>(`${env.NETEASE_BASE_URL}/api/song/enhance/player/url?${params.toString()}`, {
        headers: this.headers()
      });
      const audioUrl = data.data?.[0]?.url ?? undefined;
      if (audioUrl) {
        return { ...track, audioUrl };
      }
      console.warn(`Netease returned no playable URL for ${track.id}: ${data.data?.[0]?.code ?? data.code ?? data.msg ?? "unknown reason"}`);
    } catch (error) {
      console.warn("Netease audio URL unavailable, using playable fallback:", error instanceof Error ? error.message : error);
    }

    const fallback = mockTracks[Math.abs(hashText(track.id)) % mockTracks.length]!;
    return {
      ...track,
      album: track.album ? `${track.album} · Playable fallback` : "Playable fallback",
      audioUrl: fallback.audioUrl,
      lyric: track.lyric ?? fallback.lyric
    };
  }

  async lyric(track: Track): Promise<string | undefined> {
    if (env.SONUS_MOCK_MUSIC || track.source === "mock") {
      return track.lyric;
    }

    const params = new URLSearchParams({ id: track.id, lv: "-1", kv: "-1", tv: "-1" });
    const data = await fetchJson<LyricResult>(`${env.NETEASE_BASE_URL}/api/song/lyric?${params.toString()}`, {
      headers: this.headers()
    });
    return data.lrc?.lyric;
  }

  async recommend(seed: string, limit = 5): Promise<Track[]> {
    return this.search(seed || "late night English indie soft ambient instrumental", limit);
  }

  private headers() {
    return {
      Cookie: env.NETEASE_COOKIE ?? "",
      Referer: "https://music.163.com/",
      "User-Agent": "Mozilla/5.0 Sonus/0.1"
    };
  }
}

export const musicAdapter = new NeteaseMusicAdapter();

function hashText(text: string) {
  return Array.from(text).reduce((hash, character) => hash + character.charCodeAt(0), 0);
}

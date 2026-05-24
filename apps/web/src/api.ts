import type {
  ChatHistory,
  ChatRequest,
  DJTurn,
  NowState,
  SonusPlan,
  TasteProfile,
  TasteUpdate,
  UserLogin,
  UserPreferenceFile,
  UserProfile,
  UserRegistration
} from "@sonus/shared";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "include"
  });

  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    throw new Error(data?.message ?? `${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  now: () => requestJson<NowState>("/api/now"),
  history: () => requestJson<ChatHistory>("/api/history"),
  clearHistory: () =>
    requestJson<{ ok: true }>("/api/history", {
      method: "DELETE"
    }),
  chat: (body: ChatRequest) =>
    requestJson<DJTurn>("/api/chat", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  play: (id: string) =>
    requestJson<NowState>(`/api/play/${id}`, {
      method: "POST"
    }),
  me: () => requestJson<UserProfile>("/api/users/me"),
  preferences: () => requestJson<UserPreferenceFile>("/api/users/preferences"),
  login: (body: UserLogin) =>
    requestJson<UserProfile>("/api/users/login", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  register: (body: UserRegistration) =>
    requestJson<UserProfile>("/api/users/register", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  logout: () =>
    requestJson<{ ok: true }>("/api/users/logout", {
      method: "POST"
    }),
  taste: () => requestJson<TasteProfile>("/api/taste"),
  updateTaste: (body: TasteUpdate) =>
    requestJson<TasteProfile>("/api/taste", {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  planToday: (mood?: string) =>
    requestJson<SonusPlan>("/api/plan/today", {
      method: "POST",
      body: JSON.stringify({ mood })
    })
};

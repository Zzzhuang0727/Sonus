# Sonus Agent Handoff

Read this file first when continuing Sonus in a new conversation. It is the working handoff for the current repo state, product rules, local data model, run commands, and known caveats.

## Repository

- Local path: `/Users/zhuang/Projects/VibeCodingProjects/Sonus`
- GitHub repo: `git@github.com:Zzzhuang0727/Sonus.git`
- Main branch: `main`
- Do not commit `.env`, local SQLite databases, generated TTS audio, or per-user preference files.

## Product Goal

Sonus is a local-first personal AI DJ / AI radio host.

Core loop:

1. User opens the browser/PWA radio console.
2. User logs in or registers a local Sonus user.
3. User asks for a mood or recommendation.
4. Sonus replies in English and returns exactly 5 song choices.
5. UI shows the choices as cards under the Sonus chat bubble, plus a sixth "None of these" reroll card.
6. User selects one card to play.
7. Server records that selected song and artist in the current user's local preference file.
8. Future recommendations use the registration profile plus recent selections.

Important music rule: Sonus should recommend only English-language songs or non-Chinese international instrumental music. Sonus host replies should be in English.

## Architecture

```text
apps/web        React + Vite PWA player on localhost:3000
apps/server     Fastify + TypeScript local server on localhost:8787
packages/shared Shared Zod schemas and TypeScript API types
prompts         Sonus persona prompt
cache/tts       Generated TTS cache, ignored by git
user            Local-only user DB and per-user preference files, ignored by git
state.db        Local playback/chat state SQLite DB, ignored by git
```

The frontend talks to the server with relative `/api/*` requests and `credentials: "include"` so the local user session cookie works.

## Run Commands

Use Corepack/pnpm.

```bash
corepack pnpm install
corepack pnpm dev
```

Open:

```text
http://localhost:3000
```

Useful checks:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Targeted checks:

```bash
corepack pnpm --filter @sonus/web typecheck
corepack pnpm --filter @sonus/web build
corepack pnpm --filter @sonus/server typecheck
corepack pnpm --filter @sonus/server test
corepack pnpm --filter @sonus/server diagnose:fish
```

The user usually verifies UI in the Codex in-app browser at `http://localhost:3000/`, often around a 556-657 px wide by 896 px tall viewport.

## Environment

Root `.env` is loaded by `apps/server/src/config/env.ts`.

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_THINKING=disabled
DEEPSEEK_REASONING_EFFORT=high
FISH_API_KEY=
FISH_BASE_URL=https://api.fish.audio
FISH_VOICE_ID=
NETEASE_BASE_URL=https://music.163.com
NETEASE_COOKIE=
ICS_URL=
ICS_FILE=
OPENWEATHER_API_KEY=
OPENWEATHER_LOCATION=Shanghai,CN
SONUS_PORT=8787
SONUS_WEB_ORIGIN=http://localhost:3000
SONUS_MOCK_AI=true
SONUS_MOCK_MUSIC=true
SONUS_MOCK_TTS=true
```

Notes:

- User has said `DEEPSEEK_API_KEY`, `FISH_API_KEY`, `FISH_VOICE_ID`, and `NETEASE_COOKIE` are configured in local `.env`.
- Model should be `deepseek-v4-pro`.
- `FISH_VOICE_ID` corresponds to the Fish Audio voice/reference id.
- Fish Audio direct network access has timed out before on this machine. TTS must fail open: return DJ text and queue even when speech audio is unavailable.
- Netease real playback URL retrieval works with cookie in principle, but account/rights restrictions can still return unavailable URLs. Do not bypass restrictions; fallback or skip clearly.
- Mock flags can be used for UI work without external services.

## Git Ignore / Local Data

Keep these local only:

```text
.env
state.db*
state.db.json.bak
user/users.db*
user/preferences/*.json
user/*.md
user/playlists.json
cache/tts/*.mp3
node_modules
apps/*/dist
```

Before commits, check:

```bash
git status --short
git check-ignore -v .env state.db user/users.db user/preferences/example.json cache/tts/test.mp3
```

## Frontend State

Main files:

- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/api.ts`
- `apps/web/public/manifest.webmanifest`
- `apps/web/public/sw.js`

Current implemented UI:

- Pixel-tech radio layout with internal dot-grid panel backgrounds.
- Overall page background is a purple animated gradient.
- Top brand uses custom pixel-rendered `SONUS`; previous avatar and topbar `ON AIR` were removed.
- Top right has `LOGIN`, `DARK`, `LIGHT`.
- `LOGIN` opens a liquid-glass auth modal.
- `DARK` / `LIGHT` switch theme and persist it.
- Clock deck shows real current time and date.
- Hero waveform is animated, thin, and visually moves right-to-left.
- Transport deck has animated mini meter.
- Play/pause is a single toggle button. Pause then play should resume the same audio.
- Stop resets playback.
- Previous/next, volume stepping, progress seek, current time, and duration are wired.
- Queue is collapsible, default collapsed. Clicking the dark `QUEUE / N TRACKS` strip toggles it.
- Chat area uses history records and liquid-glass chat bubbles with avatars.
- Sonus and user messages are shown as separate bubbles.
- Clear chat button calls `DELETE /api/history`.
- Command dock floats at the bottom of the chat panel, uses one-line mood input + autosizing textarea + send button.
- The message textarea clears after successful send, grows vertically up to a capped height, then scrolls.
- Song recommendations render as 2 rows x 3 cards: five track cards and one reroll card.
- Recommendation cards must avoid clipping long song/artist text.
- `Now playing` / errors should stay close to the command dock; avoid large empty gaps.
- Lyrics are hidden by default and opened with a lyrics button. They appear in a modal/window, not a collapsible section.
- Lyrics parse timestamped LRC when available, scroll with playback time, highlight and enlarge the current line.
- Right side panel includes `TODAY PLAN` and `RECENT 20`; old `TASTE FILES` UI was replaced by recent selected songs.

Important visual preferences from the user:

- Similar to the provided Claudio reference: pixel-tech, minimal, card/panel layout.
- Pixel font / pixel-like lettering.
- Purple tone and liquid-glass chat/input surfaces.
- Increase liquid glass transparency when requested.
- Keep queue header dark even in light mode.
- Avoid text overlap; mobile-ish viewport is important.

## Backend State

Main files:

- `packages/shared/src/index.ts`: shared schemas/types.
- `apps/server/src/router/api.ts`: HTTP API routes.
- `apps/server/src/router/events.ts`: SSE.
- `apps/server/src/context/context.ts`: prompt/context assembly.
- `apps/server/src/brain/openai.ts`: DeepSeek brain adapter, historical filename.
- `apps/server/src/brain/schema.ts`: model output schema.
- `apps/server/src/music/netease.ts`: Netease search/lyric/playback adapter.
- `apps/server/src/music/mock.ts`: fallback mock tracks.
- `apps/server/src/tts/fish.ts`: Fish Audio TTS + cache.
- `apps/server/src/state/store.ts`: playback/chat/plan SQLite state.
- `apps/server/src/users/store.ts`: local user SQLite store and preference files.
- `apps/server/src/config/env.ts`: `.env` and local paths.

Current implemented API:

```text
GET    /health
GET    /api/now
GET    /api/history
DELETE /api/history
GET    /api/stream
POST   /api/chat
POST   /api/play/:id
POST   /api/plan/today
GET    /api/taste
PUT    /api/taste
POST   /api/users/register
POST   /api/users/login
GET    /api/users/me
GET    /api/users/preferences
POST   /api/users/logout
```

Current auth/user model:

- Local SQLite DB: `user/users.db`.
- Session cookie name: `sonus_user_id`.
- Registration required fields: `username`, `phone`, `email`.
- Optional fields: `name`, `age`, `birthMonthDay`, `preferredGenres`, `preferredArtists`.
- `birthMonthDay` format is `MM-DD`, for example `07-27`.
- Login uses one identity field, matching username OR phone OR email.
- Registration profile is stored only on the local machine.

Current preference model:

- Per-user file: `user/preferences/<userId>.json`.
- When user selects a recommendation card and `/api/play/:id` succeeds, `userStore.recordSelection` records the current track.
- Preference file keeps the latest 100 unique selected songs.
- Preference file drops choices older than 30 days.
- `/api/users/preferences` returns the latest 20 choices for the UI.
- `userStore.buildUserProfileContext` injects registration preferences and recent selections into the AI prompt.
- Legacy markdown taste files are no longer the primary learning system, though `/api/taste` still returns a generated compatibility profile.

Current brain behavior:

- Uses DeepSeek Chat Completions style request through `apps/server/src/brain/openai.ts`.
- Output is parsed into strict JSON with `say`, `reason`, `segue`, `searches`, and `queue`.
- `queue` must contain exactly 5 track choices.
- Hard prompt rule: reply in English only; recommend only English-language songs or non-Chinese international instrumental music; avoid Chinese-language songs and tracks whose title or artist is primarily Chinese text.
- Server also sanitizes model copy and filters/sanitizes music queries.

## Tests

Known tests:

- `packages/shared/src/index.test.ts`
- `apps/server/test/context.test.ts`
- `apps/server/test/state-store.test.ts`
- `apps/server/test/user-store.test.ts`
- `apps/server/src/tts/fish.test.ts`
- `apps/web/src/App.test.ts`

After doc-only edits, tests are not required. After code edits:

- Frontend only: run web typecheck/build.
- Server/shared changes: run root `corepack pnpm typecheck` and `corepack pnpm test`.
- If touching UI behavior, use the in-app browser to verify `http://localhost:3000/`.

## Browser Verification Checklist

After meaningful frontend changes:

1. Start dev server with `corepack pnpm dev` if not already running.
2. Open/refresh `http://localhost:3000/` in the Codex in-app browser.
3. Check narrow desktop/mobile-ish width around 556-657 px.
4. Verify:
   - topbar brand and mode switch do not collide
   - auth modal can register/login/logout
   - queue default collapsed and dark toggle strip works
   - play/pause toggles one button and resumes playback
   - recommendation cards fit long names
   - command dock clears after send and does not jump upward
   - textarea wraps/grows then scrolls
   - lyrics modal opens, closes, scrolls, and highlights current line
   - chat bubbles and command dock retain purple liquid-glass styling

## Known Caveats

- Fish Audio may time out from this environment; do not block `/api/chat` on TTS failure.
- Some Netease tracks may not provide playable URLs due to rights/account restrictions.
- The Netease playback endpoint previously required `ids=[id]`, not `id=id`.
- `state.db` replaced the earlier JSON state and is real SQLite.
- `node:sqlite` requires Node 22+.
- Dev service workers can stale-cache old frontend code; development unregisters service workers in `apps/web/src/main.tsx`.
- The Git committer on this machine may be auto-configured as local Mac user. Do not amend author unless the user asks.

## Recent Project History

- Project was initialized as a pnpm monorepo and pushed to `Zzzhuang0727/Sonus`.
- README was written in English, then `README.zh-CN.md` was added with language switch links at the top of both README files.
- `.env` and local data files are ignored and were not pushed.
- Frontend was iteratively restyled to pixel-tech purple liquid-glass UI based on user browser comments.
- Backend was updated from legacy taste markdown learning to local per-user recent-song preference learning.
- Login/register was added on the frontend and backend.

## Working Style For Future Agents

- Keep changes scoped to the user's requested area.
- Do not revert unrelated local changes.
- Use existing patterns before adding abstractions.
- Use `rg` for search.
- Use `apply_patch` for manual edits.
- Do not write or overwrite files with shell heredocs.
- Do not commit `.env` or local DB/preference/audio files.
- For UI work, verify visually in browser before final response.
- For pushes, use SSH remote `git@github.com:Zzzhuang0727/Sonus.git`; HTTPS failed earlier because GitHub password auth is disabled.

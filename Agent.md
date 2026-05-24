# Sonus Agent Handoff

Read this file first when continuing Sonus in a new conversation. It captures the current project state, design direction, run commands, and recent user preferences so another agent can resume without the prior chat history.

## Project Goal

Sonus is a local-first personal AI DJ / AI radio host.

MVP shape:

- `apps/web`: React + Vite PWA player on `localhost:3000`.
- `apps/server`: Fastify + TypeScript local server on `localhost:8787`.
- `packages/shared`: shared Zod schemas and TypeScript types.
- `user`: user taste/profile files.
- `prompts`: Sonus persona prompt.

Core product loop:

1. User chats with Sonus in the PWA.
2. Server builds context from user files, state, weather/calendar hooks, and recent playback.
3. Brain returns strict JSON with `say`, `queue`, `reason`, and `segue`.
4. Server resolves music, synthesizes DJ speech, persists state, and pushes updates by SSE.
5. PWA displays and plays the queue.

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
corepack pnpm --filter @sonus/web typecheck
corepack pnpm --filter @sonus/web build
corepack pnpm --filter @sonus/server typecheck
corepack pnpm test
```

The user has been viewing the app in the Codex in-app browser at `http://localhost:3000/`.

## Environment

The app can run in mock mode. Real integrations use these environment variables:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_THINKING`
- `DEEPSEEK_REASONING_EFFORT`
- `FISH_API_KEY`
- `FISH_VOICE_ID`
- `NETEASE_COOKIE`
- `ICS_URL`
- `ICS_FILE`
- `OPENWEATHER_API_KEY`
- `SONUS_MOCK_AI`
- `SONUS_MOCK_MUSIC`
- `SONUS_MOCK_TTS`

Do not bypass music service copyright/access limits. If a playback URL is unavailable, the expected behavior is to skip/fallback and explain.

## Current Frontend Direction

The user wants the UI to resemble the provided reference images:

- Pixel-tech style.
- Minimal, dark, card/panel layout.
- Pixel fonts / pixel-like lettering.
- Dotted pixel-grid backgrounds inside each panel.
- Overall page background is a purple animated gradient.
- Avoid oversized marketing/landing-page styling. The first screen should be the actual player.

Important current UI behavior:

- Top brand uses a custom pixel-rendered `SONUS` word. The user asked for the Sonus text to be smaller.
- Top-left avatar image and topbar `ON AIR` line were removed per user feedback.
- Theme switch has `LOGIN`, `DARK`, `LIGHT`; `DARK`/`LIGHT` should actually toggle theme.
- Clock deck time must be real-time, not static.
- Hero waveform at the bottom of the clock deck should be animated, thin, and visually move right-to-left: bars enter from the right and exit on the left.
- Mini meter icon in the transport deck should animate.
- Queue is collapsible, default collapsed. Clicking the `QUEUE / N TRACKS` header expands/collapses the rows.
- Queue header must stay dark, including in light mode. It should not become a pale blue/light strip.
- Transport controls are now wired to the audio element: play, pause, stop/reset, previous, next, volume stepping, real time, duration, seek.
- If a `speechUrl` exists, Sonus can play the host speech first, then continue into the first queued track.
- Lyrics are shown in the host/message area from `track.lyric`.
- `TASTE FILES` now exposes `taste.md`, `routines.md`, `mood-rules.md`, and editable `playlists.json`.
- PWA has a production-only service worker at `apps/web/public/sw.js`; development unregisters service workers to avoid stale module caching.

## Key Frontend Files

- `apps/web/src/App.tsx`: main React app and UI state.
- `apps/web/src/styles.css`: all current visual styling and animations.
- `apps/web/src/api.ts`: browser API client.
- `apps/web/public/manifest.webmanifest`: PWA manifest.

Current notable React state in `App.tsx`:

- `theme`: `"dark" | "light"`, persisted to `localStorage` and `document.documentElement.dataset.theme`.
- `currentTime`: updated every second for the live clock.
- `queueExpanded`: controls the collapsible queue; default is `false`.
- `playbackPhase`, `trackTime`, `trackDuration`, `volume`: drive the real transport controls.

Current notable CSS areas in `styles.css`:

- `body` / `pageGradientDrift`: animated purple page background.
- `.topbar`, `.clockDeck`, `.transportDeck`, `.queueDeck`, `.messageDeck`, `.commandDock`: panel dot-grid backgrounds.
- `.pixelDigit`, `.pixelLetter`: custom pixel clock/brand rendering.
- `.waveTrack`, `.waveform`: animated right-to-left waveform.
- `.meterMini span`: animated transport meter.
- `.queueToggle`: dark collapsible queue header.
- `.rail input`: custom range-based seek bar.
- `.lyricsPanel`: lyric display.

## Server / Shared Files

- `packages/shared/src/index.ts`: `Track`, `QueueItem`, `DJTurn`, `SonusPlan`, `TasteProfile`, `NowState` and Zod schemas.
- `apps/server/src/router/api.ts`: HTTP API routes.
- `apps/server/src/router/events.ts`: SSE events.
- `apps/server/src/context/context.ts`: prompt/context assembly.
- `apps/server/src/brain/openai.ts`: DeepSeek V4 Pro brain adapter. The filename is historical.
- `apps/server/src/music/netease.ts`: Netease adapter.
- `apps/server/src/music/mock.ts`: mock music fallback.
- `apps/server/src/tts/fish.ts`: Fish Audio TTS + cache.
- `apps/server/src/state/store.ts`: SQLite-backed persisted state using Node `node:sqlite`.

## User Profile Files

These files define Sonus's user memory/personality context:

- `user/taste.md`
- `user/routines.md`
- `user/playlists.json`
- `user/mood-rules.md`
- `prompts/sonus-persona.md`

Default host style is soft late-night English radio / "gentle night flight". Sonus should reply in English only and recommend only English-language songs or non-Chinese international instrumental music.

## Public API

- `POST /api/chat`
- `GET /api/now`
- `GET /api/stream`
- `GET /api/taste`
- `PUT /api/taste`
- `POST /api/plan/today`

## Recent User Feedback To Preserve

The user has been doing visual QA through browser comments. Preserve these decisions:

- Mode switch sizing/format should feel coordinated and compact.
- `Sonus` should use pixel-style typography and be smaller than the earlier version.
- Clock must show real current time.
- Clock deck bottom waveform should be dynamic.
- Transport left meter icon should be dynamic.
- Transport section should use a technology-style font.
- Top-left avatar image should be removed.
- Topbar `ON AIR` should be removed.
- Pixel blocks in the clock/brand should be finer/smaller.
- Each panel should have an internal pixel-dot background.
- Overall page background should be purple animated gradient.
- Queue's purpose is playback order; it is now collapsible and default collapsed.
- Queue header color should be dark, not light.

## Verification Workflow

After frontend changes:

1. Run:

   ```bash
   corepack pnpm --filter @sonus/web typecheck
   corepack pnpm --filter @sonus/web build
   ```

2. Refresh `http://localhost:3000/` in the in-app browser.
3. Check at mobile-ish viewport because the user screenshots are around 556-599 px wide by 896 px tall.
4. Verify no text overlaps, especially:
   - topbar brand and mode switch
   - clock deck
   - transport title row
   - queue header
   - command dock

After server/shared changes:

```bash
corepack pnpm --filter @sonus/server typecheck
corepack pnpm test
```

## Editing Guidelines For Future Agents

- Keep changes scoped to the user's requested area.
- Do not revert unrelated local changes.
- Use existing patterns before adding new abstractions.
- Use `apply_patch` for manual edits.
- Prefer `rg` for file/text search.
- For UI work, verify in the browser after meaningful visual changes.
- Keep Sonus as the actual player interface, not a landing page.

## Current Known State

As of the latest handoff:

- Root typecheck passed via `corepack pnpm typecheck`.
- Root test passed via `corepack pnpm test`.
- Root production build passed via `corepack pnpm build`.
- Browser verification confirmed `.queueToggle` has dark background color and dot-grid background.
- Browser smoke test confirmed default chat generates a 3-track queue, updates current track, shows lyrics, and binds progress max to the real track duration.
- DeepSeek V4 Pro integration is configured through root `.env` and has been smoke-tested successfully.
- Netease search and real playback URL retrieval work with `NETEASE_COOKIE`. Important: the playback endpoint requires `ids=[id]`, not `id=id`. If an individual track still has no playable URL because of rights/account limits, the adapter keeps real metadata and falls back to playable demo audio with a clear reason marker.
- Fish Audio config is present, and the TTS request includes the official `model: s2-pro` header. Direct connection to `api.fish.audio:443` still times out on this machine. TTS now fails open: Sonus returns DJ text and queue even when audio synthesis is unavailable. Use `corepack pnpm --filter @sonus/server diagnose:fish` to re-test, or set `FISH_BASE_URL` to a reachable proxy/endpoint.
- `state.db` is now a real SQLite database with `state_meta`, `turns`, and `plans` tables. The previous JSON file was migrated and backed up as `state.db.json.bak`.
- The dev server may already be running from a previous session; if not, start it with `corepack pnpm dev`.

## Remaining Work Requiring User Input

Ask the user for these before real integration testing:

- DeepSeek: `DEEPSEEK_API_KEY`. The default model is `deepseek-v4-pro`.
- Fish Audio: `FISH_API_KEY` and `FISH_VOICE_ID`.
- Netease: `NETEASE_COOKIE` if real playback/search needs authenticated access.
- Weather: `OPENWEATHER_API_KEY` and `OPENWEATHER_LOCATION`.
- Calendar: `ICS_URL` or `ICS_FILE`.

Without these, keep using mock mode from `.env.example`.

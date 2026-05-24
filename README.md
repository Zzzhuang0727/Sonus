<p align="right">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a>
</p>

# Sonus

Sonus is a local-first AI DJ and personal radio host. It gives you a browser/PWA radio console where you can ask for a mood, receive five song choices, pick one to play, and let Sonus learn from the songs you select.

The current version focuses on a personal desktop experience:

- Pixel-tech radio UI with purple liquid-glass chat, queue, lyrics, and recent-play panels
- Local Fastify server that coordinates AI planning, music search, speech synthesis, playback state, chat history, and user preferences
- DeepSeek V4 Pro as the DJ brain
- Netease Cloud Music search/playback adapter
- Fish Audio TTS adapter, with graceful fallback when voice synthesis is unavailable
- Local user system with per-user recent song preference files

## Project Structure

```text
apps/web        React + Vite PWA player on localhost:3000
apps/server     Fastify + TypeScript local server on localhost:8787
packages/shared Shared Zod schemas and TypeScript API types
prompts         Sonus persona prompt
cache/tts       Cached generated speech files
user            Local-only user database and preference files
```

## Quick Start

```bash
corepack enable
corepack pnpm install
cp .env.example .env
corepack pnpm dev
```

Open:

```text
http://localhost:3000
```

By default, `.env.example` enables mock mode so the app can run without real API keys.

## Environment Variables

Create a `.env` file in the project root. Do not commit it.

### Required For Real AI Planning

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_THINKING=disabled
DEEPSEEK_REASONING_EFFORT=high
```

`DEEPSEEK_API_KEY` is required when `SONUS_MOCK_AI=false`.

### Required For Fish Audio TTS

```env
FISH_API_KEY=
FISH_BASE_URL=https://api.fish.audio
FISH_VOICE_ID=
```

`FISH_VOICE_ID` is the Fish Audio voice/reference id used for Sonus host narration.

Set `SONUS_MOCK_TTS=false` after these values are configured.

### Required For Netease Music

```env
NETEASE_BASE_URL=https://music.163.com
NETEASE_COOKIE=
```

`NETEASE_COOKIE` is your browser login cookie for Netease Cloud Music. Sonus uses it for your personal local listening workflow. Some tracks may still be unavailable depending on Netease playback restrictions; Sonus falls back instead of bypassing those limits.

Set `SONUS_MOCK_MUSIC=false` after this is configured.

### Optional Context

```env
ICS_URL=
ICS_FILE=
OPENWEATHER_API_KEY=
OPENWEATHER_LOCATION=Shanghai,CN
```

These are optional hooks for calendar/weather context in daily planning.

### Local App Settings

```env
SONUS_PORT=8787
SONUS_WEB_ORIGIN=http://localhost:3000
SONUS_MOCK_AI=true
SONUS_MOCK_MUSIC=true
SONUS_MOCK_TTS=true
```

Mock mode is useful for UI work and local development without paid services.

## How To Use

1. Start the app with `corepack pnpm dev`.
2. Open `http://localhost:3000`.
3. Click `LOGIN` to register a local Sonus user.
4. Registration requires username, phone, and email. Name, age, birthday, preferred genres, and preferred artists are optional.
5. Ask Sonus for a mood, for example: `I want something soft and late-night in English.`
6. Sonus returns five song cards plus a reroll card.
7. Choose a song card to play.
8. The selected song and artist are saved to that user's local preference file.
9. Future recommendations use the user's registration preferences and recent selections.

## Local User And Preference Data

Sonus stores user data only on the current machine:

```text
user/users.db
user/preferences/<userId>.json
```

Each user has an independent preference file. Sonus keeps the latest 100 selected songs and ignores selections older than 30 days.

These files are ignored by git.

## Main APIs

```text
GET    /api/now
GET    /api/history
DELETE /api/history
POST   /api/chat
POST   /api/play/:id
GET    /api/stream
POST   /api/users/register
POST   /api/users/login
GET    /api/users/me
GET    /api/users/preferences
POST   /api/users/logout
POST   /api/plan/today
```

## Development Commands

```bash
corepack pnpm dev
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## Privacy Notes

The following files are intentionally ignored and should stay local:

- `.env`
- `state.db*`
- `user/users.db*`
- `user/preferences/*.json`
- `cache/tts/*.mp3`
- legacy local profile files under `user/*.md` and `user/playlists.json`

## Current Limitations

- Sonus is built for local personal use, not a hosted multi-user service.
- Playback availability depends on the music source and account restrictions.
- Fish Audio TTS can fail if the network or voice id is unavailable; Sonus will still show text and play music.
- UPnP/home-speaker casting is reserved for a future adapter.

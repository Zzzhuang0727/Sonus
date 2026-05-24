import fs from "node:fs/promises";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  TasteProfileSchema,
  UserLoginSchema,
  UserPreferenceFileSchema,
  UserProfileSchema,
  UserRegistrationSchema,
  type TasteProfile,
  type TasteUpdate,
  type Track,
  type UserLogin,
  type UserPreferenceChoice,
  type UserPreferenceFile,
  type UserProfile,
  type UserRegistration
} from "@sonus/shared";
import { paths } from "../config/env";
import { createId } from "../utils/id";

const DEFAULT_USER_ID = "local-default";
const SESSION_COOKIE = "sonus_user_id";
const PREFERENCE_LIMIT = 100;
const PREFERENCE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

interface UserRow {
  id: string;
  username: string;
  name: string;
  age: number | null;
  birth_month_day: string | null;
  phone: string;
  email: string;
  preferred_genres: string;
  preferred_artists: string;
  created_at: string;
  updated_at: string;
}

interface UserStoreOptions {
  dbFile?: string;
  preferenceDir?: string;
}

export class UserStore {
  private db?: DatabaseSync;
  private loaded = false;
  private dbFile: string;
  private preferenceDir: string;

  constructor(options: UserStoreOptions = {}) {
    this.dbFile = options.dbFile ?? paths.userDbFile;
    this.preferenceDir = options.preferenceDir ?? paths.userPreferenceDir;
  }

  async load() {
    this.ensureLoaded();
  }

  close() {
    this.db?.close();
    this.db = undefined;
    this.loaded = false;
  }

  async register(input: UserRegistration) {
    const parsed = this.normalizeRegistration(UserRegistrationSchema.parse(input));
    const now = new Date().toISOString();
    const user = UserProfileSchema.parse({
      id: createId("user"),
      ...parsed,
      name: parsed.name || parsed.username,
      createdAt: now,
      updatedAt: now
    });

    this.ensureLoaded();

    try {
      this.database()
        .prepare(
          `INSERT INTO users (
            id, username, name, age, birth_month_day, phone, email,
            preferred_genres, preferred_artists, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          user.id,
          user.username,
          user.name,
          user.age ?? null,
          user.birthMonthDay ?? null,
          user.phone,
          user.email,
          JSON.stringify(user.preferredGenres),
          JSON.stringify(user.preferredArtists),
          user.createdAt,
          user.updatedAt
        );
    } catch (error) {
      if (isConstraintError(error)) {
        throw new Error("A local Sonus user with this username, phone, or email already exists.");
      }
      throw error;
    }

    await this.writePreferenceFile(user.id, this.emptyPreferenceFile(user.id));
    return user;
  }

  async login(input: UserLogin) {
    const parsed = UserLoginSchema.parse(input);
    this.ensureLoaded();

    const identity = normalizeText(parsed.identity);
    const emailIdentity = normalizeEmail(parsed.identity);
    const row = this.database()
      .prepare("SELECT * FROM users WHERE username = ? OR phone = ? OR email = ?")
      .get(identity, identity, emailIdentity) as UserRow | undefined;

    return row ? this.rowToUser(row) : undefined;
  }

  async getCurrentUser(cookieHeader?: string) {
    const sessionUserId = this.getSessionUserId(cookieHeader);
    const user = sessionUserId ? this.getUserById(sessionUserId) : undefined;
    return user ?? this.getDefaultUser();
  }

  getSessionUserId(cookieHeader?: string) {
    if (!cookieHeader) {
      return undefined;
    }

    const cookies = cookieHeader.split(";").map((part) => part.trim());
    for (const cookie of cookies) {
      const [name, ...rawValue] = cookie.split("=");
      if (name === SESSION_COOKIE) {
        return decodeURIComponent(rawValue.join("="));
      }
    }

    return undefined;
  }

  buildSessionCookie(userId: string) {
    return `${SESSION_COOKIE}=${encodeURIComponent(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
  }

  clearSessionCookie() {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  async recordSelection(userId: string, track: Track) {
    const user = this.getUserById(userId) ?? this.getDefaultUser();
    const preferenceFile = await this.readPreferenceFile(user.id);
    const choice: UserPreferenceChoice = {
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      source: track.source,
      chosenAt: new Date().toISOString()
    };

    const cutoff = Date.now() - PREFERENCE_WINDOW_MS;
    const choices = [choice, ...preferenceFile.choices.filter((item) => item.trackId !== choice.trackId)]
      .filter((item) => Date.parse(item.chosenAt) >= cutoff)
      .slice(0, PREFERENCE_LIMIT);

    await this.writePreferenceFile(user.id, {
      userId: user.id,
      updatedAt: choice.chosenAt,
      choices
    });
  }

  async readPreferenceFile(userId: string) {
    const user = this.getUserById(userId) ?? this.getDefaultUser();
    const filePath = this.preferenceFilePath(user.id);

    try {
      const file = UserPreferenceFileSchema.parse(JSON.parse(await fs.readFile(filePath, "utf8")));
      return file.userId === user.id ? file : this.emptyPreferenceFile(user.id);
    } catch {
      return this.emptyPreferenceFile(user.id);
    }
  }

  async buildUserProfileContext(userId?: string) {
    const user = userId ? this.getUserById(userId) ?? this.getDefaultUser() : this.getDefaultUser();
    const preferenceFile = await this.readPreferenceFile(user.id);
    const recent = preferenceFile.choices.slice(0, 20);
    const topArtists = topCounts(preferenceFile.choices.map((choice) => choice.artist)).slice(0, 10);

    return [
      "# Registered User Profile",
      `Username: ${user.username}`,
      `Name: ${user.name}`,
      `Age: ${user.age ?? "not provided"}`,
      `Birth month/day: ${user.birthMonthDay ?? "not provided"}`,
      `Registered preferred genres: ${formatList(user.preferredGenres)}`,
      `Registered preferred artists/bands: ${formatList(user.preferredArtists)}`,
      "",
      "# Recent Song Preference File",
      `File rule: keep the latest ${PREFERENCE_LIMIT} selected songs, limited to selections from the last 30 days.`,
      `Stored selections: ${preferenceFile.choices.length}`,
      `Recently selected artists/bands: ${formatCountList(topArtists)}`,
      "Recent selected songs:",
      recent.length ? recent.map((choice, index) => `${index + 1}. ${choice.title} - ${choice.artist} (${choice.chosenAt})`).join("\n") : "No card selections have been recorded yet.",
      "",
      "# Recommendation Use",
      "When planning the next 5 cards, use the registered genres/artists and recent selected songs as taste evidence.",
      "Prefer adjacent English-language songs or non-Chinese international instrumental music. Do not repeat the exact same recent songs unless the user asks for repeats."
    ].join("\n");
  }

  async readTasteProfileForUser(userId?: string): Promise<TasteProfile> {
    const user = userId ? this.getUserById(userId) ?? this.getDefaultUser() : this.getDefaultUser();
    const preferenceFile = await this.readPreferenceFile(user.id);
    const recentSeeds = preferenceFile.choices
      .flatMap((choice) => [choice.artist, choice.title])
      .filter(Boolean)
      .slice(0, 20);

    return TasteProfileSchema.parse({
      tasteMd: await this.buildUserProfileContext(user.id),
      routinesMd: "# Preference Storage\nSonus now learns from the current local user's selected recommendation cards instead of legacy markdown preference files.",
      moodRulesMd:
        "# Preference Freshness\nEach user has an independent local preference file. The file keeps the latest 100 unique selected songs and drops selections older than 30 days.",
      playlists: [
        {
          name: "Registered Preference Seeds",
          description: "Genres and artists saved during local registration.",
          seeds: [...user.preferredGenres, ...user.preferredArtists, ...recentSeeds].slice(0, 40)
        }
      ]
    });
  }

  async updateTasteProfileForUser(userId: string, update: TasteUpdate) {
    const user = this.getUserById(userId) ?? this.getDefaultUser();
    const seeds = update.playlists?.flatMap((playlist) => playlist.seeds).map(normalizeText).filter(Boolean).slice(0, 40);

    if (seeds?.length) {
      const now = new Date().toISOString();
      this.database()
        .prepare(
          `UPDATE users
           SET preferred_genres = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(JSON.stringify(uniqueStrings(seeds)), now, user.id);
    }

    return this.readTasteProfileForUser(user.id);
  }

  getUserById(id: string) {
    this.ensureLoaded();
    const row = this.database().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return row ? this.rowToUser(row) : undefined;
  }

  private ensureLoaded() {
    if (this.loaded) {
      return;
    }

    mkdirSync(path.dirname(this.dbFile), { recursive: true });
    mkdirSync(this.preferenceDir, { recursive: true });
    this.db = new DatabaseSync(this.dbFile);
    this.migrateSchema();
    this.ensureDefaultUser();
    this.loaded = true;
  }

  private migrateSchema() {
    const table = this.database().prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
    if (!table) {
      this.createUserSchema();
      return;
    }

    const columns = this.database().prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "username")) {
      this.database().exec("DROP TABLE users;");
      this.createUserSchema();
      return;
    }

    this.database().exec(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    `);
  }

  private createUserSchema() {
    this.database().exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        age INTEGER,
        birth_month_day TEXT,
        phone TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        preferred_genres TEXT NOT NULL,
        preferred_artists TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    `);
  }

  private ensureDefaultUser() {
    const existing = this.database().prepare("SELECT id FROM users WHERE id = ?").get(DEFAULT_USER_ID);
    if (existing) {
      return;
    }

    const now = new Date().toISOString();
    this.database()
      .prepare(
        `INSERT INTO users (
          id, username, name, age, birth_month_day, phone, email,
          preferred_genres, preferred_artists, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        DEFAULT_USER_ID,
        "local",
        "Local Listener",
        null,
        null,
        "local-default",
        "local-default@sonus.local",
        JSON.stringify(["late night English indie", "ambient instrumental"]),
        JSON.stringify([]),
        now,
        now
      );
  }

  private getDefaultUser() {
    const user = this.getUserById(DEFAULT_USER_ID);
    if (!user) {
      throw new Error("Sonus default local user could not be loaded.");
    }

    return user;
  }

  private database() {
    if (!this.db) {
      throw new Error("UserStore has not been loaded.");
    }

    return this.db;
  }

  private normalizeRegistration(input: UserRegistration): UserRegistration {
    return {
      username: normalizeUsername(input.username),
      name: normalizeText(input.name ?? ""),
      age: input.age,
      birthMonthDay: input.birthMonthDay,
      phone: normalizeText(input.phone),
      email: normalizeEmail(input.email),
      preferredGenres: uniqueStrings(input.preferredGenres.map(normalizeText)),
      preferredArtists: uniqueStrings(input.preferredArtists.map(normalizeText))
    };
  }

  private rowToUser(row: UserRow) {
    return UserProfileSchema.parse({
      id: row.id,
      username: row.username,
      name: row.name,
      age: row.age ?? undefined,
      birthMonthDay: row.birth_month_day ?? undefined,
      phone: row.phone,
      email: row.email,
      preferredGenres: parseStringArray(row.preferred_genres),
      preferredArtists: parseStringArray(row.preferred_artists),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  private emptyPreferenceFile(userId: string): UserPreferenceFile {
    return {
      userId,
      updatedAt: new Date().toISOString(),
      choices: []
    };
  }

  private async writePreferenceFile(userId: string, preferenceFile: UserPreferenceFile) {
    await fs.mkdir(this.preferenceDir, { recursive: true });
    await fs.writeFile(this.preferenceFilePath(userId), `${JSON.stringify(UserPreferenceFileSchema.parse(preferenceFile), null, 2)}\n`, "utf8");
  }

  private preferenceFilePath(userId: string) {
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.preferenceDir, `${safeUserId}.json`);
  }
}

function normalizeText(value: string) {
  return value.trim();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? uniqueStrings(parsed.filter((item): item is string => typeof item === "string").map(normalizeText)) : [];
  } catch {
    return [];
  }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function topCounts(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values.map(normalizeText).filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function formatList(values: string[]) {
  return values.length ? values.join(", ") : "none yet";
}

function formatCountList(values: Array<[string, number]>) {
  return values.length ? values.map(([name, count]) => `${name} (${count})`).join(", ") : "none yet";
}

function isConstraintError(error: unknown) {
  return error instanceof Error && /constraint|unique/i.test(error.message);
}

export const userStore = new UserStore();

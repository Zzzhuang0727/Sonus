import fs from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DJTurn, NowState, QueueItem, SonusPlan } from "@sonus/shared";
import { DJTurnSchema, NowStateSchema, SonusPlanSchema } from "@sonus/shared";
import { paths } from "../config/env";

interface PersistedState {
  now: NowState;
  turns: DJTurn[];
  plans: SonusPlan[];
}

const initialNow: NowState = NowStateSchema.parse({
  queue: [],
  hostStatus: "idle",
  progressMs: 0,
  updatedAt: new Date().toISOString()
});

export class StateStore {
  private db?: DatabaseSync;
  private stateFile: string;

  constructor(stateFile = paths.stateFile) {
    this.stateFile = stateFile;
  }

  async load() {
    await this.migrateJsonStateIfNeeded();
    this.open();
    this.migrateSchema();

    if (!this.getMeta("now")) {
      this.setMeta("now", initialNow);
    }
  }

  close() {
    this.db?.close();
    this.db = undefined;
  }

  getNow() {
    return NowStateSchema.parse(this.getMeta("now") ?? initialNow);
  }

  getTurns(limit = 8) {
    if (!this.db) {
      return [];
    }

    const rows = this.database()
      .prepare(
        `SELECT payload
         FROM (
           SELECT payload, created_at, rowid
           FROM turns
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?
         )
         ORDER BY created_at ASC, rowid ASC`
      )
      .all(limit) as Array<{ payload: string }>;
    return rows.map((row) => DJTurnSchema.parse(JSON.parse(row.payload)));
  }

  async setHostStatus(hostStatus: NowState["hostStatus"]) {
    this.setNow({
      ...this.getNow(),
      hostStatus,
      updatedAt: new Date().toISOString()
    });
  }

  async addTurn(turn: DJTurn) {
    const parsedTurn = DJTurnSchema.parse(turn);
    this.database()
      .prepare(
        `INSERT OR REPLACE INTO turns (id, created_at, payload)
         VALUES (?, ?, ?)`
      )
      .run(parsedTurn.id, parsedTurn.createdAt, JSON.stringify(parsedTurn));

    this.database().prepare("DELETE FROM turns WHERE rowid NOT IN (SELECT rowid FROM turns ORDER BY created_at DESC, rowid DESC LIMIT 50)").run();

    this.setNow({
      ...this.getNow(),
      queue: parsedTurn.queue,
      next: parsedTurn.queue[0],
      lastSegue: parsedTurn.segue,
      lastSpeechUrl: parsedTurn.speechUrl,
      hostStatus: parsedTurn.speechUrl ? "speaking" : "playing",
      updatedAt: new Date().toISOString()
    });
  }

  async clearTurns() {
    this.database().prepare("DELETE FROM turns").run();
    const currentNow = this.getNow();
    this.setNow({
      ...currentNow,
      lastSegue: undefined,
      lastSpeechUrl: undefined,
      hostStatus: currentNow.current ? currentNow.hostStatus : "idle",
      updatedAt: new Date().toISOString()
    });
  }

  async setQueue(queue: QueueItem[]) {
    const current = queue.find((item) => item.status === "playing") ?? this.getNow().current;
    const next = queue.find((item) => item.status === "queued");
    this.setNow({
      ...this.getNow(),
      current,
      next,
      queue,
      updatedAt: new Date().toISOString()
    });
  }

  async playQueueItem(id: string) {
    const currentNow = this.getNow();
    const sourceQueue = currentNow.queue.some((item) => item.id === id) ? currentNow.queue : this.findTurnQueueItem(id);
    const queue: QueueItem[] = sourceQueue.map((item): QueueItem => ({
      ...item,
      status: item.id === id ? "playing" : item.status === "playing" ? "played" : item.status
    }));
    const current = queue.find((item) => item.id === id);
    const next = queue.find((item) => item.status === "queued");
    this.setNow({
      ...currentNow,
      current,
      next,
      queue,
      hostStatus: "playing",
      progressMs: 0,
      updatedAt: new Date().toISOString()
    });
  }

  async savePlan(plan: SonusPlan) {
    const parsedPlan = SonusPlanSchema.parse(plan);
    this.database()
      .prepare(
        `INSERT OR REPLACE INTO plans (id, date, created_at, payload)
         VALUES (?, ?, ?, ?)`
      )
      .run(parsedPlan.id, parsedPlan.date, parsedPlan.createdAt, JSON.stringify(parsedPlan));

    this.database().prepare("DELETE FROM plans WHERE rowid NOT IN (SELECT rowid FROM plans ORDER BY created_at DESC, rowid DESC LIMIT 20)").run();
  }

  private setNow(now: NowState) {
    this.setMeta("now", NowStateSchema.parse(now));
  }

  private open() {
    if (this.db) {
      return;
    }

    mkdirSync(path.dirname(this.stateFile), { recursive: true });
    this.db = new DatabaseSync(this.stateFile);
  }

  private migrateSchema() {
    const db = this.database();
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS state_meta (
        key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_turns_created_at ON turns(created_at);
      CREATE INDEX IF NOT EXISTS idx_plans_created_at ON plans(created_at);
    `);
  }

  private getMeta<T>(key: string): T | undefined {
    const row = this.database().prepare("SELECT payload FROM state_meta WHERE key = ?").get(key) as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as T) : undefined;
  }

  private setMeta(key: string, payload: unknown) {
    this.database()
      .prepare(
        `INSERT INTO state_meta (key, payload, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
      )
      .run(key, JSON.stringify(payload), new Date().toISOString());
  }

  private findTurnQueueItem(id: string) {
    const rows = this.database()
      .prepare(
        `SELECT payload
         FROM turns
         ORDER BY created_at DESC, rowid DESC`
      )
      .all() as Array<{ payload: string }>;

    for (const row of rows) {
      const turn = DJTurnSchema.parse(JSON.parse(row.payload));
      if (turn.queue.some((item) => item.id === id)) {
        return turn.queue;
      }
    }

    return this.getNow().queue;
  }

  private database() {
    if (!this.db) {
      throw new Error("StateStore has not been loaded.");
    }

    return this.db;
  }

  private async migrateJsonStateIfNeeded() {
    if (!existsSync(this.stateFile)) {
      return;
    }

    const header = readFileSync(this.stateFile).subarray(0, 16).toString("utf8");
    if (header === "SQLite format 3\u0000") {
      return;
    }

    let parsed: PersistedState;
    try {
      parsed = JSON.parse(await fs.readFile(this.stateFile, "utf8")) as PersistedState;
    } catch {
      return;
    }

    const backupPath = `${this.stateFile}.json.bak`;
    renameSync(this.stateFile, backupPath);
    this.open();
    this.migrateSchema();
    this.importJsonState(parsed);
  }

  private importJsonState(state: PersistedState) {
    this.setNow(NowStateSchema.parse(state.now ?? initialNow));

    for (const turn of state.turns ?? []) {
      const parsedTurn = DJTurnSchema.parse(turn);
      this.database()
        .prepare("INSERT OR REPLACE INTO turns (id, created_at, payload) VALUES (?, ?, ?)")
        .run(parsedTurn.id, parsedTurn.createdAt, JSON.stringify(parsedTurn));
    }

    for (const plan of state.plans ?? []) {
      const parsedPlan = SonusPlanSchema.parse(plan);
      this.database()
        .prepare("INSERT OR REPLACE INTO plans (id, date, created_at, payload) VALUES (?, ?, ?, ?)")
        .run(parsedPlan.id, parsedPlan.date, parsedPlan.createdAt, JSON.stringify(parsedPlan));
    }
  }
}

export const stateStore = new StateStore();

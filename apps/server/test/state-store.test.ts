import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DJTurn, QueueItem } from "@sonus/shared";
import { StateStore } from "../src/state/store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("StateStore", () => {
  it("persists now state and turns in SQLite", async () => {
    const file = await tempStateFile();
    const store = new StateStore(file);
    await store.load();

    const turn = makeTurn("turn-1");
    await store.addTurn(turn);
    await store.playQueueItem(turn.queue[0]!.id);
    store.close();

    const reopened = new StateStore(file);
    await reopened.load();
    expect(reopened.getNow().current?.id).toBe(turn.queue[0]!.id);
    expect(reopened.getTurns(1)[0]?.id).toBe("turn-1");
    reopened.close();
  });

  it("clears persisted chat turns without clearing queue state", async () => {
    const file = await tempStateFile();
    const store = new StateStore(file);
    await store.load();

    const turn = makeTurn("turn-clear");
    await store.addTurn(turn);
    expect(store.getTurns(1)).toHaveLength(1);
    await store.clearTurns();

    expect(store.getTurns(1)).toHaveLength(0);
    expect(store.getNow().queue[0]?.id).toBe(turn.queue[0]!.id);
    expect(store.getNow().lastSpeechUrl).toBeUndefined();
    store.close();
  });

  it("can play a song choice from an older chat turn", async () => {
    const file = await tempStateFile();
    const store = new StateStore(file);
    await store.load();

    const oldTurn = makeTurn("turn-old");
    const newTurn = makeTurn("turn-new");
    await store.addTurn(oldTurn);
    await store.addTurn(newTurn);
    await store.playQueueItem(oldTurn.queue[0]!.id);

    expect(store.getNow().current?.id).toBe(oldTurn.queue[0]!.id);
    expect(store.getNow().queue[0]?.id).toBe(oldTurn.queue[0]!.id);
    store.close();
  });

  it("migrates old JSON state.db into SQLite and keeps a backup", async () => {
    const file = await tempStateFile();
    const turn = makeTurn("turn-json");
    await fs.writeFile(
      file,
      `${JSON.stringify(
        {
          now: {
            queue: turn.queue,
            hostStatus: "idle",
            progressMs: 0,
            updatedAt: new Date().toISOString()
          },
          turns: [turn],
          plans: []
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const store = new StateStore(file);
    await store.load();
    expect(await fs.readFile(file, "utf8")).toContain("SQLite format 3");
    expect(await fs.readFile(`${file}.json.bak`, "utf8")).toContain("turn-json");
    expect(store.getTurns(1)[0]?.id).toBe("turn-json");
    store.close();
  });
});

async function tempStateFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sonus-state-"));
  tempDirs.push(dir);
  return path.join(dir, "state.db");
}

function makeTurn(id: string): DJTurn {
  const queue: QueueItem[] = [
    {
      id: `${id}-queue`,
      track: {
        id: `${id}-track`,
        title: "Test Track",
        artist: "Sonus",
        source: "mock",
        audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
      },
      reason: "test",
      requestedBy: "sonus",
      status: "queued"
    }
  ];

  return {
    id,
    say: "hello",
    reason: "test",
    queue,
    createdAt: new Date().toISOString()
  };
}

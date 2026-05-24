import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UserStore } from "../src/users/store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("UserStore", () => {
  it("registers and logs in a local user", async () => {
    const store = await tempUserStore();
    const user = await store.register({
      username: "avery",
      phone: "13800000000",
      email: "avery@example.com",
      name: "Avery",
      age: 29,
      birthMonthDay: "04-12",
      preferredGenres: ["dream pop", "ambient"],
      preferredArtists: ["Beach House"]
    });

    const loginByUsername = await store.login({ identity: "avery" });
    const loginByEmail = await store.login({ identity: "AVERY@example.com" });
    const loginByPhone = await store.login({ identity: "13800000000" });

    expect(loginByUsername?.id).toBe(user.id);
    expect(loginByEmail?.id).toBe(user.id);
    expect(loginByPhone?.preferredArtists).toContain("Beach House");
    store.close();
  });

  it("stores recent selected tracks in an independent per-user preference file", async () => {
    const { store, preferenceDir } = await tempUserStoreWithPaths();
    const user = await store.register({
      username: "mira",
      phone: "13900000000",
      email: "mira@example.com",
      name: "Mira",
      preferredGenres: ["slowcore"],
      preferredArtists: ["Cigarettes After Sex"]
    });
    const otherUser = await store.register({
      username: "noah",
      phone: "13700000000",
      email: "noah@example.com",
      name: "Noah",
      preferredGenres: ["post rock"],
      preferredArtists: ["Explosions in the Sky"]
    });

    await store.recordSelection(user.id, {
      id: "space-song",
      title: "Space Song",
      artist: "Beach House",
      source: "mock"
    });

    const preferenceFile = await store.readPreferenceFile(user.id);
    const otherPreferenceFile = await store.readPreferenceFile(otherUser.id);
    const files = await fs.readdir(preferenceDir);

    expect(preferenceFile.choices[0]?.title).toBe("Space Song");
    expect(otherPreferenceFile.choices).toEqual([]);
    expect(files.some((file) => file.endsWith(".json"))).toBe(true);
    store.close();
  });

  it("keeps only the latest 100 selected songs", async () => {
    const store = await tempUserStore();
    const user = await store.register({
      username: "lee",
      phone: "13600000000",
      email: "lee@example.com",
      preferredGenres: [],
      preferredArtists: []
    });

    for (let index = 0; index < 101; index += 1) {
      await store.recordSelection(user.id, {
        id: `track-${index}`,
        title: `Track ${index}`,
        artist: `Artist ${index}`,
        source: "mock"
      });
    }

    const preferenceFile = await store.readPreferenceFile(user.id);
    expect(preferenceFile.choices).toHaveLength(100);
    expect(preferenceFile.choices[0]?.title).toBe("Track 100");
    expect(preferenceFile.choices.at(-1)?.title).toBe("Track 1");
    store.close();
  });

  it("builds recommendation context from registration and recent selections", async () => {
    const store = await tempUserStore();
    const user = await store.register({
      username: "iris",
      phone: "13500000000",
      email: "iris@example.com",
      name: "Iris",
      preferredGenres: ["English indie"],
      preferredArtists: ["Men I Trust"]
    });

    await store.recordSelection(user.id, {
      id: "norton",
      title: "Norton Commander",
      artist: "Men I Trust",
      source: "mock"
    });

    const context = await store.buildUserProfileContext(user.id);

    expect(context).toContain("Registered preferred genres: English indie");
    expect(context).toContain("Registered preferred artists/bands: Men I Trust");
    expect(context).toContain("Norton Commander - Men I Trust");
    store.close();
  });
});

async function tempUserStore() {
  const { store } = await tempUserStoreWithPaths();
  return store;
}

async function tempUserStoreWithPaths() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sonus-users-"));
  tempDirs.push(dir);
  const preferenceDir = path.join(dir, "preferences");
  const store = new UserStore({
    dbFile: path.join(dir, "users.db"),
    preferenceDir
  });
  await store.load();
  return { store, preferenceDir };
}

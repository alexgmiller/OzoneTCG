import { describe, expect, it } from "vitest";
import { syncedAgo, syncProblem } from "./tcgplayerSyncStatus";

describe("syncProblem", () => {
  const ok = { groups: 462, emptyGroups: 3, cards: 30407, errors: [] };
  it("passes a normal run", () => {
    expect(syncProblem(ok)).toBeNull();
  });
  it("fails a run that saved nothing, hit write errors, or lost many sets", () => {
    expect(syncProblem({ ...ok, cards: 0 })).toMatch(/No cards/);
    expect(syncProblem({ ...ok, errors: ["Upsert 0–1000: permission denied"] })).toMatch(/1 write error: Upsert/);
    expect(syncProblem({ ...ok, emptyGroups: 200 })).toBe("200 of 462 sets didn't download");
  });
});

describe("syncedAgo", () => {
  const now = Date.parse("2026-11-17T20:00:00Z");
  it("reads like a person would say it", () => {
    expect(syncedAgo("2026-11-17T19:59:50Z", now)).toBe("just now");
    expect(syncedAgo("2026-11-17T19:48:00Z", now)).toBe("12 min ago");
    expect(syncedAgo("2026-11-17T17:00:00Z", now)).toBe("3 hr ago");
    expect(syncedAgo("2026-11-15T20:00:00Z", now)).toBe("2 days ago");
  });
});

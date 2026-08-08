import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tmpHome: string;
let enqueue: typeof import("../src/agent/pending-actions.js")["enqueue"];
let list: typeof import("../src/agent/pending-actions.js")["list"];
let getById: typeof import("../src/agent/pending-actions.js")["getById"];
let resolve: typeof import("../src/agent/pending-actions.js")["resolve"];

beforeAll(async () => {
  tmpHome = mkdtempSync(path.join(tmpdir(), "automaton-pending-"));
  process.env.AUTOMATON_HOME = tmpHome;
  ({ enqueue, list, getById, resolve } = await import("../src/agent/pending-actions.js"));
});

afterAll(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.AUTOMATON_HOME;
});

describe("pending-actions queue", () => {
  it("enqueues an action as pending", () => {
    const action = enqueue("send_testnet_transfer", { toAddress: "0xabc", amountEth: "0.01" });
    expect(action.status).toBe("pending");
    expect(action.toolName).toBe("send_testnet_transfer");
    expect(action.input).toEqual({ toAddress: "0xabc", amountEth: "0.01" });
    expect(action.resolvedAt).toBeNull();
  });

  it("lists actions filtered by status", () => {
    const a = enqueue("register_onchain_identity", {});
    const b = enqueue("spawn_child", { name: "child", genesisPrompt: "go", fundingCredits: 1 });
    resolve(a.id, "rejected");

    const pending = list("pending");
    expect(pending.some((x) => x.id === a.id)).toBe(false);
    expect(pending.some((x) => x.id === b.id)).toBe(true);

    const rejected = list("rejected");
    expect(rejected.some((x) => x.id === a.id)).toBe(true);
  });

  it("resolves an action with a result payload and timestamps it", () => {
    const action = enqueue("send_testnet_transfer", { toAddress: "0xdef", amountEth: "1" });
    const resolved = resolve(action.id, "executed", { txHash: "0x123" });
    expect(resolved.status).toBe("executed");
    expect(resolved.result).toEqual({ txHash: "0x123" });
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it("round-trips via getById", () => {
    const action = enqueue("spawn_child", { name: "x", genesisPrompt: "y", fundingCredits: 0 });
    const fetched = getById(action.id);
    expect(fetched).toEqual(action);
  });

  it("returns undefined for a nonexistent id", () => {
    expect(getById(999999)).toBeUndefined();
  });
});

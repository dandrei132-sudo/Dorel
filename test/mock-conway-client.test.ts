import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tmpHome: string;
let MockConwayClient: typeof import("../src/conway/mock-client.js")["MockConwayClient"];

beforeAll(async () => {
  tmpHome = mkdtempSync(path.join(tmpdir(), "automaton-conway-"));
  process.env.AUTOMATON_HOME = tmpHome;
  ({ MockConwayClient } = await import("../src/conway/mock-client.js"));
});

afterAll(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.AUTOMATON_HOME;
});

describe("MockConwayClient", () => {
  it("seeds a genesis grant and reports the normal tier", async () => {
    const client = new MockConwayClient();
    const { credits, tier } = await client.getCredits();
    expect(credits).toBe(25);
    expect(tier).toBe("normal");
  });

  it("charges inference usage against the ledger", async () => {
    const client = new MockConwayClient();
    const before = await client.getCredits();
    const { charged, balanceAfter } = await client.chargeInference({
      model: "claude-sonnet-5",
      inputTokens: 1000,
      outputTokens: 1000,
    });
    expect(charged).toBeCloseTo(0.03, 5);
    expect(balanceAfter).toBeCloseTo(before.credits - 0.03, 5);
  });

  it("declines x402 payment when balance is insufficient", async () => {
    const client = new MockConwayClient();
    const { credits } = await client.getCredits();
    const result = await client.x402Pay({
      resourceUrl: "https://example.com/resource",
      amount: credits + 1000,
      currency: "USD",
    });
    expect(result.paid).toBe(false);
    expect(result.balanceAfter).toBe(credits);
  });

  it("accepts x402 payment when balance is sufficient", async () => {
    const client = new MockConwayClient();
    const { credits } = await client.getCredits();
    const result = await client.x402Pay({
      resourceUrl: "https://example.com/resource",
      amount: 1,
      currency: "USD",
    });
    expect(result.paid).toBe(true);
    expect(result.balanceAfter).toBeCloseTo(credits - 1, 5);
    expect(result.receiptId).not.toBe("");
  });

  it("provisions a mock API key deterministically scoped to the address", async () => {
    const client = new MockConwayClient();
    const result = await client.provisionApiKey({
      address: "0x1234567890abcdef1234567890abcdef12345678",
      siweMessage: "message",
      signature: "0xsig",
    });
    expect(result.apiKey).toContain("12345678");
    expect(result.address).toBe("0x1234567890abcdef1234567890abcdef12345678");
  });
});

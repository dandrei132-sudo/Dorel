import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getDb } from "../state/db.js";
import { tierForBalance } from "../survival/tiers.js";
import type {
  ChargeInferenceRequest,
  ChargeResult,
  ConwayClient,
  CreditBalance,
  ProvisionApiKeyRequest,
  ProvisionApiKeyResult,
  RegisterDomainRequest,
  RegisterDomainResult,
  SpawnSandboxRequest,
  SpawnSandboxResult,
  X402PaymentRequest,
  X402PaymentResult,
} from "./types.js";

const STARTING_CREDITS = 25;
const INFERENCE_COST_PER_1K_TOKENS = 0.015;

/**
 * Local, standalone implementation of the Conway Cloud surface. Backed by
 * the same SQLite database as the rest of the agent's state, with a real
 * (simulated) credit ledger that actually decrements as the agent spends —
 * so survival-tier transitions are genuinely exercised end-to-end without
 * needing real Conway Cloud credentials.
 */
export class MockConwayClient implements ConwayClient {
  private readonly db: Database.Database;

  constructor(db: Database.Database = getDb()) {
    this.db = db;
    this.ensureSeeded();
  }

  private ensureSeeded(): void {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM credits_ledger")
      .get() as { count: number };
    if (row.count === 0) {
      this.record(STARTING_CREDITS, "genesis_grant");
    }
  }

  private currentBalance(): number {
    const row = this.db
      .prepare(
        "SELECT balance_after FROM credits_ledger ORDER BY id DESC LIMIT 1",
      )
      .get() as { balance_after: number } | undefined;
    return row?.balance_after ?? 0;
  }

  private record(delta: number, reason: string): number {
    const balanceAfter = Math.max(0, this.currentBalance() + delta);
    this.db
      .prepare(
        "INSERT INTO credits_ledger (delta, reason, balance_after) VALUES (?, ?, ?)",
      )
      .run(delta, reason, balanceAfter);
    return balanceAfter;
  }

  async getCredits(): Promise<CreditBalance> {
    const credits = this.currentBalance();
    return { credits, tier: tierForBalance(credits) };
  }

  async provisionApiKey(
    req: ProvisionApiKeyRequest,
  ): Promise<ProvisionApiKeyResult> {
    // Real SIWE signature was already produced by the caller (see
    // src/identity/siwe.ts); here we simulate what a real Conway backend
    // would do after verifying it: issue a scoped API key.
    return {
      apiKey: `mock_${req.address.slice(2, 10)}_${randomUUID().slice(0, 8)}`,
      address: req.address,
    };
  }

  async chargeInference(req: ChargeInferenceRequest): Promise<ChargeResult> {
    const totalTokens = req.inputTokens + req.outputTokens;
    const cost = (totalTokens / 1000) * INFERENCE_COST_PER_1K_TOKENS;
    const balanceAfter = this.record(-cost, `inference:${req.model}`);
    return { charged: cost, balanceAfter };
  }

  async x402Pay(req: X402PaymentRequest): Promise<X402PaymentResult> {
    const balance = this.currentBalance();
    if (balance < req.amount) {
      return {
        paid: false,
        amount: req.amount,
        balanceAfter: balance,
        receiptId: "",
      };
    }
    const balanceAfter = this.record(-req.amount, `x402:${req.resourceUrl}`);
    return {
      paid: true,
      amount: req.amount,
      balanceAfter,
      receiptId: randomUUID(),
    };
  }

  async spawnSandbox(req: SpawnSandboxRequest): Promise<SpawnSandboxResult> {
    this.record(-req.fundingCredits, `spawn_sandbox:${req.name}`);
    return { sandboxId: `sandbox_${randomUUID().slice(0, 12)}`, status: "provisioning" };
  }

  async registerDomain(
    req: RegisterDomainRequest,
  ): Promise<RegisterDomainResult> {
    const cost = 1;
    this.record(-cost, `register_domain:${req.domain}`);
    return { domain: req.domain, registered: true, cost };
  }
}

export type SurvivalTier = "normal" | "low_compute" | "critical" | "dead";

export interface CreditBalance {
  credits: number;
  tier: SurvivalTier;
}

export interface ProvisionApiKeyRequest {
  address: string;
  siweMessage: string;
  signature: string;
}

export interface ProvisionApiKeyResult {
  apiKey: string;
  address: string;
}

export interface ChargeInferenceRequest {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ChargeResult {
  charged: number;
  balanceAfter: number;
}

export interface X402PaymentRequest {
  resourceUrl: string;
  amount: number;
  currency: string;
}

export interface X402PaymentResult {
  paid: boolean;
  amount: number;
  balanceAfter: number;
  receiptId: string;
}

export interface SpawnSandboxRequest {
  name: string;
  genesisPrompt: string;
  fundingCredits: number;
}

export interface SpawnSandboxResult {
  sandboxId: string;
  status: "provisioning" | "running";
}

export interface RegisterDomainRequest {
  domain: string;
}

export interface RegisterDomainResult {
  domain: string;
  registered: boolean;
  cost: number;
}

/**
 * Surface area described in the Automaton spec for "Conway Cloud" — a
 * proprietary paid service (credits, SIWE-based API key provisioning,
 * x402 micropayments, sandbox provisioning, domain registration). No
 * public API docs or credentials exist for the real service, so this is
 * an interface a real client can implement later; see MockConwayClient
 * for the local, standalone-runnable implementation used by default.
 */
export interface ConwayClient {
  getCredits(): Promise<CreditBalance>;
  provisionApiKey(req: ProvisionApiKeyRequest): Promise<ProvisionApiKeyResult>;
  chargeInference(req: ChargeInferenceRequest): Promise<ChargeResult>;
  x402Pay(req: X402PaymentRequest): Promise<X402PaymentResult>;
  spawnSandbox(req: SpawnSandboxRequest): Promise<SpawnSandboxResult>;
  registerDomain(req: RegisterDomainRequest): Promise<RegisterDomainResult>;
}

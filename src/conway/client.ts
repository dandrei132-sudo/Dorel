import { env } from "../config.js";
import { MockConwayClient } from "./mock-client.js";
import type { ConwayClient } from "./types.js";

export type { ConwayClient } from "./types.js";
export * from "./types.js";

/**
 * Returns the active ConwayClient. Defaults to the local mock so the agent
 * loop runs standalone. If CONWAY_API_URL is set, this is the seam where a
 * real HTTP-backed client would be constructed and returned instead — no
 * real implementation exists yet since there's no public API to integrate
 * against.
 */
export function createConwayClient(): ConwayClient {
  if (env.CONWAY_API_URL) {
    throw new Error(
      `CONWAY_API_URL is set (${env.CONWAY_API_URL}) but no real ConwayClient implementation exists yet. ` +
        "Remove CONWAY_API_URL to use the local mock client, or implement RealConwayClient against your Conway Cloud endpoint.",
    );
  }
  return new MockConwayClient();
}

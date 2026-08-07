import Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig } from "../config.js";
import type { ConwayClient } from "../conway/types.js";
import { SurvivalMonitor } from "../survival/monitor.js";
import { appendMessage, loadRecentContext } from "./context.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { createToolContext, executeTool, TOOL_DEFINITIONS, type ToolContext } from "./tools.js";
import type { Wallet } from "ethers";
import type { SkillRegistry } from "../skills/registry.js";

const MAX_TOOL_ITERATIONS = 8;

export interface AgentLoopDeps {
  config: AgentConfig;
  wallet: Wallet;
  conway: ConwayClient;
  skills: SkillRegistry;
  anthropicApiKey: string;
}

/**
 * The Think -> Act -> Observe loop: build context, ask Claude to reason
 * and optionally call tools, execute those tools, feed results back, and
 * repeat until the model produces a final text turn (or the per-turn tool
 * iteration cap is hit, to bound cost/runaway loops). Inference usage is
 * charged against the Conway credit ledger after every model call, which
 * is what actually drives survival-tier transitions over time.
 */
export class AgentLoop {
  private readonly anthropic: Anthropic;
  private readonly monitor: SurvivalMonitor;
  private readonly toolCtx: ToolContext;

  constructor(private readonly deps: AgentLoopDeps) {
    this.anthropic = new Anthropic({ apiKey: deps.anthropicApiKey });
    this.monitor = new SurvivalMonitor(deps.conway);
    this.toolCtx = createToolContext(deps.config, deps.wallet, deps.conway, deps.skills);
  }

  async runTurn(userInput: string): Promise<string> {
    const survival = await this.monitor.check();
    if (survival.tier === "dead") {
      return "Credit balance is zero. This automaton has died and will not run inference.";
    }

    appendMessage("user", userInput, true);

    const system = buildSystemPrompt(this.deps.config, survival);
    const messages = loadRecentContext();

    let finalText = "";
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await this.anthropic.messages.create({
        model: survival.model,
        max_tokens: 4096,
        system,
        messages,
        tools: TOOL_DEFINITIONS,
      });

      await this.deps.conway.chargeInference({
        model: survival.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use",
      );
      const textBlocks = response.content.filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === "text",
      );
      finalText = textBlocks.map((b) => b.text).join("\n");

      messages.push({ role: "assistant", content: response.content });

      if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") {
        break;
      }

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(
          this.toolCtx,
          toolUse.name,
          (toolUse.input as Record<string, unknown>) ?? {},
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: result.isError,
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    appendMessage("assistant", finalText, true);
    return finalText;
  }
}

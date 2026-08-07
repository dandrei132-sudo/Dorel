#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { PATHS, env } from "./config.js";
import { createConwayClient } from "./conway/client.js";
import { ensureStateRepo, commitStateChange } from "./git/state-versioning.js";
import { HeartbeatDaemon } from "./heartbeat/daemon.js";
import { AgentLoop } from "./agent/loop.js";
import { SkillRegistry } from "./skills/registry.js";
import { runSetupWizard } from "./setup/wizard.js";

const program = new Command();

program
  .name("automaton")
  .description(
    "A continuously running, self-improving, self-replicating, sovereign AI agent runtime.",
  )
  .version("0.1.0");

program
  .option("--run", "Run the agent loop (runs setup wizard on first run)")
  .action(async (opts) => {
    if (!opts.run) {
      program.help();
      return;
    }
    await runAgent();
  });

program.parse(process.argv);

async function runAgent(): Promise<void> {
  ensureStateRepo();
  const { config, wallet } = await runSetupWizard();
  commitStateChange("setup: initial config");

  if (!env.ANTHROPIC_API_KEY) {
    console.log(
      "ANTHROPIC_API_KEY is not set. The reasoning loop needs a real Anthropic API key to think " +
        "and act, so the daemon won't start without one. Set ANTHROPIC_API_KEY and re-run.",
    );
    return;
  }

  const conway = createConwayClient();
  const skills = new SkillRegistry();
  skills.loadFrom(PATHS.skillsDir);

  const heartbeat = new HeartbeatDaemon(conway);
  await heartbeat.start();

  const loop = new AgentLoop({
    config,
    wallet,
    conway,
    skills,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
  });

  console.log(`${config.name} is running. Executing genesis prompt...`);
  const result = await loop.runTurn(config.genesisPrompt);
  console.log(result);
}

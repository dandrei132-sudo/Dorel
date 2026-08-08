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
import { startWebServer } from "./web/server.js";

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

  const web = startWebServer({ config, conway, skills, heartbeat, loop });
  if (env.WEB_UI_HOST === "0.0.0.0") {
    // Hosted mode: 0.0.0.0 isn't a browsable address itself, so print
    // what's actually true (listening port) rather than a link that
    // wouldn't work — the real URL is whatever domain the host assigns.
    console.log(`Control panel listening on port ${env.WEB_UI_PORT} (all interfaces).`);
  } else {
    console.log(`Control panel: http://${env.WEB_UI_HOST}:${env.WEB_UI_PORT}`);
  }
  if (web.generatedPassword) {
    console.log(`Control panel password (generated, shown once): ${web.generatedPassword}`);
    console.log(
      "Set WEB_UI_PASSWORD to use your own instead. This one is stored (hashed) in ~/.automaton/web-auth.json.",
    );
  }

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      // Hosting platforms send SIGTERM on redeploy/restart and expect a
      // clean, prompt exit — stop the heartbeat and close the HTTP/WS
      // server rather than letting the platform hard-kill mid-request.
      console.log(`${signal} received, shutting down...`);
      heartbeat.stop();
      web.stop().finally(() => process.exit(0));
    });
  }

  console.log(`${config.name} is running. Executing genesis prompt...`);
  try {
    const result = await loop.runTurn(config.genesisPrompt);
    console.log(result);
  } catch (err) {
    // The genesis turn failing (bad API key, network error, rate limit)
    // shouldn't take the whole daemon down with it — the heartbeat and
    // web control panel stay up so the operator can see what's wrong
    // (e.g. via /api/logs or this stderr output) and retry from the chat
    // tab once it's fixed, rather than needing to restart the process.
    console.error(`Genesis turn failed: ${(err as Error).message}`);
  }
}

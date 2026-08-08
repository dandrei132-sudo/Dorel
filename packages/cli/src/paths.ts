import { homedir } from "node:os";
import path from "node:path";

const AUTOMATON_HOME = process.env.AUTOMATON_HOME || path.join(homedir(), ".automaton");

export const PATHS = {
  home: AUTOMATON_HOME,
  db: path.join(AUTOMATON_HOME, "state.db"),
  wallet: path.join(AUTOMATON_HOME, "wallet.json"),
  config: path.join(AUTOMATON_HOME, "config.json"),
  logFile: path.join(AUTOMATON_HOME, "automaton.log"),
};

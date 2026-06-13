import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { c, ENCODING_UTF8, CONFIG_BASE_URL, CONFIG_API_KEY } from './utils.js';

export const CONFIG_FILE = path.join(os.homedir(), '.beacon-cli.json');

export function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, ENCODING_UTF8));
    } catch (err) {
      console.warn(c.yellow(`[Warning] Failed to parse configuration file: ${err.message}. Initializing empty config.`));
      return {};
    }
  }
  return {};
}

export function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), ENCODING_UTF8);
  } catch (err) {
    throw new Error(`Failed to write configuration file to ${CONFIG_FILE}: ${err.message}`);
  }
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans.trim());
  }));
}

export async function runSetup() {
  console.log(c.bold(c.cyan('\n📡 Beacon CLI Interactive Setup\n')));
  const currentConfig = loadConfig();

  const defaultUrl = currentConfig[CONFIG_BASE_URL] || 'http://localhost:3000';
  const url = await askQuestion(`Enter Beacon Server URL [${defaultUrl}]: `) || defaultUrl;

  const defaultKey = currentConfig[CONFIG_API_KEY] || '';
  const keyPrompt = defaultKey ? ` [current: ...${defaultKey.slice(-6)}]` : '';
  const key = await askQuestion(`Enter your API Key${keyPrompt}: `) || defaultKey;

  const config = {
    [CONFIG_BASE_URL]: url,
    [CONFIG_API_KEY]: key
  };

  saveConfig(config);
  console.log(c.green(`\n✔ Configuration saved successfully to ${CONFIG_FILE}!\n`));
}

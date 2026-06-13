import { parseArgs } from 'node:util';
import readline from 'node:readline';
import { c, readStdin, printHelp, CONFIG_BASE_URL, CONFIG_API_KEY } from './utils.js';
import { loadConfig, saveConfig, runSetup } from './config.js';
import { publish, subscribe, startLocalAuthServer, fetchMyTopics } from './client.js';

async function handleSetup() {
  try {
    await runSetup();
  } catch (err) {
    console.error(c.red(`✖ Setup failed: ${err.message}`));
    process.exit(1);
  }
}

async function handleLogin(baseUrl) {
  try {
    const credentials = await startLocalAuthServer(baseUrl);
    console.log(c.green(`\n✔ Login successful! Welcome @${credentials.username}.`));
  } catch (err) {
    console.error(c.red(`\n✖ Login failed: ${err.message}`));
    process.exit(1);
  }
}

function handleLogout() {
  try {
    const config = loadConfig();
    if (!config[CONFIG_API_KEY]) {
      console.log(c.yellow('You are not logged in.'));
      return;
    }
    const username = config['username'];
    delete config[CONFIG_API_KEY];
    if (config['username']) {
      delete config['username'];
    }
    saveConfig(config);
    if (username) {
      console.log(c.green(`✔ Successfully logged out user @${username}. API Key cleared from local config.`));
    } else {
      console.log(c.green('✔ Successfully logged out. API Key cleared from local config.'));
    }
  } catch (err) {
    console.error(c.red(`✖ Logout failed: ${err.message}`));
    process.exit(1);
  }
}

function handleConfig(positionals, config) {
  const subCommand = positionals[1];
  if (subCommand === 'set') {
    const key = positionals[2];
    const val = positionals[3];
    if (!key || !val) {
      console.error(c.red('Usage: beaconcli config set <key> <value>'));
      process.exit(1);
    }
    config[key] = val;
    try {
      saveConfig(config);
      console.log(c.green(`✔ Config updated: ${key} = ${val}`));
    } catch (err) {
      console.error(c.red(`✖ Failed to save configuration: ${err.message}`));
      process.exit(1);
    }
  } else if (subCommand === 'get') {
    const key = positionals[2];
    if (key) {
      console.log(config[key] || '');
    } else {
      console.log(JSON.stringify(config, null, 2));
    }
  } else {
    console.error(c.red('Usage: beaconcli config [set|get]'));
    process.exit(1);
  }
}

async function handlePub(positionals, baseUrl, apiKey, values) {
  const topicPath = positionals[1];
  if (!topicPath) {
    console.error(c.red('Usage: beaconcli pub <topic-path> [json-payload]'));
    process.exit(1);
  }
  
  let payload = positionals[2];
  if (!payload) {
    if (process.stdin.isTTY) {
      console.error(c.red('Error: No payload provided. Provide payload string argument or pipe in data via stdin.'));
      process.exit(1);
    }
    payload = await readStdin();
  }

  try {
    JSON.parse(payload);
  } catch {
    // Not a valid JSON string: wrap as basic message
    payload = JSON.stringify({ message: payload });
  }

  try {
    const response = await publish(baseUrl, topicPath, apiKey, payload, values);
    if (!values.silent) {
      console.log(c.green(`✔ Message published successfully! (HTTP ${response.statusCode})`));
      try {
        console.log(JSON.stringify(JSON.parse(response.body), null, 2));
      } catch {
        console.log(response.body);
      }
    }
  } catch (err) {
    console.error(c.red(`✖ Publish failed: ${err.message}`));
    process.exit(1);
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

function selectList(query, items, formatItem) {
  return new Promise((resolve) => {
    let index = 0;
    
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    
    // Hide cursor
    process.stdout.write('\x1B[?25l');
    
    const render = () => {
      // Clear from current cursor position down
      process.stdout.write('\x1B[J');
      
      console.log(query);
      items.forEach((item, i) => {
        const isSelected = i === index;
        const prefix = isSelected ? c.cyan('❯ ') : '  ';
        const line = prefix + formatItem(item, isSelected);
        console.log(line);
      });
      
      // Move cursor back up (number of items + 1 for query)
      process.stdout.write(`\x1B[${items.length + 1}A`);
    };
    
    render();
    
    const onKeypress = (str, key) => {
      if (key.name === 'up') {
        if (index > 0) {
          index--;
          render();
        }
      } else if (key.name === 'down') {
        if (index < items.length - 1) {
          index++;
          render();
        }
      } else if (key.name === 'return') {
        cleanup();
        process.stdout.write(`\x1B[${items.length + 1}B\r\n`);
        resolve(items[index]);
      } else if (key.ctrl && key.name === 'c') {
        cleanup();
        process.stdout.write(`\x1B[${items.length + 1}B\r\n`);
        console.log(c.red('Selection cancelled.'));
        process.exit(0);
      }
    };
    
    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      // Show cursor
      process.stdout.write('\x1B[?25h');
    }
    
    process.stdin.on('keypress', onKeypress);
    process.stdin.resume();
  });
}

async function handleSub(positionals, baseUrl, apiKey, values) {
  let topicPath = positionals[1];

  if (!topicPath) {
    if (!apiKey) {
      console.error(c.red('Error: You must be logged in to fetch topics dynamically. Run "beaconcli login" or provide a topic path.'));
      process.exit(1);
    }

    console.log(c.dim('Fetching your available topics...'));
    let topics;
    try {
      topics = await fetchMyTopics(baseUrl, apiKey);
    } catch (err) {
      console.error(c.red(`✖ Failed to fetch topics: ${err.message}`));
      process.exit(1);
    }

    if (!topics || topics.length === 0) {
      console.log(c.yellow('No topics found. Create a topic on the dashboard first.'));
      return;
    }

    const selected = await selectList(
      c.bold(c.cyan('📡 Select a topic to subscribe:')),
      topics,
      (t, isSelected) => {
        const visibility = t.isPrivate ? c.red('Private') : c.green('Public');
        const desc = t.description ? c.dim(` - ${t.description}`) : '';
        const namePart = isSelected ? c.bold(`${t.owner.username}/${t.name}`) : `${t.owner.username}/${t.name}`;
        return `${namePart} (${visibility})${desc}`;
      }
    );

    topicPath = `${selected.owner.username}/${selected.name}`;
    console.log(c.green(`✔ Selected topic: `) + c.bold(topicPath) + '\n');
  }

  subscribe(baseUrl, topicPath, apiKey, values);
}

export async function runCli() {
  const optionsConfig = {
    url: { type: 'string', short: 'u' },
    key: { type: 'string', short: 'k' },
    raw: { type: 'boolean', short: 'r', default: false },
    silent: { type: 'boolean', short: 's', default: false },
    help: { type: 'boolean', short: 'h', default: false }
  };

  let parsed;
  try {
    parsed = parseArgs({
      options: optionsConfig,
      allowPositionals: true
    });
  } catch (err) {
    console.error(c.red(`Error: ${err.message}`));
    console.log('Use --help to see available commands and option parameters.');
    process.exit(1);
  }

  const { values, positionals } = parsed;
  const command = positionals[0];

  if (values.help || !command || command === 'help') {
    printHelp();
    return;
  }

  // Load config & option overrides
  const config = loadConfig();
  const baseUrl = values.url || config[CONFIG_BASE_URL] || 'https://beacon.vercel.app';
  const apiKey = values.key || config[CONFIG_API_KEY];

  if (command === 'setup' || command === 'init') {
    await handleSetup();
    return;
  }

  if (command === 'login') {
    await handleLogin(baseUrl);
    return;
  }

  if (command === 'logout') {
    handleLogout();
    return;
  }

  if (command === 'config') {
    handleConfig(positionals, config);
    return;
  }

  if (command === 'pub') {
    await handlePub(positionals, baseUrl, apiKey, values);
    return;
  }

  if (command === 'sub') {
    await handleSub(positionals, baseUrl, apiKey, values);
    return;
  }

  console.error(c.red(`✖ Unknown command: ${command}`));
  printHelp();
  process.exit(1);
}

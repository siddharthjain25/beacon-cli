export const ENCODING_UTF8 = 'utf8';
export const CONFIG_BASE_URL = 'base-url';
export const CONFIG_API_KEY = 'api-key';

// Terminal ANSI Styling Colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

export const c = {
  bold: (str) => `${colors.bold}${str}${colors.reset}`,
  dim: (str) => `${colors.dim}${str}${colors.reset}`,
  italic: (str) => `${colors.italic}${str}${colors.reset}`,
  red: (str) => `${colors.red}${str}${colors.reset}`,
  green: (str) => `${colors.green}${str}${colors.reset}`,
  yellow: (str) => `${colors.yellow}${str}${colors.reset}`,
  blue: (str) => `${colors.blue}${str}${colors.reset}`,
  magenta: (str) => `${colors.magenta}${str}${colors.reset}`,
  cyan: (str) => `${colors.cyan}${str}${colors.reset}`,
};

export function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding(ENCODING_UTF8);
    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
  });
}

export function printHelp() {
  console.log(`
${c.bold('Beacon CLI Client (beaconcli)')}
Ingest, publish, and subscribe to telemetry signals right from the shell.

${c.bold('Usage:')}
  beaconcli <command> [arguments] [options]

${c.bold('Commands:')}
  ${c.cyan('login')}                  Authenticate with Beacon server via browser and save API Key automatically
  ${c.cyan('logout')}                 Clear saved authentication credentials from local config
  ${c.cyan('setup')} / ${c.cyan('init')}          Launch interactive setup wizard for server URL and API Key
  ${c.cyan('config set <key> <val>')} Set persistent configuration settings
  ${c.cyan('config get [key]')}       Display config parameters
  ${c.cyan('pub <topic> [payload]')}  Publish payload. If payload is omitted, reads from stdin pipe.
  ${c.cyan('sub [topic]')}            Subscribe to topic and stream JSON output live (enters interactive selection if omitted)

${c.bold('Options:')}
  ${c.yellow('-u, --url <url>')}       Override default configuration server URL target
  ${c.yellow('-k, --key <key>')}       Override default configuration auth API Key
  ${c.yellow('-r, --raw')}             Subscribe output displays raw messages (ideal for piping scripts)
  ${c.yellow('-s, --silent')}          Publish output silences stdout success reports
  ${c.yellow('-h, --help')}            Display this helper information

${c.bold('Examples:')}
  beaconcli setup
  beaconcli pub status/services '{"status":"operational"}'
  tail -f /var/log/syslog | beaconcli pub admin/syslog
  beaconcli sub status/services --raw | jq .
`);
}

import http from 'node:http';
import https from 'node:https';
import { exec } from 'node:child_process';
import { c, ENCODING_UTF8 } from './utils.js';
import { loadConfig, saveConfig } from './config.js';

export function publish(baseUrl, topicPath, apiKey, payloadString, options = {}) {
  return new Promise((resolve, reject) => {
    const urlString = baseUrl.endsWith('/') ? `${baseUrl}${topicPath}` : `${baseUrl}/${topicPath}`;
    let url;
    try {
      url = new URL(urlString);
    } catch (err) {
      reject(new Error(`Invalid URL target generated: ${urlString}. Details: ${err.message}`));
      return;
    }

    const client = url.protocol === 'https:' ? https : http;
    const token = options.key || apiKey;

    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!options.silent) {
      console.log(c.dim(`Publishing payload to ${url.toString()}...`));
    }

    const req = client.request(url.toString(), {
      method: 'POST',
      headers,
    }, (res) => {
      let body = '';
      res.setEncoding(ENCODING_UTF8);
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            statusCode: res.statusCode,
            body
          });
        } else {
          reject(new Error(`Server returned error status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Publish connection failed: ${err.message}`));
    });

    req.write(payloadString);
    req.end();
  });
}

export function parseSSE(buffer) {
  const parts = buffer.split('\n\n');
  const remaining = parts.pop() || '';
  const events = [];

  for (const part of parts) {
    const lines = part.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        events.push(line.slice(6).trim());
      }
    }
  }

  return { events, remaining };
}

export function handleSSEEvent(dataContent, options, topicPath) {
  try {
    const parsed = JSON.parse(dataContent);
    if (parsed.status === 'connected') {
      console.log(c.green(`✔ Subscribed to `) + c.bold(`/${topicPath}`) + c.green(` successfully. Stream is active.\n`));
      return;
    }
    
    if (options.raw) {
      console.log(dataContent);
    } else {
      const timestamp = new Date().toLocaleTimeString();
      console.log(
        c.dim(`[${timestamp}]`) + ' ' + 
        c.bold(c.cyan('SIGNAL RECEIVED:'))
      );
      console.log(JSON.stringify(parsed, null, 2));
      console.log(c.dim('--------------------------------------------------'));
    }
  } catch {
    // If JSON parsing fails, output the raw text stream message directly
    console.log(dataContent);
  }
}

export function subscribe(baseUrl, topicPath, apiKey, options = {}) {
  const urlString = baseUrl.endsWith('/') ? `${baseUrl}${topicPath}` : `${baseUrl}/${topicPath}`;
  let url;
  try {
    url = new URL(urlString);
  } catch (err) {
    console.error(c.red(`[Error] Invalid subscription URL: ${err.message}`));
    process.exit(1);
  }

  const token = options.key || apiKey;
  if (token) {
    url.searchParams.append('token', token);
  }

  const client = url.protocol === 'https:' ? https : http;
  const headers = {
    'Accept': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  console.log(c.dim(`Connecting to stream: ${url.toString()}...`));

  let reconnectTimeout = null;
  let attempts = 0;

  const connect = () => {
    const req = client.get(url.toString(), { headers }, (res) => {
      if (res.statusCode !== 200) {
        console.error(c.red(`[Error] Subscription failed. Server returned status: ${res.statusCode}`));
        process.exit(1);
      }

      attempts = 0; // reset retry counter
      let buffer = '';
      res.setEncoding(ENCODING_UTF8);

      res.on('data', (chunk) => {
        buffer += chunk;
        const { events, remaining } = parseSSE(buffer);
        buffer = remaining;
        for (const event of events) {
          handleSSEEvent(event, options, topicPath);
        }
      });

      res.on('end', () => {
        console.log(c.yellow('\n⚠ Stream disconnected by server. Reconnecting...'));
        retryConnect();
      });
    });

    req.on('error', (err) => {
      console.error(c.red(`\n✖ Connection error: ${err.message}`));
      retryConnect();
    });
  };

  const retryConnect = () => {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    attempts++;
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // capped at 30s
    console.log(c.dim(`Attempting reconnection in ${delay / 1000}s (Attempt ${attempts})...`));
    reconnectTimeout = setTimeout(connect, delay);
  };

  connect();
}

export function startLocalAuthServer(baseUrl) {
  return new Promise((resolve, reject) => {
    const port = 4821;
    const server = http.createServer((req, res) => {
      let url;
      try {
        url = new URL(req.url, `http://localhost:${port}`);
      } catch (err) {
        console.error(c.red(`[Error] Failed to parse callback request URL: ${err.message}`));
        res.writeHead(400);
        res.end('Malformed request');
        return;
      }
      
      if (url.pathname === '/auth-callback') {
        const apiKey = url.searchParams.get('apiKey');
        const username = url.searchParams.get('username');
        
        if (!apiKey) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Authentication failed: API key missing</h1>');
          server.close();
          reject(new Error('Authentication failed: API key missing in callback.'));
          return;
        }

        try {
          const config = loadConfig();
          config['api-key'] = apiKey;
          config['base-url'] = baseUrl;
          if (username) {
            config['username'] = username;
          }
          saveConfig(config);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>Internal Server Error</h1><p>${err.message}</p>`);
          server.close();
          reject(err);
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Beacon Login Successful</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
            <style>
              :root {
                --bg: #090b10;
                --card-bg: rgba(17, 22, 34, 0.65);
                --border: rgba(255, 255, 255, 0.08);
                --text: #f3f4f6;
                --text-muted: #9ca3af;
                --primary: #06b6d4; /* cyan */
                --primary-glow: rgba(6, 182, 212, 0.15);
                --success: #10b981; /* emerald */
                --success-glow: rgba(16, 185, 129, 0.2);
              }
              
              * {
                box-sizing: border-box;
              }
              
              body {
                font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
                background-color: var(--bg);
                background-image: 
                  radial-gradient(circle at 50% 30%, rgba(6, 182, 212, 0.12), transparent 50%),
                  radial-gradient(circle at 80% 80%, rgba(99, 102, 241, 0.08), transparent 40%);
                color: var(--text);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                overflow: hidden;
              }
              
              .glow-bg {
                position: absolute;
                width: 400px;
                height: 400px;
                background: radial-gradient(circle, var(--primary-glow) 0%, transparent 70%);
                top: 20%;
                z-index: -1;
                filter: blur(40px);
                animation: pulse 8s infinite alternate;
              }
              
              @keyframes pulse {
                0% { transform: scale(1); opacity: 0.8; }
                100% { transform: scale(1.2); opacity: 1; }
              }
              
              .card {
                background: var(--card-bg);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid var(--border);
                padding: 3rem 2.5rem;
                border-radius: 24px;
                text-align: center;
                box-shadow: 
                  0 20px 40px -15px rgba(0, 0, 0, 0.5),
                  0 0 50px -10px var(--primary-glow);
                max-width: 440px;
                width: 90%;
                animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                z-index: 10;
              }
              
              @keyframes slideUp {
                from {
                  opacity: 0;
                  transform: translateY(20px);
                }
                to {
                  opacity: 1;
                  transform: translateY(0);
                }
              }
              
              .success-icon-wrapper {
                position: relative;
                width: 80px;
                height: 80px;
                margin: 0 auto 1.5rem;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              
              .success-icon-bg {
                position: absolute;
                width: 100%;
                height: 100%;
                background: var(--success-glow);
                border-radius: 50%;
                animation: pingGlow 2s infinite ease-out;
              }
              
              @keyframes pingGlow {
                0% { transform: scale(0.8); opacity: 1; }
                100% { transform: scale(1.4); opacity: 0; }
              }
              
              .success-svg {
                width: 72px;
                height: 72px;
                position: relative;
                z-index: 2;
              }
              
              .success-svg circle {
                stroke: var(--success);
                stroke-width: 4;
                fill: none;
                stroke-dasharray: 220;
                stroke-dashoffset: 220;
                transform-origin: center;
                animation: drawCircle 0.8s ease-in-out forwards;
              }
              
              .success-svg path {
                stroke: var(--success);
                stroke-width: 5;
                stroke-linecap: round;
                stroke-linejoin: round;
                fill: none;
                stroke-dasharray: 50;
                stroke-dashoffset: 50;
                animation: drawCheck 0.4s 0.6s ease-in-out forwards;
              }
              
              @keyframes drawCircle {
                to { stroke-dashoffset: 0; }
              }
              
              @keyframes drawCheck {
                to { stroke-dashoffset: 0; }
              }
              
              h1 {
                font-size: 28px;
                font-weight: 800;
                margin: 0 0 0.75rem;
                background: linear-gradient(135deg, #ffffff 30%, var(--primary) 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                letter-spacing: -0.025em;
              }
              
              p {
                font-size: 15px;
                color: var(--text-muted);
                line-height: 1.6;
                margin: 0 0 1.5rem;
              }
              
              .user-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.08);
                padding: 6px 14px;
                border-radius: 99px;
                font-weight: 600;
                color: var(--primary);
                margin-bottom: 1.5rem;
                font-size: 14px;
              }
              
              .user-badge::before {
                content: '';
                display: inline-block;
                width: 8px;
                height: 8px;
                background-color: var(--success);
                border-radius: 50%;
                box-shadow: 0 0 8px var(--success);
              }
              
              .terminal-box {
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--border);
                border-radius: 12px;
                padding: 1rem;
                font-family: 'JetBrains Mono', monospace;
                font-size: 13px;
                color: #38bdf8; /* light cyan */
                text-align: left;
                margin-bottom: 1.5rem;
                position: relative;
                overflow: hidden;
              }
              
              .terminal-box::before {
                content: 'Config Written';
                position: absolute;
                top: 0;
                right: 0;
                background: rgba(255, 255, 255, 0.05);
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                padding: 3px 8px;
                border-bottom-left-radius: 8px;
                color: var(--text-muted);
              }
              
              .terminal-line {
                display: block;
                margin-bottom: 4px;
              }
              .terminal-line:last-child {
                margin-bottom: 0;
              }
              .terminal-prefix {
                color: var(--text-muted);
                user-select: none;
              }
              .terminal-path {
                color: #a7f3d0;
              }
              
              .footer-note {
                font-size: 12px;
                color: var(--text-muted);
                opacity: 0.7;
                border-top: 1px solid rgba(255, 255, 255, 0.05);
                padding-top: 1.25rem;
                margin-top: 1.5rem;
              }
            </style>
          </head>
          <body>
            <div class="glow-bg"></div>
            <div class="card">
              <div class="success-icon-wrapper">
                <div class="success-icon-bg"></div>
                <svg class="success-svg" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="32"></circle>
                  <path d="M22 36 l10 10 l18 -20"></path>
                </svg>
              </div>
              
              <h1>Login Successful!</h1>
              
              <div class="user-badge">
                @${username || 'user'}
              </div>
              
              <p>Authentication complete. Your credentials have been securely saved to the configuration file.</p>
              
              <div class="terminal-box">
                <span class="terminal-line"><span class="terminal-prefix">$</span> cat <span class="terminal-path">~/.beacon-cli.json</span></span>
                <span class="terminal-line" style="color: #64748b;">{</span>
                <span class="terminal-line" style="color: #e2e8f0; padding-left: 14px;">"api-key": "bc_••••••••${apiKey ? apiKey.slice(-6) : '••••'}"</span>
                <span class="terminal-line" style="color: #64748b;">}</span>
              </div>
              
              <div class="footer-note">
                You can now safely close this browser tab and return to your terminal.
              </div>
            </div>
          </body>
          </html>
        `);
        
        server.close();
        resolve({ apiKey, username });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(port, () => {
      const callbackUrl = `http://localhost:${port}/auth-callback`;
      const loginUrl = `${baseUrl}/login?callback=${encodeURIComponent(callbackUrl)}`;
      console.log(c.cyan(`\nOpening your browser to authenticate: ${loginUrl}\n`));

      let start = 'xdg-open';
      if (process.platform === 'darwin') {
        start = 'open';
      } else if (process.platform === 'win32') {
        start = 'start';
      }

      exec(`${start} "${loginUrl}"`, (err) => {
        if (err) {
          console.log(c.yellow(`Could not open browser automatically. Please open this link manually to log in:`));
          console.log(c.bold(c.underline(loginUrl)));
        }
      });
    });

    server.on('error', (err) => {
      reject(new Error(`Failed to start local authentication server: ${err.message}`));
    });
  });
}

export function fetchMyTopics(baseUrl, apiKey) {
  return new Promise((resolve, reject) => {
    const urlString = baseUrl.endsWith('/') ? `${baseUrl}api/my-topics` : `${baseUrl}/api/my-topics`;
    let url;
    try {
      url = new URL(urlString);
    } catch (err) {
      reject(new Error(`Invalid URL target: ${urlString}. Details: ${err.message}`));
      return;
    }

    const client = url.protocol === 'https:' ? https : http;
    const headers = {
      'Accept': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const req = client.request(url.toString(), {
      method: 'GET',
      headers,
    }, (res) => {
      let body = '';
      res.setEncoding(ENCODING_UTF8);
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`Failed to parse topics list: ${err.message}`));
          }
        } else {
          let errorMsg = body;
          try {
            const parsed = JSON.parse(body);
            if (parsed.error) errorMsg = parsed.error;
          } catch {
            // Keep original body
          }
          reject(new Error(`Server returned error status ${res.statusCode}: ${errorMsg}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Connection failed: ${err.message}`));
    });

    req.end();
  });
}


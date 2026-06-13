# Beacon CLI Client (`beaconcli`)

`beaconcli` is a lightweight, zero-dependency, real-time command-line interface utility to publish, ingest, and subscribe to telemetry signals and notification streams directly from your terminal. It integrates seamlessly with the Beacon event server.

---

## ✨ Features

* **Instant Subscription**: Stream live JSON payloads matching specific topics.
* **Interactive Selector**: Run `beaconcli sub` with no arguments to dynamically fetch your topics and select one using an interactive **arrow-key menu**.
* **Flexible Publishing**: Send JSON payloads or pipe log streams directly into a topic via standard input (`stdin`).
* **Easy Authentication**: Authenticate instantly via your browser using `beaconcli login`.
* **Zero Dependencies**: Pure native Node.js implementation (fast bootup, tiny footprint).
* **Developer Friendly**: Supports a `--raw` output mode for clean piping to formatting utilities like `jq`.

---

## 🚀 Installation

Install the package globally from the npm registry:

```bash
npm install -g @siddharthjain25/beaconcli
```

---

## 🔑 Authentication & Setup

Before sending or receiving signals, connect your CLI client to your Beacon account.

### 1. Interactive Browser Login (Recommended)
Run the login command:
```bash
beaconcli login
```
This automatically spins up a local loopback server, opens your default web browser, guides you through the UI login, and securely writes your active session token and username back to your local CLI configuration.

### 2. Check Configuration
You can view your currently stored configuration profile by running:
```bash
beaconcli config get
```

### 3. Log Out
To clear your active session credentials and purge the local configuration, run:
```bash
beaconcli logout
```

---

## 📖 Command Guide

### `beaconcli sub [topic]`
Subscribes to a topic stream and outputs messages in real-time.

* **Interactive Mode**: If you omit the topic path, the CLI queries the server and displays an interactive list of your available topics. Use the **Up/Down arrow keys** to navigate and **Enter** to select:
  ```bash
  beaconcli sub
  ```
* **Direct Mode**:
  ```bash
  beaconcli sub username/topic-name
  ```
* **Options**:
  * `-r, --raw`: Outputs the raw JSON payloads without timestamp labels or formatting. Perfect for scripts and piping:
    ```bash
    beaconcli sub username/topic-name --raw | jq .data.status
    ```

---

### `beaconcli pub <topic> [payload]`
Publishes a notification payload to a specific topic.

* **Argument Payload**:
  ```bash
  beaconcli pub username/topic-name '{"status":"operational","cpu":42}'
  ```
* **Stream/Pipe Payload (`stdin`)**:
  If the payload argument is omitted, the CLI reads directly from `stdin`. This is ideal for streaming active system logs:
  ```bash
  tail -f /var/log/syslog | beaconcli pub username/syslog
  ```
* **Options**:
  * `-s, --silent`: Suppresses successful publish confirmation logs (HTTP 200) for clean background processes.

---

### `beaconcli config`
Manage persistent client settings locally.

* **Set a value**:
  ```bash
  beaconcli config set base-url https://custom-beacon-server.com
  ```
* **Get a value / list config**:
  ```bash
  beaconcli config get base-url
  ```

---

## ⚙️ Global Options

You can override your saved profile configuration on the fly using these flags:

* `-u, --url <url>`: Override the default Beacon API server URL.
* `-k, --key <key>`: Override the saved authentication token/API key.
* `-h, --help`: Display the CLI usage help menu.

---

## 📄 License

This project is licensed under the ISC License.

# agent-health-monitor

Real-time agent health monitoring with heartbeat detection, failure alerts, automatic restart, and comprehensive status dashboards.

Built as part of the SCIEL (Agent Intelligence) infrastructure to ensure high availability of autonomous AI agents.

## Features

- **💓 Heartbeat Tracking**: Precision monitoring of agent activity with configurable intervals and grace periods.
- **🛡️ Failure Detection**: Automatic identification of stale, crashed, or offline agents.
- **🔄 Auto-Restart**: Intelligent recovery logic that attempts to revive failed agents.
- **🌐 Web Dashboard**: Built-in HTTP dashboard for real-time visual status updates.
- **🔔 Notifications**: Pluggable webhook alerts for status changes (Stale, Crashed, Recovered).
- **💾 Persistence**: Reliable state management across restarts using local storage.
- **🖥️ CLI First**: Powerful command-line interface for manual management and simulation.

## Installation

Ensure you have [Bun](https://bun.sh) installed.

```bash
git clone https://github.com/Retsumdk/agent-health-monitor.git
cd agent-health-monitor
bun install
```

## Usage

### 1. Start the Monitor

Start the background monitoring loop and the web dashboard:

```bash
# Starts on default port 3000
bun src/index.ts start

# Custom port and interval
bun src/index.ts start --port 8080 --interval 2000
```

### 2. Register an Agent

```bash
bun src/index.ts register --id my-ai-agent --name "Autonomous Researcher" --interval 60000
```

### 3. Send Heartbeats

Agents can send heartbeats via the CLI or HTTP API:

**CLI:**
```bash
bun src/index.ts heartbeat my-ai-agent
```

**HTTP API:**
```bash
curl -X POST http://localhost:3000/heartbeat/my-ai-agent
```

### 4. View Dashboard

Open `http://localhost:3000` in your browser to view the real-time health dashboard.

## Architecture

`agent-health-monitor` is designed for low overhead and high reliability:

1. **Monitor Engine**: A singleton class managing a state machine of all registered agents.
2. **Persistence Layer**: Serializes agent states and history to `health-state.json` to survive monitor restarts.
3. **HTTP Interface**: Uses `Bun.serve` for both the web dashboard and the heartbeat ingestion API.
4. **Notification System**: Triggers async webhooks when agent health thresholds are crossed.

## Development

Running tests:
```bash
bun test
```

## License

MIT - See [LICENSE](./LICENSE) for details.

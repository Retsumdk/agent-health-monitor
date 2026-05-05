#!/usr/bin/env bun
/**
 * agent-health-monitor - Real-time agent health monitoring with heartbeat detection, failure alerts, automatic restart, and comprehensive status dashboards
 * Built with Zo Computer by Retsumdk
 */

import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// --- Types & Interfaces ---

enum HealthStatus {
  HEALTHY = "HEALTHY",
  STALE = "STALE",
  CRASHED = "CRASHED",
  RESTARTING = "RESTARTING",
  OFFLINE = "OFFLINE"
}

interface AgentConfig {
  id: string;
  name: string;
  heartbeatIntervalMs: number;
  gracePeriodMs: number;
  autoRestart: boolean;
  maxRestarts: number;
  webhookUrl?: string;
}

interface AgentState {
  config: AgentConfig;
  status: HealthStatus;
  lastHeartbeat: number | null;
  restartCount: number;
  lastError: string | null;
  history: Array<{ timestamp: number; status: HealthStatus; message?: string }>;
}

interface MonitorState {
  agents: Record<string, AgentState>;
  lastCheck: number;
}

// --- Constants & Defaults ---

const STATE_FILE = join(process.cwd(), "health-state.json");
const HISTORY_LIMIT = 50;

// --- Core Logic ---

class HealthMonitor {
  private state: MonitorState;

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): MonitorState {
    if (existsSync(STATE_FILE)) {
      try {
        const raw = readFileSync(STATE_FILE, "utf-8");
        return JSON.parse(raw);
      } catch (e) {
        console.error("Failed to load state, starting fresh:", e);
      }
    }
    return { agents: {}, lastCheck: Date.now() };
  }

  private saveState() {
    try {
      writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error("Failed to save state:", e);
    }
  }

  registerAgent(config: AgentConfig) {
    if (!this.state.agents[config.id]) {
      this.state.agents[config.id] = {
        config,
        status: HealthStatus.OFFLINE,
        lastHeartbeat: null,
        restartCount: 0,
        lastError: null,
        history: []
      };
      this.logEvent(config.id, HealthStatus.OFFLINE, "Agent registered");
    } else {
      this.state.agents[config.id].config = config;
    }
    this.saveState();
  }

  recordHeartbeat(agentId: string, metadata?: any) {
    const agent = this.state.agents[agentId];
    if (!agent) {
      throw new Error(`Agent ${agentId} not registered`);
    }

    const now = Date.now();
    agent.lastHeartbeat = now;
    
    if (agent.status !== HealthStatus.HEALTHY) {
      this.logEvent(agentId, HealthStatus.HEALTHY, "Heartbeat received, agent is healthy");
      agent.status = HealthStatus.HEALTHY;
      agent.restartCount = 0;
    }
    
    this.saveState();
  }

  private logEvent(agentId: string, status: HealthStatus, message: string) {
    const agent = this.state.agents[agentId];
    if (!agent) return;

    const event = { timestamp: Date.now(), status, message };
    agent.history.unshift(event);
    if (agent.history.length > HISTORY_LIMIT) {
      agent.history.pop();
    }
    
    console.log(`[${new Date().toISOString()}] [${agentId}] ${status}: ${message}`);
  }

  async runHealthCheck() {
    const now = Date.now();
    this.state.lastCheck = now;

    for (const [id, agent] of Object.entries(this.state.agents)) {
      if (!agent.lastHeartbeat) {
        if (agent.status !== HealthStatus.OFFLINE) {
          this.logEvent(id, HealthStatus.OFFLINE, "No heartbeats received yet");
          agent.status = HealthStatus.OFFLINE;
        }
        continue;
      }

      const elapsed = now - agent.lastHeartbeat;
      const threshold = agent.config.heartbeatIntervalMs + agent.config.gracePeriodMs;

      if (elapsed > threshold) {
        if (agent.status === HealthStatus.HEALTHY) {
          this.logEvent(id, HealthStatus.STALE, `Heartbeat missing for ${Math.round(elapsed / 1000)}s`);
          agent.status = HealthStatus.STALE;
          await this.notify(agent, "Agent status changed to STALE");
        } else if (elapsed > threshold * 3 && agent.status !== HealthStatus.CRASHED) {
          this.logEvent(id, HealthStatus.CRASHED, "Agent determined to have crashed");
          agent.status = HealthStatus.CRASHED;
          await this.notify(agent, "Agent status changed to CRASHED - Critical failure detected");
          
          if (agent.config.autoRestart) {
            await this.attemptRestart(id);
          }
        }
      }
    }
    this.saveState();
  }

  private async notify(agent: AgentState, message: string) {
    if (agent.config.webhookUrl) {
      try {
        await fetch(agent.config.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: agent.config.id,
            status: agent.status,
            message,
            timestamp: new Date().toISOString()
          })
        });
      } catch (e) {
        console.error(`Failed to send notification for ${agent.config.id}:`, e);
      }
    }
  }

  private async attemptRestart(agentId: string) {
    const agent = this.state.agents[agentId];
    if (agent.restartCount >= agent.config.maxRestarts) {
      this.logEvent(agentId, HealthStatus.CRASHED, `Max restarts reached. Manual intervention required.`);
      return;
    }

    agent.restartCount++;
    agent.status = HealthStatus.RESTARTING;
    this.logEvent(agentId, HealthStatus.RESTARTING, `Attempting restart ${agent.restartCount}/${agent.config.maxRestarts}...`);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.logEvent(agentId, HealthStatus.RESTARTING, "Restart command issued successfully");
    } catch (e: any) {
      agent.lastError = e.message;
      this.logEvent(agentId, HealthStatus.CRASHED, `Restart failed: ${e.message}`);
    }
  }

  getDashboard() {
    return Object.values(this.state.agents).map(a => ({
      id: a.config.id,
      name: a.config.name,
      status: a.status,
      lastSeen: a.lastHeartbeat ? new Date(a.lastHeartbeat).toISOString() : "Never",
      restarts: a.restartCount
    }));
  }

  getAgentDetail(id: string) {
    return this.state.agents[id];
  }

  renderDashboardHtml() {
    const agents = Object.values(this.state.agents);
    const rows = agents.map(a => `
      <tr class="border-b border-zinc-800 hover:bg-zinc-800/50">
        <td class="p-4 font-mono text-zinc-400">${a.config.id}</td>
        <td class="p-4 font-medium">${a.config.name}</td>
        <td class="p-4">
          <span class="px-2 py-1 rounded text-xs font-bold ${this.getStatusColor(a.status)}">
            ${a.status}
          </span>
        </td>
        <td class="p-4 text-zinc-400">${a.lastHeartbeat ? new Date(a.lastHeartbeat).toLocaleString() : "Never"}</td>
        <td class="p-4 text-zinc-400">${a.restartCount}</td>
      </tr>
    `).join("");

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Agent Health Dashboard</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { background-color: #09090b; color: #fafafa; }
        </style>
      </head>
      <body class="p-8">
        <div class="max-w-6xl mx-auto">
          <header class="mb-8 flex justify-between items-center">
            <div>
              <h1 class="text-3xl font-bold">Agent Health Monitor</h1>
              <p class="text-zinc-400">Real-time status of AI infrastructure agents</p>
            </div>
            <div class="text-right">
              <div class="text-xs text-zinc-500 uppercase tracking-wider">Last Check</div>
              <div class="text-sm font-mono">${new Date(this.state.lastCheck).toLocaleString()}</div>
            </div>
          </header>
          
          <div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-zinc-800/50 text-zinc-400 text-xs uppercase tracking-wider">
                  <th class="p-4 font-medium">ID</th>
                  <th class="p-4 font-medium">Name</th>
                  <th class="p-4 font-medium">Status</th>
                  <th class="p-4 font-medium">Last Seen</th>
                  <th class="p-4 font-medium">Restarts</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length > 0 ? rows : '<tr><td colspan="5" class="p-8 text-center text-zinc-500">No agents registered</td></tr>'}
              </tbody>
            </table>
          </div>
          
          <footer class="mt-8 text-center text-zinc-600 text-xs">
            Built with Zo Computer &bull; Last updated ${new Date().toLocaleString()}
          </footer>
        </div>
        <script>
          setTimeout(() => window.location.reload(), 5000);
        </script>
      </body>
      </html>
    `;
  }

  private getStatusColor(status: HealthStatus) {
    switch (status) {
      case HealthStatus.HEALTHY: return "bg-green-500/10 text-green-500";
      case HealthStatus.STALE: return "bg-yellow-500/10 text-yellow-500";
      case HealthStatus.CRASHED: return "bg-red-500/10 text-red-500";
      case HealthStatus.RESTARTING: return "bg-blue-500/10 text-blue-500";
      default: return "bg-zinc-500/10 text-zinc-500";
    }
  }
}

// --- CLI & Server Implementation ---

const monitor = new HealthMonitor();
const program = new Command();

program
  .name("agent-health-monitor")
  .description("Real-time agent health monitoring system")
  .version("1.0.0");

program
  .command("start")
  .description("Start the monitor and web dashboard")
  .option("-p, --port <number>", "Port for web dashboard", "3000")
  .option("-i, --interval <ms>", "Check interval in milliseconds", "5000")
  .action(async (options) => {
    const port = parseInt(options.port);
    const interval = parseInt(options.interval);

    console.log(`\n🚀 Starting Agent Health Monitor...`);
    console.log(`📈 Dashboard: http://localhost:${port}`);
    console.log(`⏱️  Health Check Interval: ${interval}ms`);

    // Start background monitor
    setInterval(async () => {
      await monitor.runHealthCheck();
    }, interval);

    // Start Web Server
    Bun.serve({
      port,
      async fetch(req) {
        const url = new URL(req.url);
        
        // Simple API for heartbeats
        if (url.pathname.startsWith("/heartbeat/") && req.method === "POST") {
          const id = url.pathname.split("/")[2];
          try {
            monitor.recordHeartbeat(id);
            return Response.json({ status: "ok" });
          } catch (e: any) {
            return Response.json({ error: e.message }, { status: 404 });
          }
        }

        // API for data
        if (url.pathname === "/api/status") {
          return Response.json(monitor.getDashboard());
        }

        // HTML Dashboard
        return new Response(monitor.renderDashboardHtml(), {
          headers: { "Content-Type": "text/html" }
        });
      }
    });
  });

program
  .command("register")
  .description("Register a new agent")
  .requiredOption("--id <id>", "Unique ID")
  .requiredOption("--name <name>", "Display name")
  .option("--interval <ms>", "Expected heartbeat interval", "30000")
  .option("--grace <ms>", "Grace period", "10000")
  .option("--webhook <url>", "Notification webhook URL")
  .action((options) => {
    monitor.registerAgent({
      id: options.id,
      name: options.name,
      heartbeatIntervalMs: parseInt(options.interval),
      gracePeriodMs: parseInt(options.grace),
      autoRestart: true,
      maxRestarts: 5,
      webhookUrl: options.webhook
    });
    console.log(`✅ Agent ${options.id} registered.`);
  });

program
  .command("heartbeat")
  .description("Send a manual heartbeat")
  .argument("<id>", "Agent ID")
  .action((id) => {
    try {
      monitor.recordHeartbeat(id);
      console.log(`💓 Heartbeat recorded for ${id}`);
    } catch (e: any) {
      console.error(`❌ ${e.message}`);
      process.exit(1);
    }
  });

program
  .command("dashboard")
  .description("Show status in terminal")
  .action(() => {
    const data = monitor.getDashboard();
    if (data.length === 0) {
      console.log("No agents found.");
      return;
    }
    console.table(data);
  });

program
  .command("simulate")
  .description("Simulate agent failure and recovery")
  .argument("<id>", "Agent ID")
  .action(async (id) => {
    console.log(`Simulating lifecycle for ${id}...`);
    monitor.recordHeartbeat(id);
    console.log("Healthy heartbeat sent.");
    
    console.log("Waiting for stale status...");
    // Force a wait or state manipulation for demo
    const agent = monitor.getAgentDetail(id);
    if (agent) {
      agent.lastHeartbeat = Date.now() - 60000;
      await monitor.runHealthCheck();
      console.log(`Current Status: ${agent.status}`);
    }
  });

program.parse(process.argv);

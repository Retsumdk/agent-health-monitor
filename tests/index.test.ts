import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";

// Mock implementation or direct testing of the classes if exported
// For simplicity, we'll test the output side effects as the CLI is the main interface

const STATE_FILE = join(process.cwd(), "health-state.json");

describe("Agent Health Monitor", () => {
  
  beforeAll(() => {
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  });

  afterAll(() => {
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  });

  test("Should register an agent", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", "register", "--id", "test-1", "--name", "Test Agent 1"]);
    const stdout = await new Response(proc.stdout).text();
    expect(stdout).toContain("Agent test-1 registered");
    expect(existsSync(STATE_FILE)).toBe(true);
  });

  test("Should record a heartbeat", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", "heartbeat", "test-1"]);
    const stdout = await new Response(proc.stdout).text();
    expect(stdout).toContain("Heartbeat recorded for test-1");
  });

  test("Should display dashboard with correct status", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", "dashboard"]);
    const stdout = await new Response(proc.stdout).text();
    expect(stdout).toContain("test-1");
    expect(stdout).toContain("HEALTHY");
  });

  test("Should fail for unknown agent", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", "heartbeat", "unknown-agent"], {
      stderr: "pipe"
    });
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    expect(stderr).toContain("Agent unknown-agent not registered");
  });
});

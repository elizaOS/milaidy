import { describe, expect, it } from "vitest";
import { generateMockMetrics, generateMockLogs } from "../lib/mock-data";

describe("mock-data", () => {
  it("generates metrics with correct shape", () => {
    const metrics = generateMockMetrics(5);
    expect(metrics).toHaveLength(5);
    expect(metrics[0]).toHaveProperty("cpu");
    expect(metrics[0]).toHaveProperty("memoryMb");
    expect(metrics[0]).toHaveProperty("diskMb");
    expect(metrics[0]).toHaveProperty("timestamp");
    expect(typeof metrics[0].cpu).toBe("number");
  });

  it("generates logs with correct shape", () => {
    const logs = generateMockLogs(10);
    expect(logs).toHaveLength(10);
    expect(["info", "warn", "error"]).toContain(logs[0].level);
    expect(typeof logs[0].message).toBe("string");
    expect(typeof logs[0].timestamp).toBe("string");
    expect(typeof logs[0].agentName).toBe("string");
  });
});

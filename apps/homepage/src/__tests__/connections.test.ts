import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getConnections, addConnection, removeConnection, type StoredConnection,
} from "../lib/connections";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("connections store", () => {
  it("starts empty", () => {
    expect(getConnections()).toEqual([]);
  });

  it("adds a connection", () => {
    const conn = addConnection({ name: "Local", url: "http://localhost:2138", type: "local" });
    expect(conn.id).toBeDefined();
    expect(getConnections()).toHaveLength(1);
  });

  it("removes a connection by id", () => {
    const conn = addConnection({ name: "Local", url: "http://localhost:2138", type: "local" });
    removeConnection(conn.id);
    expect(getConnections()).toHaveLength(0);
  });

  it("persists across reads", () => {
    addConnection({ name: "Remote", url: "http://10.0.0.5:2138", type: "remote" });
    const conns = getConnections();
    expect(conns).toHaveLength(1);
    expect(conns[0].name).toBe("Remote");
  });
});

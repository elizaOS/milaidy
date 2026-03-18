import type { ConnectionType } from "./cloud-api";

const STORAGE_KEY = "milady-connections";

export interface StoredConnection {
  id: string;
  name: string;
  url: string;
  type: ConnectionType;
}

export function getConnections(): StoredConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConnections(conns: StoredConnection[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conns));
}

export function addConnection(input: Omit<StoredConnection, "id">): StoredConnection {
  const conn: StoredConnection = { ...input, id: crypto.randomUUID() };
  const conns = getConnections();
  conns.push(conn);
  saveConnections(conns);
  return conn;
}

export function removeConnection(id: string): void {
  saveConnections(getConnections().filter((c) => c.id !== id));
}

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CloudApiClient } from "./cloud-api";
import { getConnections, addConnection, removeConnection, type StoredConnection } from "./connections";

export type ConnectionHealth = "healthy" | "unreachable" | "checking";

interface ConnectionState extends StoredConnection {
  health: ConnectionHealth;
  client: CloudApiClient;
}

interface ConnectionContextValue {
  connections: ConnectionState[];
  add: (input: Omit<StoredConnection, "id">) => void;
  remove: (id: string) => void;
  refresh: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<ConnectionState[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const loadAndPoll = useCallback(async () => {
    const stored = getConnections();
    const states: ConnectionState[] = await Promise.all(
      stored.map(async (conn) => {
        const client = new CloudApiClient({ url: conn.url, type: conn.type });
        let health: ConnectionHealth = "checking";
        try {
          await client.health();
          health = "healthy";
        } catch {
          health = "unreachable";
        }
        return { ...conn, health, client };
      }),
    );
    setConnections(states);
  }, []);

  useEffect(() => {
    loadAndPoll();
    intervalRef.current = setInterval(loadAndPoll, 5000);
    return () => clearInterval(intervalRef.current);
  }, [loadAndPoll]);

  const add = useCallback((input: Omit<StoredConnection, "id">) => {
    addConnection(input);
    loadAndPoll();
  }, [loadAndPoll]);

  const remove = useCallback((id: string) => {
    removeConnection(id);
    loadAndPoll();
  }, [loadAndPoll]);

  return (
    <ConnectionContext value={{ connections, add, remove, refresh: loadAndPoll }}>
      {children}
    </ConnectionContext>
  );
}

export function useConnections() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnections must be used within ConnectionProvider");
  return ctx;
}

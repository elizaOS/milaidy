import "@miladyai/app-core/styles/styles.css";

import {
  initializeCapacitorBridge,
  initializeStorageBridge,
} from "@miladyai/app-core/bridge";
import { AppProvider } from "@miladyai/app-core/state";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

async function bootstrap() {
  await initializeStorageBridge();
  initializeCapacitorBridge();

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Missing #root mount point");
  }

  createRoot(rootElement).render(
    <StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </StrictMode>,
  );
}

bootstrap().catch((error) => {
  console.error("[home] Failed to bootstrap:", error);
});

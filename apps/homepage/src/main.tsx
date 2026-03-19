import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Nav } from "./components/Nav";
import { setToken } from "./lib/auth";
import { getSpaFallbackRedirectTarget } from "./lib/spa-fallback";
import { AppRoutes } from "./router";

const spaRedirectTarget = getSpaFallbackRedirectTarget(window.location);
if (spaRedirectTarget) {
  window.history.replaceState({}, "", spaRedirectTarget);
}

// Allow setting the API token via URL param: ?token=eliza_xxx
// Stores in localStorage and immediately strips the param from the URL.
// NOTE: The token may briefly appear in server/CDN access logs before replaceState
// executes. This is an accepted tradeoff for OAuth-style redirect flows; production
// deployments should use short-lived tokens and HTTPS-only.
const currentUrl = new URL(window.location.href);
const tokenParam = currentUrl.searchParams.get("token");
if (tokenParam) {
  setToken(tokenParam);
  currentUrl.searchParams.delete("token");
  window.history.replaceState({}, "", currentUrl.toString());
}

const root = document.getElementById("root");
if (!root) throw new Error("No root element");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Nav />
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
);

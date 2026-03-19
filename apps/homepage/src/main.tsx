import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Nav } from "./components/Nav";
import { setToken } from "./lib/auth";
import { AppRoutes } from "./router";

// Allow setting the API token via URL param: ?token=eliza_xxx
// Stores in localStorage and immediately strips the param from the URL.
// NOTE: The token may briefly appear in server/CDN access logs before replaceState
// executes. This is an accepted tradeoff for OAuth-style redirect flows; production
// deployments should use short-lived tokens and HTTPS-only.
const url = new URL(window.location.href);
const tokenParam = url.searchParams.get("token");
if (tokenParam) {
  setToken(tokenParam);
  url.searchParams.delete("token");
  window.history.replaceState({}, "", url.toString());
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

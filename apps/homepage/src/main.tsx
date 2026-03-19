import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { setToken } from "./lib/auth";
import { Nav } from "./components/Nav";
import { AppRoutes } from "./router";

// Allow setting the API token via URL param: ?token=eliza_xxx
// Stores in localStorage and strips the param from the URL for security.
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

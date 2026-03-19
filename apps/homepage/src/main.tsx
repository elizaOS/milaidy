import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Nav } from "./components/Nav";
import { AppRoutes } from "./router";

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

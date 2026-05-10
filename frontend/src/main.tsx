// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { SolanaProvider } from "./providers/SolanaProvider";
import Router from "./router/index";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SolanaProvider>
      <Router />
    </SolanaProvider>
  </StrictMode>,
);
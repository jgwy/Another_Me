import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { initI18n } from "./i18n";
import { useAuthStore } from "./store/auth";
import "./styles/index.css";

// Bring up i18n (zh default) and restore any persisted session before the first
// render to avoid an auth flicker and a flash of untranslated keys.
initI18n();
useAuthStore.getState().hydrate();

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

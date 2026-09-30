import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./i18n";
import { App } from "./App";
import "@mind-context/design-system/tokens.css";
import "./styles.css";
import "@mind-context/workspace-ui/chrome.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

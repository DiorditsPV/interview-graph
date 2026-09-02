import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthGate } from "./AuthGate";

import "@xyflow/react/dist/style.css";
import "highlight.js/styles/github-dark.css";
import "./styles.css";
import "./design-themes.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
);

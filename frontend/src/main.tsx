import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

import "@xyflow/react/dist/style.css";
import "highlight.js/styles/github-dark.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthGate } from "./AuthGate";
import { LangProvider } from "./i18n";

import "@xyflow/react/dist/style.css";
import "highlight.js/styles/github-dark.css";
import "./styles.css";
import "./design-themes.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Язык интерфейса — над гейтом входа: экран логина тоже переводится. */}
    <LangProvider>
      <AuthGate />
    </LangProvider>
  </StrictMode>,
);

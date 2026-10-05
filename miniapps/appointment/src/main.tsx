import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";

const container = document.getElementById("root");
if (container === null) throw new Error("#root bulunamadı");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

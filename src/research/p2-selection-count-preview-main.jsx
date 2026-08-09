import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./p2-preview.css";
import P2SelectionCountPreview from "./p2-selection-count-preview.jsx";

const root = document.getElementById("p2-research-root");
if (!root) throw new Error("P2 research preview rootがありません");

createRoot(root).render(
  <StrictMode>
    <P2SelectionCountPreview />
  </StrictMode>
);

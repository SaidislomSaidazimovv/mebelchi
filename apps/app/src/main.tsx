import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { KarkasDemo } from "./three/KarkasDemo";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
// Dev preview of the ported StructuralModel engine in our three.js stack (Phase 2).
// Open /#karkas to view it; the kitchen app is otherwise untouched.
const showKarkasDemo = typeof window !== "undefined" && window.location.hash === "#karkas";
createRoot(root).render(
  <React.StrictMode>
    {showKarkasDemo ? <KarkasDemo /> : <App />}
  </React.StrictMode>,
);

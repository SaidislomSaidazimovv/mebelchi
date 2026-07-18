import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { KarkasEditor } from "./three/KarkasEditor";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
// Dev preview of the StructuralModel editor. Open /#karkas to see the SAME editor the app opens from
// the constructor / Biblioteka (it's the real component, just a dev entry) — the kitchen app is
// otherwise untouched. The Moblo-style rebuild happens IN this editor, so /#karkas previews it.
const showKarkasDemo = typeof window !== "undefined" && window.location.hash === "#karkas";
createRoot(root).render(
  <React.StrictMode>
    {showKarkasDemo ? <KarkasEditor /> : <App />}
  </React.StrictMode>,
);

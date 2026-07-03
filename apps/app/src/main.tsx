import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { KarkasEditor } from "./three/KarkasEditor";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
// Dev preview of the ported StructuralModel editor (Phase 2/3). Open /#karkas to view it;
// the kitchen app is otherwise untouched. In Phase 3.3 it also opens from the Biblioteka.
const showKarkasDemo = typeof window !== "undefined" && window.location.hash === "#karkas";
createRoot(root).render(
  <React.StrictMode>
    {showKarkasDemo ? <KarkasEditor /> : <App />}
  </React.StrictMode>,
);

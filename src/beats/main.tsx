import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { bootPersistence } from "@/persistence";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("beats.html is missing #root");

// Load the saved project before the first render so there is no flash of the starter project.
await bootPersistence();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

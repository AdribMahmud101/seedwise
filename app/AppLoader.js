"use client";

import { useEffect } from "react";

// Leaflet ships as a classic script that defines window.L.
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/assets/leaflet.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// The workspace is an imperative module that owns #app after boot.
// Importing it once (it is cached) wires up listeners and renders.
export default function AppLoader() {
  useEffect(() => {
    loadLeaflet()
      .catch(() => {})
      .then(() => import("../src/legacy/app.js"));
  }, []);
  return null;
}

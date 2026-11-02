// pdf.js'ten önce yüklenir. Safari'de sayfa metni bu olmadan okunmaz.
import "@/lib/stream";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/literata/opsz.css";
import App from "@/App";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// src/components/editor/countdown/countdownUtils.js
import { resolveCountdownTemporalState } from "../../../../shared/renderContractPolicy.js";

export function getRemainingParts(iso, nowValue = Date.now()) {
  return resolveCountdownTemporalState(iso, nowValue);
}

export const fmt = (n, pad) => (pad ? String(n).padStart(2, "0") : String(n));

export function makeDefaultCountdown({ fechaISO, x = 200, y = 160, width = 480, height = 90 } = {}) {
  return {
    id: `countdown-${Date.now().toString(36)}`,
    tipo: "countdown",
    seccionId: undefined,      // ⚠️ la completa CanvasEditor al insertar
    fechaObjetivo: fechaISO ?? new Date(Date.now() + 86400000).toISOString(), // mañana por defecto

    // Apariencia base
    layout: "pills",           // "pills" | "flip" | "minimal"
    showLabels: true,
    padZero: true,
    separator: "·",
    gap: 12,

    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 26,
    color: "#1f2937",
    labelColor: "#6b7280",
    background: "transparent",

    boxBg: "#ffffff",
    boxBorder: "#e5e7eb",
    boxRadius: 12,
    boxShadow: true,
    flipDividerColor: "#e5e7eb",

    // Posición/tamaño
    x, y, width, height
  };
}

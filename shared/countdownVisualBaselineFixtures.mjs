export const COUNTDOWN_VISUAL_BASELINE_VERSION = 1;
export const COUNTDOWN_VISUAL_BASELINE_FROZEN_NOW_ISO =
  "2030-06-15T12:00:00.000Z";

export const COUNTDOWN_VISUAL_BASELINE_SURFACES = Object.freeze([
  "builder",
  "canvas",
  "preview",
  "publication",
  "mobile",
]);

export const countdownVisualBaselinePreset = Object.freeze({
  layout: Object.freeze({
    type: "singleFrame",
    distribution: "centered",
    visibleUnits: Object.freeze(["days", "hours", "minutes", "seconds"]),
    chipWidth: 68,
    gap: 10,
    framePadding: 16,
  }),
  tipografia: Object.freeze({
    fontFamily: "Arial, sans-serif",
    numberSize: 30,
    labelSize: 11,
    letterSpacing: 0.4,
    lineHeight: 1.05,
    labelTransform: "uppercase",
  }),
  colores: Object.freeze({
    numberColor: "#172554",
    labelColor: "#475569",
    frameColor: "#6d28d9",
  }),
  animaciones: Object.freeze({
    entry: "none",
    tick: "none",
    frame: "none",
  }),
  unidad: Object.freeze({
    showLabels: true,
    separator: "",
    boxBg: "#ffffff",
    boxBorder: "rgba(109,40,217,0.22)",
    boxRadius: 999,
    boxShadow: true,
  }),
  tamanoBase: 420,
});

export const COUNTDOWN_VISUAL_BASELINE_FRAME_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 140" fill="none">
  <rect x="7" y="7" width="506" height="126" rx="63" stroke="currentColor" stroke-width="8"/>
  <circle cx="38" cy="70" r="7" fill="currentColor"/>
  <circle cx="482" cy="70" r="7" fill="currentColor"/>
</svg>
`.trim();

export const countdownVisualBaselineStates = Object.freeze([
  Object.freeze({
    id: "days",
    label: "Faltan dias",
    targetISO: "2030-06-25T17:23:45.000Z",
    expected: Object.freeze({
      days: 10,
      hours: 5,
      minutes: 23,
      seconds: 45,
      expired: false,
    }),
  }),
  Object.freeze({
    id: "hours",
    label: "Faltan horas",
    targetISO: "2030-06-15T15:17:42.000Z",
    expected: Object.freeze({
      days: 0,
      hours: 3,
      minutes: 17,
      seconds: 42,
      expired: false,
    }),
  }),
  Object.freeze({
    id: "seconds",
    label: "Faltan segundos",
    targetISO: "2030-06-15T12:00:42.000Z",
    expected: Object.freeze({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 42,
      expired: false,
    }),
  }),
  Object.freeze({
    id: "expired",
    label: "Evento finalizado",
    targetISO: "2030-06-15T11:59:59.000Z",
    expected: Object.freeze({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: true,
    }),
  }),
]);

export function getCountdownVisualBaselineState(stateId) {
  const normalized = String(stateId || "").trim().toLowerCase();
  return (
    countdownVisualBaselineStates.find((state) => state.id === normalized) ||
    countdownVisualBaselineStates[0]
  );
}

export function buildCountdownVisualBaselineFixtureManifest() {
  return {
    fixtureVersion: COUNTDOWN_VISUAL_BASELINE_VERSION,
    frozenNowISO: COUNTDOWN_VISUAL_BASELINE_FROZEN_NOW_ISO,
    surfaces: [...COUNTDOWN_VISUAL_BASELINE_SURFACES],
    states: countdownVisualBaselineStates.map((state) => ({
      id: state.id,
      label: state.label,
      targetISO: state.targetISO,
      expected: { ...state.expected },
    })),
  };
}

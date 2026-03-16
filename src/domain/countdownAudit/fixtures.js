import { buildCountdownCanvasPatchFromPreset } from "@/domain/countdownPresets/toCanvasPatch";
import { createFutureDateISO } from "@/domain/countdownPresets/renderModel";

export const COUNTDOWN_AUDIT_TRACE_IDS = Object.freeze({
  V2_FIXED: "audit-v2-fixed",
  V2_SCREEN: "audit-v2-screen",
  LEGACY_CONTROL: "audit-legacy-control",
});

const CURRENT_COLOR_FRAME_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 128" fill="none">
  <rect x="8" y="8" width="344" height="112" rx="56" stroke="currentColor" stroke-width="10"/>
  <circle cx="42" cy="64" r="8" fill="currentColor"/>
  <circle cx="318" cy="64" r="8" fill="currentColor"/>
</svg>
`.trim();

function svgTextToDataUrl(svgText) {
  if (!svgText) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

function withAuditMeta(payload, fixture) {
  return {
    ...payload,
    countdownAuditTraceId: fixture.traceId,
    countdownAuditFixture: fixture.kind,
    countdownAuditLabel: fixture.label,
    countdownAuditSynthetic: true,
  };
}

function buildV2Fixture(kind, traceId, label) {
  const targetISO = createFutureDateISO(45);
  const config = {
    countdownAuditTraceId: traceId,
    countdownAuditFixture: kind,
    layout: {
      type: "singleFrame",
      distribution: "centered",
      visibleUnits: ["days", "hours", "minutes", "seconds"],
      gap: 12,
      framePadding: 18,
    },
    tipografia: {
      fontFamily: "Poppins",
      numberSize: 30,
      labelSize: 12,
      letterSpacing: 0.6,
      lineHeight: 1.04,
      labelTransform: "uppercase",
    },
    colores: {
      numberColor: "#16213e",
      labelColor: "#4f5d75",
      frameColor: "#1f4ed8",
    },
    animaciones: {
      entry: "fadeUp",
      tick: "flipSoft",
      frame: "none",
    },
    unidad: {
      showLabels: true,
      separator: "",
      boxBg: "#ffffff",
      boxBorder: "rgba(31,78,216,0.18)",
      boxRadius: 999,
      boxShadow: true,
    },
    tamanoBase: 420,
  };

  const svgText = CURRENT_COLOR_FRAME_SVG;
  const svgRef = {
    colorMode: "currentColor",
    downloadUrl: svgTextToDataUrl(svgText),
  };

  const presetProps = withAuditMeta(
    buildCountdownCanvasPatchFromPreset({
      presetId: `synthetic-${kind}`,
      activeVersion: 1,
      layout: config.layout,
      tipografia: config.tipografia,
      colores: config.colores,
      animaciones: config.animaciones,
      unidad: config.unidad,
      tamanoBase: config.tamanoBase,
      svgRef,
    }),
    { kind, traceId, label }
  );

  return {
    kind,
    traceId,
    label,
    targetISO,
    config,
    svgText,
    svgColorMode: "currentColor",
    frameUrl: svgRef.downloadUrl,
    frameColor: config.colores.frameColor,
    presetProps,
  };
}

function buildLegacyFixture() {
  const kind = "legacy-control";
  const traceId = COUNTDOWN_AUDIT_TRACE_IDS.LEGACY_CONTROL;
  const label = "Legacy-Control";
  const targetISO = createFutureDateISO(45);
  const presetProps = withAuditMeta(
    {
      countdownSchemaVersion: 1,
      presetId: "synthetic-legacy-control",
      presetVersion: 1,
      tamanoBase: 320,
      layoutType: "singleFrame",
      distribution: "centered",
      visibleUnits: ["days", "hours", "minutes", "seconds"],
      gap: 10,
      framePadding: 10,
      frameSvgUrl: null,
      frameColorMode: "fixed",
      frameColor: "#7c3aed",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 28,
      labelSize: 11,
      letterSpacing: 0,
      lineHeight: 1.05,
      labelTransform: "uppercase",
      color: "#7c3aed",
      labelColor: "#6b7280",
      entryAnimation: "none",
      tickAnimation: "none",
      frameAnimation: "none",
      showLabels: true,
      padZero: true,
      separator: "",
      paddingX: 8,
      paddingY: 6,
      chipWidth: 46,
      layout: "pills",
      background: "transparent",
      boxBg: "#ffffff",
      boxBorder: "#7c3aed",
      boxRadius: 14,
      boxShadow: false,
      presetPropsVersion: 1,
    },
    { kind, traceId, label }
  );

  return {
    kind,
    traceId,
    label,
    targetISO,
    config: null,
    svgText: "",
    svgColorMode: "fixed",
    frameUrl: "",
    frameColor: "#7c3aed",
    presetProps,
  };
}

const FIXTURES = Object.freeze({
  "v2-fixed": buildV2Fixture("v2-fixed", COUNTDOWN_AUDIT_TRACE_IDS.V2_FIXED, "V2-Fixed"),
  "v2-screen": buildV2Fixture("v2-screen", COUNTDOWN_AUDIT_TRACE_IDS.V2_SCREEN, "V2-Screen"),
  "legacy-control": buildLegacyFixture(),
});

export function listCountdownAuditFixtures() {
  return Object.values(FIXTURES).map((fixture) => ({ ...fixture }));
}

export function getCountdownAuditFixture(kind) {
  const safeKind = String(kind || "").trim().toLowerCase();
  if (!safeKind) return null;
  return FIXTURES[safeKind] ? { ...FIXTURES[safeKind] } : null;
}

export function buildCountdownAuditFormState(kind) {
  const fixture = getCountdownAuditFixture(kind);
  if (!fixture || !fixture.config) return null;

  return {
    nombre: fixture.label,
    categoria: {
      event: "general",
      style: "editorial",
      custom: "countdown-audit",
      label: "General / Editorial",
    },
    config: fixture.config,
    svgAsset: fixture.svgText
      ? {
          valid: true,
          fileName: `${fixture.kind}.svg`,
          mimeType: "image/svg+xml",
          byteSize: fixture.svgText.length,
          svgText: fixture.svgText,
          svgBase64: null,
          previewUrl: fixture.frameUrl,
          downloadUrl: fixture.frameUrl,
          colorMode: fixture.svgColorMode,
          inspection: {
            warnings: [],
            criticalErrors: [],
            checks: {
              fileName: `${fixture.kind}.svg`,
              bytes: fixture.svgText.length,
              viewBox: "0 0 360 128",
              hasFixedDimensions: false,
              colorMode: fixture.svgColorMode,
            },
          },
          isDirty: true,
        }
      : null,
  };
}

export function buildCountdownAuditInsertPayload(kind, overrides = {}) {
  const fixture = getCountdownAuditFixture(kind);
  if (!fixture) return null;

  const basePayload = {
    id: `countdown-audit-${fixture.kind}-${Date.now().toString(36)}`,
    tipo: "countdown",
    fechaObjetivo: fixture.targetISO,
    presetId: fixture.presetProps?.presetId || fixture.kind,
    presetProps: fixture.presetProps,
    ...overrides,
  };

  return withAuditMeta(basePayload, fixture);
}

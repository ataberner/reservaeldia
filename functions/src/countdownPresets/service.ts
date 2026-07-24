
import { randomUUID } from "crypto";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import { requireAdmin, requireAuth } from "../auth/adminAuth";
import { recordBackendCountdownTelemetry } from "../countdownObservability/telemetry";
import {
  documentReferencesCountdownPreset,
  planPublishDraftTransition,
  planSaveDraftTransition,
  resolveCountdownPresetDeletionPolicy,
  resolvePublicCatalogVersion,
} from "./phase1Policy";
import {
  buildCountdownDuplicateDraftRoot,
  resolveCountdownDuplicateSource,
} from "./phase3Policy";
import { inspectCountdownPngBuffer } from "./frameAssetValidation";

// Shared CJS is the cross-runtime authority copied into Functions at build time.
/* eslint-disable @typescript-eslint/no-var-requires -- contrato CJS compartido con frontend y scripts */
const {
  COUNTDOWN_FRAME_ASSET_LIMITS,
  COUNTDOWN_FRAME_MIME_TYPES,
  normalizeCountdownFrameColorMode,
  resolveCountdownFrameAssetType,
  resolveCountdownFrameMimeType,
} = require("../../shared/countdownFrameAssetContract.cjs") as {
  COUNTDOWN_FRAME_ASSET_LIMITS: {
    svgMaxBytes: number;
    svgWarningBytes: number;
  };
  COUNTDOWN_FRAME_MIME_TYPES: {
    svg: "image/svg+xml";
    png: "image/png";
  };
  normalizeCountdownFrameColorMode: (
    assetType: FrameAssetType | null,
    colorMode: unknown
  ) => ColorMode;
  resolveCountdownFrameAssetType: (
    value: unknown,
    fallback?: FrameAssetType | null
  ) => FrameAssetType | null;
  resolveCountdownFrameMimeType: (
    value: unknown,
    fallback?: FrameAssetType | null
  ) => FrameMimeType | null;
};
const {
  COUNTDOWN_FRAME_SCALE_LIMITS,
} = require("../../shared/countdownFrameGeometry.cjs") as {
  COUNTDOWN_FRAME_SCALE_LIMITS: {
    min: number;
    max: number;
    default: number;
  };
};
/* eslint-enable @typescript-eslint/no-var-requires */

type Estado = "draft" | "published" | "archived";
type Unit = "days" | "hours" | "minutes" | "seconds";
type LayoutType = "singleFrame" | "multiUnit";
type Distribution = "centered" | "vertical" | "grid" | "editorial";
type LabelTransform = "none" | "uppercase" | "lowercase" | "capitalize";
type ColorMode = "currentColor" | "fixed";
type FrameAssetType = "svg" | "png";
type FrameMimeType = "image/svg+xml" | "image/png";
type EntryAnim = "fadeUp" | "fadeIn" | "scaleIn" | "none";
type TickAnim = "flipSoft" | "pulse" | "none";
type FrameAnim = "rotateSlow" | "shimmer" | "none";

type Category = {
  event: string;
  style: string;
  custom: string | null;
  label: string;
};

type Config = {
  layout: {
    type: LayoutType;
    distribution: Distribution;
    visibleUnits: Unit[];
    chipWidth: number | null;
    gap: number;
    framePadding: number;
    frameScale: number;
  };
  tipografia: {
    fontFamily: string;
    numberSize: number;
    labelSize: number;
    letterSpacing: number;
    lineHeight: number;
    labelTransform: LabelTransform;
  };
  colores: {
    numberColor: string;
    labelColor: string;
    frameColor: string;
  };
  animaciones: {
    entry: EntryAnim;
    tick: TickAnim;
    frame: FrameAnim;
  };
  unidad: {
    showLabels: boolean;
    separator: string;
    boxBg: string;
    boxBorder: string;
    boxRadius: number;
    boxShadow: boolean;
  };
  tamanoBase: number;
};

type SvgRef = {
  type: FrameAssetType | null;
  mimeType: FrameMimeType | null;
  storagePath: string | null;
  downloadUrl: string | null;
  thumbnailPath: string | null;
  thumbnailUrl: string | null;
  viewBox: string | null;
  hasFixedDimensions: boolean;
  bytes: number;
  width: number | null;
  height: number | null;
  hasAlpha: boolean | null;
  hasTransparency: boolean | null;
  colorMode: ColorMode;
};

type Draft = {
  id: string;
  nombre: string;
  categoria: Category;
  svgRef: SvgRef;
  layout: Config["layout"];
  tipografia: Config["tipografia"];
  colores: Config["colores"];
  animaciones: Config["animaciones"];
  unidad: Config["unidad"];
  tamanoBase: number;
  validationReport: {
    warnings: string[];
    checks: Record<string, unknown>;
  };
};

type PresetDoc = {
  id?: string;
  nombre?: string;
  categoria?: Category;
  estado?: Estado;
  activeVersion?: number | null;
  draftVersion?: number | null;
  svgRef?: SvgRef | null;
  layout?: Config["layout"];
  tipografia?: Config["tipografia"];
  colores?: Config["colores"];
  animaciones?: Config["animaciones"];
  unidad?: Config["unidad"];
  tamanoBase?: number;
  draft?: Draft | null;
  legacyPresetProps?: LegacyCanvasProps | null;
  metadata?: Record<string, unknown>;
};

type SaveInput = {
  presetId?: unknown;
  nombre?: unknown;
  categoria?: unknown;
  expectedDraftVersion?: unknown;
  editorSessionId?: unknown;
  operationId?: unknown;
  config?: unknown;
  assets?: {
    removeFrame?: unknown;
    frameFileName?: unknown;
    frameMimeType?: unknown;
    frameBase64?: unknown;
    removeSvg?: unknown;
    svgFileName?: unknown;
    svgBase64?: unknown;
    thumbnailPngBase64?: unknown;
  };
};

type PublishInput = {
  presetId?: unknown;
  expectedDraftVersion?: unknown;
  operationId?: unknown;
};

type ArchiveInput = {
  presetId?: unknown;
  archived?: unknown;
};

type DeleteInput = {
  presetId?: unknown;
};

type SyncLegacyInput = {
  presets?: unknown;
};

type DuplicateInput = {
  presetId?: unknown;
  operationId?: unknown;
};

type ListVersionsInput = {
  presetId?: unknown;
};

type LegacyCanvasProps = {
  fontFamily: string;
  fontSize: number;
  color: string;
  labelColor: string;
  showLabels: boolean;
  boxBg: string;
  boxBorder: string;
  boxRadius: number;
  boxShadow: boolean;
  separator: string;
  gap: number;
  labelSize: number;
  letterSpacing: number;
  lineHeight: number;
};

type Range = { min: number; max: number };

const OPTIONS = {
  region: "us-central1" as const,
  cpu: "gcf_gen1" as const,
  cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
};

const COLLECTION = "countdownPresets";
const SCHEMA_VERSION = 2;
const RENDER_CONTRACT_VERSION = 2;
const LEGACY_SYNC_SOURCE = "legacy-config-v1";
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const PRESET_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const OPERATION_ID = /^[a-zA-Z0-9_-]{8,128}$/;
const UNSAFE_HREF = /^(https?:|\/\/|javascript:)/i;
const UNSAFE_CSS_TOKEN = /[<>;]/;
const UNSAFE_CSS_PATTERN = /(url\s*\(|javascript:|expression\s*\()/i;
const SAFE_CSS_VALUE = /^[#(),.%\-+\s\w:/]*$/i;

const EVENTS = new Set(["boda", "quince", "cumpleanos", "aniversario", "baby-shower", "corporativo", "general"]);
const STYLES = new Set(["minimal", "floral", "romantico", "editorial", "moderno", "clasico", "premium"]);
const LAYOUT_TYPES = new Set(["singleFrame", "multiUnit"]);
const DISTRIBUTIONS = new Set(["centered", "vertical", "grid", "editorial"]);
const ENTRY_ANIMS = new Set(["fadeUp", "fadeIn", "scaleIn", "none"]);
const TICK_ANIMS = new Set(["flipSoft", "pulse", "none"]);
const FRAME_ANIMS = new Set(["rotateSlow", "shimmer", "none"]);
const LABEL_TRANSFORMS = new Set(["none", "uppercase", "lowercase", "capitalize"]);
const COLOR_MODES = new Set(["currentColor", "fixed"]);
const UNITS: Unit[] = ["days", "hours", "minutes", "seconds"];

const RANGES: Record<string, Range> = {
  tamanoBase: { min: 220, max: 960 },
  chipWidth: { min: 34, max: 520 },
  gap: { min: 0, max: 48 },
  framePadding: { min: 0, max: 64 },
  frameScale: COUNTDOWN_FRAME_SCALE_LIMITS,
  numberSize: { min: 10, max: 120 },
  labelSize: { min: 8, max: 72 },
  letterSpacing: { min: -2, max: 12 },
  lineHeight: { min: 0.8, max: 2 },
  boxRadius: { min: 0, max: 999 },
};

const DEFAULT_CATEGORY: Category = {
  event: "general",
  style: "minimal",
  custom: null,
  label: "General / Minimal",
};

let cssValidatorWindow: ReturnType<typeof createCssValidatorWindow> | null = null;

function createCssValidatorWindow() {
  // Lazy-loaded to reduce Functions startup cost during emulator discovery/cold start.
  const { JSDOM } = require("jsdom") as typeof import("jsdom");
  return new JSDOM("<!doctype html><html><body></body></html>").window;
}

function getCssValidatorWindow() {
  if (!cssValidatorWindow) {
    cssValidatorWindow = createCssValidatorWindow();
  }
  return cssValidatorWindow;
}

function ensureApp() {
  if (admin.apps.length > 0) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "reservaeldia-7a440.firebasestorage.app",
  });
}

function db() {
  ensureApp();
  return admin.firestore();
}

function bucket() {
  ensureApp();
  return getStorage().bucket();
}

function text(value: unknown, max = 140): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function optionalText(value: unknown, max = 140): string | null {
  const out = text(value, max);
  return out || null;
}

function sanitizeCssPaint(value: unknown, fallback: string): string {
  const normalized = text(value, 120);
  if (!normalized) return fallback;
  if (UNSAFE_CSS_TOKEN.test(normalized) || UNSAFE_CSS_PATTERN.test(normalized)) {
    fail("Valor CSS invalido en estilo de unidad.");
  }
  if (!SAFE_CSS_VALUE.test(normalized)) {
    fail("Valor CSS no permitido en estilo de unidad.");
  }
  return normalized;
}

function isSafeCssPaint(value: string): boolean {
  if (!value) return false;
  if (UNSAFE_CSS_TOKEN.test(value) || UNSAFE_CSS_PATTERN.test(value)) return false;
  if (!SAFE_CSS_VALUE.test(value)) return false;

  const probe = getCssValidatorWindow().document.createElement("div");
  probe.style.color = "";
  probe.style.color = value;
  if (probe.style.color) return true;

  probe.style.background = "";
  probe.style.background = value;
  return Boolean(probe.style.background);
}

function sanitizeColorPaint(value: unknown, label: string): string {
  const normalized = text(value, 120);
  if (!normalized) fail(`${label} invalido.`);
  if (!isSafeCssPaint(normalized)) fail(`${label} invalido.`);
  return normalized;
}

function toTitle(value: string): string {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function fail(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function oneOf<T extends string>(value: unknown, set: Set<string>, label: string): T {
  const normalized = text(value, 60);
  if (!set.has(normalized)) fail(`${label} invalido.`);
  return normalized as T;
}

function isTransparentColor(value: unknown): boolean {
  return text(value, 24).toLowerCase() === "transparent";
}

function numberInRange(value: unknown, range: Range, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(`${label} debe ser numerico.`);
  if (parsed < range.min || parsed > range.max) fail(`${label} fuera de rango (${range.min}..${range.max}).`);
  return parsed;
}

function optionalNumberInRange(value: unknown, range: Range, label: string): number | null {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(`${label} debe ser numerico.`);
  if (parsed < range.min || parsed > range.max) fail(`${label} fuera de rango (${range.min}..${range.max}).`);
  return parsed;
}

function numberInRangeWithDefault(
  value: unknown,
  range: Range,
  label: string,
  fallback: number
): number {
  if (value === null || typeof value === "undefined" || value === "") {
    return fallback;
  }
  return numberInRange(value, range, label);
}

function parseId(value: unknown): string | null {
  const normalized = text(value, 90).toLowerCase();
  if (!normalized) return null;
  if (!PRESET_ID.test(normalized)) fail("presetId invalido.");
  return normalized;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, toFiniteNumber(value, fallback)));
}

function normalizeColorOrFallback(value: unknown, fallback: string): string {
  const normalized = text(value, 24);
  return HEX_COLOR.test(normalized) ? normalized : fallback;
}

function normalizePresetIdCandidate(value: unknown): string {
  const requested = text(value, 120).toLowerCase();
  const normalized = requested
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return PRESET_ID.test(normalized) ? normalized : "";
}

function parseExpectedDraftVersion(value: unknown): number | null {
  if (value === null || typeof value === "undefined") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) fail("expectedDraftVersion invalido.");
  return parsed;
}

function parseOperationId(value: unknown): string {
  const normalized = text(value, 128);
  if (!normalized) {
    // Rolling-deploy compatibility for callers that predate Phase 1.
    return `legacy_${randomUUID().replace(/-/g, "")}`;
  }
  if (!OPERATION_ID.test(normalized)) fail("operationId invalido.");
  return normalized;
}

function intOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} invalido.`);
  return value as Record<string, unknown>;
}
function slugifyName(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return normalized || "countdown";
}

async function resolveDocRef(
  requestedId: string | null,
  nombre: string,
  operationId: string
) {
  const database = db();
  if (requestedId) return { presetId: requestedId, ref: database.collection(COLLECTION).doc(requestedId) };

  const base = slugifyName(nombre);
  const operationSuffix = operationId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);
  const candidateBase = `${base}-${operationSuffix || randomUUID().slice(0, 12)}`;
  const candidate = candidateBase.slice(0, 80).replace(/-+$/g, "");
  return {
    presetId: candidate,
    ref: database.collection(COLLECTION).doc(candidate),
  };
}

function normalizeCategory(value: unknown): Category {
  const raw = plainObject(value, "categoria");
  const event = text(raw.event, 60).toLowerCase();
  const style = text(raw.style, 60).toLowerCase();
  const custom = optionalText(raw.custom, 80);
  if (!EVENTS.has(event)) fail("categoria.event invalida.");
  if (!STYLES.has(style)) fail("categoria.style invalida.");
  const label = custom
    ? `${toTitle(event)} / ${toTitle(style)} / ${custom}`
    : `${toTitle(event)} / ${toTitle(style)}`;
  return { event, style, custom, label };
}

function normalizeVisibleUnits(value: unknown): Unit[] {
  if (!Array.isArray(value)) fail("layout.visibleUnits invalido.");
  const out: Unit[] = [];
  value.forEach((item) => {
    const unit = text(item, 20) as Unit;
    if (!UNITS.includes(unit)) return;
    if (!out.includes(unit)) out.push(unit);
  });
  if (out.length === 0) fail("Debes seleccionar al menos una unidad visible.");
  return out;
}

function normalizeConfig(value: unknown): Config {
  const raw = plainObject(value, "config");
  const layoutRaw = plainObject(raw.layout, "config.layout");
  const typoRaw = plainObject(raw.tipografia, "config.tipografia");
  const colorRaw = plainObject(raw.colores, "config.colores");
  const animRaw = plainObject(raw.animaciones, "config.animaciones");
  const unitRaw =
    raw.unidad && typeof raw.unidad === "object" && !Array.isArray(raw.unidad)
      ? (raw.unidad as Record<string, unknown>)
      : {};

  const numberColor = sanitizeColorPaint(colorRaw.numberColor, "config.colores.numberColor");
  const labelColor = sanitizeColorPaint(colorRaw.labelColor, "config.colores.labelColor");
  const frameColor = sanitizeColorPaint(colorRaw.frameColor, "config.colores.frameColor");
  const boxRadiusInput = Number(unitRaw.boxRadius);
  const boxRadius = Number.isFinite(boxRadiusInput)
    ? numberInRange(boxRadiusInput, RANGES.boxRadius, "config.unidad.boxRadius")
    : 10;

  if (
    !isTransparentColor(frameColor) &&
    String(frameColor || "").trim().toLowerCase().startsWith("linear-gradient(")
  ) {
    fail("config.colores.frameColor invalido.");
  }

  return {
    layout: {
      type: oneOf<LayoutType>(layoutRaw.type, LAYOUT_TYPES, "config.layout.type"),
      distribution: oneOf<Distribution>(layoutRaw.distribution, DISTRIBUTIONS, "config.layout.distribution"),
      visibleUnits: normalizeVisibleUnits(layoutRaw.visibleUnits),
      chipWidth: optionalNumberInRange(layoutRaw.chipWidth, RANGES.chipWidth, "config.layout.chipWidth"),
      gap: numberInRange(layoutRaw.gap, RANGES.gap, "config.layout.gap"),
      framePadding: numberInRange(layoutRaw.framePadding, RANGES.framePadding, "config.layout.framePadding"),
      frameScale: numberInRangeWithDefault(
        layoutRaw.frameScale,
        RANGES.frameScale,
        "config.layout.frameScale",
        COUNTDOWN_FRAME_SCALE_LIMITS.default
      ),
    },
    tipografia: {
      fontFamily: text(typoRaw.fontFamily, 120) || "Poppins",
      numberSize: numberInRange(typoRaw.numberSize, RANGES.numberSize, "config.tipografia.numberSize"),
      labelSize: numberInRange(typoRaw.labelSize, RANGES.labelSize, "config.tipografia.labelSize"),
      letterSpacing: numberInRange(typoRaw.letterSpacing, RANGES.letterSpacing, "config.tipografia.letterSpacing"),
      lineHeight: numberInRange(typoRaw.lineHeight, RANGES.lineHeight, "config.tipografia.lineHeight"),
      labelTransform: oneOf<LabelTransform>(typoRaw.labelTransform, LABEL_TRANSFORMS, "config.tipografia.labelTransform"),
    },
    colores: {
      numberColor,
      labelColor,
      frameColor,
    },
    animaciones: {
      entry: oneOf<EntryAnim>(animRaw.entry, ENTRY_ANIMS, "config.animaciones.entry"),
      tick: oneOf<TickAnim>(animRaw.tick, TICK_ANIMS, "config.animaciones.tick"),
      frame: oneOf<FrameAnim>(animRaw.frame, FRAME_ANIMS, "config.animaciones.frame"),
    },
    unidad: {
      showLabels: unitRaw.showLabels !== false,
      separator: text(unitRaw.separator, 4),
      boxBg: sanitizeCssPaint(unitRaw.boxBg, "transparent"),
      boxBorder: sanitizeCssPaint(unitRaw.boxBorder, "transparent"),
      boxRadius,
      boxShadow: unitRaw.boxShadow === true,
    },
    tamanoBase: numberInRange(raw.tamanoBase, RANGES.tamanoBase, "config.tamanoBase"),
  };
}

function normalizeSvgRef(value: unknown): SvgRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const hasAsset = Boolean(
    optionalText(raw.storagePath, 500) ||
      optionalText(raw.downloadUrl, 1000) ||
      optionalText(raw.svgText, 1000)
  );
  const type = resolveCountdownFrameAssetType(
    raw,
    hasAsset ? "svg" : null
  );
  const mimeType = resolveCountdownFrameMimeType(raw, type);
  const modeRaw = text(raw.colorMode, 20);
  const requestedMode: ColorMode = COLOR_MODES.has(modeRaw)
    ? (modeRaw as ColorMode)
    : "fixed";
  const width = Number(raw.width || 0);
  const height = Number(raw.height || 0);
  return {
    type,
    mimeType,
    storagePath: optionalText(raw.storagePath, 500),
    downloadUrl: optionalText(raw.downloadUrl, 1000),
    thumbnailPath: optionalText(raw.thumbnailPath, 500),
    thumbnailUrl: optionalText(raw.thumbnailUrl, 1000),
    viewBox: optionalText(raw.viewBox, 120),
    hasFixedDimensions: raw.hasFixedDimensions === true,
    bytes: Number(raw.bytes || 0) || 0,
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
    hasAlpha:
      typeof raw.hasAlpha === "boolean" ? raw.hasAlpha : null,
    hasTransparency:
      typeof raw.hasTransparency === "boolean"
        ? raw.hasTransparency
        : null,
    colorMode: normalizeCountdownFrameColorMode(type, requestedMode),
  };
}

function createEmptySvgRef(partial: Partial<SvgRef> = {}): SvgRef {
  const type =
    partial.type === "png"
      ? "png"
      : partial.type === "svg"
        ? "svg"
        : null;
  return {
    type,
    mimeType:
      type === "png"
        ? COUNTDOWN_FRAME_MIME_TYPES.png
        : type === "svg"
          ? COUNTDOWN_FRAME_MIME_TYPES.svg
          : null,
    storagePath: partial.storagePath ?? null,
    downloadUrl: partial.downloadUrl ?? null,
    thumbnailPath: partial.thumbnailPath ?? null,
    thumbnailUrl: partial.thumbnailUrl ?? null,
    viewBox: partial.viewBox ?? null,
    hasFixedDimensions: partial.hasFixedDimensions === true,
    bytes: Number(partial.bytes || 0) || 0,
    width:
      Number.isFinite(Number(partial.width)) && Number(partial.width) > 0
        ? Number(partial.width)
        : null,
    height:
      Number.isFinite(Number(partial.height)) && Number(partial.height) > 0
        ? Number(partial.height)
        : null,
    hasAlpha:
      typeof partial.hasAlpha === "boolean" ? partial.hasAlpha : null,
    hasTransparency:
      typeof partial.hasTransparency === "boolean"
        ? partial.hasTransparency
        : null,
    colorMode: normalizeCountdownFrameColorMode(type, partial.colorMode),
  };
}

function normalizeLegacyCanvasProps(value: unknown): LegacyCanvasProps | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    fontFamily: text(raw.fontFamily, 120) || "Poppins",
    fontSize: clampNumber(raw.fontSize, RANGES.numberSize.min, RANGES.numberSize.max, 28),
    color: normalizeColorOrFallback(raw.color, "#111111"),
    labelColor: normalizeColorOrFallback(raw.labelColor, "#6b7280"),
    showLabels: raw.showLabels !== false,
    boxBg: sanitizeCssPaint(raw.boxBg, "transparent"),
    boxBorder: sanitizeCssPaint(raw.boxBorder, "transparent"),
    boxRadius: clampNumber(raw.boxRadius, 0, 999, 12),
    boxShadow: raw.boxShadow === true,
    separator: text(raw.separator, 8),
    gap: clampNumber(raw.gap, RANGES.gap.min, RANGES.gap.max, 8),
    labelSize: clampNumber(raw.labelSize, RANGES.labelSize.min, RANGES.labelSize.max, 11),
    letterSpacing: clampNumber(
      raw.letterSpacing,
      RANGES.letterSpacing.min,
      RANGES.letterSpacing.max,
      0
    ),
    lineHeight: clampNumber(raw.lineHeight, RANGES.lineHeight.min, RANGES.lineHeight.max, 1.05),
  };
}

function buildConfigFromLegacyProps(legacyProps: LegacyCanvasProps): Config {
  return {
    layout: {
      type: "singleFrame",
      distribution: "centered",
      visibleUnits: [...UNITS],
      chipWidth: null,
      gap: clampNumber(legacyProps.gap, RANGES.gap.min, RANGES.gap.max, 8),
      framePadding: 10,
      frameScale: COUNTDOWN_FRAME_SCALE_LIMITS.default,
    },
    tipografia: {
      fontFamily: legacyProps.fontFamily || "Poppins",
      numberSize: clampNumber(
        legacyProps.fontSize,
        RANGES.numberSize.min,
        RANGES.numberSize.max,
        28
      ),
      labelSize: clampNumber(
        legacyProps.labelSize,
        RANGES.labelSize.min,
        RANGES.labelSize.max,
        11
      ),
      letterSpacing: clampNumber(
        legacyProps.letterSpacing,
        RANGES.letterSpacing.min,
        RANGES.letterSpacing.max,
        0
      ),
      lineHeight: clampNumber(
        legacyProps.lineHeight,
        RANGES.lineHeight.min,
        RANGES.lineHeight.max,
        1.05
      ),
      labelTransform: "uppercase",
    },
    colores: {
      numberColor: normalizeColorOrFallback(legacyProps.color, "#111111"),
      labelColor: normalizeColorOrFallback(legacyProps.labelColor, "#6b7280"),
      frameColor: normalizeColorOrFallback(legacyProps.boxBorder, "#773dbe"),
    },
    animaciones: {
      entry: "none",
      tick: "none",
      frame: "none",
    },
    unidad: {
      showLabels: legacyProps.showLabels,
      separator: legacyProps.separator || "",
      boxBg: legacyProps.boxBg || "transparent",
      boxBorder: legacyProps.boxBorder || "transparent",
      boxRadius: clampNumber(
        legacyProps.boxRadius,
        RANGES.boxRadius.min,
        RANGES.boxRadius.max,
        10
      ),
      boxShadow: legacyProps.boxShadow === true,
    },
    tamanoBase: 320,
  };
}

function normalizeSyncLegacyPayload(value: unknown) {
  if (!Array.isArray(value)) fail("presets legacy invalido.");
  const uniqueIds = new Set<string>();
  const payload: Array<{ id: string; nombre: string; legacyProps: LegacyCanvasProps }> = [];

  value.slice(0, 200).forEach((rawItem, index) => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return;
    const item = rawItem as Record<string, unknown>;
    const nombre = text(item.nombre, 120) || text(item.id, 120) || `Legacy ${index + 1}`;
    const normalizedFromId = normalizePresetIdCandidate(item.id);
    const normalizedFromName = normalizePresetIdCandidate(nombre);
    let presetId =
      normalizedFromId ||
      normalizedFromName ||
      `legacy-${Date.now().toString(36)}-${index.toString(36)}`;

    if (!PRESET_ID.test(presetId)) {
      presetId = `legacy-${Date.now().toString(36)}-${index.toString(36)}`;
    }

    while (uniqueIds.has(presetId)) {
      const suffix = uniqueIds.size.toString(36);
      const base = presetId.slice(0, Math.max(3, 80 - suffix.length - 1));
      presetId = `${base}-${suffix}`;
    }
    uniqueIds.add(presetId);

    const legacyProps = normalizeLegacyCanvasProps(item.props || {});
    if (!legacyProps) return;
    payload.push({ id: presetId, nombre, legacyProps });
  });

  if (!payload.length) fail("No se recibieron presets legacy validos.");
  return payload;
}

function parseBase64(value: unknown, label: string): Buffer {
  if (typeof value !== "string" || !value.trim()) fail(`${label} es obligatorio.`);
  const clean = value.includes(",") ? value.split(",")[1] || "" : value;
  try {
    return Buffer.from(clean, "base64");
  } catch {
    fail(`${label} no es base64 valido.`);
  }
}

function parseViewBox(value: string | null) {
  if (!value) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
  if (parts.length !== 4) return null;
  const width = parts[2];
  const height = parts[3];
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function inspectSvg(svgText: string, fileName: string, bytes: number) {
  const warnings: string[] = [];
  const criticalErrors: string[] = [];

  if (bytes > COUNTDOWN_FRAME_ASSET_LIMITS.svgMaxBytes) {
    criticalErrors.push("El SVG supera 500KB.");
  } else if (bytes > COUNTDOWN_FRAME_ASSET_LIMITS.svgWarningBytes) {
    warnings.push("El SVG pesa mas de 200KB.");
  }

  const { JSDOM } = require("jsdom") as typeof import("jsdom");
  let dom: import("jsdom").JSDOM;
  try {
    dom = new JSDOM(svgText, { contentType: "image/svg+xml" });
  } catch {
    throw new HttpsError("invalid-argument", "El SVG no se pudo parsear.");
  }

  const document = dom.window.document;
  const root = document.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") fail("El archivo no contiene un nodo SVG valido.");

  const viewBoxRaw = root.getAttribute("viewBox");
  const viewBox = parseViewBox(viewBoxRaw);
  if (!viewBox) criticalErrors.push("El SVG debe incluir viewBox valido.");

  const widthAttr = root.getAttribute("width");
  const heightAttr = root.getAttribute("height");
  const hasFixedDimensions = Boolean(widthAttr || heightAttr);
  if (hasFixedDimensions) warnings.push("El SVG tiene width/height fijos.");

  const isSquare = Boolean(viewBox && Math.abs(viewBox.width - viewBox.height) <= 0.01);
  if (viewBox && !isSquare) warnings.push("El viewBox no es cuadrado.");

  if (document.querySelector("script")) criticalErrors.push("El SVG contiene <script>.");
  if (document.querySelector("foreignObject")) criticalErrors.push("El SVG contiene <foreignObject>.");
  if (document.querySelector("text") || document.querySelector("tspan")) {
    criticalErrors.push("El SVG contiene texto (<text>/<tspan>). ");
  }

  let hasInlineHandlers = false;
  let hasUnsafeLink = false;
  Array.from(document.querySelectorAll("*")).forEach((el) => {
    Array.from(el.attributes || []).forEach((attr) => {
      const name = String(attr.name || "").toLowerCase();
      const val = String(attr.value || "").trim();
      if (name.startsWith("on")) hasInlineHandlers = true;
      if ((name === "href" || name === "xlink:href") && UNSAFE_HREF.test(val)) hasUnsafeLink = true;
    });
  });

  if (hasInlineHandlers) criticalErrors.push("El SVG contiene handlers inline on*.");
  if (hasUnsafeLink) criticalErrors.push("El SVG contiene links externos inseguros.");

  const serialized = root.outerHTML;
  const usesCurrentColor = /currentColor/i.test(serialized);
  if (!usesCurrentColor) warnings.push("El SVG no usa currentColor.");

  return {
    valid: criticalErrors.length === 0,
    warnings,
    criticalErrors,
    checks: {
      fileName,
      mimeType: "image/svg+xml",
      bytes,
      hasViewBox: Boolean(viewBox),
      viewBox: viewBoxRaw,
      viewBoxWidth: viewBox?.width || null,
      viewBoxHeight: viewBox?.height || null,
      isSquare,
      hasFixedDimensions,
      widthAttr,
      heightAttr,
      colorMode: (usesCurrentColor ? "currentColor" : "fixed") as ColorMode,
    },
    svgText: serialized,
  };
}

function storageUrl(path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function uploadWithToken(path: string, buffer: Buffer, contentType: string) {
  const file = bucket().file(path);
  const token = randomUUID();
  await file.save(buffer, {
    contentType,
    metadata: {
      cacheControl: "public,max-age=31536000,immutable",
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return { storagePath: path, downloadUrl: storageUrl(path, token) };
}

async function copyVersionedAsset(sourcePath: string, targetPath: string, fallbackContentType: string) {
  const source = bucket().file(sourcePath);
  const target = bucket().file(targetPath);
  const [exists] = await source.exists();
  if (!exists) throw new HttpsError("failed-precondition", `No existe asset ${sourcePath}.`);

  await source.copy(target);
  const [meta] = await source.getMetadata();
  const token = randomUUID();
  await target.setMetadata({
    contentType: meta.contentType || fallbackContentType,
    cacheControl: meta.cacheControl || "public,max-age=31536000,immutable",
    metadata: {
      ...(meta.metadata || {}),
      firebaseStorageDownloadTokens: token,
    },
  });

  return {
    storagePath: targetPath,
    downloadUrl: storageUrl(targetPath, token),
    bytes: Number(meta.size || 0),
  };
}

async function deleteStoragePrefix(prefix: string) {
  const safePrefix = text(prefix, 600);
  if (!safePrefix) return;
  try {
    await bucket().deleteFiles({ prefix: safePrefix, force: true });
  } catch (error) {
    logger.warn("No se pudieron limpiar assets de countdown preset", {
      prefix: safePrefix,
      error,
    });
  }
}

async function deleteStorageFiles(paths: Array<string | null | undefined>) {
  const uniquePaths = Array.from(
    new Set(
      paths
        .map((value) => text(value, 600))
        .filter((value) => value.startsWith("assets/countdown/"))
    )
  );
  await Promise.all(
    uniquePaths.map(async (path) => {
      try {
        await bucket().file(path).delete({ ignoreNotFound: true });
      } catch (error) {
        logger.warn("No se pudo limpiar un asset staged de countdown", {
          path,
          error,
        });
      }
    })
  );
}

function isMutableDraftAssetPath(path: string | null | undefined, presetId: string) {
  const normalized = text(path, 600);
  return (
    normalized.startsWith(`assets/countdown/staging/${presetId}/`) ||
    normalized.startsWith(`assets/countdown/frames/${presetId}/draft/`) ||
    normalized.startsWith(`assets/countdown/thumbnails/${presetId}/draft/`)
  );
}

async function deleteSubcollection(
  ref: admin.firestore.DocumentReference,
  collectionName: string
) {
  const childRefs = await ref.collection(collectionName).listDocuments();
  if (!childRefs.length) return;

  const CHUNK_SIZE = 400;
  for (let index = 0; index < childRefs.length; index += CHUNK_SIZE) {
    const chunk = childRefs.slice(index, index + CHUNK_SIZE);
    const batch = db().batch();
    chunk.forEach((childRef) => batch.delete(childRef));
    await batch.commit();
  }
}

const COUNTDOWN_REFERENCE_COLLECTIONS = [
  "borradores",
  "plantillas",
  "publicadas",
  "publicadas_historial",
] as const;

async function countCountdownPresetReferences(presetId: string): Promise<number> {
  let count = 0;
  for (const collectionName of COUNTDOWN_REFERENCE_COLLECTIONS) {
    const snapshot = await db().collection(collectionName).get();
    snapshot.docs.forEach((document) => {
      if (documentReferencesCountdownPreset(document.data(), presetId)) {
        count += 1;
      }
    });
  }
  return count;
}

function operationConflictMessage(reason: string, action: "guardar" | "publicar") {
  if (reason === "operation-type-mismatch") {
    return "operationId ya fue utilizado por otra operacion.";
  }
  if (reason === "operation-incomplete") {
    return "La operacion anterior no termino. Reintenta con el mismo operationId.";
  }
  if (reason === "draft-missing") {
    return "No hay borrador para publicar.";
  }
  return `El borrador cambio antes de ${action}. Recarga y reintenta.`;
}

type TimestampLike = { toDate: () => Date };
function isTimestampLike(value: unknown): value is TimestampLike {
  return !!value && typeof value === "object" && "toDate" in value && typeof (value as TimestampLike).toDate === "function";
}

function serialize(value: unknown): unknown {
  if (isTimestampLike(value)) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map((v) => serialize(v));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serialize(v)]);
    return Object.fromEntries(entries);
  }
  return value;
}
function estimateChipWidth(tamanoBase: number, visibleUnits: Unit[], distribution: Distribution): number {
  const base = Math.max(220, tamanoBase);
  const count = Math.max(1, visibleUnits.length);
  if (distribution === "vertical") return Math.round(base * 0.48);
  if (distribution === "grid") return Math.round(base * 0.42);
  if (distribution === "editorial") return Math.round(base * (count <= 2 ? 0.45 : 0.34));
  return Math.round(base / count) - 8;
}

function buildCanvasPatch(params: {
  presetId: string;
  activeVersion: number;
  config: Config;
  svgRef: SvgRef;
}) {
  const { presetId, activeVersion, config, svgRef } = params;
  const visibleUnits = config.layout.visibleUnits.length ? config.layout.visibleUnits : [...UNITS];
  const chipWidth = Number.isFinite(config.layout.chipWidth)
    ? Math.max(RANGES.chipWidth.min, Math.min(RANGES.chipWidth.max, Number(config.layout.chipWidth)))
    : Math.max(34, estimateChipWidth(config.tamanoBase, visibleUnits, config.layout.distribution));
  const unitStyle = config.unidad || {
    showLabels: true,
    separator: "",
    boxBg: "transparent",
    boxBorder: "transparent",
    boxRadius: 10,
    boxShadow: false,
  };

  return {
    countdownSchemaVersion: 2,
    presetId,
    presetVersion: activeVersion,
    tamanoBase: config.tamanoBase,
    layoutType: config.layout.type,
    distribution: config.layout.distribution,
    visibleUnits,
    gap: config.layout.gap,
    framePadding: config.layout.framePadding,
    frameScale: config.layout.frameScale,
    frameSvgUrl: svgRef.downloadUrl,
    frameAssetType: svgRef.downloadUrl ? svgRef.type || "svg" : null,
    frameMimeType: svgRef.downloadUrl
      ? svgRef.mimeType || COUNTDOWN_FRAME_MIME_TYPES.svg
      : null,
    frameIntrinsicWidth: svgRef.width,
    frameIntrinsicHeight: svgRef.height,
    frameColorMode: normalizeCountdownFrameColorMode(
      svgRef.downloadUrl ? svgRef.type || "svg" : null,
      svgRef.colorMode
    ),
    frameColor: config.colores.frameColor,
    fontFamily: config.tipografia.fontFamily,
    fontSize: config.tipografia.numberSize,
    labelSize: config.tipografia.labelSize,
    letterSpacing: config.tipografia.letterSpacing,
    lineHeight: config.tipografia.lineHeight,
    labelTransform: config.tipografia.labelTransform,
    color: config.colores.numberColor,
    labelColor: config.colores.labelColor,
    entryAnimation: config.animaciones.entry,
    tickAnimation: config.animaciones.tick,
    frameAnimation: config.animaciones.frame,
    showLabels: unitStyle.showLabels !== false,
    padZero: true,
    separator: unitStyle.separator || "",
    paddingX: Math.max(4, Math.round(config.layout.framePadding * 0.52)),
    paddingY: Math.max(4, Math.round(config.layout.framePadding * 0.4)),
    chipWidth,
    layout: "pills",
    background: "transparent",
    boxBg: unitStyle.boxBg || "transparent",
    boxBorder: unitStyle.boxBorder || "transparent",
    boxRadius: Number.isFinite(unitStyle.boxRadius) ? unitStyle.boxRadius : 10,
    boxShadow: unitStyle.boxShadow === true,
    presetPropsVersion: SCHEMA_VERSION,
  };
}

function buildLegacyCanvasPatch(params: {
  presetId: string;
  activeVersion: number;
  legacyProps: LegacyCanvasProps;
}) {
  const { presetId, activeVersion, legacyProps } = params;
  return {
    countdownSchemaVersion: 1,
    presetId,
    presetVersion: activeVersion,
    tamanoBase: 320,
    layoutType: "singleFrame",
    distribution: "centered",
    visibleUnits: [...UNITS],
    gap: legacyProps.gap,
    framePadding: 10,
    frameSvgUrl: null,
    frameAssetType: null,
    frameMimeType: null,
    frameIntrinsicWidth: null,
    frameIntrinsicHeight: null,
    frameColorMode: "fixed",
    frameColor: normalizeColorOrFallback(legacyProps.boxBorder, "#773dbe"),
    fontFamily: legacyProps.fontFamily,
    fontSize: legacyProps.fontSize,
    labelSize: legacyProps.labelSize,
    letterSpacing: legacyProps.letterSpacing,
    lineHeight: legacyProps.lineHeight,
    labelTransform: "uppercase",
    color: legacyProps.color,
    labelColor: legacyProps.labelColor,
    entryAnimation: "none",
    tickAnimation: "none",
    frameAnimation: "none",
    showLabels: legacyProps.showLabels,
    padZero: true,
    separator: legacyProps.separator || "",
    paddingX: 8,
    paddingY: 6,
    chipWidth: 46,
    layout: "pills",
    background: "transparent",
    boxBg: legacyProps.boxBg,
    boxBorder: legacyProps.boxBorder,
    boxRadius: legacyProps.boxRadius,
    boxShadow: legacyProps.boxShadow,
    presetPropsVersion: 1,
  };
}

export const saveCountdownPresetDraft = onCall(
  OPTIONS,
  async (request: CallableRequest<SaveInput>) => {
    const uid = requireAdmin(request);

    const nombre = text(request.data?.nombre, 120);
    if (!nombre) fail("nombre es obligatorio.");

    const categoria = normalizeCategory(request.data?.categoria);
    const config = normalizeConfig(request.data?.config);
    const expectedDraftVersion = parseExpectedDraftVersion(request.data?.expectedDraftVersion);
    const requestedId = parseId(request.data?.presetId);
    const editorSessionId = text(request.data?.editorSessionId, 120);
    const operationId = parseOperationId(request.data?.operationId);

    const { presetId, ref } = await resolveDocRef(requestedId, nombre, operationId);
    const operationRef = ref.collection("operations").doc(operationId);
    const existingOperationSnap = await operationRef.get();
    if (existingOperationSnap.exists) {
      const replay = planSaveDraftTransition({
        currentDraftVersion: null,
        expectedDraftVersion,
        operationData: existingOperationSnap.data(),
      });
      if (replay.kind === "replay") return replay.result;
      const replayReason =
        replay.kind === "conflict"
          ? replay.reason
          : "operation-incomplete";
      throw new HttpsError(
        "failed-precondition",
        operationConflictMessage(replayReason, "guardar")
      );
    }

    const snap = await ref.get();
    const existing = (snap.exists ? (snap.data() as PresetDoc) : null) || null;
    const existingDraft = existing?.draft || null;
    const existingSvgRef = normalizeSvgRef(existingDraft?.svgRef) || normalizeSvgRef(existing?.svgRef);

    const assets = request.data?.assets || {};
    const removeFrame =
      assets.removeFrame === true || assets.removeSvg === true;
    const canonicalFrameBase64 =
      typeof assets.frameBase64 === "string"
        ? assets.frameBase64.trim()
        : "";
    const legacySvgBase64 =
      typeof assets.svgBase64 === "string" ? assets.svgBase64.trim() : "";
    const incomingFrameBase64 =
      canonicalFrameBase64 || legacySvgBase64;
    const hasIncomingFrame = incomingFrameBase64.length > 0;
    const hasIncomingThumb = typeof assets.thumbnailPngBase64 === "string" && assets.thumbnailPngBase64.trim().length > 0;
    if (removeFrame && hasIncomingFrame) {
      fail("No se puede quitar y reemplazar el frame en la misma solicitud.");
    }

    let inspection: {
      valid: boolean;
      warnings: string[];
      criticalErrors: string[];
      checks: Record<string, unknown> & {
        bytes: number;
        viewBox?: string | null;
        viewBoxWidth?: number | null;
        viewBoxHeight?: number | null;
        hasFixedDimensions?: boolean;
        width?: number | null;
        height?: number | null;
        hasAlpha?: boolean;
        hasTransparency?: boolean;
        colorMode?: ColorMode;
      };
      svgText?: string;
    } | null = null;
    let nextSvgRef: SvgRef | null = existingSvgRef;
    const attemptId = randomUUID().replace(/-/g, "");
    const stagingPrefix = `assets/countdown/staging/${presetId}/${operationId}/${attemptId}/`;
    const uploadedPaths: string[] = [];

    if (removeFrame) {
      nextSvgRef = createEmptySvgRef({
        thumbnailPath: existingSvgRef?.thumbnailPath || null,
        thumbnailUrl: existingSvgRef?.thumbnailUrl || null,
      });
    }

    if (hasIncomingFrame) {
      const frameFileName =
        text(assets.frameFileName, 180) ||
        text(assets.svgFileName, 180);
      const lowerFileName = frameFileName.toLowerCase();
      const frameType: FrameAssetType = lowerFileName.endsWith(".png")
        ? "png"
        : lowerFileName.endsWith(".svg")
          ? "svg"
          : fail("El archivo no es un SVG o PNG válido.");
      const expectedMimeType =
        frameType === "png"
          ? COUNTDOWN_FRAME_MIME_TYPES.png
          : COUNTDOWN_FRAME_MIME_TYPES.svg;
      const declaredMimeType = text(assets.frameMimeType, 80).toLowerCase();
      if (
        canonicalFrameBase64 &&
        declaredMimeType !== expectedMimeType
      ) {
        fail("El archivo no es un SVG o PNG válido.");
      }
      if (declaredMimeType && declaredMimeType !== expectedMimeType) {
        fail("El archivo no es un SVG o PNG válido.");
      }

      const frameBuffer = parseBase64(
        incomingFrameBase64,
        canonicalFrameBase64 ? "assets.frameBase64" : "assets.svgBase64"
      );
      let uploadBuffer = frameBuffer;
      if (frameType === "png") {
        try {
          inspection = await inspectCountdownPngBuffer(
            frameBuffer,
            frameFileName,
            declaredMimeType
          );
        } catch (error) {
          fail(
            error instanceof Error
              ? error.message
              : "No pudimos leer el archivo. Probá exportándolo nuevamente."
          );
        }
      } else {
        const svgText = frameBuffer.toString("utf8");
        inspection = inspectSvg(
          svgText,
          frameFileName,
          frameBuffer.byteLength
        );
        if (!inspection.valid) fail(inspection.criticalErrors.join(" "));
        uploadBuffer = Buffer.from(inspection.svgText || "", "utf8");
      }

      const draftSvgPath = `${stagingPrefix}frame.${frameType}`;
      const uploaded = await uploadWithToken(
        draftSvgPath,
        uploadBuffer,
        expectedMimeType
      );
      uploadedPaths.push(uploaded.storagePath);

      nextSvgRef = {
        type: frameType,
        mimeType: expectedMimeType,
        storagePath: uploaded.storagePath,
        downloadUrl: uploaded.downloadUrl,
        thumbnailPath: existingSvgRef?.thumbnailPath || null,
        thumbnailUrl: existingSvgRef?.thumbnailUrl || null,
        viewBox:
          frameType === "svg" ? inspection.checks.viewBox || null : null,
        hasFixedDimensions:
          frameType === "svg" &&
          inspection.checks.hasFixedDimensions === true,
        bytes: inspection.checks.bytes,
        width: Number(
          frameType === "png"
            ? inspection.checks.width
            : inspection.checks.viewBoxWidth
        ) || null,
        height: Number(
          frameType === "png"
            ? inspection.checks.height
            : inspection.checks.viewBoxHeight
        ) || null,
        hasAlpha:
          frameType === "png"
            ? inspection.checks.hasAlpha === true
            : null,
        hasTransparency:
          frameType === "png"
            ? inspection.checks.hasTransparency === true
            : null,
        colorMode: normalizeCountdownFrameColorMode(
          frameType,
          inspection.checks.colorMode
        ),
      };
    }

    if (hasIncomingThumb) {
      const draftThumbPath = `${stagingPrefix}thumbnail.png`;
      let uploadedThumb;
      try {
        const png = parseBase64(
          assets.thumbnailPngBase64,
          "assets.thumbnailPngBase64"
        );
        uploadedThumb = await uploadWithToken(draftThumbPath, png, "image/png");
      } catch (error) {
        await deleteStorageFiles(uploadedPaths);
        throw error;
      }
      uploadedPaths.push(uploadedThumb.storagePath);

      nextSvgRef = {
        ...(nextSvgRef || createEmptySvgRef()),
        thumbnailPath: uploadedThumb.storagePath,
        thumbnailUrl: uploadedThumb.downloadUrl,
      };
    }

    if (!nextSvgRef) {
      nextSvgRef = createEmptySvgRef();
    }

    const warnings = removeFrame
      ? []
      : inspection?.warnings || existingDraft?.validationReport?.warnings || [];
    const checks = removeFrame
      ? {}
      : inspection?.checks || existingDraft?.validationReport?.checks || {};

    const draft: Draft = {
      id: presetId,
      nombre,
      categoria,
      svgRef: nextSvgRef,
      layout: config.layout,
      tipografia: config.tipografia,
      colores: config.colores,
      animaciones: config.animaciones,
      unidad: config.unidad,
      tamanoBase: config.tamanoBase,
      validationReport: { warnings, checks },
    };

    let previousDraftAssetPaths: Array<string | null> = [];
    const committedSvgRef: SvgRef = nextSvgRef;
    let transactionOutcome: {
      result: Record<string, unknown>;
      didCommit: boolean;
    } | null = null;

    try {
      transactionOutcome = await db().runTransaction(async (transaction) => {
        const [operationSnap, currentSnap] = await Promise.all([
          transaction.get(operationRef),
          transaction.get(ref),
        ]);
        const current = (currentSnap.exists
          ? (currentSnap.data() as PresetDoc)
          : null) || null;
        const transition = planSaveDraftTransition({
          currentDraftVersion: current?.draftVersion,
          expectedDraftVersion,
          operationData: operationSnap.exists ? operationSnap.data() : null,
        });

        if (transition.kind === "replay") {
          return { result: transition.result, didCommit: false };
        }
        if (transition.kind === "conflict") {
          throw new HttpsError(
            "failed-precondition",
            operationConflictMessage(transition.reason, "guardar")
          );
        }

        const nextDraftVersion = Number(transition.nextDraftVersion);
        const currentMetadata =
          current?.metadata && typeof current.metadata === "object"
            ? current.metadata
            : {};
        const currentDraftEditorSessionId = text(
          (currentMetadata as Record<string, unknown>)?.draftEditorSessionId,
          120
        );
        const currentDraft = current?.draft || null;
        const previousDraftSvgRef =
          normalizeSvgRef(currentDraft?.svgRef) || normalizeSvgRef(current?.svgRef);
        previousDraftAssetPaths = [
          previousDraftSvgRef?.storagePath || null,
          previousDraftSvgRef?.thumbnailPath || null,
        ];
        const hasActiveVersion = Number(current?.activeVersion || 0) > 0;
        const now = FieldValue.serverTimestamp();
        const result = {
          presetId,
          draftVersion: nextDraftVersion,
          estado: (current?.estado as Estado) || "draft",
          warnings,
          operationId,
          updatedAt: new Date().toISOString(),
        };

        transaction.set(
          ref,
          {
            id: presetId,
            nombre: hasActiveVersion ? current?.nombre || nombre : nombre,
            categoria: hasActiveVersion ? current?.categoria || categoria : categoria,
            estado: (current?.estado as Estado) || "draft",
            activeVersion: hasActiveVersion
              ? Number(current?.activeVersion || 0)
              : null,
            draftVersion: nextDraftVersion,
            svgRef: hasActiveVersion
              ? normalizeSvgRef(current?.svgRef) || nextSvgRef
              : nextSvgRef,
            layout: hasActiveVersion ? current?.layout || config.layout : config.layout,
            tipografia: hasActiveVersion
              ? current?.tipografia || config.tipografia
              : config.tipografia,
            colores: hasActiveVersion
              ? current?.colores || config.colores
              : config.colores,
            animaciones: hasActiveVersion
              ? current?.animaciones || config.animaciones
              : config.animaciones,
            unidad: hasActiveVersion ? current?.unidad || config.unidad : config.unidad,
            tamanoBase: hasActiveVersion
              ? Number(current?.tamanoBase || config.tamanoBase)
              : config.tamanoBase,
            draft,
            metadata: {
              ...currentMetadata,
              schemaVersion: SCHEMA_VERSION,
              renderContractVersion: RENDER_CONTRACT_VERSION,
              draftEditorSessionId:
                editorSessionId || currentDraftEditorSessionId || null,
              updatedAt: now,
              updatedByUid: uid,
              ...(currentSnap.exists
                ? {}
                : { createdAt: now, createdByUid: uid }),
            },
          },
          { merge: true }
        );
        transaction.create(operationRef, {
          type: "save",
          status: "completed",
          expectedDraftVersion,
          result,
          createdAt: now,
          completedAt: now,
          uid,
        });
        return { result, didCommit: true };
      });
    } catch (error) {
      await deleteStorageFiles(uploadedPaths);
      throw error;
    }

    if (!transactionOutcome.didCommit) {
      await deleteStorageFiles(uploadedPaths);
      return transactionOutcome.result;
    }

    const retainedPaths = new Set(
      [committedSvgRef.storagePath, committedSvgRef.thumbnailPath].filter(Boolean)
    );
    await deleteStorageFiles(
      previousDraftAssetPaths.filter(
        (path) =>
          path &&
          isMutableDraftAssetPath(path, presetId) &&
          !retainedPaths.has(path)
      )
    );

    return transactionOutcome.result;
  }
);

export const publishCountdownPresetDraft = onCall(
  OPTIONS,
  async (request: CallableRequest<PublishInput>) => {
    const uid = requireAdmin(request);

    const presetId = parseId(request.data?.presetId);
    if (!presetId) fail("presetId es obligatorio.");

    const expectedDraftVersion = parseExpectedDraftVersion(request.data?.expectedDraftVersion);
    if (!expectedDraftVersion) fail("expectedDraftVersion es obligatorio.");
    const operationId = parseOperationId(request.data?.operationId);

    const ref = db().collection(COLLECTION).doc(presetId);
    const operationRef = ref.collection("operations").doc(operationId);
    const existingOperationSnap = await operationRef.get();
    if (existingOperationSnap.exists) {
      const replay = planPublishDraftTransition({
        currentDraftVersion: null,
        expectedDraftVersion,
        activeVersion: null,
        hasDraft: false,
        operationData: existingOperationSnap.data(),
      });
      if (replay.kind === "replay") return replay.result;
      const replayReason =
        replay.kind === "conflict"
          ? replay.reason
          : "operation-incomplete";
      throw new HttpsError(
        "failed-precondition",
        operationConflictMessage(replayReason, "publicar")
      );
    }

    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "No existe el preset solicitado.");

    const data = (snap.data() || {}) as PresetDoc;
    const draftSnapshot = data.draft as Draft | null;
    if (!draftSnapshot) {
      throw new HttpsError("failed-precondition", "No hay borrador para publicar.");
    }
    const draftSvgRef = normalizeSvgRef(draftSnapshot.svgRef) || createEmptySvgRef();
    if (!draftSvgRef.thumbnailPath) throw new HttpsError("failed-precondition", "El borrador no tiene miniatura PNG.");

    const attemptId = randomUUID().replace(/-/g, "");
    const frameAssetType = draftSvgRef.storagePath
      ? draftSvgRef.type || "svg"
      : null;
    const frameMimeType = frameAssetType
      ? resolveCountdownFrameMimeType(draftSvgRef, frameAssetType) ||
        COUNTDOWN_FRAME_MIME_TYPES.svg
      : null;
    const frameTarget = frameAssetType
      ? `assets/countdown/frames/${presetId}/operations/${operationId}/${attemptId}/frame.${frameAssetType}`
      : null;
    const thumbTarget = `assets/countdown/thumbnails/${presetId}/operations/${operationId}/${attemptId}/thumbnail.png`;
    const stagedPaths: string[] = [];
    let framePublished: Awaited<ReturnType<typeof copyVersionedAsset>> | null = null;
    let thumbPublished: Awaited<ReturnType<typeof copyVersionedAsset>>;

    try {
      [framePublished, thumbPublished] = await Promise.all([
        draftSvgRef.storagePath
          ? copyVersionedAsset(
              draftSvgRef.storagePath,
              frameTarget as string,
              frameMimeType as string
            )
          : Promise.resolve(null),
        copyVersionedAsset(draftSvgRef.thumbnailPath, thumbTarget, "image/png"),
      ]);
      if (framePublished?.storagePath) stagedPaths.push(framePublished.storagePath);
      stagedPaths.push(thumbPublished.storagePath);
    } catch (error) {
      await Promise.all([
        deleteStoragePrefix(
          `assets/countdown/frames/${presetId}/operations/${operationId}/${attemptId}/`
        ),
        deleteStoragePrefix(
          `assets/countdown/thumbnails/${presetId}/operations/${operationId}/${attemptId}/`
        ),
      ]);
      throw error;
    }

    const publishedSvgRef: SvgRef = {
      type: framePublished ? frameAssetType : null,
      mimeType: framePublished ? frameMimeType : null,
      storagePath: framePublished?.storagePath || null,
      downloadUrl: framePublished?.downloadUrl || null,
      thumbnailPath: thumbPublished.storagePath,
      thumbnailUrl: thumbPublished.downloadUrl,
      viewBox: draftSvgRef.viewBox,
      hasFixedDimensions: draftSvgRef.hasFixedDimensions,
      bytes: framePublished?.bytes || draftSvgRef.bytes,
      width: draftSvgRef.width,
      height: draftSvgRef.height,
      hasAlpha: draftSvgRef.hasAlpha,
      hasTransparency: draftSvgRef.hasTransparency,
      colorMode: normalizeCountdownFrameColorMode(
        framePublished ? frameAssetType : null,
        draftSvgRef.colorMode
      ),
    };

    let transactionOutcome: {
      result: Record<string, unknown>;
      didCommit: boolean;
      draftAssets: SvgRef | null;
    } | null = null;

    try {
      transactionOutcome = await db().runTransaction(async (transaction) => {
        const [operationSnap, currentSnap] = await Promise.all([
          transaction.get(operationRef),
          transaction.get(ref),
        ]);
        if (!currentSnap.exists) {
          throw new HttpsError("not-found", "No existe el preset solicitado.");
        }

        const current = (currentSnap.data() || {}) as PresetDoc;
        const currentDraft = current.draft as Draft | null;
        const transition = planPublishDraftTransition({
          currentDraftVersion: current.draftVersion,
          expectedDraftVersion,
          activeVersion: current.activeVersion,
          hasDraft: Boolean(currentDraft),
          operationData: operationSnap.exists ? operationSnap.data() : null,
        });

        if (transition.kind === "replay") {
          return {
            result: transition.result,
            didCommit: false,
            draftAssets: null,
          };
        }
        if (transition.kind === "conflict") {
          throw new HttpsError(
            "failed-precondition",
            operationConflictMessage(transition.reason, "publicar")
          );
        }
        if (!currentDraft) {
          throw new HttpsError("failed-precondition", "No hay borrador para publicar.");
        }

        const currentDraftSvgRef =
          normalizeSvgRef(currentDraft.svgRef) || createEmptySvgRef();
        if (
          currentDraftSvgRef.storagePath !== draftSvgRef.storagePath ||
          currentDraftSvgRef.thumbnailPath !== draftSvgRef.thumbnailPath
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Los assets del borrador cambiaron antes de publicar."
          );
        }

        const config = normalizeConfig({
          layout: currentDraft.layout,
          tipografia: currentDraft.tipografia,
          colores: currentDraft.colores,
          animaciones: currentDraft.animaciones,
          unidad: currentDraft.unidad,
          tamanoBase: currentDraft.tamanoBase,
        });
        const category = normalizeCategory(currentDraft.categoria);
        const nextVersion = Number(transition.nextActiveVersion);
        const versionRef = ref.collection("versions").doc(String(nextVersion));
        const metadata =
          current.metadata && typeof current.metadata === "object"
            ? current.metadata
            : {};
        const now = FieldValue.serverTimestamp();
        const result = {
          presetId,
          activeVersion: nextVersion,
          operationId,
          publishedAt: new Date().toISOString(),
        };

        transaction.create(versionRef, {
          id: presetId,
          version: nextVersion,
          nombre: currentDraft.nombre,
          categoria: category,
          svgRef: publishedSvgRef,
          layout: config.layout,
          tipografia: config.tipografia,
          colores: config.colores,
          animaciones: config.animaciones,
          unidad: config.unidad,
          tamanoBase: config.tamanoBase,
          metadata: {
            schemaVersion: SCHEMA_VERSION,
            renderContractVersion: RENDER_CONTRACT_VERSION,
            publishedAt: now,
            publishedByUid: uid,
            sourceDraftVersion: expectedDraftVersion,
            assetOperationId: operationId,
          },
        });

        transaction.set(
          ref,
          {
            id: presetId,
            nombre: currentDraft.nombre,
            categoria: category,
            estado: "published",
            activeVersion: nextVersion,
            draftVersion: null,
            svgRef: publishedSvgRef,
            layout: config.layout,
            tipografia: config.tipografia,
            colores: config.colores,
            animaciones: config.animaciones,
            unidad: config.unidad,
            tamanoBase: config.tamanoBase,
            draft: null,
            legacyPresetProps: FieldValue.delete(),
            metadata: {
              ...metadata,
              schemaVersion: SCHEMA_VERSION,
              renderContractVersion: RENDER_CONTRACT_VERSION,
              updatedAt: now,
              updatedByUid: uid,
              publishedAt: now,
              publishedByUid: uid,
              archivedAt: null,
              archivedByUid: null,
            },
          },
          { merge: true }
        );
        transaction.create(operationRef, {
          type: "publish",
          status: "completed",
          expectedDraftVersion,
          result,
          createdAt: now,
          completedAt: now,
          uid,
        });

        return {
          result,
          didCommit: true,
          draftAssets: currentDraftSvgRef,
        };
      });
    } catch (error) {
      await deleteStorageFiles(stagedPaths);
      throw error;
    }

    if (!transactionOutcome.didCommit) {
      await deleteStorageFiles(stagedPaths);
      return transactionOutcome.result;
    }

    await deleteStorageFiles([
      isMutableDraftAssetPath(
        transactionOutcome.draftAssets?.storagePath,
        presetId
      )
        ? transactionOutcome.draftAssets?.storagePath
        : null,
      isMutableDraftAssetPath(
        transactionOutcome.draftAssets?.thumbnailPath,
        presetId
      )
        ? transactionOutcome.draftAssets?.thumbnailPath
        : null,
    ]);
    return transactionOutcome.result;
  }
);

export const duplicateCountdownPreset = onCall(
  OPTIONS,
  async (request: CallableRequest<DuplicateInput>) => {
    const uid = requireAdmin(request);
    const sourcePresetId = parseId(request.data?.presetId);
    if (!sourcePresetId) fail("presetId es obligatorio.");
    const operationId = parseOperationId(request.data?.operationId);

    const sourceRef = db().collection(COLLECTION).doc(sourcePresetId);
    const operationRef = sourceRef.collection("operations").doc(operationId);
    const existingOperation = await operationRef.get();
    if (existingOperation.exists) {
      const operationData = existingOperation.data() || {};
      if (
        operationData.type === "duplicate" &&
        operationData.status === "completed" &&
        operationData.result &&
        typeof operationData.result === "object"
      ) {
        return operationData.result as Record<string, unknown>;
      }
      throw new HttpsError(
        "failed-precondition",
        "El operationId ya fue utilizado por otra operación."
      );
    }

    const sourceSnap = await sourceRef.get();
    if (!sourceSnap.exists) {
      throw new HttpsError("not-found", "No existe el preset solicitado.");
    }
    const sourceRoot = (sourceSnap.data() || {}) as PresetDoc;
    const sourceDraftVersion = intOrNull(sourceRoot.draftVersion);
    const activeVersion = intOrNull(sourceRoot.activeVersion);
    let activeVersionData: Record<string, unknown> | null = null;
    if (!sourceRoot.draft) {
      if (!activeVersion || activeVersion < 1) {
        throw new HttpsError(
          "failed-precondition",
          "El preset no tiene un borrador ni una versión publicada para duplicar."
        );
      }
      const versionSnap = await sourceRef
        .collection("versions")
        .doc(String(activeVersion))
        .get();
      if (!versionSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "La versión activa del preset no está disponible."
        );
      }
      activeVersionData = (versionSnap.data() || {}) as Record<string, unknown>;
    }
    const sourcePlan = resolveCountdownDuplicateSource({
      rootData: sourceRoot as Record<string, unknown>,
      activeVersionData,
    });
    if (!sourcePlan.ok) {
      throw new HttpsError(
        "failed-precondition",
        "El preset no tiene una fuente compatible para duplicar."
      );
    }
    const { sourcePayload, sourceKind, sourceVersion } = sourcePlan;

    const sourceName =
      text(sourcePayload.nombre, 108) || text(sourceRoot.nombre, 108) || sourcePresetId;
    const duplicateName = text(`${sourceName} — copia`, 120);
    const category = normalizeCategory(
      sourcePayload.categoria || sourceRoot.categoria
    );
    const config = normalizeConfig({
      layout: sourcePayload.layout,
      tipografia: sourcePayload.tipografia,
      colores: sourcePayload.colores,
      animaciones: sourcePayload.animaciones,
      unidad: sourcePayload.unidad,
      tamanoBase: sourcePayload.tamanoBase,
    });
    const sourceSvgRef =
      normalizeSvgRef(sourcePayload.svgRef) ||
      normalizeSvgRef(sourceRoot.svgRef) ||
      createEmptySvgRef();
    const { presetId, ref: targetRef } = await resolveDocRef(
      null,
      duplicateName,
      operationId
    );
    const attemptId = randomUUID().replace(/-/g, "");
    const stagingPrefix = `assets/countdown/staging/${presetId}/${operationId}/${attemptId}/`;
    const uploadedPaths: string[] = [];

    let copiedFrame: Awaited<ReturnType<typeof copyVersionedAsset>> | null = null;
    let copiedThumbnail: Awaited<ReturnType<typeof copyVersionedAsset>> | null =
      null;
    try {
      if (sourceSvgRef.storagePath) {
        const sourceFrameType = sourceSvgRef.type || "svg";
        const sourceFrameMimeType =
          resolveCountdownFrameMimeType(sourceSvgRef, sourceFrameType) ||
          COUNTDOWN_FRAME_MIME_TYPES.svg;
        copiedFrame = await copyVersionedAsset(
          sourceSvgRef.storagePath,
          `${stagingPrefix}frame.${sourceFrameType}`,
          sourceFrameMimeType
        );
        uploadedPaths.push(copiedFrame.storagePath);
      }
      if (sourceSvgRef.thumbnailPath) {
        copiedThumbnail = await copyVersionedAsset(
          sourceSvgRef.thumbnailPath,
          `${stagingPrefix}thumbnail.png`,
          "image/png"
        );
        uploadedPaths.push(copiedThumbnail.storagePath);
      }
    } catch (error) {
      await deleteStorageFiles(uploadedPaths);
      throw error;
    }

    const copiedSvgRef: SvgRef = {
      type: copiedFrame ? sourceSvgRef.type || "svg" : null,
      mimeType: copiedFrame
        ? resolveCountdownFrameMimeType(
            sourceSvgRef,
            sourceSvgRef.type || "svg"
          ) || COUNTDOWN_FRAME_MIME_TYPES.svg
        : null,
      storagePath: copiedFrame?.storagePath || null,
      downloadUrl: copiedFrame?.downloadUrl || null,
      thumbnailPath: copiedThumbnail?.storagePath || null,
      thumbnailUrl: copiedThumbnail?.downloadUrl || null,
      viewBox: sourceSvgRef.viewBox,
      hasFixedDimensions: sourceSvgRef.hasFixedDimensions,
      bytes: copiedFrame?.bytes || sourceSvgRef.bytes,
      width: sourceSvgRef.width,
      height: sourceSvgRef.height,
      hasAlpha: sourceSvgRef.hasAlpha,
      hasTransparency: sourceSvgRef.hasTransparency,
      colorMode: normalizeCountdownFrameColorMode(
        copiedFrame ? sourceSvgRef.type || "svg" : null,
        sourceSvgRef.colorMode
      ),
    };
    const sourceValidation =
      sourcePayload.validationReport &&
      typeof sourcePayload.validationReport === "object"
        ? (sourcePayload.validationReport as {
            warnings?: unknown;
            checks?: unknown;
          })
        : null;
    const warnings = Array.isArray(sourceValidation?.warnings)
      ? sourceValidation.warnings.filter((entry): entry is string => typeof entry === "string")
      : [];
    const checks =
      sourceValidation?.checks &&
      typeof sourceValidation.checks === "object" &&
      !Array.isArray(sourceValidation.checks)
        ? (sourceValidation.checks as Record<string, unknown>)
        : {};
    let didCommit = false;
    try {
      const transactionResult = await db().runTransaction(
        async (transaction) => {
          const [currentOperation, currentSource, currentTarget] =
            await Promise.all([
              transaction.get(operationRef),
              transaction.get(sourceRef),
              transaction.get(targetRef),
            ]);

          if (currentOperation.exists) {
            const operationData = currentOperation.data() || {};
            if (
              operationData.type === "duplicate" &&
              operationData.status === "completed" &&
              operationData.result &&
              typeof operationData.result === "object"
            ) {
              return {
                result: operationData.result as Record<string, unknown>,
                didCommit: false,
              };
            }
            throw new HttpsError(
              "failed-precondition",
              "El operationId ya fue utilizado por otra operación."
            );
          }
          if (!currentSource.exists) {
            throw new HttpsError("not-found", "No existe el preset solicitado.");
          }
          if (
            sourceKind === "draft" &&
            intOrNull((currentSource.data() as PresetDoc)?.draftVersion) !==
              sourceDraftVersion
          ) {
            throw new HttpsError(
              "failed-precondition",
              "El borrador original cambió durante la duplicación."
            );
          }
          if (currentTarget.exists) {
            throw new HttpsError(
              "already-exists",
              "Ya existe el destino de esta duplicación."
            );
          }

          const now = FieldValue.serverTimestamp();
          const result = {
            presetId,
            draftVersion: 1,
            operationId,
            sourcePresetId,
            duplicatedAt: new Date().toISOString(),
          };
          transaction.create(
            targetRef,
            buildCountdownDuplicateDraftRoot({
              presetId,
              duplicateName,
              category,
              config,
              svgRef: copiedSvgRef,
              validationReport: { warnings, checks },
              uid,
              sourcePresetId,
              sourceKind,
              sourceVersion,
              schemaVersion: SCHEMA_VERSION,
              renderContractVersion: RENDER_CONTRACT_VERSION,
              now,
            })
          );
          transaction.create(operationRef, {
            type: "duplicate",
            status: "completed",
            result,
            createdAt: now,
            completedAt: now,
            uid,
          });
          return { result, didCommit: true };
        }
      );
      didCommit = transactionResult.didCommit;
      if (!didCommit) {
        await deleteStorageFiles(uploadedPaths);
      }
      return transactionResult.result;
    } catch (error) {
      if (!didCommit) await deleteStorageFiles(uploadedPaths);
      throw error;
    }
  }
);

export const listCountdownPresetVersionsAdmin = onCall(
  OPTIONS,
  async (request: CallableRequest<ListVersionsInput>) => {
    requireAdmin(request);
    const presetId = parseId(request.data?.presetId);
    if (!presetId) fail("presetId es obligatorio.");

    const ref = db().collection(COLLECTION).doc(presetId);
    const [rootSnap, versionsSnap] = await Promise.all([
      ref.get(),
      ref.collection("versions").get(),
    ]);
    if (!rootSnap.exists) {
      throw new HttpsError("not-found", "No existe el preset solicitado.");
    }

    const rootData = (rootSnap.data() || {}) as PresetDoc;
    const items = versionsSnap.docs
      .map((versionDoc): Record<string, unknown> & { id: string } => ({
        id: versionDoc.id,
        ...(versionDoc.data() as Record<string, unknown>),
      }))
      .sort(
        (left, right) =>
          Number(right.version || right.id || 0) -
          Number(left.version || left.id || 0)
      )
      .map((item) => serialize(item));

    return {
      presetId,
      activeVersion: intOrNull(rootData.activeVersion) || 0,
      items,
    };
  }
);

export const syncLegacyCountdownPresets = onCall(
  OPTIONS,
  async (request: CallableRequest<SyncLegacyInput>) => {
    const uid = requireAdmin(request);
    const legacyPresets = normalizeSyncLegacyPayload(request.data?.presets);
    const database = db();
    const now = FieldValue.serverTimestamp();

    let created = 0;
    let skipped = 0;
    const createdIds: string[] = [];
    const skippedIds: string[] = [];

    let batch = database.batch();
    let writeOps = 0;
    const commitBatch = async () => {
      if (writeOps === 0) return;
      await batch.commit();
      batch = database.batch();
      writeOps = 0;
    };

    for (const legacyPreset of legacyPresets) {
      const ref = database.collection(COLLECTION).doc(legacyPreset.id);
      const snap = await ref.get();
      if (snap.exists) {
        skipped += 1;
        skippedIds.push(legacyPreset.id);
        continue;
      }

      const legacyConfig = buildConfigFromLegacyProps(legacyPreset.legacyProps);
      const svgRef = createEmptySvgRef();
      const category = { ...DEFAULT_CATEGORY };

      batch.create(
        ref,
        {
          id: legacyPreset.id,
          nombre: legacyPreset.nombre,
          categoria: category,
          estado: "published",
          activeVersion: 1,
          draftVersion: null,
          svgRef,
          layout: legacyConfig.layout,
          tipografia: legacyConfig.tipografia,
          colores: legacyConfig.colores,
          animaciones: legacyConfig.animaciones,
          unidad: legacyConfig.unidad,
          tamanoBase: legacyConfig.tamanoBase,
          draft: null,
          legacyPresetProps: legacyPreset.legacyProps,
          metadata: {
            schemaVersion: SCHEMA_VERSION,
            renderContractVersion: RENDER_CONTRACT_VERSION,
            createdAt: now,
            createdByUid: uid,
            updatedAt: now,
            updatedByUid: uid,
            publishedAt: now,
            publishedByUid: uid,
            archivedAt: null,
            archivedByUid: null,
            migrationSource: LEGACY_SYNC_SOURCE,
          },
        }
      );
      writeOps += 1;

      batch.create(
        ref.collection("versions").doc("1"),
        {
          id: legacyPreset.id,
          version: 1,
          nombre: legacyPreset.nombre,
          categoria: category,
          svgRef,
          layout: legacyConfig.layout,
          tipografia: legacyConfig.tipografia,
          colores: legacyConfig.colores,
          animaciones: legacyConfig.animaciones,
          unidad: legacyConfig.unidad,
          tamanoBase: legacyConfig.tamanoBase,
          legacyPresetProps: legacyPreset.legacyProps,
          metadata: {
            schemaVersion: SCHEMA_VERSION,
            renderContractVersion: RENDER_CONTRACT_VERSION,
            publishedAt: now,
            publishedByUid: uid,
            migrationSource: LEGACY_SYNC_SOURCE,
          },
        }
      );
      writeOps += 1;

      created += 1;
      createdIds.push(legacyPreset.id);

      if (writeOps >= 400) {
        await commitBatch();
      }
    }

    await commitBatch();

    return {
      created,
      skipped,
      createdIds,
      skippedIds,
    };
  }
);
export const archiveCountdownPreset = onCall(
  OPTIONS,
  async (request: CallableRequest<ArchiveInput>) => {
    const uid = requireAdmin(request);
    const presetId = parseId(request.data?.presetId);
    if (!presetId) fail("presetId es obligatorio.");

    const archived = request.data?.archived === true;

    const ref = db().collection(COLLECTION).doc(presetId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "No existe el preset solicitado.");

    const data = (snap.data() || {}) as PresetDoc;
    const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
    const hasPublishedVersion = Number(data.activeVersion || 0) > 0;

    const nextEstado: Estado = archived ? "archived" : hasPublishedVersion ? "published" : "draft";

    await ref.set(
      {
        estado: nextEstado,
        metadata: {
          ...metadata,
          updatedAt: FieldValue.serverTimestamp(),
          updatedByUid: uid,
          archivedAt: archived ? FieldValue.serverTimestamp() : null,
          archivedByUid: archived ? uid : null,
        },
      },
      { merge: true }
    );

    return { presetId, estado: nextEstado };
  }
);

export const deleteCountdownPreset = onCall(
  OPTIONS,
  async (request: CallableRequest<DeleteInput>) => {
    const uid = requireAdmin(request);
    const presetId = parseId(request.data?.presetId);
    if (!presetId) fail("presetId es obligatorio.");

    const ref = db().collection(COLLECTION).doc(presetId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "No existe el preset solicitado.");

    const data = (snap.data() || {}) as PresetDoc;
    const [versionSnap, referenceCount] = await Promise.all([
      ref.collection("versions").limit(1).get(),
      countCountdownPresetReferences(presetId),
    ]);
    const deletionPolicy = resolveCountdownPresetDeletionPolicy({
      activeVersion: data.activeVersion,
      versionCount: versionSnap.size,
      referenceCount,
    });

    if (deletionPolicy === "tombstone") {
      const result = await db().runTransaction(async (transaction) => {
        const currentSnap = await transaction.get(ref);
        if (!currentSnap.exists) {
          throw new HttpsError("not-found", "No existe el preset solicitado.");
        }
        const current = (currentSnap.data() || {}) as PresetDoc;
        const metadata =
          current.metadata && typeof current.metadata === "object"
            ? current.metadata
            : {};
        const now = FieldValue.serverTimestamp();
        transaction.set(
          ref,
          {
            estado: "archived",
            metadata: {
              ...metadata,
              updatedAt: now,
              updatedByUid: uid,
              archivedAt: now,
              archivedByUid: uid,
              tombstonedAt: now,
              tombstonedByUid: uid,
              tombstoneReason:
                Number(current.activeVersion || 0) > 0
                  ? "published-version-protection"
                  : "reference-protection",
            },
          },
          { merge: true }
        );
        return {
          presetId,
          deleted: false,
          archived: true,
          tombstoned: true,
          protectedVersionCount: versionSnap.size,
          protectedReferenceCount: referenceCount,
        };
      });
      return result;
    }

    await db().runTransaction(async (transaction) => {
      const currentSnap = await transaction.get(ref);
      if (!currentSnap.exists) {
        throw new HttpsError("not-found", "No existe el preset solicitado.");
      }
      const current = (currentSnap.data() || {}) as PresetDoc;
      if (Number(current.activeVersion || 0) > 0) {
        throw new HttpsError(
          "failed-precondition",
          "El preset ya tiene una version publicada y solo puede archivarse."
        );
      }
      transaction.delete(ref);
    });
    await deleteSubcollection(ref, "operations");
    await Promise.all([
      deleteStoragePrefix(`assets/countdown/staging/${presetId}/`),
      deleteStoragePrefix(`assets/countdown/frames/${presetId}/draft/`),
      deleteStoragePrefix(`assets/countdown/thumbnails/${presetId}/draft/`),
    ]);

    return {
      presetId,
      deleted: true,
      archived: false,
      tombstoned: false,
    };
  }
);

export const listCountdownPresetsAdmin = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, never>>) => {
    requireAdmin(request);

    const snap = await db().collection(COLLECTION).get();
    const items = snap.docs
      .map((doc): Record<string, unknown> => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }))
      .sort((a, b) => {
        const aTs = (a.metadata as Record<string, unknown> | undefined)?.updatedAt;
        const bTs = (b.metadata as Record<string, unknown> | undefined)?.updatedAt;
        const aMs = isTimestampLike(aTs) ? aTs.toDate().getTime() : 0;
        const bMs = isTimestampLike(bTs) ? bTs.toDate().getTime() : 0;
        return bMs - aMs;
      })
      .map((item) => serialize(item));

    return { items };
  }
);

export const listCountdownPresetsPublic = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, never>>) => {
    requireAuth(request);

    const snap = await db().collection(COLLECTION).where("estado", "==", "published").get();

    const resolvedItems = await Promise.all(
      snap.docs.map(async (doc) => {
        const rootData = (doc.data() || {}) as PresetDoc;
        const activeVersion = intOrNull(rootData.activeVersion);
        const versionSnap =
          activeVersion !== null && activeVersion > 0
            ? await doc.ref.collection("versions").doc(String(activeVersion)).get()
            : null;
        const resolution = resolvePublicCatalogVersion({
          rootData,
          versionExists: Boolean(versionSnap?.exists),
          versionData: versionSnap?.data() || null,
        });

        if (!resolution.ok) {
          logger.error("Preset countdown omitido del catalogo publico", {
            presetId: doc.id,
            reason: resolution.reason,
            activeVersion,
          });
          return null;
        }

        try {
          const versionData = resolution.versionData as PresetDoc &
            Record<string, unknown>;
          const config = normalizeConfig({
            layout: versionData.layout,
            tipografia: versionData.tipografia,
            colores: versionData.colores,
            animaciones: versionData.animaciones,
            unidad: versionData.unidad,
            tamanoBase: versionData.tamanoBase,
          });
          const svgRef =
            normalizeSvgRef(versionData.svgRef) || createEmptySvgRef();
          const categoria = versionData.categoria
            ? normalizeCategory(versionData.categoria)
            : DEFAULT_CATEGORY;
          const migrationSource = text(
            (versionData.metadata as Record<string, unknown> | undefined)
              ?.migrationSource,
            80
          );
          const legacyProps = normalizeLegacyCanvasProps(
            versionData.legacyPresetProps
          );
          const shouldUseLegacyPatch =
            migrationSource === LEGACY_SYNC_SOURCE &&
            resolution.activeVersion <= 1 &&
            Boolean(legacyProps);

          return {
            migrationSource,
            publicItem: {
              id: doc.id,
              nombre: text(versionData.nombre, 120) || doc.id,
              categoria: { label: categoria.label },
              thumbnailUrl: svgRef.thumbnailUrl,
              activeVersion: resolution.activeVersion,
              presetPropsForCanvas:
                shouldUseLegacyPatch && legacyProps
                  ? buildLegacyCanvasPatch({
                      presetId: doc.id,
                      activeVersion: resolution.activeVersion,
                      legacyProps,
                    })
                  : buildCanvasPatch({
                      presetId: doc.id,
                      activeVersion: resolution.activeVersion,
                      config,
                      svgRef,
                    }),
            },
          };
        } catch (error) {
          logger.error("Version countdown invalida en catalogo publico", {
            presetId: doc.id,
            activeVersion: resolution.activeVersion,
            error,
          });
          return null;
        }
      })
    );
    const catalogEntries = resolvedItems.filter(
      (item): item is NonNullable<typeof item> => Boolean(item)
    );
    const items = catalogEntries.map((entry) => entry.publicItem);

    recordBackendCountdownTelemetry({
      eventType: "catalog_read",
      renderer: "countdown-preset-catalog",
      renderState: {
        objetos: catalogEntries.map((entry) => ({
          ...entry.publicItem.presetPropsForCanvas,
          tipo: "countdown",
          migrationSource: entry.migrationSource || null,
        })),
      },
    });

    return { items };
  }
);

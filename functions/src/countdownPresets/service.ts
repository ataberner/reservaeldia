
import { randomUUID } from "crypto";
import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import { JSDOM } from "jsdom";
import { requireAuth, requireSuperAdmin } from "../auth/adminAuth";

type Estado = "draft" | "published" | "archived";
type Unit = "days" | "hours" | "minutes" | "seconds";
type LayoutType = "singleFrame" | "multiUnit";
type Distribution = "centered" | "vertical" | "grid" | "editorial";
type LabelTransform = "none" | "uppercase" | "lowercase" | "capitalize";
type ColorMode = "currentColor" | "fixed";
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
    gap: number;
    framePadding: number;
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
  storagePath: string | null;
  downloadUrl: string | null;
  thumbnailPath: string | null;
  thumbnailUrl: string | null;
  viewBox: string | null;
  hasFixedDimensions: boolean;
  bytes: number;
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
  config?: unknown;
  assets?: {
    svgFileName?: unknown;
    svgBase64?: unknown;
    thumbnailPngBase64?: unknown;
  };
};

type PublishInput = {
  presetId?: unknown;
  expectedDraftVersion?: unknown;
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
  region: "us-central1",
  cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
};

const COLLECTION = "countdownPresets";
const SCHEMA_VERSION = 2;
const RENDER_CONTRACT_VERSION = 2;
const LEGACY_SYNC_SOURCE = "legacy-config-v1";
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const PRESET_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const UNSAFE_HREF = /^(https?:|\/\/|javascript:)/i;
const UNSAFE_CSS_TOKEN = /[<>;]/;
const UNSAFE_CSS_PATTERN = /(url\s*\(|javascript:|expression\s*\()/i;
const SAFE_CSS_VALUE = /^[#(),.%\-+\s\w:/]*$/i;
const CSS_VALIDATOR_WINDOW = new JSDOM("<!doctype html><html><body></body></html>").window;

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
  tamanoBase: { min: 220, max: 640 },
  gap: { min: 0, max: 48 },
  framePadding: { min: 0, max: 64 },
  numberSize: { min: 10, max: 120 },
  labelSize: { min: 8, max: 72 },
  letterSpacing: { min: -2, max: 12 },
  lineHeight: { min: 0.8, max: 2 },
  boxRadius: { min: 0, max: 120 },
};

const DEFAULT_CATEGORY: Category = {
  event: "general",
  style: "minimal",
  custom: null,
  label: "General / Minimal",
};

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

  const probe = CSS_VALIDATOR_WINDOW.document.createElement("div");
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

async function resolveDocRef(requestedId: string | null, nombre: string) {
  const database = db();
  if (requestedId) return { presetId: requestedId, ref: database.collection(COLLECTION).doc(requestedId) };

  const base = slugifyName(nombre);
  let attempt = 0;
  while (attempt < 5) {
    const candidate = `${base}-${Date.now().toString(36)}${attempt === 0 ? "" : `-${attempt}`}`;
    const ref = database.collection(COLLECTION).doc(candidate);
    const snap = await ref.get();
    if (!snap.exists) return { presetId: candidate, ref };
    attempt += 1;
  }

  throw new HttpsError("internal", "No se pudo generar presetId unico.");
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
      gap: numberInRange(layoutRaw.gap, RANGES.gap, "config.layout.gap"),
      framePadding: numberInRange(layoutRaw.framePadding, RANGES.framePadding, "config.layout.framePadding"),
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
  const modeRaw = text(raw.colorMode, 20);
  const colorMode: ColorMode = COLOR_MODES.has(modeRaw) ? (modeRaw as ColorMode) : "fixed";
  return {
    storagePath: optionalText(raw.storagePath, 500),
    downloadUrl: optionalText(raw.downloadUrl, 1000),
    thumbnailPath: optionalText(raw.thumbnailPath, 500),
    thumbnailUrl: optionalText(raw.thumbnailUrl, 1000),
    viewBox: optionalText(raw.viewBox, 120),
    hasFixedDimensions: raw.hasFixedDimensions === true,
    bytes: Number(raw.bytes || 0) || 0,
    colorMode,
  };
}

function createEmptySvgRef(partial: Partial<SvgRef> = {}): SvgRef {
  return {
    storagePath: partial.storagePath ?? null,
    downloadUrl: partial.downloadUrl ?? null,
    thumbnailPath: partial.thumbnailPath ?? null,
    thumbnailUrl: partial.thumbnailUrl ?? null,
    viewBox: partial.viewBox ?? null,
    hasFixedDimensions: partial.hasFixedDimensions === true,
    bytes: Number(partial.bytes || 0) || 0,
    colorMode: partial.colorMode === "currentColor" ? "currentColor" : "fixed",
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
      gap: clampNumber(legacyProps.gap, RANGES.gap.min, RANGES.gap.max, 8),
      framePadding: 10,
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

  if (bytes > 500 * 1024) criticalErrors.push("El SVG supera 500KB.");
  else if (bytes > 200 * 1024) warnings.push("El SVG pesa mas de 200KB.");

  let dom: JSDOM;
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

async function deleteVersionHistory(ref: admin.firestore.DocumentReference) {
  const versionRefs = await ref.collection("versions").listDocuments();
  if (!versionRefs.length) return;

  const CHUNK_SIZE = 400;
  for (let index = 0; index < versionRefs.length; index += CHUNK_SIZE) {
    const chunk = versionRefs.slice(index, index + CHUNK_SIZE);
    const batch = db().batch();
    chunk.forEach((versionRef) => batch.delete(versionRef));
    await batch.commit();
  }
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
  const chipWidth = Math.max(34, estimateChipWidth(config.tamanoBase, visibleUnits, config.layout.distribution));
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
    frameSvgUrl: svgRef.downloadUrl,
    frameColorMode: svgRef.colorMode,
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
    const uid = requireSuperAdmin(request);

    const nombre = text(request.data?.nombre, 120);
    if (!nombre) fail("nombre es obligatorio.");

    const categoria = normalizeCategory(request.data?.categoria);
    const config = normalizeConfig(request.data?.config);
    const expectedDraftVersion = parseExpectedDraftVersion(request.data?.expectedDraftVersion);
    const requestedId = parseId(request.data?.presetId);

    const { presetId, ref } = await resolveDocRef(requestedId, nombre);
    const snap = await ref.get();
    const existing = (snap.exists ? (snap.data() as PresetDoc) : null) || null;

    const currentDraftVersion = intOrNull(existing?.draftVersion);
    if (expectedDraftVersion !== currentDraftVersion) {
      throw new HttpsError(
        "failed-precondition",
        "El borrador fue modificado por otra sesion. Recarga antes de guardar."
      );
    }

    const existingDraft = existing?.draft || null;
    const existingSvgRef = normalizeSvgRef(existingDraft?.svgRef) || normalizeSvgRef(existing?.svgRef);

    const assets = request.data?.assets || {};
    const hasIncomingSvg = typeof assets.svgBase64 === "string" && assets.svgBase64.trim().length > 0;
    const hasIncomingThumb = typeof assets.thumbnailPngBase64 === "string" && assets.thumbnailPngBase64.trim().length > 0;
    const allowFramelessDraft = Boolean(snap.exists && !existingSvgRef?.storagePath);

    let inspection: ReturnType<typeof inspectSvg> | null = null;
    let nextSvgRef: SvgRef | null = existingSvgRef;

    if (hasIncomingSvg) {
      const svgFileName = text(assets.svgFileName, 180);
      if (!svgFileName.toLowerCase().endsWith(".svg")) fail("svgFileName debe terminar en .svg.");

      const svgBuffer = parseBase64(assets.svgBase64, "assets.svgBase64");
      const svgText = svgBuffer.toString("utf8");
      inspection = inspectSvg(svgText, svgFileName, svgBuffer.byteLength);
      if (!inspection.valid) fail(inspection.criticalErrors.join(" "));

      const draftSvgPath = `assets/countdown/frames/${presetId}/draft/frame.svg`;
      const uploaded = await uploadWithToken(draftSvgPath, Buffer.from(inspection.svgText, "utf8"), "image/svg+xml");

      nextSvgRef = {
        storagePath: uploaded.storagePath,
        downloadUrl: uploaded.downloadUrl,
        thumbnailPath: existingSvgRef?.thumbnailPath || null,
        thumbnailUrl: existingSvgRef?.thumbnailUrl || null,
        viewBox: inspection.checks.viewBox,
        hasFixedDimensions: inspection.checks.hasFixedDimensions,
        bytes: inspection.checks.bytes,
        colorMode: inspection.checks.colorMode,
      };
    }

    if (hasIncomingThumb) {
      const png = parseBase64(assets.thumbnailPngBase64, "assets.thumbnailPngBase64");
      const draftThumbPath = `assets/countdown/thumbnails/${presetId}/draft/thumbnail.png`;
      const uploadedThumb = await uploadWithToken(draftThumbPath, png, "image/png");

      nextSvgRef = {
        ...(nextSvgRef || createEmptySvgRef()),
        thumbnailPath: uploadedThumb.storagePath,
        thumbnailUrl: uploadedThumb.downloadUrl,
      };
    }

    if (!nextSvgRef) {
      nextSvgRef = createEmptySvgRef();
    }

    if (!nextSvgRef.storagePath && !allowFramelessDraft) {
      fail("Debes subir un SVG valido para guardar el borrador.");
    }

    const warnings = inspection?.warnings || existingDraft?.validationReport?.warnings || [];
    const checks = inspection?.checks || existingDraft?.validationReport?.checks || {};

    const nextDraftVersion = (currentDraftVersion || 0) + 1;
    const now = admin.firestore.FieldValue.serverTimestamp();

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

    const hasActiveVersion = Number(existing?.activeVersion || 0) > 0;
    const metadata = existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {};

    await ref.set(
      {
        id: presetId,
        nombre: hasActiveVersion ? existing?.nombre || nombre : nombre,
        categoria: hasActiveVersion ? existing?.categoria || categoria : categoria,
        estado: (existing?.estado as Estado) || "draft",
        activeVersion: hasActiveVersion ? Number(existing?.activeVersion || 0) : null,
        draftVersion: nextDraftVersion,
        svgRef: hasActiveVersion ? normalizeSvgRef(existing?.svgRef) || nextSvgRef : nextSvgRef,
        layout: hasActiveVersion ? existing?.layout || config.layout : config.layout,
        tipografia: hasActiveVersion ? existing?.tipografia || config.tipografia : config.tipografia,
        colores: hasActiveVersion ? existing?.colores || config.colores : config.colores,
        animaciones: hasActiveVersion ? existing?.animaciones || config.animaciones : config.animaciones,
        unidad: hasActiveVersion ? existing?.unidad || config.unidad : config.unidad,
        tamanoBase: hasActiveVersion ? Number(existing?.tamanoBase || config.tamanoBase) : config.tamanoBase,
        draft,
        metadata: {
          ...metadata,
          schemaVersion: SCHEMA_VERSION,
          renderContractVersion: RENDER_CONTRACT_VERSION,
          updatedAt: now,
          updatedByUid: uid,
          ...(snap.exists ? {} : { createdAt: now, createdByUid: uid }),
        },
      },
      { merge: true }
    );

    return {
      presetId,
      draftVersion: nextDraftVersion,
      estado: (existing?.estado as Estado) || "draft",
      warnings,
      updatedAt: new Date().toISOString(),
    };
  }
);

export const publishCountdownPresetDraft = onCall(
  OPTIONS,
  async (request: CallableRequest<PublishInput>) => {
    const uid = requireSuperAdmin(request);

    const presetId = parseId(request.data?.presetId);
    if (!presetId) fail("presetId es obligatorio.");

    const expectedDraftVersion = parseExpectedDraftVersion(request.data?.expectedDraftVersion);
    if (!expectedDraftVersion) fail("expectedDraftVersion es obligatorio.");

    const ref = db().collection(COLLECTION).doc(presetId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "No existe el preset solicitado.");

    const data = (snap.data() || {}) as PresetDoc;
    const currentDraftVersion = intOrNull(data.draftVersion);
    if (currentDraftVersion !== expectedDraftVersion) {
      throw new HttpsError("failed-precondition", "El borrador cambio. Recarga antes de publicar.");
    }

    const draft = data.draft as Draft | null;
    if (!draft) throw new HttpsError("failed-precondition", "No hay borrador para publicar.");

    const config = normalizeConfig({
      layout: draft.layout,
      tipografia: draft.tipografia,
      colores: draft.colores,
      animaciones: draft.animaciones,
      unidad: draft.unidad,
      tamanoBase: draft.tamanoBase,
    });
    const category = normalizeCategory(draft.categoria);
    const draftSvgRef = normalizeSvgRef(draft.svgRef) || createEmptySvgRef();
    if (!draftSvgRef.thumbnailPath) throw new HttpsError("failed-precondition", "El borrador no tiene miniatura PNG.");

    const nextVersion = Math.max(0, Number(data.activeVersion || 0)) + 1;
    const frameTarget = `assets/countdown/frames/${presetId}/v${nextVersion}/frame.svg`;
    const thumbTarget = `assets/countdown/thumbnails/${presetId}/v${nextVersion}/thumbnail.png`;

    const [framePublished, thumbPublished] = await Promise.all([
      draftSvgRef.storagePath
        ? copyVersionedAsset(draftSvgRef.storagePath, frameTarget, "image/svg+xml")
        : Promise.resolve(null),
      copyVersionedAsset(draftSvgRef.thumbnailPath, thumbTarget, "image/png"),
    ]);

    const publishedSvgRef: SvgRef = {
      storagePath: framePublished?.storagePath || null,
      downloadUrl: framePublished?.downloadUrl || null,
      thumbnailPath: thumbPublished.storagePath,
      thumbnailUrl: thumbPublished.downloadUrl,
      viewBox: draftSvgRef.viewBox,
      hasFixedDimensions: draftSvgRef.hasFixedDimensions,
      bytes: framePublished?.bytes || draftSvgRef.bytes,
      colorMode: draftSvgRef.colorMode,
    };

    const now = admin.firestore.FieldValue.serverTimestamp();
    const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {};

    const batch = db().batch();
    batch.set(ref.collection("versions").doc(String(nextVersion)), {
      id: presetId,
      version: nextVersion,
      nombre: draft.nombre,
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
      },
    });

    batch.set(ref, {
      id: presetId,
      nombre: draft.nombre,
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
      legacyPresetProps: admin.firestore.FieldValue.delete(),
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
    }, { merge: true });

    await batch.commit();

    return {
      presetId,
      activeVersion: nextVersion,
      publishedAt: new Date().toISOString(),
    };
  }
);

export const syncLegacyCountdownPresets = onCall(
  OPTIONS,
  async (request: CallableRequest<SyncLegacyInput>) => {
    const uid = requireSuperAdmin(request);
    const legacyPresets = normalizeSyncLegacyPayload(request.data?.presets);
    const database = db();
    const now = admin.firestore.FieldValue.serverTimestamp();

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

      batch.set(
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
        },
        { merge: false }
      );
      writeOps += 1;

      batch.set(
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
          tamanoBase: legacyConfig.tamanoBase,
          metadata: {
            schemaVersion: SCHEMA_VERSION,
            renderContractVersion: RENDER_CONTRACT_VERSION,
            publishedAt: now,
            publishedByUid: uid,
            migrationSource: LEGACY_SYNC_SOURCE,
          },
        },
        { merge: false }
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
    const uid = requireSuperAdmin(request);
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
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedByUid: uid,
          archivedAt: archived ? admin.firestore.FieldValue.serverTimestamp() : null,
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
    requireSuperAdmin(request);
    const presetId = parseId(request.data?.presetId);
    if (!presetId) fail("presetId es obligatorio.");

    const ref = db().collection(COLLECTION).doc(presetId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "No existe el preset solicitado.");

    const data = (snap.data() || {}) as PresetDoc;
    const estadoActual = text(data.estado, 20);
    if (estadoActual === "published") {
      throw new HttpsError(
        "failed-precondition",
        "Solo se pueden eliminar presets despublicados (draft o archived)."
      );
    }

    await deleteVersionHistory(ref);
    await ref.delete();
    await Promise.all([
      deleteStoragePrefix(`assets/countdown/frames/${presetId}/`),
      deleteStoragePrefix(`assets/countdown/thumbnails/${presetId}/`),
    ]);

    return {
      presetId,
      deleted: true,
    };
  }
);

export const listCountdownPresetsAdmin = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, never>>) => {
    requireSuperAdmin(request);

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

    const items = snap.docs
      .map((doc) => {
        const data = (doc.data() || {}) as PresetDoc;

        try {
          const config = normalizeConfig({
            layout: data.layout,
            tipografia: data.tipografia,
            colores: data.colores,
            animaciones: data.animaciones,
            unidad: data.unidad,
            tamanoBase: data.tamanoBase,
          });

          const svgRef = normalizeSvgRef(data.svgRef) || {
            storagePath: null,
            downloadUrl: null,
            thumbnailPath: null,
            thumbnailUrl: null,
            viewBox: null,
            hasFixedDimensions: false,
            bytes: 0,
            colorMode: "fixed" as ColorMode,
          };

          const categoria = data.categoria ? normalizeCategory(data.categoria) : DEFAULT_CATEGORY;
          const activeVersion = Math.max(1, Number(data.activeVersion || 1));
          const migrationSource = text(
            (data.metadata as Record<string, unknown> | undefined)?.migrationSource,
            80
          );
          const legacyProps = normalizeLegacyCanvasProps(data.legacyPresetProps);
          const shouldUseLegacyPatch =
            migrationSource === LEGACY_SYNC_SOURCE && activeVersion <= 1 && Boolean(legacyProps);

          return {
            id: doc.id,
            nombre: text(data.nombre, 120) || doc.id,
            categoria: { label: categoria.label },
            thumbnailUrl: svgRef.thumbnailUrl,
            activeVersion,
            presetPropsForCanvas: shouldUseLegacyPatch && legacyProps
              ? buildLegacyCanvasPatch({
                  presetId: doc.id,
                  activeVersion,
                  legacyProps,
                })
              : buildCanvasPatch({
                  presetId: doc.id,
                  activeVersion,
                  config,
                  svgRef,
                }),
          };
        } catch (error) {
          logger.error("Preset countdown invalido en catalogo publico", {
            presetId: doc.id,
            error,
          });
          return null;
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return { items };
  }
);

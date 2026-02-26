const DEFAULT_CANVAS_WIDTH = 800;

export const MOTION_EFFECT_VALUES = Object.freeze([
  "none",
  "reveal",
  "draw",
  "zoom",
  "hover",
  "pulse",
  "rsvp",
]);

const MOTION_EFFECT_SET = new Set(MOTION_EFFECT_VALUES);

export const GLOBAL_MOTION_PRESETS = Object.freeze({
  soft_elegant: Object.freeze({
    id: "soft_elegant",
    label: "Suave y elegante",
    description: "Animaciones sutiles y elegantes al hacer scroll.",
  }),
  modern_dynamic: Object.freeze({
    id: "modern_dynamic",
    label: "Moderno y dinamico",
    description: "Animaciones mas notorias, look actual y transiciones suaves.",
  }),
  minimal: Object.freeze({
    id: "minimal",
    label: "Minimalista",
    description: "Casi sin animaciones, con foco en titulos principales.",
  }),
});

export const CLEAR_ALL_MOTION_PRESET_ID = "clear_all";

const PRESET_IDS = new Set(Object.keys(GLOBAL_MOTION_PRESETS));

const EXPLICIT_ROLE_ALIASES = Object.freeze({
  title: "title",
  titulo: "title",
  heading: "title",
  hero: "title",
  subtitle: "subtitle",
  subtitulo: "subtitle",
  subheading: "subtitle",
  body: "body",
  paragraph: "body",
  parrafo: "body",
  text: "body",
  texto: "body",
  cta: "cta",
  button: "cta",
  boton: "cta",
  divider: "divider",
  line: "divider",
  linea: "divider",
  image: "image",
  imagen: "image",
  gallery: "gallery",
  galeria: "gallery",
  icon: "icon",
  icono: "icon",
  countdown: "countdown",
  rsvp: "rsvp",
});

const SUPPORTED_AUTO_TYPES = new Set([
  "text",
  "image",
  "icon",
  "divider",
  "gallery",
  "countdown",
  "rsvp",
  "button",
]);

function toLowerText(value) {
  return String(value || "").trim().toLowerCase();
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizePresetId(value) {
  const normalized = toLowerText(value);
  return PRESET_IDS.has(normalized) ? normalized : "soft_elegant";
}

function canonicalType(element) {
  const tipo = toLowerText(element?.tipo);
  const figura = toLowerText(element?.figura);

  if (tipo === "texto" || tipo === "text") return "text";
  if (tipo === "imagen" || tipo === "image") return "image";
  if (tipo === "icono" || tipo === "icon" || tipo === "icono-svg") return "icon";
  if (tipo === "galeria" || tipo === "gallery") return "gallery";
  if (tipo === "countdown") return "countdown";
  if (tipo === "rsvp-boton" || tipo === "rsvp") return "rsvp";
  if (tipo === "button" || tipo === "boton") return "button";
  if (tipo === "line" || tipo === "divider") return "divider";
  if (tipo === "forma" && figura === "line") return "divider";
  if (tipo === "forma") return "shape";

  return "unsupported";
}

function normalizeExplicitRole(value) {
  const normalized = toLowerText(value);
  return EXPLICIT_ROLE_ALIASES[normalized] || "";
}

function inferTextRoleBySize(element) {
  const fontSize = toFiniteNumber(element?.fontSize, 0);
  if (fontSize >= 30) return "title";
  if (fontSize >= 22) return "subtitle";
  return "body";
}

function isListLine(line) {
  return /^(\s*[-*\u2022]\s+|\s*\d+[.)]\s+)/.test(line);
}

function isLongListText(element) {
  const rawText = String(element?.texto || "");
  if (!rawText) return false;

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 6) return true;
  const listLines = lines.filter((line) => isListLine(line)).length;
  return listLines >= 4;
}

function resolveElementArea(element, type) {
  if (!element || typeof element !== "object") return 0;

  if (type === "divider") {
    const points = Array.isArray(element.points) ? element.points : null;
    if (points && points.length >= 4) {
      const dx = toFiniteNumber(points[2], 0) - toFiniteNumber(points[0], 0);
      const dy = toFiniteNumber(points[3], 0) - toFiniteNumber(points[1], 0);
      const length = Math.sqrt(dx * dx + dy * dy);
      const stroke = Math.max(1, toFiniteNumber(element.strokeWidth, 2));
      return length * stroke;
    }
  }

  if (type === "text") {
    const fontSize = toFiniteNumber(element.fontSize, 0);
    const width = toFiniteNumber(element.width, 0);
    if (width > 0 && fontSize > 0) return width * (fontSize * 1.2);
    const textLength = String(element.texto || "").trim().length;
    return Math.max(0, textLength) * Math.max(0, fontSize) * 0.7;
  }

  const width = Math.abs(toFiniteNumber(element.width, 0) || toFiniteNumber(element.ancho, 0));
  const height = Math.abs(toFiniteNumber(element.height, 0) || toFiniteNumber(element.alto, 0));
  if (width > 0 && height > 0) return width * height;

  const radius = Math.abs(toFiniteNumber(element.radius, 0));
  if (radius > 0) return Math.PI * radius * radius;

  return 0;
}

function isSmallElement(element, type) {
  if (type === "text") {
    const fontSize = toFiniteNumber(element?.fontSize, 0);
    if (fontSize > 0 && fontSize <= 13) return true;
  }

  return resolveElementArea(element, type) > 0 && resolveElementArea(element, type) < 2400;
}

function smallRepeatKey(element, type) {
  const sectionId = String(element?.seccionId || "no-section");
  const shape = type === "shape" || type === "divider" ? toLowerText(element?.figura) : "";
  return `${sectionId}:${type}:${shape}`;
}

function buildSmallRepeatMap(elements) {
  const map = new Map();

  (elements || []).forEach((element) => {
    const type = canonicalType(element);
    if (!isSmallElement(element, type)) return;
    const key = smallRepeatKey(element, type);
    map.set(key, (map.get(key) || 0) + 1);
  });

  return map;
}

function hasStrongAnimationSignal(element, type) {
  if (!element || typeof element !== "object") return false;

  const directFlags = [
    "hasStrongAnimation",
    "strongAnimation",
    "animacionFuerte",
    "animationStrong",
    "animated",
    "isAnimated",
  ];

  for (const flagKey of directFlags) {
    if (element[flagKey] === true) return true;
  }

  if (type === "countdown") {
    const presetHint = toLowerText(element?.presetId || element?.layout || "");
    if (/flip|neon|retro|cyber|matrix|glitch/.test(presetHint)) return true;
  }

  return false;
}

function buildSectionContext(secciones) {
  const list = Array.isArray(secciones) ? [...secciones] : [];
  list.sort((left, right) => {
    const leftOrder = toFiniteNumber(left?.orden, 0);
    const rightOrder = toFiniteNumber(right?.orden, 0);
    return leftOrder - rightOrder;
  });

  const firstSectionId = list[0]?.id || "";
  const sectionById = new Map();
  list.forEach((section) => {
    if (!section?.id) return;
    sectionById.set(section.id, section);
  });

  return { firstSectionId, sectionById };
}

function isCoverImage(element, sectionContext) {
  if (!element || !sectionContext) return false;

  if (String(element.seccionId || "") === String(sectionContext.firstSectionId || "")) {
    return true;
  }

  const section = sectionContext.sectionById.get(element.seccionId);
  const sectionHeight = Math.max(1, toFiniteNumber(section?.altura, 600));
  const sectionArea = DEFAULT_CANVAS_WIDTH * sectionHeight;
  const areaRatio = resolveElementArea(element, "image") / sectionArea;
  return areaRatio >= 0.35;
}

function isMediumOrLargeImage(element) {
  const width = Math.abs(toFiniteNumber(element?.width, 0) || toFiniteNumber(element?.ancho, 0));
  const height = Math.abs(toFiniteNumber(element?.height, 0) || toFiniteNumber(element?.alto, 0));
  if (width >= 260 || height >= 260) return true;
  return width * height >= 70000;
}

function isInteractiveIcon(element) {
  if (!element || typeof element !== "object") return false;
  if (element?.enlace) return true;
  if (element?.isInteractive) return true;
  return false;
}

function resolveRole(element, type) {
  const explicitRole = normalizeExplicitRole(element?.role || element?.rol);
  if (explicitRole) return explicitRole;

  if (type === "text") return inferTextRoleBySize(element);
  if (type === "divider") return "divider";
  if (type === "image") return "image";
  if (type === "gallery") return "gallery";
  if (type === "icon") return "icon";
  if (type === "countdown") return "countdown";
  if (type === "rsvp") return "rsvp";
  if (type === "button") return "cta";
  if (type === "shape") return "decorative";

  return "unsupported";
}

export function inferMotionRole(element) {
  const type = canonicalType(element);
  return resolveRole(element, type);
}

export function sanitizeMotionEffect(value) {
  const normalized = toLowerText(value);
  return MOTION_EFFECT_SET.has(normalized) ? normalized : "none";
}

export function clearAllMotionEffects(elements) {
  const list = Array.isArray(elements) ? elements : [];
  return list.map((element) => ({ ...element, motionEffect: "none" }));
}

export function getAllowedMotionEffectsForElement(element) {
  if (!element || typeof element !== "object") return ["none"];
  const type = canonicalType(element);
  const allowed = new Set(["none", "reveal", "hover"]);
  if (type === "divider") allowed.add("draw");
  if (type === "image") allowed.add("zoom");
  if (type === "countdown") allowed.add("pulse");
  if (type === "rsvp") {
    allowed.add("pulse");
    allowed.add("rsvp");
  }
  return Array.from(allowed);
}

function effectForPreset({ presetId, element, type, role, sectionContext }) {
  if (presetId === "minimal") {
    if (role === "title" || role === "subtitle") return "reveal";
    if (type === "button") return "hover";
    if (type === "rsvp") return "rsvp";
    return "none";
  }

  if (type === "divider") return "draw";
  if (type === "gallery") return "reveal";
  if (type === "text") return "reveal";
  if (type === "button") return "hover";
  if (type === "countdown") return "pulse";
  if (type === "rsvp") return "rsvp";

  if (type === "icon") {
    return isInteractiveIcon(element) ? "hover" : "reveal";
  }

  if (type === "image") {
    if (presetId === "modern_dynamic") {
      return isCoverImage(element, sectionContext) || isMediumOrLargeImage(element)
        ? "zoom"
        : "reveal";
    }
    return isCoverImage(element, sectionContext) ? "zoom" : "reveal";
  }

  return "none";
}

function shouldExcludeFromAutoEffect({ element, type, repeatMap }) {
  if (!SUPPORTED_AUTO_TYPES.has(type)) return true;
  if (element?.esFondo) return true;
  if (hasStrongAnimationSignal(element, type)) return true;

  if (type === "text" && isLongListText(element)) return true;

  const repeatKey = smallRepeatKey(element, type);
  if (repeatMap.get(repeatKey) >= 6) return true;

  return false;
}

export function applyGlobalMotionPreset(elements, options = {}) {
  const list = Array.isArray(elements) ? elements : [];
  const presetId = normalizePresetId(options?.presetId);
  const sectionContext = buildSectionContext(options?.secciones);
  const repeatMap = buildSmallRepeatMap(list);

  return list.map((element) => {
    const type = canonicalType(element);
    const role = resolveRole(element, type);

    if (shouldExcludeFromAutoEffect({ element, type, repeatMap })) {
      return { ...element, motionEffect: "none" };
    }

    const effect = effectForPreset({
      presetId,
      element,
      type,
      role,
      sectionContext,
    });

    return { ...element, motionEffect: sanitizeMotionEffect(effect) };
  });
}

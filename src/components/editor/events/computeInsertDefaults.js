import { sanitizeMotionEffect } from "@/domain/motionEffects";
import { estimateCountdownUnitHeight } from "@/domain/countdownPresets/renderModel";
import {
  MIDNIGHT_RSVP_BUTTON_STYLE_ID,
  createRsvpButtonStylePatch,
} from "@/domain/rsvp/buttonStyles";

const CANVAS_WIDTH = 800;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stripUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  );
}

function calcCountdownInitialWidth(presetProps = {}) {
  const defaultUnits = ["days", "hours", "minutes", "seconds"];
  const unitsRaw = Array.isArray(presetProps.visibleUnits)
    ? presetProps.visibleUnits
    : defaultUnits;
  const units = unitsRaw
    .map((unit) => String(unit || "").trim())
    .filter(Boolean);
  const n = Math.max(1, units.length || defaultUnits.length);
  const gap = toNumber(presetProps.gap, 8);
  const paddingX = toNumber(presetProps.paddingX, 8);
  const chipWidth = toNumber(presetProps.chipWidth, 46);
  const chipW = chipWidth + paddingX * 2;
  const tamanoBase = toNumber(presetProps.tamanoBase, 320);
  const distribution = String(
    presetProps.distribution || presetProps.layoutType || "centered"
  ).toLowerCase();

  if (distribution === "vertical") {
    return Math.max(160, Math.round(Math.max(chipW + 24, tamanoBase * 0.48)));
  }
  if (distribution === "grid") {
    const cols = Math.min(2, n);
    return Math.max(180, Math.round(cols * chipW + gap * (cols - 1)));
  }
  if (distribution === "editorial") {
    return Math.max(220, Math.round(Math.max(chipW * n + gap * (n - 1), tamanoBase * 0.72)));
  }

  return Math.max(180, Math.round(n * chipW + gap * (n - 1)));
}

function calcCountdownInitialHeight(presetProps = {}) {
  const defaultUnits = ["days", "hours", "minutes", "seconds"];
  const unitsRaw = Array.isArray(presetProps.visibleUnits)
    ? presetProps.visibleUnits
    : defaultUnits;
  const n = Math.max(1, unitsRaw.length || defaultUnits.length);
  const gap = toNumber(presetProps.gap, 8);
  const paddingY = toNumber(presetProps.paddingY, 6);
  const valueSize = toNumber(presetProps.fontSize, 16);
  const labelSize = toNumber(presetProps.labelSize, 10);
  const showLabels = presetProps.showLabels !== false;
  const distribution = String(
    presetProps.distribution || presetProps.layoutType || "centered"
  ).toLowerCase();
  const tamanoBase = toNumber(presetProps.tamanoBase, 320);
  const textDrivenChipH = paddingY * 2 + valueSize + (showLabels ? labelSize : 0) + 10;
  const layoutDrivenChipH = estimateCountdownUnitHeight({
    tamanoBase,
    distribution,
    unitsCount: n,
  });
  const chipH = Math.max(textDrivenChipH, layoutDrivenChipH);

  if (distribution === "vertical") {
    return Math.max(120, Math.round(n * chipH + gap * (n - 1)));
  }
  if (distribution === "grid") {
    const cols = Math.min(2, n);
    const rows = Math.ceil(n / cols);
    return Math.max(110, Math.round(rows * chipH + gap * (rows - 1)));
  }
  if (distribution === "editorial") {
    return Math.max(110, Math.round(chipH * 1.35));
  }

  return Math.max(90, Math.round(chipH + 10));
}

function inferTextVariant(variant = "texto", isMobile = false) {
  if (variant === "titulo") {
    return {
      texto: "Titulo",
      fontSize: isMobile ? 34 : 36,
      fontWeight: "bold",
      fontStyle: "normal",
      y: 100,
    };
  }
  if (variant === "subtitulo") {
    return {
      texto: "Subtitulo",
      fontSize: isMobile ? 22 : 24,
      fontWeight: "normal",
      fontStyle: "italic",
      y: 160,
    };
  }
  if (variant === "parrafo") {
    return {
      texto: "Texto del parrafo...",
      fontSize: isMobile ? 16 : 18,
      fontWeight: "normal",
      fontStyle: "normal",
      y: 220,
    };
  }
  return {
    texto: "Texto",
    fontSize: isMobile ? 22 : 24,
    fontWeight: "normal",
    fontStyle: "normal",
    y: 120,
  };
}

function calcGalleryHeight({ width, rows, cols, gap, ratio }) {
  const ratioCell = ratio === "4:3" ? 3 / 4 : ratio === "16:9" ? 9 / 16 : 1;
  const cellW = Math.max(1, (width - gap * (cols - 1)) / cols);
  const cellH = cellW * ratioCell;
  return rows * cellH + gap * (rows - 1);
}

export default function computeInsertDefaults({
  payload = {},
  targetSeccionId,
  secciones = [],
  normalizarAltoModo,
  ALTURA_PANTALLA_EDITOR,
}) {
  const isMobile =
    typeof window !== "undefined" &&
    (window.matchMedia("(max-width: 1024px)").matches ||
      window.matchMedia("(pointer: coarse)").matches);

  const tipo = payload.tipo || "texto";
  const id = payload.id || `${tipo}-${Date.now().toString(36)}`;

  const incomingWidth = toNumber(payload.width);
  const incomingHeight = toNumber(payload.height);
  const incomingX = toNumber(payload.x);
  const incomingY = toNumber(payload.y);

  let next = {
    ...payload,
    id,
    tipo,
    seccionId: targetSeccionId,
    motionEffect: sanitizeMotionEffect(payload.motionEffect),
    rotation: toNumber(payload.rotation, 0),
    scaleX: toNumber(payload.scaleX, 1),
    scaleY: toNumber(payload.scaleY, 1),
  };

  if (tipo === "texto") {
    const variant = inferTextVariant(payload.variant, isMobile);
    const x = incomingX ?? 100;
    const y = incomingY ?? variant.y;

    next = {
      ...next,
      texto: payload.texto ?? variant.texto,
      x,
      y,
      fontSize: toNumber(payload.fontSize, variant.fontSize),
      color: payload.color ?? "#000000",
      fontFamily: payload.fontFamily ?? "sans-serif",
      fontWeight: payload.fontWeight ?? variant.fontWeight,
      fontStyle: payload.fontStyle ?? variant.fontStyle,
      textDecoration: payload.textDecoration ?? "none",
      align: payload.align ?? "left",
    };
  } else if (tipo === "forma") {
    const figura = payload.figura || "rect";
    const baseSize = isMobile ? 120 : 100;
    const shapeDefaults = {
      rect: { width: baseSize, height: baseSize },
      circle: { radius: 50 },
      line: { points: [0, 0, 120, 0], strokeWidth: 3 },
      triangle: { radius: 60 },
      diamond: { width: 120, height: 120 },
      star: { width: 120, height: 120 },
      heart: { width: 120, height: 108 },
      arrow: { width: 160, height: 90 },
      pentagon: { width: 120, height: 120 },
      hexagon: { width: 128, height: 112 },
      pill: { width: 170, height: 72 },
    };
    const selectedDefault = shapeDefaults[figura] || shapeDefaults.rect;
    const width = incomingWidth ?? selectedDefault.width ?? baseSize;
    const height = incomingHeight ?? selectedDefault.height ?? baseSize;
    const x = incomingX ?? Math.round((CANVAS_WIDTH - width) / 2);
    const y = incomingY ?? 120;

    next = {
      ...next,
      figura,
      color: payload.color ?? "#000000",
      x,
      y,
      width,
      height,
      texto: payload.texto ?? "",
      fontSize: toNumber(payload.fontSize, 24),
      fontFamily: payload.fontFamily ?? "sans-serif",
      fontWeight: payload.fontWeight ?? "normal",
      fontStyle: payload.fontStyle ?? "normal",
      colorTexto: payload.colorTexto ?? "#000000",
      align: payload.align ?? "center",
    };

    if (figura === "line") {
      next.points = Array.isArray(payload.points)
        ? payload.points
        : (selectedDefault.points || [0, 0, 120, 0]);
      next.strokeWidth = toNumber(
        payload.strokeWidth,
        selectedDefault.strokeWidth || 3
      );
      delete next.width;
      delete next.height;
    } else if (figura === "circle") {
      next.radius = toNumber(payload.radius, selectedDefault.radius || 50);
    } else if (figura === "triangle") {
      next.radius = toNumber(payload.radius, selectedDefault.radius || 60);
    } else if (figura === "pill") {
      const safeHeight = Number.isFinite(next.height) ? next.height : (selectedDefault.height || 72);
      next.cornerRadius = toNumber(payload.cornerRadius, Math.max(10, Math.round(safeHeight / 2)));
    }
  } else if (tipo === "icono" || tipo === "icono-svg") {
    const width = incomingWidth ?? (isMobile ? 112 : 128);
    const height = incomingHeight ?? width;
    const x = incomingX ?? Math.round((CANVAS_WIDTH - width) / 2);
    const y = incomingY ?? 120;
    next = {
      ...next,
      x,
      y,
      width,
      height,
    };
  } else if (tipo === "imagen") {
    const sourceWidth = toNumber(payload.ancho, 300);
    const sourceHeight = toNumber(payload.alto, 300);
    const width = incomingWidth ?? Math.min(isMobile ? 260 : 320, sourceWidth);
    const ratio = sourceWidth > 0 ? sourceHeight / sourceWidth : 1;
    const height = incomingHeight ?? Math.max(40, Math.round(width * ratio));
    const x = incomingX ?? Math.round((CANVAS_WIDTH - width) / 2);
    const y = incomingY ?? 120;
    next = {
      ...next,
      x,
      y,
      width,
      height,
    };
  } else if (tipo === "galeria") {
    const rows = Math.max(1, toNumber(payload.rows, 2));
    const cols = Math.max(1, toNumber(payload.cols, 2));
    const gap = Math.max(0, toNumber(payload.gap, 8));
    const widthPct = clamp(
      toNumber(payload.widthPct, isMobile ? 92 : 70),
      10,
      100
    );
    const width = incomingWidth ?? (CANVAS_WIDTH * widthPct) / 100;
    const height =
      incomingHeight ??
      calcGalleryHeight({
        width,
        rows,
        cols,
        gap,
        ratio: payload.ratio,
      });
    const x = incomingX ?? Math.round((CANVAS_WIDTH - width) / 2);
    const y = incomingY ?? 120;
    next = {
      ...next,
      rows,
      cols,
      gap,
      widthPct,
      x,
      y,
      width,
      height,
    };
  } else if (tipo === "countdown") {
    const presetProps = payload.presetProps || payload.props || {};
    const width = incomingWidth ?? calcCountdownInitialWidth(presetProps);
    const height = incomingHeight ?? calcCountdownInitialHeight(presetProps);
    const x = incomingX ?? Math.round((CANVAS_WIDTH - width) / 2);
    const y = incomingY ?? 140;
    next = {
      ...next,
      x,
      y,
      width,
      height,
      fechaObjetivo: payload.fechaObjetivo || payload.targetISO || payload.fechaISO,
      ...presetProps,
    };
  } else if (tipo === "rsvp-boton") {
    const width = incomingWidth ?? 200;
    const height = incomingHeight ?? 50;
    const x = incomingX ?? Math.round((CANVAS_WIDTH - width) / 2);
    const y = incomingY ?? 140;
    const hasVisualConfig = [
      "rsvpStyleId",
      "fillMode",
      "gradientFrom",
      "gradientTo",
      "color",
      "colorTexto",
      "strokeColor",
      "strokeWidth",
      "shadowColor",
      "shadowBlur",
      "shadowOffsetY",
    ].some((key) => typeof payload[key] !== "undefined");
    const stylePatch = hasVisualConfig
      ? {}
      : createRsvpButtonStylePatch(MIDNIGHT_RSVP_BUTTON_STYLE_ID);

    next = {
      ...next,
      ...stylePatch,
      motionEffect: sanitizeMotionEffect(payload.motionEffect || "rsvp"),
      x,
      y,
      width,
      height,
      ancho: width,
      alto: height,
      cornerRadius: Number.isFinite(payload.cornerRadius) ? payload.cornerRadius : 8,
    };
  } else {
    next = {
      ...next,
      x: incomingX ?? 100,
      y: incomingY ?? 120,
    };
  }

  if (Number.isFinite(next.width)) {
    next.x = clamp(toNumber(next.x, 0), 0, Math.max(0, CANVAS_WIDTH - next.width));
  } else {
    next.x = clamp(toNumber(next.x, 0), 0, CANVAS_WIDTH);
  }
  next.y = Math.max(0, toNumber(next.y, 0));

  const seccion = secciones.find((s) => s.id === targetSeccionId);
  if (normalizarAltoModo?.(seccion?.altoModo) === "pantalla") {
    const yPx = Number.isFinite(next.y) ? next.y : 0;
    next.yNorm = Math.max(0, Math.min(1, yPx / ALTURA_PANTALLA_EDITOR));
  }

  const {
    variant: _variant,
    presetProps: _presetProps,
    targetISO: _targetISO,
    ...persistable
  } = next;

  return stripUndefined(persistable);
}





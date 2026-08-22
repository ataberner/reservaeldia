import { sanitizeMotionEffect } from "@/domain/motionEffects";
import {
  resolveCountdownBoundsXWithinCanvas,
} from "@/domain/countdownPresets/frameGeometry";
import {
  resolveCountdownInsertGeometry,
} from "@/domain/countdownPresets/effectiveGeometry";
import { recordCountdownAuditSnapshot } from "@/domain/countdownAudit/runtime";
import { applyGalleryLayoutPresetToRenderObject } from "@/domain/gallery/galleryLayoutPresets";
import { resolveTextInsertAlignment } from "@/domain/elements/insertions";
import {
  MIDNIGHT_RSVP_BUTTON_STYLE_ID,
  createRsvpButtonStylePatch,
} from "@/domain/rsvp/buttonStyles";
import { resolveCountdownTargetIso } from "../../../../shared/renderContractPolicy.js";

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

export { resolveCountdownInsertGeometry };

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
  let countdownSelectionBounds = null;

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
      width: incomingWidth ?? 260, // cambiá 260 para probar
      __autoWidth: payload.__autoWidth ?? false,
      textWrapMode: payload.textWrapMode ?? "word",
      align: resolveTextInsertAlignment(payload.align),
      ...(Number.isFinite(Number(payload.lineHeight))
        ? { lineHeight: Number(payload.lineHeight) }
        : {}),
      ...(Number.isFinite(Number(payload.letterSpacing))
        ? { letterSpacing: Number(payload.letterSpacing) }
        : {}),
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
    const x = incomingX ?? Math.round((CANVAS_WIDTH - width) / 2);
    const y = incomingY ?? 120;
    const galleryBase = {
      ...next,
      rows,
      cols,
      gap,
      widthPct,
      x,
      y,
      width,
    };
    const renderedGallery = applyGalleryLayoutPresetToRenderObject(galleryBase);
    const renderedRows = Math.max(1, toNumber(renderedGallery.rows, rows));
    const renderedCols = Math.max(1, toNumber(renderedGallery.cols, cols));
    const height =
      incomingHeight ??
      toNumber(renderedGallery.height) ??
      calcGalleryHeight({
        width,
        rows: renderedRows,
        cols: renderedCols,
        gap,
        ratio: renderedGallery.ratio || payload.ratio,
      });
    next = {
      ...galleryBase,
      ...renderedGallery,
      rows: renderedRows,
      cols: renderedCols,
      height,
    };
  } else if (tipo === "countdown") {
    const presetProps = payload.presetProps || payload.props || {};
    const countdownTarget = resolveCountdownTargetIso(payload);
    const countdownGeometry = resolveCountdownInsertGeometry(presetProps, {
      width: incomingWidth,
      height: incomingHeight,
    });
    const width = countdownGeometry.width;
    const height = countdownGeometry.height;
    countdownSelectionBounds = countdownGeometry.selectionBounds;
    const x =
      incomingX ??
      resolveCountdownBoundsXWithinCanvas({
        bounds: countdownSelectionBounds,
        canvasWidth: CANVAS_WIDTH,
      });
    const y = incomingY ?? 140;
    next = {
      ...next,
      x,
      y,
      width,
      height,
      fechaObjetivo: countdownTarget.targetISO,
      ...presetProps,
      mostrarCuentaRegresiva: payload.mostrarCuentaRegresiva !== false,
    };
  } else if (tipo === "rsvp-boton" || tipo === "regalo-boton") {
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
  } else if (tipo === "mapa-google") {
    const width = Math.max(200, incomingWidth ?? 361);
    const height = Math.max(200, incomingHeight ?? 220);
    const x = incomingX ?? Math.round((CANVAS_WIDTH - width) / 2);
    const y = incomingY ?? 140;
    next = {
      ...next,
      x,
      y,
      width,
      height,
      mostrarMapa: payload.mostrarMapa === true,
      googlePlaceId: payload.googlePlaceId ?? "",
      googleDisplayName: payload.googleDisplayName ?? "",
      googleFormattedAddress: payload.googleFormattedAddress ?? "",
      googleLat: Number.isFinite(Number(payload.googleLat))
        ? Number(payload.googleLat)
        : null,
      googleLng: Number.isFinite(Number(payload.googleLng))
        ? Number(payload.googleLng)
        : null,
    };
  } else {
    next = {
      ...next,
      x: incomingX ?? 100,
      y: incomingY ?? 120,
    };
  }

  if (next.tipo === "countdown" && countdownSelectionBounds) {
    next.x = resolveCountdownBoundsXWithinCanvas({
      bounds: countdownSelectionBounds,
      canvasWidth: CANVAS_WIDTH,
      preferredCenterX:
        toNumber(next.x, 0) +
        countdownSelectionBounds.x +
        countdownSelectionBounds.width / 2,
    });
  } else if (Number.isFinite(next.width)) {
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

  if (persistable?.tipo === "countdown") {
    recordCountdownAuditSnapshot({
      countdown: persistable,
      stage: "canvas-insert-defaults",
      renderer: "persisted-document",
      sourceDocument: "compute-insert-defaults",
      viewport: "editor",
      wrapperScale: 1,
      usesRasterThumbnail: false,
      altoModo: seccion?.altoModo || "",
      sourceLabel: "insert-defaults",
    });
  }

  return stripUndefined(persistable);
}





// components/MiniToolbarTabTexto.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { normalizeInvitationType } from "@/domain/invitationTypes";
import {
  resolveStoryTextSidebarBinding,
  STORY_TEXT_FIELD_KEY,
  STORY_TEXT_SIDEBAR_TITLE,
} from "@/domain/templates/storyText";
import { useTextPresetCatalog } from "@/hooks/useTextPresetCatalog";
import { EDITOR_BRIDGE_EVENTS } from "@/lib/editorBridgeContracts";
import {
  readCanvasEditorMethod,
  readEditorActiveSectionId,
  readEditorInvitationType,
  readEditorObjects,
} from "@/lib/editorRuntimeBridge";

const storyTitleClass =
  "m-0 block w-full text-left font-['Source_Sans_Pro',sans-serif] text-[16px] font-semibold leading-[20px] tracking-[0px] text-[#262626]";
const storyTextareaClass =
  "mt-1.5 block min-h-[112px] w-full resize-y rounded-md bg-white px-3 py-2 font-['Source_Sans_Pro',sans-serif] text-[13px] font-normal leading-[18px] text-[#262626] outline-none [border:1px_solid_var(--Border,#00000029)] focus:[border-color:#692B9A]";

function normalizeTextProps(item = {}) {
  const fontSize = Number(item.fontSize ?? item.size ?? 24);
  const align = String(item.align || item.textAlign || item.alignment || item.alineacion || "left").toLowerCase();
  const color = item.color ?? item.fill ?? item.colorTexto ?? item.textColor ?? "#000000";

  const lineHeight =
    typeof item.lineHeight === "number" && item.lineHeight > 0
      ? item.lineHeight
      : typeof item.lineHeightPx === "number" && fontSize > 0
        ? item.lineHeightPx / fontSize
        : 1.2;

  const letterSpacing = Number.isFinite(Number(item.letterSpacing))
    ? Number(item.letterSpacing)
    : 0;

  return {
    fontSize,
    fontFamily: item.fontFamily ?? item.font ?? "sans-serif",
    fontWeight: item.fontWeight ?? item.weight ?? "normal",
    fontStyle: item.italic === true ? "italic" : item.fontStyle ?? item.style ?? "normal",
    textDecoration: item.textDecoration ?? item.decoration ?? "none",
    lineHeight,
    align: align === "center" || align === "right" ? align : "left",
    color,
    fill: color,
    colorTexto: color,
    width: item.width ?? undefined,
    letterSpacing,
  };
}

function getSeccionDestino(explicitId) {
  if (explicitId) return explicitId;
  if (typeof window === "undefined") return null;
  return readEditorActiveSectionId();
}

let measureCtx = null;
function getMeasureCtx() {
  if (typeof document === "undefined") return null;
  if (measureCtx) return measureCtx;
  const canvas = document.createElement("canvas");
  measureCtx = canvas.getContext("2d");
  return measureCtx;
}

function buildFontString({ fontStyle = "normal", fontWeight = "normal", fontSize = 24, fontFamily = "sans-serif" }) {
  const style = fontStyle && fontStyle !== "normal" ? `${fontStyle} ` : "";
  const weight = fontWeight && fontWeight !== "normal" ? `${fontWeight} ` : "";
  return `${style}${weight}${Number(fontSize)}px ${fontFamily}`;
}

function measureTextWidth(texto, fontDesc, letterSpacing = 0) {
  const ctx = getMeasureCtx();
  const safeText = String(texto ?? "").replace(/\r\n/g, "\n");
  const safeSize = Number(fontDesc?.fontSize) || 24;
  const safeSpacing = Number(letterSpacing) || 0;
  const lines = safeText.split("\n");
  if (!ctx) {
    return Math.max(
      ...lines.map((line) => {
        const safeLine = String(line || "");
        return safeLine.length * (safeSize * 0.56) + Math.max(0, safeLine.length - 1) * safeSpacing;
      }),
      0
    );
  }
  ctx.font = buildFontString(fontDesc);
  const width = Math.max(
    ...lines.map((line) => {
      const safeLine = String(line || "");
      const base = ctx.measureText(safeLine).width;
      const spacingExtra = Math.max(0, safeLine.length - 1) * safeSpacing;
      return base + spacingExtra;
    }),
    0
  );
  return Math.ceil(width);
}

function getCurrentInvitationType() {
  if (typeof window === "undefined") return "general";

  const direct = readEditorInvitationType() || "general";

  return normalizeInvitationType(direct);
}

function readTemplateAuthoringSnapshot(targetWindow) {
  if (typeof window === "undefined" && !targetWindow) return {};
  const getTemplateAuthoringSnapshot = readCanvasEditorMethod(
    "getTemplateAuthoringSnapshot",
    targetWindow
  );
  return typeof getTemplateAuthoringSnapshot === "function"
    ? getTemplateAuthoringSnapshot()
    : {};
}

function readStoryTextState(targetWindow) {
  const authoringSnapshot = readTemplateAuthoringSnapshot(targetWindow);
  return resolveStoryTextSidebarBinding({
    fieldsSchema: authoringSnapshot?.fieldsSchema,
    defaults: authoringSnapshot?.defaults,
    objetos: readEditorObjects(targetWindow),
  });
}

function readInitialStoryTextState() {
  if (typeof window === "undefined") return readStoryTextState();
  return readStoryTextState(window);
}

function updateLinkedStoryTextDefault(fieldKey, value) {
  if (typeof window === "undefined" || !fieldKey) return;
  const updateDefault = readCanvasEditorMethod("updateTemplateAuthoringDefault");
  if (typeof updateDefault !== "function") return;

  void Promise.resolve(
    updateDefault(fieldKey, String(value ?? ""), { applyTargets: true })
  ).catch((error) => {
    console.error("No se pudo actualizar Texto historia.", error);
  });
}

function scrollToStoryTextTarget() {
  if (typeof window === "undefined") return false;
  const scrollToTarget = readCanvasEditorMethod("scrollToDynamicFieldTarget");
  if (typeof scrollToTarget !== "function") return false;
  return scrollToTarget(STORY_TEXT_FIELD_KEY);
}

function selectSidebarFieldText(event) {
  const target = event?.currentTarget;
  if (!target) return;

  if (typeof target.select === "function") {
    try {
      target.select();
      return;
    } catch {
      // Ignore controls that reject programmatic text selection.
    }
  }

  if (typeof target.setSelectionRange !== "function") return;
  try {
    target.setSelectionRange(0, String(target.value ?? "").length);
  } catch {
    // Ignore controls that reject programmatic text selection.
  }
}

function resolvePresetItems(preset) {
  if (Array.isArray(preset?.items) && preset.items.length > 0) return preset.items;
  if (Array.isArray(preset?.objetos) && preset.objetos.length > 0) return preset.objetos;
  if (Array.isArray(preset?.elements) && preset.elements.length > 0) return preset.elements;
  if (Array.isArray(preset?.legacyItems) && preset.legacyItems.length > 0) return preset.legacyItems;
  return [];
}

function buildPresetPreviewLayout(preset, maxItems = 3) {
  const items = resolvePresetItems(preset).slice(0, maxItems);
  if (!items.length) {
    return {
      items: [],
      minX: 0,
      minY: 0,
      width: 1,
      height: 1,
      scale: 1,
    };
  }

  const positioned = items.map((rawItem, index) => {
    const norm = normalizeTextProps(rawItem);
    const text = rawItem?.uppercase === true
      ? String(rawItem.texto || "").toUpperCase()
      : String(rawItem?.texto || "");
    const width = Math.max(18, measureTextWidth(text, {
      fontStyle: norm.fontStyle,
      fontWeight: norm.fontWeight,
      fontSize: norm.fontSize,
      fontFamily: norm.fontFamily,
    }, norm.letterSpacing));
    const linesCount = Math.max(1, text.split(/\r?\n/).length);
    const height = Math.max(norm.fontSize, norm.fontSize * norm.lineHeight * linesCount);
    const x = Number.isFinite(Number(rawItem.x)) ? Number(rawItem.x) : 0;
    const y = Number.isFinite(Number(rawItem.y))
      ? Number(rawItem.y)
      : Number.isFinite(Number(rawItem.dy))
        ? Number(rawItem.dy)
        : index * (norm.fontSize + 6);

    const left = norm.align === "center" ? x - width / 2 : norm.align === "right" ? x - width : x;
    const right = left + width;

    return {
      key: `${preset?.id || "preset"}-preview-${index}`,
      text,
      norm,
      left,
      right,
      y,
      width,
      height,
    };
  });

  const minX = positioned.reduce((acc, item) => Math.min(acc, item.left), Number.POSITIVE_INFINITY);
  const minY = positioned.reduce((acc, item) => Math.min(acc, item.y), Number.POSITIVE_INFINITY);
  const maxX = positioned.reduce((acc, item) => Math.max(acc, item.right), Number.NEGATIVE_INFINITY);
  const maxY = positioned.reduce((acc, item) => Math.max(acc, item.y + item.height), Number.NEGATIVE_INFINITY);

  const safeMinX = Number.isFinite(minX) ? minX : 0;
  const safeMinY = Number.isFinite(minY) ? minY : 0;
  const width = Math.max(1, (Number.isFinite(maxX) ? maxX : 1) - safeMinX);
  const height = Math.max(1, (Number.isFinite(maxY) ? maxY : 1) - safeMinY);
  const maxPreviewWidth = 212;
  const maxPreviewHeight = 78;
  const scale = Math.min(1, maxPreviewWidth / width, maxPreviewHeight / height);

  return {
    items: positioned,
    minX: safeMinX,
    minY: safeMinY,
    width,
    height,
    scale,
  };
}

function insertarPresetTexto(preset, seccionActivaId) {
  const seccionId = getSeccionDestino(seccionActivaId);
  if (!seccionId) {
    alert("No hay secciones aun. Crea una seccion para insertar el preset.");
    return;
  }

  const items = resolvePresetItems(preset);
  if (!items.length) return;

  const metrics = items.map((item) => {
    const normalized = normalizeTextProps(item);
    const textRaw = String(item.texto ?? "");
    const text = item.uppercase === true ? textRaw.toUpperCase() : textRaw;
    const width = measureTextWidth(text, {
      fontStyle: normalized.fontStyle,
      fontWeight: normalized.fontWeight,
      fontSize: normalized.fontSize,
      fontFamily: normalized.fontFamily,
    }, normalized.letterSpacing);

    const x = Number.isFinite(Number(item.x)) ? Number(item.x) : 0;
    const y = Number.isFinite(Number(item.y))
      ? Number(item.y)
      : Number.isFinite(Number(item.dy))
        ? Number(item.dy)
        : 0;

    return {
      item,
      normalized,
      text,
      width,
      x,
      y,
    };
  });

  const minX = metrics.reduce((acc, current) => Math.min(acc, current.x), Number.POSITIVE_INFINITY);
  const minY = metrics.reduce((acc, current) => Math.min(acc, current.y), Number.POSITIVE_INFINITY);
  const safeMinX = Number.isFinite(minX) ? minX : 0;
  const safeMinY = Number.isFinite(minY) ? minY : 0;

  const anchorX = Number.isFinite(Number(preset?.insertX))
    ? Number(preset.insertX)
    : Number.isFinite(Number(preset?.centerX))
      ? Number(preset.centerX)
      : 300;

  const anchorY = Number.isFinite(Number(preset?.insertY))
    ? Number(preset.insertY)
    : Number.isFinite(Number(preset?.baseY))
      ? Number(preset.baseY)
      : 120;

  metrics.forEach((entry, index) => {
    const baseX = anchorX + (entry.x - safeMinX);
    const baseY = anchorY + (entry.y - safeMinY);

    let x = baseX;
    if (entry.normalized.align === "center") {
      x = Math.round(baseX - entry.width / 2);
    } else if (entry.normalized.align === "right") {
      x = Math.round(baseX - entry.width);
    }

    const detail = {
      id: `texto-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      tipo: "texto",
      texto: entry.text,
      x,
      y: Math.round(baseY),
      fontSize: entry.normalized.fontSize,
      fontFamily: entry.normalized.fontFamily,
      fontWeight: entry.normalized.fontWeight,
      fontStyle: entry.normalized.fontStyle,
      textDecoration: entry.normalized.textDecoration,
      lineHeight: entry.normalized.lineHeight,
      letterSpacing: entry.normalized.letterSpacing,
      color: entry.normalized.color,
      colorTexto: entry.normalized.color,
      fill: entry.normalized.fill,
      align: entry.normalized.align,
      width: undefined,
      rotation: entry.item.rotation ?? 0,
      scaleX: entry.item.scaleX ?? 1,
      scaleY: entry.item.scaleY ?? 1,
      seccionId,
    };

    window.dispatchEvent(new CustomEvent("insertar-elemento", { detail }));
  });
}

export default function MiniToolbarTabTexto({
  onAgregarTitulo,
  onAgregarSubtitulo,
  onAgregarParrafo,
  seccionActivaId,
  simplifiedForAssistant = false,
}) {
  const [invitationType, setInvitationType] = useState(getCurrentInvitationType);
  const [storyTextState, setStoryTextState] = useState(readInitialStoryTextState);
  const [storyTextValue, setStoryTextValue] = useState(() => storyTextState.value);
  const editingStoryTextRef = useRef(false);
  const {
    items: textPresets,
    loading,
    error,
    usingFallback,
  } = useTextPresetCatalog(invitationType);

  useEffect(() => {
    const sync = () => setInvitationType(getCurrentInvitationType());
    sync();

    window.addEventListener("editor-tipo-invitacion", sync);
    window.addEventListener("abrir-borrador", sync);
    return () => {
      window.removeEventListener("editor-tipo-invitacion", sync);
      window.removeEventListener("abrir-borrador", sync);
    };
  }, []);

  const syncStoryTextState = useCallback(() => {
    const nextState = readStoryTextState(window);
    setStoryTextState(nextState);
    if (!editingStoryTextRef.current) {
      setStoryTextValue(nextState.value);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    syncStoryTextState();
    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
      syncStoryTextState
    );
    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
      syncStoryTextState
    );

    return () => {
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
        syncStoryTextState
      );
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
        syncStoryTextState
      );
    };
  }, [syncStoryTextState]);

  const handleStoryTextChange = (event) => {
    const nextValue = event.target.value;
    setStoryTextValue(nextValue);
    if (!storyTextState.fieldKey) return;
    updateLinkedStoryTextDefault(storyTextState.fieldKey, nextValue);
  };

  useEffect(() => {
    const fonts = new Set();
    (Array.isArray(textPresets) ? textPresets : []).forEach((preset) => {
      resolvePresetItems(preset).forEach((item) => {
        const family = String(item?.fontFamily ?? item?.font ?? "").trim();
        if (family) fonts.add(family);
      });
    });

    if (!fonts.size) return;
    let active = true;
    void import("@/utils/fontManager")
      .then(({ fontManager }) => {
        if (!active) return;
        return fontManager.loadFonts([...fonts]);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [textPresets]);

  const storyTextSection = storyTextState.hasBinding ? (
    <section className={simplifiedForAssistant ? "w-full" : "-mt-1 md:-mt-1.5 w-full"}>
      <h3 className={storyTitleClass}>{STORY_TEXT_SIDEBAR_TITLE}</h3>
      <textarea
        value={storyTextValue}
        onFocus={(event) => {
          editingStoryTextRef.current = true;
          selectSidebarFieldText(event);
          scrollToStoryTextTarget();
        }}
        onChange={handleStoryTextChange}
        onBlur={() => {
          editingStoryTextRef.current = false;
        }}
        aria-label={STORY_TEXT_SIDEBAR_TITLE}
        className={storyTextareaClass}
      />
    </section>
  ) : null;

  if (simplifiedForAssistant) {
    return (
      <div className="flex flex-col gap-1.5 flex-1 min-h-0">
        {storyTextSection}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 md:gap-1.5 flex-1 min-h-[280px]">
      <button
        onClick={onAgregarTitulo}
        className="w-full px-3 py-1.5 text-sm md:px-4 md:py-2 md:text-base rounded-lg border border-zinc-300
         bg-white text-zinc-800 font-semibold text-center
         hover:bg-purple-100 hover:border-purple-500 hover:text-purple-700
         hover:shadow-md transition-all"
      >
        Anadir titulo
      </button>

      <button
        onClick={onAgregarSubtitulo}
        className="w-full px-3 py-1.5 text-sm md:px-4 md:py-2 md:text-base rounded-lg border border-zinc-300
         bg-white text-zinc-700 font-medium text-center
         hover:bg-purple-100 hover:border-purple-500 hover:text-purple-700
         hover:shadow-md transition-all"
      >
        Anadir subtitulo
      </button>

      <button
        onClick={onAgregarParrafo}
        className="w-full px-3 py-1.5 text-sm md:px-4 md:py-2 md:text-base rounded-lg border border-zinc-300
         bg-white text-zinc-600 text-center
         hover:bg-purple-100 hover:border-purple-500 hover:text-purple-700
         hover:shadow-md transition-all"
      >
        Anadir parrafo
      </button>

      {storyTextSection}

      <div className="flex-1 min-h-[220px] overflow-y-auto pr-1">
        <div className="flex flex-col gap-2">
          {loading && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 text-[11px] text-zinc-600">
              Cargando presets de texto...
            </div>
          )}

          {!loading && error ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-700">
              {usingFallback ? "Mostrando presets legacy en fallback." : error}
            </div>
          ) : null}

          {!loading && (!Array.isArray(textPresets) || textPresets.length === 0) ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-2 py-3 text-center text-[11px] text-zinc-600">
              No hay combinaciones disponibles para esta categoria.
            </div>
          ) : null}

          {textPresets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => insertarPresetTexto(preset, seccionActivaId)}
              aria-label={`Insertar preset ${preset.nombre || preset.id || "texto"}`}
              title={preset.nombre || preset.id || "Preset de texto"}
              className="group relative w-full min-h-[104px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-white via-zinc-50 to-zinc-100/80 p-2 text-left ring-1 ring-zinc-200/90 transition-all hover:-translate-y-[1px] hover:ring-zinc-300 hover:shadow-md active:translate-y-0 active:shadow-sm"
            >
              {(() => {
                const preview = buildPresetPreviewLayout(preset, 3);

                return (
                  <div className="relative h-[84px] overflow-hidden rounded-lg bg-gradient-to-br from-zinc-900/5 via-zinc-800/10 to-zinc-900/5">
                    <div
                      className="absolute left-1/2 top-1/2"
                      style={{
                        width: preview.width,
                        height: preview.height,
                        transform: `translate(-50%, -50%) scale(${preview.scale})`,
                        transformOrigin: "center",
                      }}
                    >
                      {preview.items.map((entry) => (
                        <div
                          key={entry.key}
                          className="absolute whitespace-pre"
                          style={{
                            left: entry.left - preview.minX,
                            top: entry.y - preview.minY,
                            width: entry.width,
                            fontFamily: entry.norm.fontFamily,
                            fontSize: entry.norm.fontSize,
                            color: entry.norm.color,
                            fontWeight: entry.norm.fontWeight,
                            fontStyle: entry.norm.fontStyle,
                            textDecoration: entry.norm.textDecoration,
                            lineHeight: entry.norm.lineHeight,
                            letterSpacing: entry.norm.letterSpacing,
                            textAlign: entry.norm.align,
                            textShadow: "0 0.5px 0.5px rgba(255,255,255,0.25)",
                          }}
                        >
                          {entry.text || " "}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

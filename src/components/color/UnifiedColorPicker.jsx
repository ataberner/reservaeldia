import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChromePicker } from "react-color";
import { Pipette } from "lucide-react";
import {
  GRADIENT_COLOR_PRESETS,
  SOLID_COLOR_PRESETS,
  parseLinearGradientColors,
  resolveSolidPickerValue,
  toCssBackground,
} from "@/domain/colors/presets";

const UNSAFE_CSS_TOKEN = /[<>;]/;
const UNSAFE_CSS_PATTERN = /(url\s*\(|javascript:|expression\s*\()/i;
const SAFE_CSS_VALUE = /^[#(),.%\-+\s\w:/]*$/i;
const DIRECTION_TO_DEG = Object.freeze({
  "to top": 0,
  "to top right": 45,
  "to right top": 45,
  "to right": 90,
  "to bottom right": 135,
  "to right bottom": 135,
  "to bottom": 180,
  "to bottom left": 225,
  "to left bottom": 225,
  "to left": 270,
  "to top left": 315,
  "to left top": 315,
});

function normalizeComparableValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isCssPaintValid(value) {
  const safe = String(value || "").trim();
  if (!safe) return false;
  if (UNSAFE_CSS_TOKEN.test(safe) || UNSAFE_CSS_PATTERN.test(safe)) return false;
  if (!SAFE_CSS_VALUE.test(safe)) return false;

  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    return CSS.supports("color", safe) || CSS.supports("background", safe);
  }

  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(safe) ||
    /^rgba?\([^)]+\)$/i.test(safe) ||
    /^hsla?\([^)]+\)$/i.test(safe) ||
    /^linear-gradient\([^)]+\)$/i.test(safe);
}

function parseGradientAngle(value, fallback = 135) {
  const safe = String(value || "").trim().toLowerCase();
  const angleMatch = safe.match(/linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,/i);
  if (angleMatch) {
    const parsed = Number(angleMatch[1]);
    if (Number.isFinite(parsed)) {
      const normalized = ((parsed % 360) + 360) % 360;
      return Math.round(normalized);
    }
  }

  const directionMatch = safe.match(/linear-gradient\(\s*(to\s+[a-z\s]+)\s*,/i);
  if (directionMatch) {
    const direction = String(directionMatch[1] || "").trim().toLowerCase();
    if (direction in DIRECTION_TO_DEG) return DIRECTION_TO_DEG[direction];
  }

  return fallback;
}

function buildGradientValue(angle, from, to) {
  const safeAngle = clampNumber(angle, 0, 360, 135);
  const fromSafe = String(from || "#773dbe").trim() || "#773dbe";
  const toSafe = String(to || "#ec4899").trim() || "#ec4899";
  return `linear-gradient(${safeAngle}deg, ${fromSafe} 0%, ${toSafe} 100%)`;
}

function formatPickerColor(nextColor, fallbackColor) {
  const rgb = nextColor?.rgb || {};
  const alpha = Number.isFinite(rgb.a) ? Number(rgb.a) : 1;
  if (alpha >= 0.999) {
    return String(nextColor?.hex || fallbackColor);
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Number(alpha.toFixed(3))})`;
}

export default function UnifiedColorPicker({
  value,
  onChange,
  disabled = false,
  title = "Cambiar color",
  triggerClassName = "",
  panelWidth = 264,
  fallbackColor = "#ffffff",
  showGradients = true,
  showEyeDropper = true,
  solidPresets = SOLID_COLOR_PRESETS,
  gradientPresets = GRADIENT_COLOR_PRESETS,
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("solid");
  const [pickerSolidColor, setPickerSolidColor] = useState(
    resolveSolidPickerValue(value, fallbackColor)
  );
  const [activeStop, setActiveStop] = useState("from");
  const [gradientFrom, setGradientFrom] = useState("#773dbe");
  const [gradientTo, setGradientTo] = useState("#ec4899");
  const [gradientAngle, setGradientAngle] = useState(135);
  const [manualValue, setManualValue] = useState(String(value || "").trim() || fallbackColor);
  const [panelPosition, setPanelPosition] = useState({
    top: 0,
    left: 0,
    ready: false,
  });

  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const currentBackground = useMemo(
    () => toCssBackground(value, fallbackColor),
    [value, fallbackColor]
  );

  const comparableCurrentValue = useMemo(
    () => normalizeComparableValue(value),
    [value]
  );

  const isManualValid = useMemo(() => isCssPaintValid(manualValue), [manualValue]);

  const syncGradientDraftFromValue = useCallback((nextValue) => {
    const gradient = parseLinearGradientColors(nextValue);
    if (!gradient) return false;
    setGradientFrom(String(gradient.from || "#773dbe"));
    setGradientTo(String(gradient.to || "#ec4899"));
    setGradientAngle(parseGradientAngle(nextValue, 135));
    return true;
  }, []);

  useEffect(() => {
    setPickerSolidColor(resolveSolidPickerValue(value, fallbackColor));
    setManualValue(String(value || "").trim() || fallbackColor);
    const hasGradient = syncGradientDraftFromValue(value);
    if (showGradients && hasGradient) {
      setMode("gradient");
      return;
    }
    if (!showGradients) {
      setMode("solid");
    }
  }, [value, fallbackColor, showGradients, syncGradientDraftFromValue]);

  useEffect(() => {
    if (!showGradients && mode === "gradient") {
      setMode("solid");
    }
  }, [showGradients, mode]);

  useEffect(() => {
    if (!open) return undefined;

    const handleOutsideClick = (event) => {
      const clickedInsideRoot = rootRef.current?.contains(event.target);
      const clickedInsidePanel = panelRef.current?.contains(event.target);
      if (!clickedInsideRoot && !clickedInsidePanel) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  const updatePanelPosition = useCallback(() => {
    if (!open || typeof window === "undefined") return;

    const triggerNode = triggerRef.current;
    const panelNode = panelRef.current;
    if (!triggerNode || !panelNode) return;

    const viewportMargin = 8;
    const separation = 10;
    const viewportWidth = Math.max(0, window.innerWidth || 0);
    const viewportHeight = Math.max(0, window.innerHeight || 0);

    const triggerRect = triggerNode.getBoundingClientRect();
    const panelRect = panelNode.getBoundingClientRect();
    const renderedPanelWidth = Math.max(220, panelRect.width || panelWidth);
    const renderedPanelHeight = Math.max(140, panelRect.height || 360);

    let left = triggerRect.left;
    if (left + renderedPanelWidth > viewportWidth - viewportMargin) {
      left = viewportWidth - viewportMargin - renderedPanelWidth;
    }
    if (left < viewportMargin) {
      left = viewportMargin;
    }

    const canOpenBelow =
      triggerRect.bottom + separation + renderedPanelHeight <=
      viewportHeight - viewportMargin;
    const topBelow = Math.min(
      triggerRect.bottom + separation,
      viewportHeight - viewportMargin - renderedPanelHeight
    );
    const topAbove = Math.max(
      viewportMargin,
      triggerRect.top - separation - renderedPanelHeight
    );

    setPanelPosition({
      top: Math.round(canOpenBelow ? topBelow : topAbove),
      left: Math.round(left),
      ready: true,
    });
  }, [open, panelWidth]);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") {
      setPanelPosition((previous) => ({ ...previous, ready: false }));
      return undefined;
    }

    const raf = window.requestAnimationFrame(updatePanelPosition);
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  const applySolidColor = useCallback(
    (nextValue) => {
      if (typeof onChange === "function") {
        onChange(nextValue);
      }
      setManualValue(String(nextValue || "").trim() || fallbackColor);
    },
    [onChange, fallbackColor]
  );

  const applyGradientValue = useCallback(
    (nextGradient) => {
      if (typeof onChange === "function") {
        onChange(nextGradient);
      }
      setManualValue(nextGradient);
    },
    [onChange]
  );

  const applyGradientDraft = useCallback(
    ({ from = gradientFrom, to = gradientTo, angle = gradientAngle }) => {
      const nextGradient = buildGradientValue(angle, from, to);
      applyGradientValue(nextGradient);
    },
    [gradientFrom, gradientTo, gradientAngle, applyGradientValue]
  );

  const handleManualApply = useCallback(() => {
    const candidate = String(manualValue || "").trim();
    if (!isCssPaintValid(candidate)) return;

    const hasGradient = showGradients && Boolean(parseLinearGradientColors(candidate));
    if (hasGradient) {
      syncGradientDraftFromValue(candidate);
      setMode("gradient");
      applyGradientValue(candidate);
      return;
    }

    setMode("solid");
    setPickerSolidColor(resolveSolidPickerValue(candidate, fallbackColor));
    applySolidColor(candidate);
  }, [
    manualValue,
    showGradients,
    syncGradientDraftFromValue,
    applyGradientValue,
    fallbackColor,
    applySolidColor,
  ]);

  const eyedropperEnabled =
    showEyeDropper &&
    typeof window !== "undefined" &&
    "EyeDropper" in window;

  const gradientPreviewValue = useMemo(
    () => buildGradientValue(gradientAngle, gradientFrom, gradientTo),
    [gradientAngle, gradientFrom, gradientTo]
  );

  const pickerColor =
    mode === "gradient"
      ? activeStop === "from"
        ? gradientFrom
        : gradientTo
      : pickerSolidColor;

  const panel = (
    <div
      ref={panelRef}
      className="fixed z-[130]"
      style={{
        top: `${panelPosition.top}px`,
        left: `${panelPosition.left}px`,
        width: `${panelWidth}px`,
        maxWidth: "calc(100vw - 16px)",
        visibility: panelPosition.ready ? "visible" : "hidden",
      }}
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="h-8 w-8 shrink-0 rounded-lg border border-slate-300"
            style={{ background: currentBackground }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-slate-800">
              {title}
            </p>
            <p
              className="truncate text-[10px] text-slate-500"
              title={String(value || "").trim() || fallbackColor}
            >
              {String(value || "").trim() || fallbackColor}
            </p>
          </div>
        </div>

        {showGradients ? (
          <div className="mb-2 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setMode("solid")}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                mode === "solid"
                  ? "bg-white text-violet-700 shadow-sm"
                  : "text-slate-600 hover:bg-white"
              }`}
            >
              Color
            </button>
            <button
              type="button"
              onClick={() => setMode("gradient")}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                mode === "gradient"
                  ? "bg-white text-violet-700 shadow-sm"
                  : "text-slate-600 hover:bg-white"
              }`}
            >
              Gradiente
            </button>
          </div>
        ) : null}

        {mode === "gradient" && showGradients ? (
          <div className="mb-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div
              className="h-8 w-full rounded-md border border-slate-300"
              style={{ background: gradientPreviewValue }}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setActiveStop("from")}
                className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
                  activeStop === "from"
                    ? "border-violet-300 bg-violet-50 text-violet-700"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                Desde
              </button>
              <button
                type="button"
                onClick={() => setActiveStop("to")}
                className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
                  activeStop === "to"
                    ? "border-violet-300 bg-violet-50 text-violet-700"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                Hacia
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Angulo
              </label>
              <input
                type="range"
                min={0}
                max={360}
                value={gradientAngle}
                onChange={(event) => {
                  const nextAngle = clampNumber(event.target.value, 0, 360, 135);
                  setGradientAngle(nextAngle);
                  applyGradientDraft({ angle: nextAngle });
                }}
                className="h-1.5 flex-1 accent-violet-600"
              />
              <span className="w-10 text-right text-[10px] font-semibold text-slate-600">
                {gradientAngle}deg
              </span>
            </div>
          </div>
        ) : null}

        <ChromePicker
          color={pickerColor}
          disableAlpha={false}
          styles={{
            default: {
              picker: {
                width: "100%",
                boxShadow: "none",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
              },
            },
          }}
          onChange={(nextColor) => {
            const formatted = formatPickerColor(nextColor, fallbackColor);
            if (mode === "gradient" && showGradients) {
              if (activeStop === "from") {
                setGradientFrom(formatted);
              } else {
                setGradientTo(formatted);
              }
              return;
            }
            setPickerSolidColor(formatted);
          }}
          onChangeComplete={(nextColor) => {
            const formatted = formatPickerColor(nextColor, fallbackColor);
            if (mode === "gradient" && showGradients) {
              const nextDraft =
                activeStop === "from"
                  ? { from: formatted }
                  : { to: formatted };
              if (activeStop === "from") {
                setGradientFrom(formatted);
              } else {
                setGradientTo(formatted);
              }
              applyGradientDraft(nextDraft);
              return;
            }
            setPickerSolidColor(formatted);
            applySolidColor(formatted);
          }}
        />

        <div className="mt-2 flex items-center gap-2">
          <input
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleManualApply();
              }
            }}
            placeholder="#773DBE | rgb(119,61,190) | linear-gradient(...)"
            className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-[11px] text-slate-700"
          />
          <button
            type="button"
            disabled={!isManualValid}
            onClick={handleManualApply}
            className="h-8 rounded-md border border-slate-300 px-2 text-[11px] font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Aplicar
          </button>
          {eyedropperEnabled ? (
            <button
              type="button"
              title="Tomar color de la pantalla"
              onClick={async () => {
                try {
                  const eyeDropper = new window.EyeDropper();
                  const result = await eyeDropper.open();
                  if (!result?.sRGBHex) return;

                  if (mode === "gradient" && showGradients) {
                    if (activeStop === "from") {
                      setGradientFrom(result.sRGBHex);
                      applyGradientDraft({ from: result.sRGBHex });
                    } else {
                      setGradientTo(result.sRGBHex);
                      applyGradientDraft({ to: result.sRGBHex });
                    }
                    return;
                  }

                  setPickerSolidColor(result.sRGBHex);
                  applySolidColor(result.sRGBHex);
                } catch {
                  // Ignorar cancelaciones del usuario.
                }
              }}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
            >
              <Pipette className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {solidPresets.length > 0 ? (
          <div className="mt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Colores rapidos
            </div>
            <div className="grid grid-cols-8 gap-1.5">
              {solidPresets.map((preset) => {
                const normalizedPreset = normalizeComparableValue(preset);
                const isActive = comparableCurrentValue === normalizedPreset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setMode("solid");
                      setPickerSolidColor(preset);
                      applySolidColor(preset);
                    }}
                    title={preset}
                    className={`h-6 w-6 rounded-md border transition ${
                      isActive
                        ? "border-violet-500 ring-2 ring-violet-200"
                        : "border-slate-200"
                    }`}
                    style={{ background: preset }}
                  />
                );
              })}
            </div>
          </div>
        ) : null}

        {showGradients && gradientPresets.length > 0 ? (
          <div className="mt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Gradientes
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {gradientPresets.map((gradient) => {
                const isActive =
                  comparableCurrentValue ===
                  normalizeComparableValue(gradient.value);
                return (
                  <button
                    key={gradient.id}
                    type="button"
                    onClick={() => {
                      setMode("gradient");
                      syncGradientDraftFromValue(gradient.value);
                      applyGradientValue(gradient.value);
                    }}
                    title={gradient.label}
                    className={`h-8 rounded-md border px-2 text-left text-[10px] font-semibold text-white shadow-sm transition ${
                      isActive
                        ? "border-violet-500 ring-2 ring-violet-200"
                        : "border-white/40"
                    }`}
                    style={{ background: gradient.value }}
                  >
                    {gradient.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((previous) => !previous)}
        className={`h-7 w-7 rounded-md border border-gray-300 shadow-sm transition ${
          disabled
            ? "cursor-not-allowed bg-gray-200"
            : "hover:-translate-y-[1px]"
        } ${triggerClassName}`}
        style={{ background: currentBackground }}
      />

      {open &&
        (typeof document !== "undefined"
          ? createPortal(panel, document.body)
          : panel)}
    </div>
  );
}

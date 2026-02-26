import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChromePicker } from "react-color";
import { Pipette } from "lucide-react";
import {
  GRADIENT_COLOR_PRESETS,
  SOLID_COLOR_PRESETS,
  resolveSolidPickerValue,
  toCssBackground,
} from "@/domain/colors/presets";

function normalizeComparableValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
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
  const [pickerSolidColor, setPickerSolidColor] = useState(
    resolveSolidPickerValue(value, fallbackColor)
  );
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

  useEffect(() => {
    setPickerSolidColor(resolveSolidPickerValue(value, fallbackColor));
  }, [value, fallbackColor]);

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
    },
    [onChange]
  );

  const applyGradient = useCallback(
    (gradientValue) => {
      if (typeof onChange === "function") {
        onChange(gradientValue);
      }
    },
    [onChange]
  );

  const formatPickerColor = useCallback((nextColor) => {
    const rgb = nextColor?.rgb || {};
    const alpha = Number.isFinite(rgb.a) ? Number(rgb.a) : 1;
    if (alpha >= 0.999) {
      return String(nextColor?.hex || fallbackColor);
    }
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Number(alpha.toFixed(3))})`;
  }, [fallbackColor]);

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
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xl">
        <ChromePicker
          color={pickerSolidColor}
          disableAlpha={false}
          styles={{
            default: {
              picker: {
                width: "100%",
                boxShadow: "none",
              },
            },
          }}
          onChange={(nextColor) => {
            setPickerSolidColor(formatPickerColor(nextColor));
          }}
          onChangeComplete={(nextColor) => {
            applySolidColor(formatPickerColor(nextColor));
          }}
        />

        <div className="mt-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Colores
          </div>
          <div className="grid grid-cols-6 gap-2">
            {showEyeDropper &&
              typeof window !== "undefined" &&
              "EyeDropper" in window && (
                <button
                  type="button"
                  title="Tomar color de la pantalla"
                  onClick={async () => {
                    try {
                      const eyeDropper = new window.EyeDropper();
                      const result = await eyeDropper.open();
                      if (!result?.sRGBHex) return;
                      setPickerSolidColor(result.sRGBHex);
                      applySolidColor(result.sRGBHex);
                    } catch {
                      // Ignorar cancelaciones del usuario.
                    }
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-white text-gray-700 transition hover:-translate-y-[1px] hover:bg-gray-50"
                >
                  <Pipette className="h-4 w-4" />
                </button>
              )}

            {solidPresets.map((preset) => {
              const normalizedPreset = normalizeComparableValue(preset);
              const isActive = comparableCurrentValue === normalizedPreset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applySolidColor(preset)}
                  title={preset}
                  className={`h-7 w-7 rounded border transition hover:-translate-y-[1px] ${
                    isActive
                      ? "border-violet-500 ring-2 ring-violet-200"
                      : "border-gray-200"
                  }`}
                  style={{ background: preset }}
                />
              );
            })}
          </div>
        </div>

        {showGradients && gradientPresets.length > 0 && (
          <div className="mt-3">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Gradientes
            </div>
            <div className="grid grid-cols-2 gap-2">
              {gradientPresets.map((gradient) => {
                const isActive =
                  comparableCurrentValue ===
                  normalizeComparableValue(gradient.value);
                return (
                  <button
                    key={gradient.id}
                    type="button"
                    onClick={() => applyGradient(gradient.value)}
                    title={gradient.label}
                    className={`h-9 rounded-lg border px-2 text-left text-[11px] font-medium text-white shadow-sm transition hover:-translate-y-[1px] ${
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
        )}
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

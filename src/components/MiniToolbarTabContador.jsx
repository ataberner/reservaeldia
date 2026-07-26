// components/MiniToolbarTabContador.jsx
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CountdownPreview from "@/components/editor/countdown/CountdownPreview";
import {
  getCountdownSidebarPanelPresentation,
  getCountdownSidebarPresetPresentation,
} from "@/components/countdownSidebarPresentation";
import {
  COUNTDOWN_SIDEBAR_PREVIEW_HEIGHT_LIMITS,
  resolveCountdownSidebarPreviewFrameDimensions,
  resolveCountdownSidebarPreviewHeight,
  resolveCountdownSidebarPreviewLayout,
  resolveCountdownSidebarPreviewTransform,
} from "@/components/countdownSidebarPreviewLayout";
import { useCountdownPresetCatalog } from "@/hooks/useCountdownPresetCatalog";
import {
  readCanvasEditorMethod,
  readEditorObjectByType,
  readEditorObjects,
} from "@/lib/editorRuntimeBridge";
import {
  buildCountdownTargetIsoFromLocalParts,
  isCountdownVisible,
  splitCountdownTargetIso,
} from "@/domain/eventDetails/countdownEventDetails";
import {
  EVENT_DETAIL_FEATURES,
} from "@/domain/eventDetails/features";
import {
  resolveEventDateSidebarBinding,
} from "@/domain/eventDetails/date";
import {
  resolveEventTimesFromAuthoring,
} from "@/domain/eventDetails/time";
import {
  resolveCountdownTargetIso,
} from "../../shared/renderContractPolicy.js";
import activationStyles from "./MiniToolbarTabRegalos.module.css";

const COUNTDOWN_PREVIEW_SURFACE_CLASS_NAME =
  "rounded-xl bg-[radial-gradient(circle_at_50%_42%,#c9c3d2_0%,#ddd8e2_58%,#ebe7ee_100%)] shadow-[inset_0_0_0_1px_rgba(119,61,190,0.10)]";

function readEventDetailsCountdownTarget(countdown, objetos) {
  const countdownTarget = resolveCountdownTargetIso(countdown || null).targetISO;
  const getTemplateAuthoringSnapshot = readCanvasEditorMethod(
    "getTemplateAuthoringSnapshot"
  );
  const authoringSnapshot =
    typeof getTemplateAuthoringSnapshot === "function"
      ? getTemplateAuthoringSnapshot() || {}
      : {};
  const fieldsSchema = Array.isArray(authoringSnapshot?.fieldsSchema)
    ? authoringSnapshot.fieldsSchema
    : [];
  const defaults =
    authoringSnapshot?.defaults &&
    typeof authoringSnapshot.defaults === "object" &&
    !Array.isArray(authoringSnapshot.defaults)
      ? authoringSnapshot.defaults
      : {};

  const eventDateBinding = resolveEventDateSidebarBinding({
    fieldsSchema,
    defaults,
    objetos,
    feature: EVENT_DETAIL_FEATURES.CEREMONY,
  });
  const eventDateParts = splitCountdownTargetIso(
    eventDateBinding.targetISO || countdownTarget
  );
  const countdownParts = splitCountdownTargetIso(countdownTarget);
  const eventTimes = resolveEventTimesFromAuthoring({
    fieldsSchema,
    defaults,
    fallbackStartTime: eventDateParts.time || countdownParts.time,
    feature: EVENT_DETAIL_FEATURES.CEREMONY,
  });
  const targetFromEventDetails = buildCountdownTargetIsoFromLocalParts({
    date: eventDateParts.date || countdownParts.date,
    time: eventTimes.startTime || eventDateParts.time || countdownParts.time,
  });

  return targetFromEventDetails || countdownTarget;
}

function CountdownPresetThumbnail({
  targetISO,
  preset,
  previewImageUrl,
  previewProps,
}) {
  const viewportRef = useRef(null);
  const livePreviewRef = useRef(null);
  const [loadedFrame, setLoadedFrame] = useState(null);
  const frameDimensions = useMemo(
    () =>
      resolveCountdownSidebarPreviewFrameDimensions({
        preset,
        loadedFrame,
      }),
    [loadedFrame, preset]
  );
  const layoutPreset = useMemo(
    () =>
      frameDimensions.status === "loaded"
        ? {
            ...preset,
            frameIntrinsicWidth: frameDimensions.width,
            frameIntrinsicHeight: frameDimensions.height,
          }
        : preset,
    [frameDimensions, preset]
  );
  const layout = useMemo(
    () => resolveCountdownSidebarPreviewLayout(layoutPreset),
    [layoutPreset]
  );
  const [sizing, setSizing] = useState(null);
  const hasLivePreview = Object.keys(preset || {}).length > 0;
  useLayoutEffect(() => {
    const preview = livePreviewRef.current;
    if (!preview || !frameDimensions.isPng || !frameDimensions.source) {
      return undefined;
    }

    const syncIntrinsicDimensions = (image) => {
      if (image?.tagName !== "IMG") return;
      const imageSource = String(image.getAttribute("src") || "").trim();
      if (
        imageSource !== frameDimensions.source &&
        String(image.currentSrc || "").trim() !== frameDimensions.source
      ) {
        return;
      }

      const width = Number(image.naturalWidth || 0);
      const height = Number(image.naturalHeight || 0);
      if (!(width > 0 && height > 0)) return;

      setLoadedFrame((current) =>
        current?.source === frameDimensions.source &&
        current.width === width &&
        current.height === height
          ? current
          : { source: frameDimensions.source, width, height }
      );
    };
    const handleFrameLoad = (event) => {
      syncIntrinsicDimensions(event.target);
    };

    preview.addEventListener("load", handleFrameLoad, true);
    preview.querySelectorAll("img").forEach((image) => {
      if (image.complete) syncIntrinsicDimensions(image);
    });

    return () => {
      preview.removeEventListener("load", handleFrameLoad, true);
    };
  }, [
    frameDimensions.isPng,
    frameDimensions.source,
  ]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const measure = () => {
      const viewportWidth = viewport.clientWidth;
      if (!(viewportWidth > 0)) return;
      const viewportHeight = resolveCountdownSidebarPreviewHeight({
        availableWidth: viewportWidth,
        layout,
      });
      const transform = resolveCountdownSidebarPreviewTransform({
        viewportWidth,
        viewportHeight,
        layout,
      });
      const nextSizing = {
        viewportHeight,
        ...transform,
      };

      setSizing((current) => {
        if (
          current &&
          Object.keys(nextSizing).every(
            (key) => Math.abs(current[key] - nextSizing[key]) < 0.01
          )
        ) {
          return current;
        }
        return nextSizing;
      });
    };

    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [layout]);

  return (
    <div
      ref={viewportRef}
      aria-hidden="true"
      data-countdown-preview-viewport=""
      data-countdown-preview-surface="unified"
      className={`pointer-events-none flex w-full flex-none items-center justify-center overflow-hidden ${COUNTDOWN_PREVIEW_SURFACE_CLASS_NAME}`}
      style={{
        aspectRatio: sizing ? undefined : layout.viewportAspectRatio,
        height: sizing ? `${sizing.viewportHeight}px` : undefined,
        minHeight: `${COUNTDOWN_SIDEBAR_PREVIEW_HEIGHT_LIMITS.min}px`,
        maxHeight: `${COUNTDOWN_SIDEBAR_PREVIEW_HEIGHT_LIMITS.max}px`,
      }}
    >
      {hasLivePreview ? (
        <div
          ref={livePreviewRef}
          data-countdown-frame-status={frameDimensions.status}
          className="h-full w-full [&>div]:!h-full [&>div]:!items-center [&>div]:!overflow-visible [&>div>div]:!shrink-0"
          style={{
            transform: sizing
              ? `translate3d(${sizing.translateX}px, ${sizing.translateY}px, 0) scale(${sizing.zoom})`
              : undefined,
            transformOrigin: "center",
          }}
        >
          <CountdownPreview
            targetISO={targetISO}
            preset={preset}
            {...previewProps}
          />
        </div>
      ) : previewImageUrl ? (
        <img
          src={previewImageUrl}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="text-[11px] text-zinc-400">Sin preview</div>
      )}
    </div>
  );
}

export default function MiniToolbarTabContador() {
  const {
    items: countdownPresets,
    loading: loadingCountdownPresets,
    error: countdownPresetsError,
    usingFallback,
  } = useCountdownPresetCatalog();

  const [countdownEnBorrador, setCountdownEnBorrador] = useState(null);
  const [countdownTargetISO, setCountdownTargetISO] = useState("");
  const [, setPreviewTick] = useState(0);

  useEffect(() => {
    // Un solo timer compartido evita un intervalo por card en el catalogo.
    const timer = window.setInterval(() => {
      setPreviewTick((prev) => (prev + 1) % 86400);
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncCountdown = () => {
      try {
        const objetos = readEditorObjects();
        const firstCountdown = readEditorObjectByType("countdown");

        setCountdownEnBorrador(firstCountdown);
        setCountdownTargetISO(
          readEventDetailsCountdownTarget(firstCountdown, objetos)
        );
      } catch {
        setCountdownEnBorrador(null);
        setCountdownTargetISO("");
      }
    };

    syncCountdown();
    window.addEventListener("editor-selection-change", syncCountdown);

    return () => {
      window.removeEventListener("editor-selection-change", syncCountdown);
    };
  }, []);

  const sidebarPanelPresentation = useMemo(
    () =>
      getCountdownSidebarPanelPresentation({
        countdownPresetsError,
        usingFallback,
      }),
    [countdownPresetsError, usingFallback]
  );

  const selectedPresetId = useMemo(
    () => String(countdownEnBorrador?.presetId || "").trim(),
    [countdownEnBorrador?.presetId]
  );
  const isCountdownActive = countdownEnBorrador
    ? isCountdownVisible(countdownEnBorrador)
    : false;

  const handleCountdownVisibilityToggle = () => {
    const countdownId = countdownEnBorrador?.id;
    if (!countdownId) return;

    const mostrarCuentaRegresiva = !isCountdownActive;
    const applyVisibility = (countdown) =>
      countdown?.id === countdownId
        ? { ...countdown, mostrarCuentaRegresiva }
        : countdown;

    setCountdownEnBorrador(applyVisibility);
    window.dispatchEvent(
      new CustomEvent("actualizar-elemento", {
        detail: {
          id: countdownId,
          cambios: { mostrarCuentaRegresiva },
        },
      })
    );
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      <section className={`${activationStyles.activationPanel} shrink-0`}>
        <div className={activationStyles.activationHeader}>
          <h3 className={activationStyles.activationTitle}>Mostrar contador</h3>
          <button
            type="button"
            role="switch"
            aria-checked={isCountdownActive}
            aria-label={
              countdownEnBorrador?.id
                ? isCountdownActive
                  ? "Ocultar contador"
                  : "Mostrar contador"
                : "Elegí un diseño de contador para poder mostrarlo"
            }
            disabled={!countdownEnBorrador?.id}
            onClick={handleCountdownVisibilityToggle}
            className={`${activationStyles.activationSwitch} ${
              isCountdownActive ? activationStyles.activationSwitchOn : ""
            } motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span
              className={`${activationStyles.activationSwitchThumb} motion-reduce:transition-none`}
              aria-hidden="true"
            />
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white/90 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        {sidebarPanelPresentation.fallbackMessage ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
            {sidebarPanelPresentation.fallbackMessage}
          </div>
        ) : null}

        <div className="flex flex-col gap-5">
          {loadingCountdownPresets && (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-4 text-xs text-zinc-500">
              Cargando presets...
            </div>
          )}

          {!loadingCountdownPresets && countdownPresets.length === 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-4 text-xs text-zinc-500">
              No hay presets disponibles.
            </div>
          )}

          {!loadingCountdownPresets && countdownPresets.map((p) => {
            const isoPreview = countdownTargetISO || new Date().toISOString();
            const rawPresetProps = p?.presetPropsForCanvas || p?.props || {};
            const presetLabel = String(p?.nombre || p?.id || "Preset");
            const previewImageUrl = String(p?.thumbnailUrl || "").trim();
            const isSelected = selectedPresetId.length > 0 && selectedPresetId === String(p?.id || "");
            const presetPresentation = getCountdownSidebarPresetPresentation({ preset: p });
            const cardClassName = [
              "group flex w-full flex-col rounded-[18px] border-2 px-[14px] py-3 text-left transition-all duration-200 motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/90 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
              isSelected
                ? "border-[#773dbe] bg-[#faf7ff] shadow-[0_0_0_3px_rgba(119,61,190,0.15)]"
                : "border-[#e8e2f1] bg-[linear-gradient(180deg,#ffffff_0%,#fcfbff_100%)] shadow-[0_4px_12px_rgba(15,23,42,0.04)] hover:-translate-y-[1px] hover:border-[#773dbe] hover:bg-[#faf7ff] motion-reduce:hover:translate-y-0",
            ].join(" ");
            const nameClassName = isSelected
              ? "truncate text-[12px] font-medium text-[#773dbe]"
              : "truncate text-[12px] font-normal text-[#6b7280]";

            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={isSelected}
                aria-label={`Aplicar preset ${presetLabel}`}
                title={presetLabel}
                onClick={() => {
                  const iso = countdownTargetISO;
                  if (!iso) {
                    alert(
                      "Configurá la fecha y el horario en Detalles del evento antes de elegir un contador."
                    );
                    return;
                  }

                  const {
                    x: _px,
                    y: _py,
                    width: _pw,
                    height: _ph,
                    fechaObjetivo: _pFecha,
                    fechaISO: _pFechaISO,
                    targetISO: _pTargetISO,
                    tipo: _ptipo,
                    id: _pid,
                    ...presetPropsSafe
                  } = rawPresetProps;

                  window.dispatchEvent(
                    new CustomEvent("insertar-elemento", {
                      detail: {
                        id: `count-${Date.now().toString(36)}`,
                        tipo: "countdown",
                        fechaObjetivo: iso,
                        presetId: p.id,
                        presetProps: presetPropsSafe,
                      },
                    })
                  );
                }}
                className={cardClassName}
              >
                <CountdownPresetThumbnail
                  targetISO={isoPreview}
                  preset={rawPresetProps}
                  previewImageUrl={previewImageUrl}
                  previewProps={presetPresentation.previewProps}
                />
                <div className="mt-2 min-w-0">
                  <p className={nameClassName}>{presetLabel}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}


import { useEffect, useMemo, useState } from "react";
import { Layer, Stage } from "react-konva";
import CountdownPresetLivePreview from "./CountdownPresetLivePreview";
import CountdownKonva from "@/components/editor/countdown/CountdownKonva";
import computeInsertDefaults from "@/components/editor/events/computeInsertDefaults";
import { buildCountdownCanvasPatchFromPreset } from "@/domain/countdownPresets/toCanvasPatch";
import {
  COUNTDOWN_VISUAL_BASELINE_FROZEN_NOW_ISO,
  COUNTDOWN_VISUAL_BASELINE_FRAME_SVG,
  countdownVisualBaselinePreset,
  getCountdownVisualBaselineState,
} from "../../../../shared/countdownVisualBaselineFixtures.mjs";

const SECTION = Object.freeze({
  id: "countdown-phase0-baseline-section",
  orden: 1,
  alto: 360,
  altoModo: "fijo",
  fondo: "#f8fafc",
  mobileLayoutMode: "preserve",
});

function svgToDataUrl(svgText) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

function injectFrozenClock(html) {
  const timestamp = Date.parse(COUNTDOWN_VISUAL_BASELINE_FROZEN_NOW_ISO);
  const bootstrap = `<script>(function(){var NativeDate=Date;var fixed=${timestamp};class FrozenDate extends NativeDate{constructor(){var args=Array.prototype.slice.call(arguments);super(...(args.length?args:[fixed]));}static now(){return fixed;}}window.Date=FrozenDate;window.__COUNTDOWN_ANIMATIONS_ENABLED=false;}());</script>`;
  return String(html || "").replace(/<head([^>]*)>/i, `<head$1>${bootstrap}`);
}

function Surface({ id, title, children, compact = false }) {
  return (
    <section
      data-countdown-baseline-surface={id}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{
        width: compact ? 430 : 820,
        height: 470,
      }}
    >
      <header className="flex h-11 items-center border-b border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700">
        {title}
      </header>
      <div className="flex h-[426px] items-center justify-center overflow-hidden bg-white">
        {children}
      </div>
    </section>
  );
}

function HtmlSurface({ html, title, mobile = false, surfaceId }) {
  return (
    <Surface id={surfaceId} title={title} compact={mobile}>
      <iframe
        title={title}
        srcDoc={html}
        style={{
          width: mobile ? 390 : 800,
          height: 420,
          border: 0,
          background: "#ffffff",
        }}
      />
    </Surface>
  );
}

export default function CountdownPhase0BaselineHarness({ stateId }) {
  const fixtureState = getCountdownVisualBaselineState(stateId);
  const [previewHtml, setPreviewHtml] = useState("");
  const [publicationHtml, setPublicationHtml] = useState("");
  const [generationError, setGenerationError] = useState("");
  const frameUrl = useMemo(
    () => svgToDataUrl(COUNTDOWN_VISUAL_BASELINE_FRAME_SVG),
    []
  );

  const presetProps = useMemo(
    () =>
      buildCountdownCanvasPatchFromPreset({
        presetId: "countdown-phase0-baseline",
        activeVersion: 7,
        layout: countdownVisualBaselinePreset.layout,
        tipografia: countdownVisualBaselinePreset.tipografia,
        colores: countdownVisualBaselinePreset.colores,
        animaciones: countdownVisualBaselinePreset.animaciones,
        unidad: countdownVisualBaselinePreset.unidad,
        tamanoBase: countdownVisualBaselinePreset.tamanoBase,
        svgRef: {
          colorMode: "currentColor",
          downloadUrl: frameUrl,
        },
      }),
    [frameUrl]
  );

  const countdownObject = useMemo(
    () =>
      computeInsertDefaults({
        payload: {
          id: "countdown-phase0-baseline-object",
          tipo: "countdown",
          fechaObjetivo: fixtureState.targetISO,
          presetId: "countdown-phase0-baseline",
          presetProps,
        },
        targetSeccionId: SECTION.id,
        secciones: [SECTION],
        normalizarAltoModo: (value) =>
          String(value || "").trim().toLowerCase(),
        ALTURA_PANTALLA_EDITOR: 500,
      }),
    [fixtureState.targetISO, presetProps]
  );

  useEffect(() => {
    let active = true;
    setPreviewHtml("");
    setPublicationHtml("");
    setGenerationError("");

    import("../../../../functions/src/utils/generarHTMLDesdeSecciones")
      .then(({ generarHTMLDesdeSecciones }) => {
        if (!active) return;
        const preview = generarHTMLDesdeSecciones(
          [SECTION],
          [countdownObject],
          undefined,
          { isPreview: true }
        );
        const publication = generarHTMLDesdeSecciones(
          [SECTION],
          [countdownObject],
          undefined,
          {
            isPreview: false,
            slug: "countdown-phase0-baseline",
          }
        );
        setPreviewHtml(injectFrozenClock(preview));
        setPublicationHtml(injectFrozenClock(publication));
      })
      .catch((error) => {
        if (!active) return;
        setGenerationError(
          error instanceof Error ? error.message : "baseline-generation-error"
        );
      });

    return () => {
      active = false;
    };
  }, [countdownObject]);

  const ready =
    Boolean(previewHtml) && Boolean(publicationHtml) && !generationError;

  return (
    <main
      data-countdown-baseline-ready={ready ? "true" : "false"}
      data-countdown-baseline-state={fixtureState.id}
      className="min-h-dvh bg-slate-100 p-6 text-slate-900"
    >
      <div className="mb-5">
        <h1 className="text-xl font-semibold">
          Countdown Phase 0 Visual Baseline
        </h1>
        <p className="text-sm text-slate-600">
          {fixtureState.label} · target {fixtureState.targetISO}
        </p>
      </div>

      {generationError ? (
        <pre className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {generationError}
        </pre>
      ) : null}

      <div className="flex flex-wrap items-start gap-6">
        <Surface id="builder" title="Builder">
          <div className="h-[390px] w-[760px]">
            <CountdownPresetLivePreview
              config={countdownVisualBaselinePreset}
              svgText={COUNTDOWN_VISUAL_BASELINE_FRAME_SVG}
              frameUrl={frameUrl}
              svgColorMode="currentColor"
              frameColor={countdownVisualBaselinePreset.colores.frameColor}
              targetISO={fixtureState.targetISO}
            />
          </div>
        </Surface>

        <Surface id="canvas" title="Canvas">
          <Stage width={800} height={420}>
            <Layer>
              <CountdownKonva
                obj={countdownObject}
                registerRef={() => {}}
                seccionesOrdenadas={[SECTION]}
                altoCanvas={360}
                ALTURA_PANTALLA_EDITOR={500}
                isPassiveRender
              />
            </Layer>
          </Stage>
        </Surface>

        {previewHtml ? (
          <HtmlSurface
            html={previewHtml}
            title="Preview desktop"
            surfaceId="preview"
          />
        ) : null}

        {publicationHtml ? (
          <HtmlSurface
            html={publicationHtml}
            title="Publicacion desktop"
            surfaceId="publication"
          />
        ) : null}

        {publicationHtml ? (
          <HtmlSurface
            html={publicationHtml}
            title="Publicacion mobile"
            mobile
            surfaceId="mobile"
          />
        ) : null}
      </div>
    </main>
  );
}

import { useMemo, useState } from "react";
import CountdownPresetPreviewPanel from "./CountdownPresetPreviewPanel";
import SvgUploadInspector from "./SvgUploadInspector";
import { createDefaultCountdownPresetConfig } from "@/domain/countdownPresets/contract";

const PREVIEW_STATE = Object.freeze({
  viewport: "desktop",
  zoom: 100,
  scenario: "days",
  background: "light",
  reducedMotion: true,
  mobileExpanded: true,
  nowISO: "2030-06-01T12:00:00.000Z",
  targetISO: "2030-06-11T12:00:00.000Z",
  customTargetISO: "",
});

export default function CountdownFrameUploadRegressionHarness() {
  const [frameAsset, setFrameAsset] = useState(null);
  const [preview, setPreview] = useState(PREVIEW_STATE);
  const config = useMemo(() => {
    const next = createDefaultCountdownPresetConfig();
    return {
      ...next,
      layout: {
        ...next.layout,
        type: "singleFrame",
        distribution: "editorial",
        frameScale: 5,
      },
    };
  }, []);
  const formState = useMemo(
    () => ({
      nombre: "Harness de frame",
      categoria: {
        event: "general",
        style: "clasico",
        custom: null,
        label: "General · Clásico",
      },
      config,
      svgAsset: frameAsset,
    }),
    [config, frameAsset]
  );

  return (
    <main
      data-countdown-frame-upload-harness="true"
      data-countdown-frame-upload-ready="true"
      className="h-dvh min-h-0 overflow-x-hidden overflow-y-auto bg-slate-100 text-slate-900"
    >
      <div
        aria-hidden="true"
        className="flex h-[42vh] min-h-64 items-end justify-center pb-6 text-xs text-slate-500"
      >
        Espacio previo para comprobar el scroll general
      </div>

      <section className="mx-auto w-full max-w-4xl px-3 pb-6">
        <div
          data-countdown-frame-internal-scroll
          className="h-[560px] min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div
            aria-hidden="true"
            className="flex h-56 items-end pb-4 text-xs text-slate-500"
          >
            Espacio previo para comprobar el scroll interno
          </div>

          <SvgUploadInspector
            value={frameAsset}
            onChange={setFrameAsset}
          />

          <div className="mt-4">
            <CountdownPresetPreviewPanel
              formState={formState}
              selectedPreset={null}
              validation={{ valid: true, errors: [] }}
              preview={preview}
              onPreviewChange={(patch) =>
                setPreview((current) => ({ ...current, ...patch }))
              }
              onScenarioChange={() => {}}
              onCustomTargetChange={() => {}}
            />
          </div>

          <div
            data-countdown-frame-internal-end
            aria-hidden="true"
            className="h-px w-full"
          />
        </div>
      </section>

      <div
        data-countdown-frame-page-end
        aria-hidden="true"
        className="h-px w-full"
      />
    </main>
  );
}

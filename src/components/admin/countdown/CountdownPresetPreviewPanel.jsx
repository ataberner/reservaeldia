import CountdownPresetLivePreview from "@/components/admin/countdown/CountdownPresetLivePreview";
import { COUNTDOWN_PREVIEW_SCENARIOS } from "@/domain/countdownPresets/builderState";
import { resolveCountdownFrameAssetType } from "@/domain/countdownPresets/frameAssetContract";

function previewBackgroundClass(background) {
  if (background === "dark") return "bg-slate-950";
  if (background === "transparent") {
    return "bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]";
  }
  return "bg-white";
}

function resolveLocalDateTime(preview) {
  if (preview?.scenario === "custom" && preview?.customTargetISO) {
    return String(preview.customTargetISO).slice(0, 16);
  }
  const parsed = new Date(preview?.targetISO || "");
  if (!Number.isFinite(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

export default function CountdownPresetPreviewPanel({
  formState,
  selectedPreset,
  validation,
  preview,
  onPreviewChange,
  onScenarioChange,
  onCustomTargetChange,
}) {
  const config = formState?.config || {};
  const svgAsset = formState?.svgAsset;
  const frameAssetType = resolveCountdownFrameAssetType(
    svgAsset,
    svgAsset ? "svg" : null
  );
  const nowMs = new Date(preview?.nowISO || "").getTime();
  const isMobile = preview?.viewport === "mobile";
  const frameUrl =
    frameAssetType === "png"
      ? svgAsset?.previewUrl || svgAsset?.downloadUrl || ""
      : !svgAsset?.svgText
        ? svgAsset?.downloadUrl || svgAsset?.previewUrl || ""
        : "";
  const legacySource =
    Boolean(selectedPreset?.legacyPresetProps) &&
    String(selectedPreset?.metadata?.migrationSource || "").toLowerCase() ===
      "legacy-config-v1";
  const hasVisibleUnits =
    Array.isArray(config?.layout?.visibleUnits) &&
    config.layout.visibleUnits.length > 0;

  return (
    <aside className="w-full lg:sticky lg:top-3 lg:self-start">
      <section
        aria-labelledby="countdown-preview-title"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-sm"
      >
        <header className="border-b border-slate-200 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2
                id="countdown-preview-title"
                className="text-sm font-semibold text-slate-950"
              >
                Simulación
              </h2>
              <p className="text-[11px] text-slate-600">
                No se guarda dentro del preset.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onPreviewChange?.({
                  mobileExpanded: !preview?.mobileExpanded,
                })
              }
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-violet-500 md:hidden"
              aria-expanded={preview?.mobileExpanded === true}
              aria-controls="countdown-preview-body"
            >
              {preview?.mobileExpanded ? "Ocultar preview" : "Ver preview"}
            </button>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div
              className="grid grid-cols-2 rounded-lg border border-slate-300 p-0.5"
              role="group"
              aria-label="Viewport de la vista previa"
            >
              {[
                ["desktop", "Escritorio"],
                ["mobile", "Móvil"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={preview?.viewport === value}
                  onClick={() => onPreviewChange?.({ viewport: value })}
                  className={`min-h-11 rounded-md px-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                    preview?.viewport === value
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="text-[11px] font-medium text-slate-600">
              <span className="sr-only">Zoom</span>
              <select
                value={preview?.zoom || 100}
                onChange={(event) =>
                  onPreviewChange?.({ zoom: Number(event.target.value) })
                }
                className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                {[75, 90, 100, 110, 125].map((zoom) => (
                  <option key={zoom} value={zoom}>
                    Zoom {zoom}%
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-2 block text-[11px] font-medium text-slate-600">
            Estado temporal
            <select
              value={preview?.scenario || "days"}
              onChange={(event) => onScenarioChange?.(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              {COUNTDOWN_PREVIEW_SCENARIOS.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label}
                </option>
              ))}
            </select>
          </label>

          {preview?.scenario === "custom" ? (
            <label className="mt-2 block text-[11px] font-medium text-slate-600">
              Fecha simulada
              <input
                type="datetime-local"
                value={resolveLocalDateTime(preview)}
                onChange={(event) =>
                  onCustomTargetChange?.(event.target.value)
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              />
            </label>
          ) : null}

          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] font-medium text-slate-600">
              Fondo
              <select
                value={preview?.background || "light"}
                onChange={(event) =>
                  onPreviewChange?.({ background: event.target.value })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                <option value="light">Claro</option>
                <option value="dark">Oscuro</option>
                <option value="transparent">Transparencia</option>
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={preview?.reducedMotion === true}
                onChange={(event) =>
                  onPreviewChange?.({
                    reducedMotion: event.target.checked,
                  })
                }
              />
              Movimiento reducido
            </label>
          </div>
        </header>

        <div
          id="countdown-preview-body"
          className={`p-2 ${
            preview?.mobileExpanded ? "block" : "hidden md:block"
          }`}
        >
          {!validation?.valid ? (
            <p
              role="alert"
              className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
            >
              La simulación es orientativa hasta corregir los campos inválidos.
              Los valores fuera de rango no se consideran aceptados.
            </p>
          ) : null}
          <div
            className={`ml-auto min-w-0 overflow-hidden rounded-xl border border-slate-200 p-2 transition-colors motion-reduce:transition-none ${previewBackgroundClass(
              preview?.background
            )} ${isMobile ? "max-w-[390px]" : "max-w-full"}`}
            data-preview-viewport={isMobile ? "mobile" : "desktop"}
          >
            <div
              style={{
                width: `${10000 / Number(preview?.zoom || 100)}%`,
                transform: `scale(${Number(preview?.zoom || 100) / 100})`,
                transformOrigin: "top left",
              }}
            >
              {hasVisibleUnits ? (
                <CountdownPresetLivePreview
                  config={config}
                  svgText={svgAsset?.svgText || ""}
                  frameUrl={frameUrl}
                  frameAssetType={frameAssetType}
                  svgColorMode={svgAsset?.colorMode || "fixed"}
                  frameColor={config?.colores?.frameColor}
                  targetISO={preview?.targetISO}
                  nowMs={Number.isFinite(nowMs) ? nowMs : null}
                  reducedMotion={preview?.reducedMotion === true}
                  legacyPresetProps={selectedPreset?.legacyPresetProps || null}
                  useLegacyCanvasPreview={legacySource && !svgAsset}
                />
              ) : (
                <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-rose-300 bg-rose-50 p-4 text-center text-sm text-rose-700">
                  Seleccioná al menos una unidad para habilitar la simulación.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </aside>
  );
}

// components/MiniToolbarTabContador.jsx
import React, { useEffect, useMemo, useState } from "react";
import CountdownPreview from "@/components/editor/countdown/CountdownPreview";
import { useCountdownPresetCatalog } from "@/hooks/useCountdownPresetCatalog";
import UnifiedColorPicker from "@/components/color/UnifiedColorPicker";
import {
  resolveCountdownContract,
  resolveCountdownTargetIso,
} from "../../shared/renderContractPolicy.js";

function fechaStrToISO(str) {
  if (!str || typeof str !== "string") return null;
  let s = str.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ":00";
  const d = new Date(s);
  const ms = d.getTime();
  if (Number.isNaN(ms)) {
    console.warn("[Countdown] fecha/hora invalida ->", str);
    return null;
  }
  return d.toISOString();
}

function fechaISOToInputDateTime(iso) {
  if (!iso || typeof iso !== "string") return null;
  const d = new Date(iso);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function describePaint(value) {
  const safe = String(value || "").trim();
  if (!safe) return "Sin color";
  return safe.toLowerCase().startsWith("linear-gradient(") ? "Gradiente" : safe.toUpperCase();
}

export default function MiniToolbarTabContador() {
  const {
    items: countdownPresets,
    loading: loadingCountdownPresets,
    error: countdownPresetsError,
    usingFallback,
  } = useCountdownPresetCatalog();

  const ahoraMas30d = (() => {
    const d = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  const [fechaEventoStr, setFechaEventoStr] = useState(ahoraMas30d);
  const [countdownSel, setCountdownSel] = useState(null);
  const [countdownEnBorrador, setCountdownEnBorrador] = useState(null);
  const [, setPreviewTick] = useState(0);

  useEffect(() => {
    // Un solo timer compartido evita un intervalo por card en el catalogo.
    const timer = window.setInterval(() => {
      setPreviewTick((prev) => (prev + 1) % 86400);
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncSelectedCountdown = () => {
      try {
        const ids = window._elementosSeleccionados || [];
        const objs = window._objetosActuales || [];
        const firstCountdown = Array.isArray(objs)
          ? objs.find((o) => o?.tipo === "countdown") || null
          : null;

        setCountdownEnBorrador(firstCountdown);

        if (!Array.isArray(ids) || !Array.isArray(objs) || ids.length !== 1) {
          setCountdownSel(null);
          return;
        }

        const obj = objs.find((o) => o.id === ids[0]);
        if (!obj || obj.tipo !== "countdown") {
          setCountdownSel(null);
          return;
        }

        setCountdownSel(obj);
      } catch {
        setCountdownSel(null);
        setCountdownEnBorrador(null);
      }
    };

    syncSelectedCountdown();
    window.addEventListener("editor-selection-change", syncSelectedCountdown);

    return () => {
      window.removeEventListener("editor-selection-change", syncSelectedCountdown);
    };
  }, []);

  useEffect(() => {
    const fechaObj = resolveCountdownTargetIso(countdownEnBorrador || null).targetISO;
    if (!fechaObj) return;

    const fechaInput = fechaISOToInputDateTime(fechaObj);
    if (!fechaInput) return;

    setFechaEventoStr((prev) => (prev === fechaInput ? prev : fechaInput));
  }, [
    countdownEnBorrador?.id,
    countdownEnBorrador?.fechaObjetivo,
    countdownEnBorrador?.targetISO,
    countdownEnBorrador?.fechaISO,
  ]);

  const selectedUI = useMemo(() => {
    if (!countdownSel) return null;
    return {
      id: countdownSel.id,
      color: countdownSel.color ?? "#111827",
      labelColor: countdownSel.labelColor ?? "#6b7280",
      boxBg: countdownSel.boxBg ?? "#ffffff",
      boxBorder: countdownSel.boxBorder ?? "#e5e7eb",
      frameColor: countdownSel.frameColor ?? "#773dbe",
      frameColorMode: String(countdownSel.frameColorMode || "fixed").toLowerCase(),
      frameSvgUrl: String(countdownSel.frameSvgUrl || "").trim(),
      showLabels: !!countdownSel.showLabels,
    };
  }, [countdownSel]);

  const canEditFrameSvgColor = useMemo(() => {
    if (!selectedUI) return false;
    if (!selectedUI.frameSvgUrl) return true;
    return selectedUI.frameColorMode === "currentcolor";
  }, [selectedUI]);
  const selectedCountdownContract = useMemo(
    () => (countdownSel ? resolveCountdownContract(countdownSel) : null),
    [countdownSel]
  );
  const draftCountdownTarget = useMemo(
    () => resolveCountdownTargetIso(countdownEnBorrador || null),
    [
      countdownEnBorrador?.id,
      countdownEnBorrador?.fechaObjetivo,
      countdownEnBorrador?.targetISO,
      countdownEnBorrador?.fechaISO,
    ]
  );

  const selectedPresetId = useMemo(
    () => String(countdownEnBorrador?.presetId || "").trim(),
    [countdownEnBorrador?.presetId]
  );

  const patchSelectedCountdown = (cambios) => {
    const id = selectedUI?.id;
    if (!id) return;

    window.dispatchEvent(
      new CustomEvent("actualizar-elemento", {
        detail: { id, cambios },
      })
    );
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      <section className="sticky top-0 z-20 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-violet-800">
          Fecha del evento
        </label>
        <input
          type="datetime-local"
          value={fechaEventoStr}
          onChange={(e) => {
            const nextValue = e.target.value;
            setFechaEventoStr(nextValue);

            if (!countdownEnBorrador?.id) return;
            const iso = fechaStrToISO(nextValue);
            if (!iso) return;

            window.dispatchEvent(
              new CustomEvent("actualizar-elemento", {
                detail: {
                  id: countdownEnBorrador.id,
                  cambios: { fechaObjetivo: iso },
                },
              })
            );
          }}
          className="mt-2 w-full rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-sm text-zinc-800 focus:border-violet-400 focus:outline-none"
        />
      </section>

      {selectedUI && (
        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white/90 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
          {selectedCountdownContract?.isLegacyFrozenCompat ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-[11px] text-sky-800">
              Este countdown usa schema v1 legacy. Se mantiene por compatibilidad, pero esta congelado para trabajo nuevo.
            </div>
          ) : null}
          {draftCountdownTarget.usesCompatibilityAlias ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
              La fecha actual se esta resolviendo desde <code>{draftCountdownTarget.sourceField}</code>. Los cambios nuevos deben escribir en <code>fechaObjetivo</code>.
            </div>
          ) : null}

          <label className="block text-xs font-medium text-zinc-700">
            Separacion entre chips
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={countdownSel.gap ?? 8}
              onChange={(e) => patchSelectedCountdown({ gap: Number(e.target.value) })}
              className="mt-2 w-full accent-violet-600"
            />
            <div className="mt-1 text-[11px] text-zinc-500">
              Gap actual: {countdownSel.gap ?? 8}px
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-zinc-700">
              Numeros
              <div className="mt-1 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-2 py-1.5">
                <span className="max-w-[82px] truncate text-[11px] font-semibold text-zinc-700" title={selectedUI.color}>
                  {describePaint(selectedUI.color)}
                </span>
                <UnifiedColorPicker
                  value={selectedUI.color}
                  onChange={(nextColor) => patchSelectedCountdown({ color: nextColor })}
                  panelWidth={272}
                  title="Color de numeros"
                  triggerClassName="h-7 w-7 rounded border border-zinc-300"
                />
              </div>
            </label>

            <label className="text-xs font-medium text-zinc-700">
              Etiquetas
              <div className="mt-1 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-2 py-1.5">
                <span className="max-w-[82px] truncate text-[11px] font-semibold text-zinc-700" title={selectedUI.labelColor}>
                  {describePaint(selectedUI.labelColor)}
                </span>
                <UnifiedColorPicker
                  value={selectedUI.labelColor}
                  onChange={(nextColor) => patchSelectedCountdown({ labelColor: nextColor })}
                  panelWidth={272}
                  title="Color de etiquetas"
                  disabled={!selectedUI.showLabels}
                  triggerClassName="h-7 w-7 rounded border border-zinc-300"
                />
              </div>
              {!selectedUI.showLabels && (
                <div className="mt-1 text-[10px] text-zinc-600">
                  Este preset no muestra labels.
                </div>
              )}
            </label>

            <label className="text-xs font-medium text-zinc-700">
              Fondo chip
              <div className="mt-1 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-2 py-1.5">
                <span className="max-w-[82px] truncate text-[11px] font-semibold text-zinc-700" title={selectedUI.boxBg}>
                  {describePaint(selectedUI.boxBg)}
                </span>
                <UnifiedColorPicker
                  value={selectedUI.boxBg}
                  onChange={(nextColor) => patchSelectedCountdown({ boxBg: nextColor })}
                  panelWidth={272}
                  showGradients={false}
                  title="Fondo del chip"
                  triggerClassName="h-7 w-7 rounded border border-zinc-300"
                />
              </div>
            </label>

            <label className="text-xs font-medium text-zinc-700">
              Borde chip
              <div className="mt-1 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-2 py-1.5">
                <span className="max-w-[82px] truncate text-[11px] font-semibold text-zinc-700" title={selectedUI.boxBorder}>
                  {describePaint(selectedUI.boxBorder)}
                </span>
                <UnifiedColorPicker
                  value={selectedUI.boxBorder}
                  onChange={(nextColor) => patchSelectedCountdown({ boxBorder: nextColor })}
                  panelWidth={272}
                  showGradients={false}
                  title="Borde del chip"
                  triggerClassName="h-7 w-7 rounded border border-zinc-300"
                />
              </div>
            </label>

            <label className="col-span-2 text-xs font-medium text-zinc-700">
              Color frame SVG
              <div className="mt-1 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-2 py-1.5">
                <span className="max-w-[160px] truncate text-[11px] font-semibold text-zinc-700" title={selectedUI.frameColor}>
                  {describePaint(selectedUI.frameColor)}
                </span>
                <UnifiedColorPicker
                  value={selectedUI.frameColor}
                  onChange={(nextColor) => patchSelectedCountdown({ frameColor: nextColor })}
                  panelWidth={272}
                  showGradients={false}
                  title="Color del frame SVG"
                  disabled={!canEditFrameSvgColor}
                  triggerClassName="h-7 w-7 rounded border border-zinc-300"
                />
              </div>
              {!canEditFrameSvgColor && (
                <div className="mt-1 text-[10px] text-zinc-600">
                  Este SVG tiene color fijo. Para recolorarlo, debe usar currentColor.
                </div>
              )}
            </label>
          </div>
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white/90 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        {countdownPresetsError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
            {usingFallback
              ? "Catalogo remoto no disponible. Mostrando presets legacy congelados de compatibilidad."
              : countdownPresetsError}
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
            const isoPreview = fechaStrToISO(fechaEventoStr) || new Date().toISOString();
            const rawPresetProps = p?.presetPropsForCanvas || p?.props || {};
            const presetLabel = String(p?.nombre || p?.id || "Preset");
            const hasLivePresetPreview = Object.keys(rawPresetProps || {}).length > 0;
            const previewImageUrl = String(p?.thumbnailUrl || "").trim();
            const isSelected = selectedPresetId.length > 0 && selectedPresetId === String(p?.id || "");
            const isLegacyPreset = p?.legacyFrozen === true;
            const cardClassName = [
              "group flex h-[96px] w-full flex-col rounded-[18px] border-2 px-[14px] py-3 text-left transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/90 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
              isSelected
                ? "border-[#773dbe] bg-[#faf7ff] shadow-[0_0_0_3px_rgba(119,61,190,0.15)]"
                : "border-[#e8e2f1] bg-[linear-gradient(180deg,#ffffff_0%,#fcfbff_100%)] shadow-[0_4px_12px_rgba(15,23,42,0.04)] hover:-translate-y-[1px] hover:border-[#773dbe] hover:bg-[#faf7ff]",
            ].join(" ");
            const previewClassName = "flex flex-1 items-center justify-center overflow-hidden -translate-y-[2px]";
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
                  const iso = fechaStrToISO(fechaEventoStr);
                  if (!iso) {
                    alert("La fecha/hora no es valida. Elegi una fecha.");
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
                <div className={previewClassName}>
                  {hasLivePresetPreview ? (
                    <CountdownPreview
                      targetISO={isoPreview}
                      preset={rawPresetProps}
                      size="md"
                      live={false}
                    />
                  ) : previewImageUrl ? (
                    <img
                      src={previewImageUrl}
                      alt={`${presetLabel} preview`}
                      className="h-full w-full object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="text-[11px] text-zinc-400">Sin preview</div>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className={nameClassName}>{presetLabel}</p>
                  {isLegacyPreset ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-amber-700">
                      legacy compat
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}


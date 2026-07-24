import { useCallback } from "react";
import CountdownPresetFormSections from "@/components/admin/countdown/CountdownPresetFormSections";
import CountdownPresetHistoryPanel from "@/components/admin/countdown/CountdownPresetHistoryPanel";
import CountdownPresetPreviewPanel from "@/components/admin/countdown/CountdownPresetPreviewPanel";
import {
  isCountdownPresetLegacy,
  isCountdownPresetProtected,
  resolveCountdownPublishControls,
} from "@/domain/countdownPresets/builderState";
import { resolveCountdownPresetArchiveLabel } from "@/domain/countdownPresets/builderFormModel";

function StatusPill({ tone = "slate", children }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    violet: "bg-violet-100 text-violet-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-700",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        tones[tone] || tones.slate
      }`}
    >
      {children}
    </span>
  );
}

function focusFirstInvalid(validation) {
  const fieldId = validation?.firstField;
  if (!fieldId || typeof document === "undefined") return;
  window.requestAnimationFrame(() => {
    const wrapper = document.querySelector(
      `[data-countdown-field="${CSS.escape(fieldId)}"]`
    );
    const target =
      document.getElementById(`countdown-field-${fieldId}`) ||
      wrapper?.querySelector("input, select, textarea, button");
    wrapper?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    target?.focus?.({ preventScroll: true });
  });
}

export default function CountdownPresetForm({
  selectedPreset,
  formState,
  validation,
  dirty,
  busy,
  activeOperation,
  notice,
  history,
  preview,
  effectivePresetId,
  effectiveDraftVersion,
  onChange,
  onSaveDraft,
  onPublishSaved,
  onSaveAndPublish,
  onDiscard,
  onArchive,
  onDelete,
  onDuplicate,
  onOpenHistory,
  onCloseHistory,
  onSelectHistoryVersion,
  onPreviewChange,
  onScenarioChange,
  onCustomTargetChange,
}) {
  const activeVersion = Number(selectedPreset?.activeVersion || 0);
  const archived = selectedPreset?.estado === "archived";
  const legacy = isCountdownPresetLegacy(selectedPreset);
  const protectedPreset = isCountdownPresetProtected(selectedPreset);
  const controls = resolveCountdownPublishControls({
    presetId: effectivePresetId,
    draftVersion: effectiveDraftVersion,
    dirty,
    saving: busy,
    publishing: busy,
  });

  const runValidated = useCallback(
    (action) => {
      if (!validation?.valid) {
        focusFirstInvalid(validation);
      }
      action?.();
    },
    [validation]
  );

  if (history?.open) {
    return (
      <CountdownPresetHistoryPanel
        history={history}
        formState={formState}
        onClose={onCloseHistory}
        onSelectVersion={onSelectHistoryVersion}
      />
    );
  }

  return (
    <section className="min-w-0 self-start p-0">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
              {selectedPreset?.id ? "Preset seleccionado" : "Preset nuevo"}
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold text-slate-950">
              {formState.nombre || "Preset sin nombre"}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Estado del preset">
              {dirty ? (
                <StatusPill tone="amber">Cambios sin guardar</StatusPill>
              ) : effectiveDraftVersion ? (
                <StatusPill tone="violet">
                  Borrador {effectiveDraftVersion} guardado
                </StatusPill>
              ) : (
                <StatusPill>Sin borrador guardado</StatusPill>
              )}
              {activeVersion ? (
                <StatusPill tone="emerald">
                  Versión {activeVersion} activa
                </StatusPill>
              ) : null}
              {archived ? (
                <StatusPill tone="rose">Archivado</StatusPill>
              ) : null}
              {legacy ? (
                <StatusPill tone="amber">Compatibilidad legacy</StatusPill>
              ) : null}
              {protectedPreset ? (
                <StatusPill>Versiones publicadas protegidas</StatusPill>
              ) : null}
              {activeOperation ? (
                <StatusPill tone="violet">Operación en progreso</StatusPill>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runValidated(onSaveDraft)}
              disabled={busy}
              className="min-h-11 rounded-lg bg-violet-700 px-4 py-2 text-xs font-semibold text-white outline-none hover:bg-violet-800 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activeOperation === "save"
                ? "Guardando…"
                : "Guardar borrador"}
            </button>
            <button
              type="button"
              onClick={onPublishSaved}
              disabled={!controls.canPublishSaved}
              title={
                controls.publishBlockedByDirty
                  ? "Guardá o descartá los cambios locales antes de publicar la versión guardada."
                  : ""
              }
              className="min-h-11 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 outline-none hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activeOperation === "publish"
                ? "Publicando…"
                : "Publicar versión guardada"}
            </button>
            <button
              type="button"
              onClick={() => runValidated(onSaveAndPublish)}
              disabled={!controls.canSaveAndPublish}
              className="min-h-11 rounded-lg border border-emerald-700 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 outline-none hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activeOperation === "save-and-publish"
                ? "Guardando y publicando…"
                : "Guardar y publicar"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onDiscard}
            disabled={!dirty || busy}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
          >
            Descartar cambios locales
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            disabled={!selectedPreset?.id || dirty || busy}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
          >
            Duplicar preset
          </button>
          <button
            type="button"
            onClick={onOpenHistory}
            disabled={!selectedPreset?.id || busy}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
          >
            Consultar historial
          </button>
          <button
            type="button"
            onClick={onArchive}
            disabled={!selectedPreset?.id || dirty || busy}
            className="min-h-11 rounded-lg border border-amber-300 px-3 text-xs font-semibold text-amber-800 outline-none hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
          >
            {resolveCountdownPresetArchiveLabel(selectedPreset)}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!selectedPreset?.id || dirty || busy}
            className="min-h-11 rounded-lg border border-rose-300 px-3 text-xs font-semibold text-rose-700 outline-none hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
          >
            Eliminar borrador seguro
          </button>
        </div>
      </header>

      {notice ? (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`mt-3 rounded-xl border px-4 py-3 text-sm ${
            notice.type === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      {validation?.attempted && !validation.valid ? (
        <section
          role="alert"
          aria-labelledby="countdown-validation-title"
          className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <h3 id="countdown-validation-title" className="font-semibold">
            Revisá el formulario antes de continuar
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => focusFirstInvalid(validation)}
            className="mt-3 min-h-11 rounded-lg border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-700 outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            Ir al primer error
          </button>
        </section>
      ) : null}

      {legacy ? (
        <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-800">
          Este preset conserva adaptadores legacy/v1. El editor escribe schema 2
          sin retirar aliases ni modificar invitaciones existentes.
        </p>
      ) : null}

      <div className="mt-4 grid min-w-0 items-start gap-3 md:grid-cols-[minmax(0,2fr)_minmax(250px,0.85fr)] xl:gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <CountdownPresetFormSections
            formState={formState}
            validation={validation}
            selectedPreset={selectedPreset}
            onChange={onChange}
          />
        </div>
        <div className="min-w-0 md:justify-self-end">
          <CountdownPresetPreviewPanel
            formState={formState}
            selectedPreset={selectedPreset}
            validation={validation}
            preview={preview}
            onPreviewChange={onPreviewChange}
            onScenarioChange={onScenarioChange}
            onCustomTargetChange={onCustomTargetChange}
          />
        </div>
      </div>
    </section>
  );
}

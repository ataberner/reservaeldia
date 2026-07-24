import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import CountdownPresetConfirmDialog from "@/components/admin/countdown/CountdownPresetConfirmDialog";
import CountdownPresetForm from "@/components/admin/countdown/CountdownPresetForm";
import CountdownPresetList from "@/components/admin/countdown/CountdownPresetList";
import { COUNTDOWN_PRESETS } from "@/config/countdownPresets";
import { useCountdownPresetBuilderState } from "@/hooks/useCountdownPresetBuilderState";

export default function CountdownPresetBuilderPage() {
  const router = useRouter();
  const allowNextPopRef = useRef(false);
  const allowNextRouteRef = useRef(false);
  const builder = useCountdownPresetBuilderState();

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!builder.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [builder.dirty]);

  useEffect(() => {
    router.beforePopState(({ as }) => {
      if (allowNextPopRef.current) {
        allowNextPopRef.current = false;
        return true;
      }
      return builder.requestRouteChange(() => {
        allowNextPopRef.current = true;
        allowNextRouteRef.current = true;
        void router.push(as);
      });
    });
    return () => router.beforePopState(() => true);
  }, [builder.requestRouteChange, router]);

  useEffect(() => {
    const handleRouteChangeStart = (url) => {
      if (allowNextRouteRef.current) {
        allowNextRouteRef.current = false;
        return;
      }
      if (url === router.asPath) return;
      const allowed = builder.requestRouteChange(() => {
        allowNextRouteRef.current = true;
        void router.push(url);
      });
      if (allowed) return;
      router.events.emit("routeChangeError");
      const error = new Error("COUNTDOWN_BUILDER_ROUTE_CANCELLED");
      error.cancelled = true;
      throw error;
    };
    router.events.on("routeChangeStart", handleRouteChangeStart);
    return () => {
      router.events.off("routeChangeStart", handleRouteChangeStart);
    };
  }, [builder.requestRouteChange, router]);

  return (
    <section className="mx-auto w-full max-w-[1600px] px-0 py-3">
      <header className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-950">
              Constructor de countdowns
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
              Editá el borrador, comprobá el diseño con la simulación y publicá
              una nueva versión.
            </p>
          </div>
          <button
            type="button"
            onClick={() => builder.syncLegacy({ presets: COUNTDOWN_PRESETS })}
            disabled={builder.busy || builder.dirty}
            title={
              builder.dirty
                ? "Guardá o descartá los cambios locales antes de sincronizar."
                : "Crea únicamente los documentos de compatibilidad que falten."
            }
            className="min-h-11 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 outline-none hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
          >
            {builder.activeOperation === "sync-legacy"
              ? "Sincronizando…"
              : "Sincronizar compatibilidad"}
          </button>
        </div>
      </header>

      {builder.listError ? (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {builder.listError}
        </div>
      ) : null}

      <div className="mt-3 grid min-w-0 items-start gap-3 lg:grid-cols-[310px_minmax(0,1fr)]">
        <CountdownPresetList
          items={builder.items}
          filteredItems={builder.filteredItems}
          categoryOptions={builder.categoryOptions}
          selectedId={builder.selectedId}
          dirty={builder.dirty}
          loading={builder.loadingList}
          filters={builder.filters}
          onFilterChange={builder.setFilter}
          onSelect={builder.selectPreset}
          onCreate={builder.createPreset}
        />
        <CountdownPresetForm
          selectedPreset={builder.selectedItem}
          formState={builder.formState}
          validation={builder.validation}
          dirty={builder.dirty}
          busy={builder.busy}
          activeOperation={builder.activeOperation}
          notice={builder.notice}
          history={builder.history}
          preview={builder.preview}
          effectivePresetId={builder.effectivePresetId}
          effectiveDraftVersion={builder.effectiveDraftVersion}
          onChange={builder.changeForm}
          onSaveDraft={builder.saveDraft}
          onPublishSaved={builder.publishSavedDraft}
          onSaveAndPublish={builder.saveAndPublish}
          onDiscard={builder.requestDiscardChanges}
          onArchive={builder.requestArchiveToggle}
          onDelete={builder.requestDeletePreset}
          onDuplicate={builder.duplicatePreset}
          onOpenHistory={builder.openHistory}
          onCloseHistory={builder.closeHistory}
          onSelectHistoryVersion={builder.selectHistoryVersion}
          onPreviewChange={builder.setPreview}
          onScenarioChange={builder.setPreviewScenario}
          onCustomTargetChange={builder.setCustomPreviewTarget}
        />
      </div>

      <CountdownPresetConfirmDialog
        confirmation={builder.confirmation}
        busy={builder.busy}
        onCancel={builder.cancelConfirmation}
        onConfirm={builder.confirmPendingAction}
      />
    </section>
  );
}

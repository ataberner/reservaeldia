import CountdownPresetForm from "@/components/admin/countdown/CountdownPresetForm";
import CountdownPresetList from "@/components/admin/countdown/CountdownPresetList";
import { COUNTDOWN_PRESETS } from "@/config/countdownPresets";
import { useCountdownPresetBuilderState } from "@/hooks/useCountdownPresetBuilderState";

export default function CountdownPresetBuilderPage() {
  const {
    items,
    selectedId,
    selectedItem,
    loadingList,
    listError,
    saving,
    publishing,
    archiving,
    deleting,
    syncingLegacy,
    lastMessage,
    setSelectedId,
    saveDraft,
    publishDraft,
    toggleArchive,
    syncLegacy,
    removePreset,
  } = useCountdownPresetBuilderState();

  return (
    <section className="mx-auto flex h-full w-full max-w-7xl flex-col py-2 lg:py-3">
      <header className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900 lg:text-xl">
              Constructor de Presets de Countdown
            </h1>
            <p className="mt-0.5 text-[11px] text-slate-600 lg:text-xs">
              Disena, versiona y publica presets reutilizables para todo el canvas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => syncLegacy({ presets: COUNTDOWN_PRESETS })}
            disabled={syncingLegacy}
            className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
          >
            {syncingLegacy ? "Sincronizando legacy..." : "Sincronizar presets legacy"}
          </button>
        </div>
      </header>

      {listError ? (
        <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
          {listError}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden">
        <CountdownPresetList
          items={items}
          selectedId={selectedId}
          loading={loadingList}
          onSelect={setSelectedId}
          onCreate={() => setSelectedId(null)}
        />

        <CountdownPresetForm
          selectedPreset={selectedItem}
          saving={saving}
          publishing={publishing}
          archiving={archiving}
          deleting={deleting}
          onSaveDraft={saveDraft}
          onPublishDraft={publishDraft}
          onToggleArchive={toggleArchive}
          onDeletePreset={removePreset}
          lastMessage={lastMessage}
        />
      </div>
    </section>
  );
}

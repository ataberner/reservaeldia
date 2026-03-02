import TextPresetEditorDrawer from "./TextPresetEditorDrawer";
import TextPresetFiltersBar from "./TextPresetFiltersBar";
import TextPresetGrid from "./TextPresetGrid";
import TextPresetHeader from "./TextPresetHeader";
import { useTextPresetAdminState } from "./useTextPresetAdminState";

function FlashMessage({ message, onClose }) {
  if (!message?.text) return null;

  const toneClass =
    message.type === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : message.type === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className={`rounded-xl border px-3 py-2 text-left text-sm ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <p>{message.text}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-current px-1.5 py-0.5 text-[11px] font-semibold"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

export default function TextPresetAdminPage() {
  const {
    loadingList,
    listError,
    filteredItems,
    categoryOptions,
    summaryStats,
    searchInput,
    selectedTipo,
    selectedCategoria,
    selectedActivo,
    selectedVisible,
    selectedEditPreset,
    savingEdit,
    syncingLegacy,
    busyById,
    flashMessage,
    setSearchInput,
    setSelectedTipo,
    setSelectedCategoria,
    setSelectedActivo,
    setSelectedVisible,
    clearFlashMessage,
    reload,
    openEditPreset,
    openCreatePreset,
    closeEditPreset,
    savePreset,
    duplicatePresetById,
    toggleActivation,
    toggleVisibility,
    removePresetById,
    syncLegacyNow,
  } = useTextPresetAdminState();

  const handleDelete = (presetId) => {
    if (!presetId) return;
    const confirmed = window.confirm("Se eliminara el preset de texto. Esta accion no se puede deshacer.");
    if (!confirmed) return;
    void removePresetById(presetId);
  };

  return (
    <main className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-2 py-2 text-left sm:px-3 lg:px-4">
      <div className="sticky top-0 z-20 flex-none space-y-2 bg-slate-50 pb-2">
        <TextPresetHeader
          summaryStats={summaryStats}
          onCreate={openCreatePreset}
          onReload={() => reload({ trySyncLegacy: false })}
          reloading={loadingList}
          syncingLegacy={syncingLegacy}
          onSyncLegacy={syncLegacyNow}
        />

        <FlashMessage message={flashMessage} onClose={clearFlashMessage} />

        <TextPresetFiltersBar
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          selectedTipo={selectedTipo}
          onTipoChange={setSelectedTipo}
          selectedCategoria={selectedCategoria}
          onCategoriaChange={setSelectedCategoria}
          selectedActivo={selectedActivo}
          onActivoChange={setSelectedActivo}
          selectedVisible={selectedVisible}
          onVisibleChange={setSelectedVisible}
          categoryOptions={categoryOptions}
          filteredTotal={filteredItems.length}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
        <TextPresetGrid
          loading={loadingList}
          error={listError}
          items={filteredItems}
          busyById={busyById}
          onEdit={openEditPreset}
          onDuplicate={duplicatePresetById}
          onToggleActivation={toggleActivation}
          onToggleVisibility={toggleVisibility}
          onDelete={handleDelete}
          onReload={() => reload({ trySyncLegacy: false })}
        />
      </div>

      <TextPresetEditorDrawer
        preset={selectedEditPreset}
        saving={savingEdit}
        onClose={closeEditPreset}
        onSave={savePreset}
      />
    </main>
  );
}

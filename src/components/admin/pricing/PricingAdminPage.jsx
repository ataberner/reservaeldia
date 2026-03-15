import PricingChangeConfirmModal from "@/components/admin/pricing/PricingChangeConfirmModal";
import PricingConfigPanel from "@/components/admin/pricing/PricingConfigPanel";
import PricingHistory from "@/components/admin/pricing/PricingHistory";
import usePricingAdminState from "@/components/admin/pricing/usePricingAdminState";

function PricingPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-4 w-28 rounded bg-slate-200" />
        <div className="mt-4 h-8 w-72 rounded bg-slate-200" />
        <div className="mt-3 h-4 w-full max-w-2xl rounded bg-slate-100" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="h-3 w-28 rounded bg-slate-200" />
            <div className="mt-3 h-8 w-24 rounded bg-slate-100" />
          </div>
        ))}
      </div>

      <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-36 rounded bg-slate-200" />
        <div className="mt-3 h-4 w-full max-w-xl rounded bg-slate-100" />
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-20 rounded-2xl bg-slate-100" />
          <div className="h-20 rounded-2xl bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

export default function PricingAdminPage() {
  const {
    loading,
    loadingMoreHistory,
    saving,
    error,
    success,
    historyError,
    historyUnavailable,
    config,
    form,
    historyItems,
    hasMoreHistory,
    confirmOpen,
    pendingChange,
    canSave,
    isDirty,
    validationMessage,
    setField,
    resetForm,
    reload,
    openConfirm,
    closeConfirm,
    saveChanges,
    loadMoreHistory,
  } = usePricingAdminState();

  const handleReload = () => {
    void reload({ showLoader: true });
  };

  if (loading && !config) {
    return (
      <section className="mx-auto w-full max-w-6xl py-6">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Precios de publicacion</h1>
            <p className="mt-1 text-sm text-gray-600">
              Pricing canonico usado por el checkout y la creacion de pagos.
            </p>
          </div>
          <a
            href="/dashboard"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Volver al dashboard
          </a>
        </header>

        <PricingPageSkeleton />
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl py-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Precios de publicacion</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Administra el pricing canonico que usa el checkout y la integracion con Mercado
            Pago para nuevas publicaciones y actualizaciones.
          </p>
        </div>
        <a
          href="/dashboard"
          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Volver al dashboard
        </a>
      </header>

      {!config ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-red-900">
            No se pudo cargar la configuracion de pricing
          </h2>
          <p className="mt-2 text-sm text-red-700">
            {error || "Ocurrio un problema al consultar el pricing actual."}
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={handleReload}
              className="inline-flex items-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              Reintentar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <PricingConfigPanel
            config={config}
            form={form}
            error={error}
            success={success}
            saving={saving}
            canSave={canSave}
            isDirty={isDirty}
            validationMessage={validationMessage}
            onFieldChange={setField}
            onReset={resetForm}
            onReload={handleReload}
            onOpenConfirm={openConfirm}
          />

          <PricingHistory
            items={historyItems}
            historyError={historyError}
            historyUnavailable={historyUnavailable}
            hasMoreHistory={hasMoreHistory}
            loadingMoreHistory={loadingMoreHistory}
            onLoadMore={loadMoreHistory}
          />
        </div>
      )}

      <PricingChangeConfirmModal
        isOpen={confirmOpen}
        change={pendingChange}
        saving={saving}
        onCancel={closeConfirm}
        onConfirm={saveChanges}
      />
    </section>
  );
}

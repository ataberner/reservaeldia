import { useEffect, useMemo, useState } from "react";
import {
  getBrowserStorageRecoveryState,
  subscribeBrowserStorageRecovery,
} from "@/lib/storage/browserStorageRecovery";
import {
  buildBrowserStorageRecoveryViewModel,
  readDashboardPendingChangesState,
  runBrowserStorageRecoveryReload,
} from "@/domain/dashboard/browserStorageRecoveryUi";

export default function BrowserStorageRecoveryBanner() {
  const [recoveryState, setRecoveryState] = useState(() =>
    getBrowserStorageRecoveryState()
  );
  const [pendingState, setPendingState] = useState(() =>
    readDashboardPendingChangesState({
      canvasEditor:
        typeof window !== "undefined" ? window.canvasEditor || null : null,
    })
  );
  const [reloadState, setReloadState] = useState({
    status: "idle",
    message: "",
    allowUnconfirmed: false,
  });

  useEffect(() => {
    const update = (nextState = getBrowserStorageRecoveryState()) => {
      setRecoveryState(nextState);
      setPendingState(
        readDashboardPendingChangesState({
          canvasEditor:
            typeof window !== "undefined" ? window.canvasEditor || null : null,
        })
      );
    };

    update();
    return subscribeBrowserStorageRecovery(update);
  }, []);

  const viewModel = useMemo(
    () => buildBrowserStorageRecoveryViewModel(recoveryState, pendingState),
    [pendingState, recoveryState]
  );

  if (!viewModel.visible) return null;

  const handleReload = async () => {
    setReloadState((current) => ({
      ...current,
      status: "flushing",
      message: "Intentando confirmar el guardado antes de recargar...",
    }));

    const result = await runBrowserStorageRecoveryReload({
      canvasEditor:
        typeof window !== "undefined" ? window.canvasEditor || null : null,
      allowUnconfirmed: reloadState.allowUnconfirmed,
    });

    if (result?.ok === true) return;

    setPendingState(result?.pendingState || pendingState);
    setReloadState({
      status: "blocked",
      allowUnconfirmed: true,
      message:
        "No pudimos confirmar el guardado. Revisa si estabas editando antes de recargar.",
    });
  };

  return (
    <div
      className="fixed inset-x-0 top-0 z-[1000] border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-lg"
      role="alert"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{viewModel.title}</p>
          <p className="mt-1 text-sm text-amber-900">{viewModel.body}</p>
          <p className="mt-1 text-sm text-amber-900">{viewModel.pendingWarning}</p>
          {reloadState.message && (
            <p className="mt-1 text-sm font-medium text-amber-950">
              {reloadState.message}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleReload}
          disabled={reloadState.status === "flushing"}
          className="shrink-0 rounded-lg bg-amber-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {reloadState.status === "flushing"
            ? "Guardando..."
            : reloadState.allowUnconfirmed
              ? "Recargar de todos modos"
              : viewModel.reloadLabel}
        </button>
      </div>
    </div>
  );
}

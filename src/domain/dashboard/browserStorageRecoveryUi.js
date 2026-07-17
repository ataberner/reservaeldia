function normalizeText(value) {
  return String(value || "").trim();
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        timedOut: true,
        value: null,
      });
    }, Math.max(1000, Number(timeoutMs) || 8000));

    Promise.resolve(promise)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          timedOut: false,
          value,
        });
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          timedOut: false,
          error,
        });
      });
  });
}

export function readDashboardPendingChangesState({ canvasEditor = null } = {}) {
  const bridge =
    canvasEditor && typeof canvasEditor === "object" ? canvasEditor : null;
  const hasFlushBridge = typeof bridge?.flushPersistenceNow === "function";
  const hasPendingReader = typeof bridge?.hasPendingDraftWrites === "function";

  if (!bridge) {
    return {
      known: true,
      hasPendingChanges: false,
      hasFlushBridge: false,
      reason: "editor-unavailable",
    };
  }

  if (!hasPendingReader) {
    return {
      known: false,
      hasPendingChanges: null,
      hasFlushBridge,
      reason: "pending-reader-unavailable",
    };
  }

  try {
    const hasPendingChanges = bridge.hasPendingDraftWrites() === true;
    return {
      known: true,
      hasPendingChanges,
      hasFlushBridge,
      reason: hasPendingChanges ? "pending-writes" : "no-pending-writes",
    };
  } catch {
    return {
      known: false,
      hasPendingChanges: null,
      hasFlushBridge,
      reason: "pending-reader-failed",
    };
  }
}

export function buildBrowserStorageRecoveryViewModel(
  recoveryState,
  pendingState = {}
) {
  const visible =
    recoveryState?.active === true && recoveryState?.storageKind === "indexeddb";
  if (!visible) {
    return {
      visible: false,
      title: "",
      body: "",
      pendingWarning: "",
      reloadLabel: "Recargar",
    };
  }

  let pendingWarning =
    "Si estabas editando, vamos a intentar confirmar el guardado antes de recargar.";
  if (pendingState.known === true && pendingState.hasPendingChanges === true) {
    pendingWarning =
      "Hay cambios pendientes de guardado. Antes de recargar vamos a intentar guardarlos una sola vez.";
  } else if (pendingState.known === true && pendingState.hasPendingChanges === false) {
    pendingWarning =
      "No detectamos guardados pendientes en el editor abierto.";
  } else if (pendingState.known === false) {
    pendingWarning =
      "No podemos confirmar si hay cambios pendientes; no vamos a recargar automaticamente.";
  }

  return {
    visible: true,
    title: "Safari perdio acceso al almacenamiento local",
    body:
      "La pagina puede seguir usando la red, pero el almacenamiento local del navegador quedo inestable. Recargar suele restaurar la conexion.",
    pendingWarning,
    reloadLabel: "Intentar guardar y recargar",
    repetitions: Number(recoveryState?.repetitions || 1),
    operation: normalizeText(recoveryState?.operation),
    phase: normalizeText(recoveryState?.phase),
  };
}

export async function runBrowserStorageRecoveryReload({
  canvasEditor = null,
  reload = null,
  allowUnconfirmed = false,
  flushTimeoutMs = 8000,
} = {}) {
  const pendingState = readDashboardPendingChangesState({ canvasEditor });
  const flushNow =
    canvasEditor && typeof canvasEditor.flushPersistenceNow === "function"
      ? canvasEditor.flushPersistenceNow
      : null;

  if (flushNow && !allowUnconfirmed) {
    const flushOutcome = await withTimeout(
      flushNow({
        reason: "browser-storage-recovery-manual-reload",
      }),
      flushTimeoutMs
    );

    if (flushOutcome.timedOut) {
      return {
        ok: false,
        blocked: true,
        reason: "flush-timeout",
        pendingState,
      };
    }

    if (flushOutcome.error) {
      return {
        ok: false,
        blocked: true,
        reason: "flush-error",
        error: flushOutcome.error,
        pendingState,
      };
    }

    if (flushOutcome.value?.ok !== true) {
      return {
        ok: false,
        blocked: true,
        reason: normalizeText(flushOutcome.value?.reason) || "flush-not-confirmed",
        error: normalizeText(flushOutcome.value?.error),
        pendingState,
      };
    }
  }

  if (!flushNow && pendingState.hasPendingChanges === true && !allowUnconfirmed) {
    return {
      ok: false,
      blocked: true,
      reason: "pending-without-flush-bridge",
      pendingState,
    };
  }

  if (typeof reload === "function") {
    reload();
  } else if (typeof window !== "undefined") {
    window.location.reload();
  }

  return {
    ok: true,
    reloaded: true,
    pendingState,
    allowUnconfirmed: allowUnconfirmed === true,
  };
}

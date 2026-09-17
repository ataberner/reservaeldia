function asTask(task) {
  return typeof task === "function" ? task : () => undefined;
}

export function createDraftWriteCoordinator() {
  let tail = Promise.resolve();
  let pendingWrites = 0;
  let coalescibleTail = null;

  const enqueueDraftWrite = (task, { coalesceKey = "" } = {}) => {
    const key = typeof coalesceKey === "string" ? coalesceKey : "";
    if (key && coalescibleTail?.key === key) {
      coalescibleTail.runTask = asTask(task);
      return coalescibleTail.promise;
    }
    const entry = { key, runTask: asTask(task), promise: null };
    // Only consecutive, not-yet-started complete snapshots may supersede each
    // other. Every ordinary mutation/flush seals the preceding queue position.
    coalescibleTail = key ? entry : null;
    pendingWrites += 1;

    const taskPromise = tail.catch(() => undefined).then(() => {
      if (coalescibleTail === entry) coalescibleTail = null;
      return entry.runTask();
    });
    entry.promise = taskPromise;
    tail = taskPromise.catch(() => undefined).finally(() => {
      pendingWrites = Math.max(0, pendingWrites - 1);
    });

    return taskPromise;
  };

  return {
    enqueueDraftWrite,
    waitForDraftWrites() {
      return tail;
    },
    hasPendingDraftWrites() {
      return pendingWrites > 0;
    },
  };
}

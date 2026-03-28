function asTask(task) {
  return typeof task === "function" ? task : () => undefined;
}

export function createDraftWriteCoordinator() {
  let tail = Promise.resolve();
  let pendingWrites = 0;

  const enqueueDraftWrite = (task) => {
    const runTask = asTask(task);
    pendingWrites += 1;

    const taskPromise = tail.catch(() => undefined).then(() => runTask());
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

// Local, value-free measurements; no message, snapshot or draft identity.
export const DESIGNER_AI_TIMING_EVENT = "designer-ai-turn-timing";

export function createDesignerAiTurnTiming(now = () => performance.now()) {
  const started = now();
  const stages = { contextMs: 0, callableMs: 0, actionsAndPersistenceMs: 0, metadataMs: 0 };
  const milestones = { firstFeedbackMs: null, responseReadyMs: null };
  let outcome = null;
  let published = false;
  let batchId = null;
  return {
    setBatchId(value) {
      if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) batchId = value;
    },
    startStage(stage) {
      const stageStarted = now();
      let stopped = false;
      return () => {
        if (stopped || !Object.hasOwn(stages, stage)) return;
        stopped = true;
        stages[stage] += Math.max(0, now() - stageStarted);
      };
    },
    markFeedback() {
      if (milestones.firstFeedbackMs === null) milestones.firstFeedbackMs = Math.max(0, now() - started);
    },
    complete(status) {
      outcome = ["success", "error", "duplicate"].includes(status) ? status : "error";
      milestones.responseReadyMs = Math.max(0, now() - started);
    },
    publish(targetWindow) {
      if (!outcome || published) return;
      published = true;
      const detail = { ...stages, ...milestones, responseVisibleMs: Math.max(0, now() - started), outcome, ...(batchId ? { batchId } : {}) };
      targetWindow.dispatchEvent(new targetWindow.CustomEvent(DESIGNER_AI_TIMING_EVENT, { detail }));
    },
  };
}

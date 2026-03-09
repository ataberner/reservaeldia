import { useEffect } from "react";
import {
  INLINE_ALIGNMENT_MODEL_V2_VERSION,
  summarizeInlineTrace,
} from "@/components/editor/overlays/inlineAlignmentModelV2";
import { INLINE_LAYOUT_VERSION } from "@/components/editor/overlays/inlineEditor/inlineEditorConstants";

export default function useInlineTraceBridge({
  isPhaseAtomicV2,
  normalizedOverlayEngine,
}) {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!Array.isArray(window.__INLINE_TRACE)) {
      window.__INLINE_TRACE = [];
    }
    if (!window.__INLINE_TEST || typeof window.__INLINE_TEST !== "object") {
      window.__INLINE_TEST = {};
    }
    const runMatrix = async (options = {}) => {
      const trace = Array.isArray(window.__INLINE_TRACE) ? [...window.__INLINE_TRACE] : [];
      const summary = summarizeInlineTrace({
        trace,
        maxErrorPx: Number.isFinite(Number(options?.maxErrorPx))
          ? Number(options.maxErrorPx)
          : 0.5,
        phases: Array.isArray(options?.phases) ? options.phases : undefined,
      });
      return {
        generatedAt: new Date().toISOString(),
        engine: normalizedOverlayEngine,
        modelVersion: isPhaseAtomicV2
          ? `${INLINE_LAYOUT_VERSION}-${INLINE_ALIGNMENT_MODEL_V2_VERSION}`
          : INLINE_LAYOUT_VERSION,
        alignmentModelVersion: INLINE_ALIGNMENT_MODEL_V2_VERSION,
        summary,
        sampleCount: trace.length,
        trace,
      };
    };
    const clearTrace = () => {
      window.__INLINE_TRACE = [];
      return true;
    };
    const getFocusRcaTrace = () =>
      Array.isArray(window.__INLINE_FOCUS_RCA_TRACE)
        ? [...window.__INLINE_FOCUS_RCA_TRACE]
        : [];
    const clearFocusRcaTrace = () => {
      window.__INLINE_FOCUS_RCA_TRACE = [];
      window.__INLINE_FOCUS_RCA_SESSION = {};
      return true;
    };

    window.__INLINE_TEST.runMatrix = runMatrix;
    window.__INLINE_TEST.clearTrace = clearTrace;
    window.__INLINE_TEST.getFocusRcaTrace = getFocusRcaTrace;
    window.__INLINE_TEST.clearFocusRcaTrace = clearFocusRcaTrace;
    return () => {
      if (window.__INLINE_TEST?.runMatrix === runMatrix) {
        delete window.__INLINE_TEST.runMatrix;
      }
      if (window.__INLINE_TEST?.clearTrace === clearTrace) {
        delete window.__INLINE_TEST.clearTrace;
      }
      if (window.__INLINE_TEST?.getFocusRcaTrace === getFocusRcaTrace) {
        delete window.__INLINE_TEST.getFocusRcaTrace;
      }
      if (window.__INLINE_TEST?.clearFocusRcaTrace === clearFocusRcaTrace) {
        delete window.__INLINE_TEST.clearFocusRcaTrace;
      }
    };
  }, [isPhaseAtomicV2, normalizedOverlayEngine]);
}

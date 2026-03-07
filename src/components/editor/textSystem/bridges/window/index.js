export {
  getCurrentInlineEditingId,
  setCurrentInlineEditingId,
  clearCurrentInlineEditingIdIfMatches,
  getInlineEditingSnapshot,
  setInlineEditingSnapshot,
  clearInlineEditingSnapshotIfMatches,
  getWindowElementRefs,
  getWindowObjectResolver,
  getInlineResizeData,
  setInlineResizeData,
  clearInlineResizeData,
} from "@/components/editor/textSystem/bridges/window/inlineWindowBridge";
export { default as useInlineGlobalEditingSync } from "@/components/editor/textSystem/bridges/window/useInlineGlobalEditingSync";

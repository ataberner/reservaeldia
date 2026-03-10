export { default as useInlineDebugEmitterCore } from "@/components/editor/textSystem/debug/useInlineDebugEmitterCore";
export { default as useInlineTraceBridge } from "@/components/editor/textSystem/debug/useInlineTraceBridge";
export { buildInlineTextBoxesPayload } from "@/components/editor/textSystem/debug/buildInlineTextBoxesPayload";
export {
  buildInlineCaretComparisonPayload,
  buildInlineCaretStateSnapshot,
} from "@/components/editor/textSystem/debug/buildInlineCaretComparisonPayload";
export {
  buildInlineTextWithCaretComparisonPayload,
  buildInlineTextWithCaretSnapshot,
} from "@/components/editor/textSystem/debug/buildInlineTextWithCaretComparisonPayload";
export { buildInlineTextInkPositionDiagPayload } from "@/components/editor/textSystem/debug/buildInlineTextInkPositionDiagPayload";
export {
  emitSemanticCaretDebug,
  emitSemanticCaretPositionDebug,
  isSemanticCaretDebugEnabled,
  isSemanticCaretPositionDebugEnabled,
  rectToSemanticCaretPayload,
  roundSemanticCaretMetric,
} from "@/components/editor/textSystem/debug/semanticHiddenCaretDebug";

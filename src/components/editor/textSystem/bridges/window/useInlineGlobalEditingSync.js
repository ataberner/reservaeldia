import { useEffect } from "react";
import {
  clearCurrentInlineEditingIdIfMatches,
  clearInlineEditingSnapshotIfMatches,
  getCurrentInlineEditingId,
  setCurrentInlineEditingId,
  setInlineEditingSnapshot,
} from "@/components/editor/textSystem/bridges/window/inlineWindowBridge";

export default function useInlineGlobalEditingSync({
  editing,
  inlineDebugLog,
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    setInlineEditingSnapshot(editing);
  }, [editing.id, editing.value]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const previousCurrentEditingId = getCurrentInlineEditingId();
    setCurrentInlineEditingId(editing?.id || null);

    inlineDebugLog("sync-global-editing", {
      editingId: editing?.id || null,
      valueLength: String(editing?.value ?? "").length,
      previousCurrentEditingId,
      nextCurrentEditingId: getCurrentInlineEditingId(),
    });

    return () => {
      inlineDebugLog("sync-global-editing-cleanup", {
        editingId: editing?.id || null,
        currentEditingId: getCurrentInlineEditingId(),
      });
      clearInlineEditingSnapshotIfMatches(editing.id);
      clearCurrentInlineEditingIdIfMatches(editing.id);
    };
  }, [editing.id, inlineDebugLog]);
}

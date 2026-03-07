import useCanvasEditorInlineRuntime from "@/components/editor/canvasEditor/useCanvasEditorInlineRuntime";
import useCanvasEditorInlineCommitHandlers from "@/components/editor/canvasEditor/useCanvasEditorInlineCommitHandlers";

export default function useCanvasEditorTextSystem({
  runtimeParams,
  commitParams,
}) {
  const runtime = useCanvasEditorInlineRuntime(runtimeParams);
  const resolvedCommitParams =
    typeof commitParams === "function" ? commitParams(runtime) : commitParams;
  const commit = useCanvasEditorInlineCommitHandlers(resolvedCommitParams);

  return {
    ...runtime,
    ...commit,
  };
}

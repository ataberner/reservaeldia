import InlineTextEditor from "@/components/InlineTextEditor";
import DividersOverlayStage from "@/components/canvas/DividersOverlayStage";

export default function CanvasInlineEditingLayer({
  editing,
  elementRefs,
  objetos,
  handleInlineOverlaySwapRequest,
  onInlineChange,
  onInlineDebugEvent,
  onInlineFinish,
  escalaVisual,
  inlineDebugAB,
  inlineSwapAck,
  isMobile,
  zoom,
  altoCanvasDinamico,
  seccionesOrdenadas,
}) {
  return (
    <>
      {editing.id && elementRefs.current[editing.id] && (() => {
        const objetoEnEdicion = objetos.find((o) => o.id === editing.id);
        const keepCenterDuringEdit =
          Boolean(objetoEnEdicion) &&
          objetoEnEdicion.tipo === "texto" &&
          !objetoEnEdicion.__groupAlign &&
          !Number.isFinite(Number(objetoEnEdicion.width)) &&
          objetoEnEdicion.__autoWidth !== false;

        return (
          <InlineTextEditor
            editingId={editing.id}
            node={elementRefs.current[editing.id]}
            value={editing.value}
            textAlign={objetoEnEdicion?.align || "left"}
            maintainCenterWhileEditing={keepCenterDuringEdit}
            onOverlaySwapRequest={handleInlineOverlaySwapRequest}
            onChange={onInlineChange}
            onDebugEvent={onInlineDebugEvent}
            onFinish={onInlineFinish}
            scaleVisual={escalaVisual}
            finishMode={inlineDebugAB.finishMode}
            widthMode={inlineDebugAB.overlayWidthMode}
            overlayEngine={inlineDebugAB.overlayEngine}
            swapAckToken={inlineSwapAck}
          />
        );
      })()}

      {!isMobile && (
        <DividersOverlayStage
          zoom={zoom}
          altoCanvasDinamico={altoCanvasDinamico}
          seccionesOrdenadas={seccionesOrdenadas}
        />
      )}
    </>
  );
}

import { createPortal } from "react-dom";
import HiddenSemanticTextBackend from "@/components/editor/textSystem/render/domSemantic/HiddenSemanticTextBackend";
import DividersOverlayStage from "@/components/canvas/DividersOverlayStage";

export default function CanvasInlineEditingLayer({
  editing,
  elementRefs,
  objetos,
  escalaVisual,
  textEditController,
  textEditBackendController,
  isMobile,
  zoom,
  altoCanvasDinamico,
  seccionesOrdenadas,
}) {
  const semanticBackend =
    editing.id && elementRefs.current[editing.id] && (() => {
      const objetoEnEdicion = objetos.find((o) => o.id === editing.id);
      const keepCenterDuringEdit =
        Boolean(objetoEnEdicion) &&
        objetoEnEdicion.tipo === "texto" &&
        !objetoEnEdicion.__groupAlign &&
        !Number.isFinite(Number(objetoEnEdicion.width)) &&
        objetoEnEdicion.__autoWidth !== false;

        return (
          <HiddenSemanticTextBackend
            editing={editing}
            node={elementRefs.current[editing.id]}
            controller={textEditBackendController || textEditController}
            textAlign={objetoEnEdicion?.align || "left"}
            scaleVisual={escalaVisual}
            preserveCenterDuringEdit={keepCenterDuringEdit}
          />
        );
      })();

  return (
    <>
      {semanticBackend && typeof document !== "undefined"
        ? createPortal(semanticBackend, document.body)
        : semanticBackend}

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

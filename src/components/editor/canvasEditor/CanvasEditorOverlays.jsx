import { Settings } from "lucide-react";
import MenuOpcionesElemento from "@/components/MenuOpcionesElemento";
import FloatingTextToolbar from "@/components/editor/toolbar/FloatingTextToolbar";
import TemplateFieldBadgeOverlay from "@/components/editor/templateAuthoring/TemplateFieldBadgeOverlay";
import ConfirmDeleteSectionModal from "@/components/editor/sections/ConfirmDeleteSectionModal";

export default function CanvasEditorOverlays({
  elementosSeleccionados,
  editingId,
  isSelectionRotating,
  botonOpcionesRef,
  optionButtonSize,
  togglePanelOpciones,
  isMobile,
  canManageSite,
  templateAuthoringStatusClass,
  templateAuthoring,
  templateAuthoringStatus,
  templateAuthoringStatusLabel,
  editorOverlayRootRef,
  stageRef,
  elementRefs,
  hoverId,
  mostrarPanelZ,
  objetos,
  onCopiar,
  onPegar,
  onDuplicar,
  onEliminar,
  moverElemento,
  setMostrarPanelZ,
  reemplazarFondo,
  secciones,
  setSecciones,
  setObjetos,
  setElementosSeleccionados,
  abrirPanelRsvp,
  canRenderTemplateAuthoringMenu,
  handleViewTemplateFieldUsage,
  objetoSeleccionado,
  mostrarSelectorFuente,
  setMostrarSelectorFuente,
  mostrarSelectorTamano,
  setMostrarSelectorTamano,
  allFonts,
  fontManager,
  tamaniosDisponibles,
  onCambiarAlineacion,
  deleteSectionModal,
  seccionPendienteEliminar,
  cantidadElementosSeccionPendiente,
  isDeletingSection,
  cerrarModalBorrarSeccion,
  confirmarBorrarSeccion,
}) {
  return (
    <>
      {elementosSeleccionados.length === 1 && !editingId && !isSelectionRotating && (
        <div
          ref={botonOpcionesRef}
          data-option-button="true"
          className="absolute z-50 bg-white border-2 border-purple-500 rounded-full shadow-lg hover:shadow-xl transition-shadow duration-200"
          style={{
            left: "0px",
            top: "0px",
            width: `${optionButtonSize}px`,
            height: `${optionButtonSize}px`,
            display: "none",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "auto",
            transition: "none",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(4px)",
            border: "2px solid #773dbe",
            touchAction: "manipulation",
          }}
        >
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              togglePanelOpciones("gear-pointerdown", e.nativeEvent || e);
            }}
            onClick={(e) => {
              if (e.detail !== 0) return;
              e.stopPropagation();
              togglePanelOpciones("gear-keyboard-click", e.nativeEvent || e);
            }}
            className="hover:bg-purple-50 w-full h-full rounded-full flex items-center justify-center transition-colors"
            title="Opciones del elemento"
            aria-label="Opciones del elemento"
            style={{ touchAction: "manipulation" }}
          >
            <Settings
              className="text-purple-700"
              style={{ width: isMobile ? 18 : 14, height: isMobile ? 18 : 14 }}
            />
          </button>
        </div>
      )}

      {canManageSite && (
        <div
          className={`pointer-events-none absolute right-3 top-3 z-[70] rounded-full border px-3 py-1 text-[11px] font-semibold shadow-sm ${templateAuthoringStatusClass}`}
          title={
            !templateAuthoring.canConfigure
              ? "Este borrador no tiene plantilla base para configurar schema."
              : templateAuthoringStatus.isReady
              ? "Schema dinamico listo para publicar."
              : "Corrige inconsistencias de mapping antes de guardar plantilla."
          }
        >
          {templateAuthoringStatusLabel}
        </div>
      )}

      {canManageSite && (
        <TemplateFieldBadgeOverlay
          layoutRootRef={editorOverlayRootRef}
          stageRef={stageRef}
          elementRefs={elementRefs}
          selectedElementId={elementosSeleccionados[0] || ""}
          hoveredElementId={hoverId || ""}
          fieldIndexByElementId={templateAuthoring.fieldIndexByElementId}
          fieldsSchema={templateAuthoring.fieldsSchema}
          isMobile={isMobile}
        />
      )}

      {mostrarPanelZ && (
        <MenuOpcionesElemento
          isOpen={mostrarPanelZ}
          botonOpcionesRef={botonOpcionesRef}
          elementoSeleccionado={objetos.find((o) => o.id === elementosSeleccionados[0])}
          onCopiar={onCopiar}
          onPegar={onPegar}
          onDuplicar={onDuplicar}
          onEliminar={onEliminar}
          moverElemento={moverElemento}
          onCerrar={() => setMostrarPanelZ(false)}
          reemplazarFondo={reemplazarFondo}
          secciones={secciones}
          objetos={objetos}
          setSecciones={setSecciones}
          setObjetos={setObjetos}
          setElementosSeleccionados={setElementosSeleccionados}
          onConfigurarRsvp={() => abrirPanelRsvp({ forcePresetSelection: false })}
          canManageSite={canManageSite}
          templateAuthoring={
            canRenderTemplateAuthoringMenu
              ? {
                  canConfigure: templateAuthoring.canConfigure,
                  loading: templateAuthoring.loading,
                  saving: templateAuthoring.saving,
                  error: templateAuthoring.error,
                  selectedElementType: templateAuthoring.selectedElementType,
                  selectedIsSupportedElement: templateAuthoring.selectedIsSupportedElement,
                  selectedElementDefaultFieldType:
                    templateAuthoring.selectedElementDefaultFieldType,
                  selectedField: templateAuthoring.selectedField,
                  fieldsSchema: templateAuthoring.fieldsSchema,
                  onCreateField: templateAuthoring.createFieldFromSelection,
                  onLinkField: templateAuthoring.linkSelectionToField,
                  onEditField: templateAuthoring.editField,
                  onUnlinkField: templateAuthoring.unlinkSelection,
                  onDeleteField: templateAuthoring.deleteField,
                  onViewUsage: handleViewTemplateFieldUsage,
                }
              : null
          }
        />
      )}

      <FloatingTextToolbar
        objetoSeleccionado={objetoSeleccionado}
        setObjetos={setObjetos}
        elementosSeleccionados={elementosSeleccionados}
        mostrarSelectorFuente={mostrarSelectorFuente}
        setMostrarSelectorFuente={setMostrarSelectorFuente}
        mostrarSelectorTamano={mostrarSelectorTamano}
        setMostrarSelectorTamano={setMostrarSelectorTamano}
        ALL_FONTS={allFonts}
        fontManager={fontManager}
        tamaniosDisponibles={tamaniosDisponibles}
        onCambiarAlineacion={onCambiarAlineacion}
      />

      <ConfirmDeleteSectionModal
        isOpen={deleteSectionModal.isOpen}
        sectionName={seccionPendienteEliminar?.tipo}
        itemCount={cantidadElementosSeccionPendiente}
        isDeleting={isDeletingSection}
        onCancel={cerrarModalBorrarSeccion}
        onConfirm={confirmarBorrarSeccion}
      />
    </>
  );
}

import { Settings, Tag } from "lucide-react";
import MenuOpcionesElemento from "@/components/MenuOpcionesElemento";
import FloatingTextToolbar from "@/components/editor/toolbar/FloatingTextToolbar";
import TemplateFieldBadgeOverlay from "@/components/editor/templateAuthoring/TemplateFieldBadgeOverlay";
import ConfirmDeleteSectionModal from "@/components/editor/sections/ConfirmDeleteSectionModal";

export default function CanvasEditorOverlays({
  readOnly,
  elementosSeleccionados,
  overlaySelection,
  editingId,
  isSelectionRotating,
  botonOpcionesRef,
  optionButtonSize,
  togglePanelOpciones,
  isMobile,
  canManageSite,
  templateAuthoring,
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
  setSeccionActivaId,
  setSectionDecorationEdit,
  usarComoDecoracionFondo,
  abrirPanelRsvp,
  abrirPanelRegalos,
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
  calcularPatchTextoDesdeCentro,
  obtenerCentroVisualTextoX,
  canOpenTemplateEditorialPanel,
  templateWorkspace,
  onOpenTemplateEditorialPanel,
  deleteSectionModal,
  seccionPendienteEliminar,
  cantidadElementosSeccionPendiente,
  isDeletingSection,
  cerrarModalBorrarSeccion,
  confirmarBorrarSeccion,
  sectionDecorationEdit,
  onConvertirDecoracionFondoEnImagen,
  onEliminarDecoracionFondo,
  onFinalizarAjusteDecoracionFondo,
  onActualizarMovimientoDecoracionFondo,
  onDesanclarImagenFondoBase,
  onFinalizarAjusteFondoBase,
}) {
  const workspaceStateLabel =
    templateWorkspace?.estadoEditorial === "en_revision"
      ? "En revision"
      : templateWorkspace?.estadoEditorial === "en_proceso"
        ? "En proceso"
        : "Publicada";
  const shouldShowTemplateFieldBadge =
    canManageSite && templateWorkspace?.mode === "template_edit";
  const overlayKind = overlaySelection?.kind || null;
  const menuSelection = overlaySelection?.menuItem || null;
  const isBackgroundDecorationEditing = overlayKind === "background-decoration";
  const isSectionBaseImageEditing = overlayKind === "section-base-image";
  const shouldShowOptionButton =
    !readOnly &&
    !editingId &&
    !isSelectionRotating &&
    Boolean(menuSelection);
  const optionButtonTitle = isBackgroundDecorationEditing
    ? "Opciones de la decoracion"
    : isSectionBaseImageEditing
      ? "Opciones del fondo"
      : "Opciones del elemento";

  return (
    <>
      {shouldShowOptionButton && (
        <div
          ref={botonOpcionesRef}
          data-option-button="true"
          className="absolute z-[60] bg-white border-2 border-purple-500 rounded-full shadow-lg hover:shadow-xl transition-shadow duration-200"
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
            title={optionButtonTitle}
            aria-label={optionButtonTitle}
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
        <div className="absolute right-3 top-3 z-[70] flex max-w-[280px] flex-col items-end gap-2">
          {canOpenTemplateEditorialPanel ? (
            <button
              type="button"
              onClick={onOpenTemplateEditorialPanel}
              className="inline-flex items-center gap-2 rounded-full border border-[#d6c3f5] bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-[#6f3bc0] shadow-sm transition hover:bg-[#faf6ff]"
            >
              <Tag className="h-3.5 w-3.5" />
              <span>Etiquetas y estado</span>
              <span className="rounded-full border border-[#eadffd] bg-[#faf6ff] px-2 py-0.5 text-[10px] font-semibold text-[#6f3bc0]">
                {workspaceStateLabel}
              </span>
            </button>
          ) : null}
        </div>
      )}

      {shouldShowTemplateFieldBadge && (
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
          elementoSeleccionado={menuSelection}
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
          setSeccionActivaId={setSeccionActivaId}
          setSectionDecorationEdit={setSectionDecorationEdit}
          usarComoDecoracionFondo={usarComoDecoracionFondo}
          onConvertirDecoracionFondoEnImagen={onConvertirDecoracionFondoEnImagen}
          onEliminarDecoracionFondo={onEliminarDecoracionFondo}
          onFinalizarAjusteDecoracionFondo={onFinalizarAjusteDecoracionFondo}
          onActualizarMovimientoDecoracionFondo={onActualizarMovimientoDecoracionFondo}
          onDesanclarImagenFondoBase={onDesanclarImagenFondoBase}
          onFinalizarAjusteFondoBase={onFinalizarAjusteFondoBase}
          onConfigurarRsvp={() => abrirPanelRsvp({ forcePresetSelection: false })}
          onConfigurarRegalos={() => abrirPanelRegalos()}
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
        calcularPatchTextoDesdeCentro={calcularPatchTextoDesdeCentro}
        obtenerCentroVisualTextoX={obtenerCentroVisualTextoX}
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

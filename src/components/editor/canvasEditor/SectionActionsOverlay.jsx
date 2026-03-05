import { createPortal } from "react-dom";
import {
  Trash2,
  Layers,
  MoveUp,
  MoveDown,
  PlusCircle,
  Unlink2,
  Monitor,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { calcularOffsetY } from "@/utils/layout";
import SelectorColorSeccion from "@/components/SelectorColorSeccion";
import { toCssBackground } from "@/domain/colors/presets";
import { normalizarAltoModo } from "@/components/editor/canvasEditor/canvasEditorCoreUtils";
import { desanclarImagenDeFondo as desanclarFondo } from "@/utils/accionesFondo";
import { guardarSeccionComoPlantilla } from "@/utils/plantillas";

export default function SectionActionsOverlay({
  seccionActivaId,
  seccionesOrdenadas,
  altoCanvas,
  seccionesAnimando,
  isMobile,
  mobileSectionActionsTop,
  mobileSectionActionsOpen,
  setMobileSectionActionsOpen,
  handleCrearSeccion,
  moverSeccionConScroll,
  isDeletingSection,
  cambiarColorFondoSeccion,
  togglePantallaCompletaSeccion,
  secciones,
  objetos,
  setSecciones,
  setObjetos,
  setElementosSeleccionados,
  mobileBackgroundEditSectionId,
  setMobileBackgroundEditSectionId,
  canManageSite,
  refrescarPlantillasDeSeccion,
  abrirModalBorrarSeccion,
}) {
  return (
    <>
      {seccionActivaId && seccionesOrdenadas.map((seccion, index) => {
        if (seccion.id !== seccionActivaId) return null;

        const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
        const esPrimera = index === 0;
        const esUltima = index === seccionesOrdenadas.length - 1;
        const estaAnimando = seccionesAnimando.includes(seccion.id);
        const sectionActionCompact = !isMobile;
        const sectionButtonBase = sectionActionCompact
          ? "h-8 w-8 rounded-lg text-xs font-semibold transition-all duration-200 border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dccaf7] inline-flex items-center justify-center"
          : "px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dccaf7]";
        const sectionButtonDisabled =
          "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 shadow-none";
        const sectionButtonPrimary =
          "border-[#ccb6ef] bg-gradient-to-r from-[#8a57cf] via-[#773dbe] to-[#6737b3] text-white shadow-[0_10px_22px_rgba(119,61,190,0.30)] hover:-translate-y-[1px] hover:from-[#7f4fc5] hover:via-[#6f3bbc] hover:to-[#5f31a8] hover:shadow-[0_14px_28px_rgba(119,61,190,0.38)]";
        const sectionButtonNeutral =
          "border-[#e4d7f6] bg-white/95 text-[#5f3596] shadow-[0_6px_16px_rgba(15,23,42,0.06)] hover:-translate-y-[1px] hover:border-[#cdb9ee] hover:bg-[#faf6ff] hover:shadow-[0_12px_24px_rgba(119,61,190,0.16)]";
        const sectionButtonSuccess =
          "border-emerald-300 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-[0_10px_22px_rgba(5,150,105,0.28)] hover:-translate-y-[1px] hover:from-emerald-600 hover:to-emerald-700 hover:shadow-[0_14px_28px_rgba(5,150,105,0.36)]";
        const sectionButtonDanger =
          "border-rose-300 bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-[0_10px_22px_rgba(225,29,72,0.28)] hover:-translate-y-[1px] hover:from-rose-600 hover:to-red-700 hover:shadow-[0_14px_28px_rgba(225,29,72,0.36)]";
        const sectionIconClass = sectionActionCompact ? "w-4 h-4" : "w-3.5 h-3.5";
        const sectionActionsStackClass = sectionActionCompact
          ? "flex flex-col items-center gap-1.5 rounded-xl border border-[#e4d7f6] bg-white/95 p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.14)] backdrop-blur"
          : "flex flex-col gap-2";
        const renderSectionActionContent = (IconComponent, label) => (
          <span className={`inline-flex items-center ${sectionActionCompact ? "justify-center" : "gap-1.5"}`}>
            <IconComponent className={sectionIconClass} />
            {!sectionActionCompact ? label : null}
          </span>
        );

        const actionButtons = (
          <>
            <button
              onClick={() =>
                moverSeccionConScroll({
                  seccionId: seccion.id,
                  direccion: "subir",
                })
              }
              disabled={esPrimera || estaAnimando}
              className={`${sectionButtonBase} ${esPrimera || estaAnimando
                ? sectionButtonDisabled
                : sectionButtonPrimary
                } ${estaAnimando ? "animate-pulse" : ""}`}
              title={esPrimera ? "Ya es la primera seccion" : "Subir seccion"}
              aria-label="Subir seccion"
            >
              {renderSectionActionContent(MoveUp, "Subir seccion")}
            </button>

            <button
              onClick={() =>
                moverSeccionConScroll({
                  seccionId: seccion.id,
                  direccion: "bajar",
                })
              }
              disabled={esUltima || estaAnimando}
              className={`${sectionButtonBase} ${esUltima || estaAnimando
                ? sectionButtonDisabled
                : sectionButtonPrimary
                } ${estaAnimando ? "animate-pulse" : ""}`}
              title={esUltima ? "Ya es la ultima seccion" : "Bajar seccion"}
              aria-label="Bajar seccion"
            >
              {renderSectionActionContent(MoveDown, "Bajar seccion")}
            </button>

            <button
              onClick={handleCrearSeccion}
              disabled={estaAnimando}
              className={`${sectionButtonBase} ${estaAnimando
                ? `${sectionButtonDisabled} animate-pulse`
                : sectionButtonPrimary
                }`}
              title="Anadir una nueva seccion debajo"
              aria-label="Anadir seccion"
            >
              {renderSectionActionContent(PlusCircle, "Anadir seccion")}
            </button>

            {sectionActionCompact ? (
              <SelectorColorSeccion
                seccion={seccion}
                compact
                disabled={estaAnimando || isDeletingSection}
                onChange={(id, color) => cambiarColorFondoSeccion(id, color)}
              />
            ) : (
              <div
                className={`${sectionButtonBase} ${sectionButtonNeutral} flex items-center justify-between gap-2`}
                title="Cambiar color de fondo de esta seccion"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-3.5 w-3.5 rounded border border-white/80 shadow-sm"
                    style={{ background: toCssBackground(seccion.fondo, "#ffffff") }}
                  />
                  Fondo seccion
                </span>
                <SelectorColorSeccion
                  seccion={seccion}
                  disabled={estaAnimando || isDeletingSection}
                  onChange={(id, color) => cambiarColorFondoSeccion(id, color)}
                />
              </div>
            )}

            {(() => {
              const modoSeccion = normalizarAltoModo(seccion.altoModo);
              const esPantalla = modoSeccion === "pantalla";

              return (
                <div className={sectionActionCompact ? "flex flex-col items-center gap-1.5" : "flex flex-wrap items-center gap-2"}>
                  <button
                    onClick={() => togglePantallaCompletaSeccion(seccion.id)}
                    className={`${sectionButtonBase} ${esPantalla
                      ? sectionButtonPrimary
                      : sectionButtonNeutral
                      }`}
                    title="Pantalla completa de la seccion"
                    aria-label={esPantalla ? "Pantalla completa activada" : "Pantalla completa desactivada"}
                  >
                    {renderSectionActionContent(
                      Monitor,
                      esPantalla ? "Pantalla completa: ON" : "Pantalla completa: OFF"
                    )}
                  </button>

                  {seccion.fondoTipo === "imagen" && (
                    <button
                      onClick={() =>
                        desanclarFondo({
                          seccionId: seccion.id,
                          secciones,
                          objetos,
                          setSecciones,
                          setObjetos,
                          setElementosSeleccionados,
                        })
                      }
                      className={`${sectionButtonBase} ${sectionButtonNeutral}`}
                      title="Desanclar imagen de fondo"
                      aria-label="Desanclar imagen de fondo"
                    >
                      {renderSectionActionContent(Unlink2, "Desanclar fondo")}
                    </button>
                  )}

                  {seccion.fondoTipo === "imagen" && isMobile && (
                    <button
                      onClick={() => {
                        setMobileBackgroundEditSectionId((prev) =>
                          prev === seccion.id ? null : seccion.id
                        );
                      }}
                      className={`${sectionButtonBase} ${
                        mobileBackgroundEditSectionId === seccion.id
                          ? "border-indigo-300 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-[0_10px_22px_rgba(79,70,229,0.28)] hover:-translate-y-[1px] hover:from-indigo-600 hover:to-indigo-700 hover:shadow-[0_14px_28px_rgba(79,70,229,0.36)]"
                          : sectionButtonNeutral
                      }`}
                      title="Modo mover fondo en mobile"
                      aria-label="Modo mover fondo"
                    >
                      {mobileBackgroundEditSectionId === seccion.id
                        ? "Mover fondo: ON"
                        : "Mover fondo"}
                    </button>
                  )}
                </div>
              );
            })()}

            {canManageSite && (
              <button
                onClick={() =>
                  guardarSeccionComoPlantilla({
                    seccionId: seccion.id,
                    secciones,
                    objetos,
                    refrescarPlantillasDeSeccion,
                  })
                }
                disabled={estaAnimando}
                className={`${sectionButtonBase} ${estaAnimando
                  ? sectionButtonDisabled
                  : sectionButtonSuccess
                  } ${estaAnimando ? "animate-pulse" : ""}`}
                title="Guardar esta seccion como plantilla"
                aria-label="Guardar seccion como plantilla"
              >
                {renderSectionActionContent(Layers, "Plantilla")}
              </button>
            )}

            <button
              onClick={() => {
                if (isMobile) {
                  setMobileSectionActionsOpen(false);
                }
                abrirModalBorrarSeccion(seccion.id);
              }}
              disabled={estaAnimando || isDeletingSection}
              className={`${sectionButtonBase} ${estaAnimando || isDeletingSection
                ? sectionButtonDisabled
                : sectionButtonDanger
                } ${estaAnimando || isDeletingSection ? "animate-pulse" : ""}`}
              title="Borrar esta seccion y todos sus elementos"
              aria-label="Borrar seccion"
            >
              {renderSectionActionContent(Trash2, "Borrar seccion")}
            </button>
          </>
        );

        if (isMobile) {
          if (typeof document === "undefined") return null;
          return createPortal(
            <div
              className="fixed z-[90] flex flex-col items-end gap-2"
              style={{
                top: mobileSectionActionsTop,
                right: "max(8px, env(safe-area-inset-right, 0px))",
              }}
            >
              <button
                type="button"
                onClick={() => setMobileSectionActionsOpen((prev) => !prev)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ccb6ef] bg-gradient-to-r from-[#8a57cf] via-[#773dbe] to-[#6737b3] text-white shadow-[0_10px_22px_rgba(119,61,190,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:from-[#7f4fc5] hover:via-[#6f3bbc] hover:to-[#5f31a8] hover:shadow-[0_14px_28px_rgba(119,61,190,0.42)]"
                title="Acciones de seccion"
              >
                {mobileSectionActionsOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {mobileSectionActionsOpen && (
                <div className="w-[min(84vw,230px)] max-h-[62vh] overflow-y-auto rounded-xl border border-purple-200 bg-white/95 p-2 shadow-2xl backdrop-blur">
                  <div className="flex flex-col gap-2">{actionButtons}</div>
                </div>
              )}
            </div>,
            document.body,
            `orden-mobile-${seccion.id}`
          );
        }

        const desktopPanelWidth = sectionActionCompact ? 56 : 260;

        return (
          <div
            key={`orden-${seccion.id}`}
            className={`absolute ${sectionActionsStackClass}`}
            style={{
              top: offsetY + 20,
              right: sectionActionCompact ? 10 : -150,
              zIndex: 25,
              maxWidth: sectionActionCompact ? desktopPanelWidth : 260,
            }}
          >
            {actionButtons}
          </div>
        );
      })}
    </>
  );
}

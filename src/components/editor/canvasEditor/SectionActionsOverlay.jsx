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

const DESKTOP_PANEL_WIDTH = 76;
const DESKTOP_PANEL_RIGHT = 12;

const DESKTOP_TOOLTIP_LABELS = Object.freeze({
  moveUp: "Subir sección",
  moveDown: "Bajar sección",
  add: "Añadir sección",
  background: "Cambiar fondo",
  fullscreen: "Pantalla completa",
  detachBackground: "Desanclar imagen de fondo",
  saveTemplate: "Guardar como plantilla",
  delete: "Eliminar sección",
});

const DESKTOP_BUTTON_BASE =
  "group inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dccaf7]";
const DESKTOP_BUTTON_DISABLED =
  "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 shadow-none";
const DESKTOP_BUTTON_VARIANTS = Object.freeze({
  neutral:
    "border-[#e6dbf8] bg-white/95 text-[#5f3596] shadow-[0_8px_18px_rgba(15,23,42,0.08)] hover:-translate-y-[1px] hover:border-[#d2c1f2] hover:bg-[#faf6ff] hover:shadow-[0_12px_24px_rgba(119,61,190,0.15)]",
  accent:
    "border-[#dfcff6] bg-gradient-to-br from-[#faf7ff] via-[#f4eeff] to-[#ece2ff] text-[#6b41a7] shadow-[0_10px_20px_rgba(119,61,190,0.10)] hover:-translate-y-[1px] hover:border-[#cdb9ee] hover:shadow-[0_14px_24px_rgba(119,61,190,0.16)]",
  active:
    "border-[#ccb6ef] bg-gradient-to-r from-[#8a57cf] via-[#773dbe] to-[#6737b3] text-white shadow-[0_12px_24px_rgba(119,61,190,0.28)] hover:-translate-y-[1px] hover:from-[#7f4fc5] hover:via-[#6f3bbc] hover:to-[#5f31a8] hover:shadow-[0_16px_28px_rgba(119,61,190,0.34)]",
  success:
    "border-emerald-300 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-[0_10px_22px_rgba(5,150,105,0.28)] hover:-translate-y-[1px] hover:from-emerald-600 hover:to-emerald-700 hover:shadow-[0_14px_28px_rgba(5,150,105,0.36)]",
  danger:
    "border-rose-300 bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-[0_10px_22px_rgba(225,29,72,0.28)] hover:-translate-y-[1px] hover:from-rose-600 hover:to-red-700 hover:shadow-[0_14px_28px_rgba(225,29,72,0.36)]",
});

function DesktopSectionActionButton({ action }) {
  const variantClassName = action.disabled
    ? DESKTOP_BUTTON_DISABLED
    : DESKTOP_BUTTON_VARIANTS[action.variant] || DESKTOP_BUTTON_VARIANTS.neutral;
  const IconComponent = action.icon;

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.title}
      aria-label={action.ariaLabel}
      aria-pressed={typeof action.pressed === "boolean" ? action.pressed : undefined}
      className={`${DESKTOP_BUTTON_BASE} ${variantClassName} ${action.pulse ? "animate-pulse" : ""}`}
    >
      <IconComponent className="h-4 w-4" />
    </button>
  );
}

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
  if (!seccionActivaId) return null;

  const activeSectionIndex = seccionesOrdenadas.findIndex((seccion) => seccion.id === seccionActivaId);
  if (activeSectionIndex === -1) return null;

  const seccion = seccionesOrdenadas[activeSectionIndex];
  const offsetY = calcularOffsetY(seccionesOrdenadas, activeSectionIndex, altoCanvas);
  const esPrimera = activeSectionIndex === 0;
  const esUltima = activeSectionIndex === seccionesOrdenadas.length - 1;
  const estaAnimando = seccionesAnimando.includes(seccion.id);
  const modoSeccion = normalizarAltoModo(seccion.altoModo);
  const esPantalla = modoSeccion === "pantalla";
  const tieneFondoImagen = seccion.fondoTipo === "imagen";

  const handleDesanclarFondo = () =>
    desanclarFondo({
      seccionId: seccion.id,
      secciones,
      objetos,
      setSecciones,
      setObjetos,
      setElementosSeleccionados,
    });

  const handleGuardarComoPlantilla = () =>
    guardarSeccionComoPlantilla({
      seccionId: seccion.id,
      secciones,
      objetos,
      refrescarPlantillasDeSeccion,
    });

  const handleEliminarSeccion = () => {
    if (isMobile) {
      setMobileSectionActionsOpen(false);
    }
    abrirModalBorrarSeccion(seccion.id);
  };

  const mobileButtonBase =
    "px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dccaf7]";
  const mobileButtonDisabled =
    "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 shadow-none";
  const mobileButtonPrimary =
    "border-[#ccb6ef] bg-gradient-to-r from-[#8a57cf] via-[#773dbe] to-[#6737b3] text-white shadow-[0_10px_22px_rgba(119,61,190,0.30)] hover:-translate-y-[1px] hover:from-[#7f4fc5] hover:via-[#6f3bbc] hover:to-[#5f31a8] hover:shadow-[0_14px_28px_rgba(119,61,190,0.38)]";
  const mobileButtonNeutral =
    "border-[#e4d7f6] bg-white/95 text-[#5f3596] shadow-[0_6px_16px_rgba(15,23,42,0.06)] hover:-translate-y-[1px] hover:border-[#cdb9ee] hover:bg-[#faf6ff] hover:shadow-[0_12px_24px_rgba(119,61,190,0.16)]";
  const mobileButtonSuccess =
    "border-emerald-300 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-[0_10px_22px_rgba(5,150,105,0.28)] hover:-translate-y-[1px] hover:from-emerald-600 hover:to-emerald-700 hover:shadow-[0_14px_28px_rgba(5,150,105,0.36)]";
  const mobileButtonDanger =
    "border-rose-300 bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-[0_10px_22px_rgba(225,29,72,0.28)] hover:-translate-y-[1px] hover:from-rose-600 hover:to-red-700 hover:shadow-[0_14px_28px_rgba(225,29,72,0.36)]";

  const renderMobileActionContent = (IconComponent, label) => (
    <span className="inline-flex items-center gap-1.5">
      <IconComponent className="h-3.5 w-3.5" />
      {label}
    </span>
  );

  const mobileActionButtons = (
    <>
      <button
        type="button"
        onClick={() =>
          moverSeccionConScroll({
            seccionId: seccion.id,
            direccion: "subir",
          })
        }
        disabled={esPrimera || estaAnimando}
        className={`${mobileButtonBase} ${
          esPrimera || estaAnimando ? mobileButtonDisabled : mobileButtonPrimary
        } ${estaAnimando ? "animate-pulse" : ""}`}
        title={esPrimera ? "Ya es la primera seccion" : "Subir seccion"}
        aria-label="Subir seccion"
      >
        {renderMobileActionContent(MoveUp, "Subir seccion")}
      </button>

      <button
        type="button"
        onClick={() =>
          moverSeccionConScroll({
            seccionId: seccion.id,
            direccion: "bajar",
          })
        }
        disabled={esUltima || estaAnimando}
        className={`${mobileButtonBase} ${
          esUltima || estaAnimando ? mobileButtonDisabled : mobileButtonPrimary
        } ${estaAnimando ? "animate-pulse" : ""}`}
        title={esUltima ? "Ya es la ultima seccion" : "Bajar seccion"}
        aria-label="Bajar seccion"
      >
        {renderMobileActionContent(MoveDown, "Bajar seccion")}
      </button>

      <button
        type="button"
        onClick={handleCrearSeccion}
        disabled={estaAnimando}
        className={`${mobileButtonBase} ${
          estaAnimando ? `${mobileButtonDisabled} animate-pulse` : mobileButtonPrimary
        }`}
        title="Anadir una nueva seccion debajo"
        aria-label="Anadir seccion"
      >
        {renderMobileActionContent(PlusCircle, "Anadir seccion")}
      </button>

      <div
        className={`${mobileButtonBase} ${mobileButtonNeutral} flex items-center justify-between gap-2`}
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => togglePantallaCompletaSeccion(seccion.id)}
          className={`${mobileButtonBase} ${esPantalla ? mobileButtonPrimary : mobileButtonNeutral}`}
          title="Pantalla completa de la seccion"
          aria-label={esPantalla ? "Pantalla completa activada" : "Pantalla completa desactivada"}
        >
          {renderMobileActionContent(
            Monitor,
            esPantalla ? "Pantalla completa: ON" : "Pantalla completa: OFF"
          )}
        </button>

        {tieneFondoImagen && (
          <button
            type="button"
            onClick={handleDesanclarFondo}
            className={`${mobileButtonBase} ${mobileButtonNeutral}`}
            title="Desanclar imagen de fondo"
            aria-label="Desanclar imagen de fondo"
          >
            {renderMobileActionContent(Unlink2, "Desanclar fondo")}
          </button>
        )}

        {tieneFondoImagen && isMobile && (
          <button
            type="button"
            onClick={() => {
              setMobileBackgroundEditSectionId((prev) => (prev === seccion.id ? null : seccion.id));
            }}
            className={`${mobileButtonBase} ${
              mobileBackgroundEditSectionId === seccion.id
                ? "border-indigo-300 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-[0_10px_22px_rgba(79,70,229,0.28)] hover:-translate-y-[1px] hover:from-indigo-600 hover:to-indigo-700 hover:shadow-[0_14px_28px_rgba(79,70,229,0.36)]"
                : mobileButtonNeutral
            }`}
            title="Modo mover fondo en mobile"
            aria-label="Modo mover fondo"
          >
            {mobileBackgroundEditSectionId === seccion.id ? "Mover fondo: ON" : "Mover fondo"}
          </button>
        )}
      </div>

      {canManageSite && (
        <button
          type="button"
          onClick={handleGuardarComoPlantilla}
          disabled={estaAnimando}
          className={`${mobileButtonBase} ${
            estaAnimando ? mobileButtonDisabled : mobileButtonSuccess
          } ${estaAnimando ? "animate-pulse" : ""}`}
          title="Guardar esta seccion como plantilla"
          aria-label="Guardar seccion como plantilla"
        >
          {renderMobileActionContent(Layers, "Plantilla")}
        </button>
      )}

      <button
        type="button"
        onClick={handleEliminarSeccion}
        disabled={estaAnimando || isDeletingSection}
        className={`${mobileButtonBase} ${
          estaAnimando || isDeletingSection ? mobileButtonDisabled : mobileButtonDanger
        } ${estaAnimando || isDeletingSection ? "animate-pulse" : ""}`}
        title="Borrar esta seccion y todos sus elementos"
        aria-label="Borrar seccion"
      >
        {renderMobileActionContent(Trash2, "Borrar seccion")}
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
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {mobileSectionActionsOpen && (
          <div className="w-[min(84vw,230px)] max-h-[62vh] overflow-y-auto rounded-xl border border-purple-200 bg-white/95 p-2 shadow-2xl backdrop-blur">
            <div className="flex flex-col gap-2">{mobileActionButtons}</div>
          </div>
        )}
      </div>,
      document.body,
      `orden-mobile-${seccion.id}`
    );
  }

  const desktopActionGroups = [
    {
      id: "reorder",
      items: [
        {
          id: "move-up",
          icon: MoveUp,
          title: DESKTOP_TOOLTIP_LABELS.moveUp,
          ariaLabel: DESKTOP_TOOLTIP_LABELS.moveUp,
          variant: "neutral",
          disabled: esPrimera || estaAnimando,
          pulse: estaAnimando,
          onClick: () =>
            moverSeccionConScroll({
              seccionId: seccion.id,
              direccion: "subir",
            }),
        },
        {
          id: "move-down",
          icon: MoveDown,
          title: DESKTOP_TOOLTIP_LABELS.moveDown,
          ariaLabel: DESKTOP_TOOLTIP_LABELS.moveDown,
          variant: "neutral",
          disabled: esUltima || estaAnimando,
          pulse: estaAnimando,
          onClick: () =>
            moverSeccionConScroll({
              seccionId: seccion.id,
              direccion: "bajar",
            }),
        },
      ],
    },
    {
      id: "structure",
      items: [
        {
          id: "add",
          icon: PlusCircle,
          title: DESKTOP_TOOLTIP_LABELS.add,
          ariaLabel: DESKTOP_TOOLTIP_LABELS.add,
          variant: "accent",
          disabled: estaAnimando,
          pulse: estaAnimando,
          onClick: handleCrearSeccion,
        },
      ],
    },
    {
      id: "appearance",
      items: [
        {
          id: "background",
          type: "color-picker",
          title: DESKTOP_TOOLTIP_LABELS.background,
        },
        {
          id: "fullscreen",
          icon: Monitor,
          title: DESKTOP_TOOLTIP_LABELS.fullscreen,
          ariaLabel: DESKTOP_TOOLTIP_LABELS.fullscreen,
          variant: esPantalla ? "active" : "neutral",
          pressed: esPantalla,
          onClick: () => togglePantallaCompletaSeccion(seccion.id),
        },
        ...(tieneFondoImagen
          ? [
              {
                id: "detach-background",
                icon: Unlink2,
                title: DESKTOP_TOOLTIP_LABELS.detachBackground,
                ariaLabel: DESKTOP_TOOLTIP_LABELS.detachBackground,
                variant: "neutral",
                onClick: handleDesanclarFondo,
              },
            ]
          : []),
      ],
    },
    ...(canManageSite
      ? [
          {
            id: "reuse",
            items: [
              {
                id: "save-template",
                icon: Layers,
                title: DESKTOP_TOOLTIP_LABELS.saveTemplate,
                ariaLabel: DESKTOP_TOOLTIP_LABELS.saveTemplate,
                variant: "success",
                disabled: estaAnimando,
                pulse: estaAnimando,
                onClick: handleGuardarComoPlantilla,
              },
            ],
          },
        ]
      : []),
    {
      id: "destructive",
      items: [
        {
          id: "delete",
          icon: Trash2,
          title: DESKTOP_TOOLTIP_LABELS.delete,
          ariaLabel: DESKTOP_TOOLTIP_LABELS.delete,
          variant: "danger",
          disabled: estaAnimando || isDeletingSection,
          pulse: estaAnimando || isDeletingSection,
          onClick: handleEliminarSeccion,
        },
      ],
    },
  ].filter((group) => Array.isArray(group.items) && group.items.length > 0);

  return (
    <div
      className="absolute"
      style={{
        top: offsetY + 20,
        right: DESKTOP_PANEL_RIGHT,
        zIndex: 25,
        width: DESKTOP_PANEL_WIDTH,
        transition: "top 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease, box-shadow 220ms ease",
        willChange: "top, opacity, box-shadow",
      }}
    >
      <div
        key={seccion.id}
        className={`relative overflow-hidden rounded-2xl border bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(249,245,255,0.97)_100%)] px-2 py-2.5 backdrop-blur-[10px] ${
          estaAnimando
            ? "border-[#d8c4f4] shadow-[0_20px_38px_rgba(119,61,190,0.18)]"
            : "border-[#ebe2f8] shadow-[0_16px_32px_rgba(90,52,156,0.13)]"
        }`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-[#f7f1ff] via-white/90 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-2 top-5 h-12 w-2 rounded-full bg-gradient-to-b from-[#dcccf8] via-[#b996ec] to-[#7944c3] shadow-[0_8px_16px_rgba(119,61,190,0.20)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-5 h-12 w-px bg-gradient-to-b from-transparent via-[#d5c2f2] to-transparent"
        />

        <div className="relative flex flex-col items-center gap-2">
          <div className="flex flex-col items-center gap-1 pb-0.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-[#eadff9] bg-white/90 px-2 py-0.5 shadow-[0_4px_10px_rgba(90,52,156,0.08)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#7a44ce]" />
              <span className="text-[9px] font-semibold tracking-[0.22em] text-[#6b43a8]">
                SECCIÓN
              </span>
            </span>
          </div>

          {desktopActionGroups.map((group, groupIndex) => (
            <div key={group.id} className="flex w-full flex-col items-center gap-2">
              <div className="flex w-full flex-col items-center gap-1.5">
                {group.items.map((action) =>
                  action.type === "color-picker" ? (
                    <div key={action.id} className="flex w-full justify-center">
                      <SelectorColorSeccion
                        compact
                        seccion={seccion}
                        title={action.title}
                        disabled={estaAnimando || isDeletingSection}
                        onChange={(id, color) => cambiarColorFondoSeccion(id, color)}
                      />
                    </div>
                  ) : (
                    <DesktopSectionActionButton key={action.id} action={action} />
                  )
                )}
              </div>

              {groupIndex < desktopActionGroups.length - 1 ? (
                <div
                  aria-hidden="true"
                  className="h-px w-9 bg-gradient-to-r from-transparent via-[#ddcff5] to-transparent"
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

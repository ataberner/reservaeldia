import { useMemo, useState } from "react";
import {
  EVENT_PERSON_NAME_ROLES,
} from "@/domain/eventDetails/personNames.js";
import {
  EVENT_LOCATION_ROLES,
} from "@/domain/eventDetails/location.js";
import {
  EVENT_TIME_ROLES,
} from "@/domain/eventDetails/time.js";
import {
  resolveCountdownContract,
  resolveCountdownTargetIso,
} from "../../../../shared/renderContractPolicy.js";

export default function TemplateDynamicFieldMenuSection({
  visible = false,
  canConfigure = false,
  loading = false,
  saving = false,
  error = "",
  selectedElement = null,
  selectedElementType = "",
  selectedIsSupportedElement = false,
  selectedField = null,
  onLinkEventPersonName,
  onLinkEventLocation,
  onLinkEventTime,
  onLinkEventDate,
  onLinkStoryText,
  onUnlinkField,
  onViewUsage,
}) {
  const [submitError, setSubmitError] = useState("");
  const selectedCountdownContract = useMemo(
    () =>
      selectedElementType === "countdown"
        ? resolveCountdownContract(selectedElement || null)
        : null,
    [selectedElement, selectedElementType]
  );
  const selectedCountdownTarget = useMemo(
    () =>
      selectedElementType === "countdown"
        ? resolveCountdownTargetIso(selectedElement || null)
        : null,
    [selectedElement, selectedElementType]
  );

  if (!visible) return null;

  const hasLinkedField = Boolean(selectedField?.key);
  const canUseEventPersonNameLinks =
    selectedElementType === "texto" && typeof onLinkEventPersonName === "function";
  const canUseEventLocationLinks =
    selectedElementType === "texto" && typeof onLinkEventLocation === "function";
  const canUseEventTimeLinks =
    selectedElementType === "texto" && typeof onLinkEventTime === "function";
  const canUseEventDateLinks =
    (selectedElementType === "texto" || selectedElementType === "countdown") &&
    typeof onLinkEventDate === "function";
  const canUseStoryTextLink =
    selectedElementType === "texto" && typeof onLinkStoryText === "function";

  const sectionButtonBase =
    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[12px] transition";
  const sectionButtonNeutral = `${sectionButtonBase} bg-slate-50 text-slate-700 hover:bg-slate-100`;

  const renderHint = () => {
    if (loading) {
      return <p className="text-[10px] text-slate-500">Cargando configuracion...</p>;
    }
    if (!canConfigure) {
      return (
        <p className="text-[10px] text-amber-700">
          Este borrador no tiene plantilla base vinculada. No se puede configurar schema.
        </p>
      );
    }
    if (!selectedIsSupportedElement) {
      return (
        <p className="text-[10px] text-slate-500">
          Selecciona un texto o countdown para vincularlo a datos del evento.
        </p>
      );
    }

    if (selectedElementType === "countdown") {
      return (
        <div className="space-y-1">
          <p className="text-[10px] text-slate-500">
            Vincula una fecha al countdown para que el formulario actualice su cuenta regresiva.
          </p>
          {selectedCountdownContract?.isLegacyFrozenCompat ? (
            <p className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] text-sky-800">
              Este countdown usa schema v1 legacy. Se mantiene por compatibilidad, pero esta congelado para trabajo nuevo.
            </p>
          ) : null}
          {selectedCountdownTarget?.usesCompatibilityAlias ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
              La fecha actual se esta resolviendo desde {selectedCountdownTarget.sourceField}. Los nuevos cambios deben persistir en fechaObjetivo.
            </p>
          ) : null}
        </div>
      );
    }
    if (selectedElementType !== "texto") {
      return (
        <p className="text-[10px] text-slate-500">
          Este elemento tiene un campo dinamico heredado. Solo se permite revisar o desvincularlo.
        </p>
      );
    }

    return (
      <p className="text-[10px] text-slate-500">
        Vincula este texto a un dato editable desde Detalles del evento.
      </p>
    );
  };

  const handleLinkEventPersonName = async (role) => {
    if (typeof onLinkEventPersonName !== "function") return;
    setSubmitError("");

    try {
      await onLinkEventPersonName(role);
    } catch (linkError) {
      setSubmitError(
        linkError instanceof Error
          ? linkError.message
          : "No se pudo vincular el texto a los nombres del evento."
      );
    }
  };

  const handleLinkEventLocation = async (role) => {
    if (typeof onLinkEventLocation !== "function") return;
    setSubmitError("");

    try {
      await onLinkEventLocation(role);
    } catch (linkError) {
      setSubmitError(
        linkError instanceof Error
          ? linkError.message
          : "No se pudo vincular el texto a la ubicacion del evento."
      );
    }
  };

  const handleLinkEventTime = async (role) => {
    if (typeof onLinkEventTime !== "function") return;
    setSubmitError("");

    try {
      await onLinkEventTime(role);
    } catch (linkError) {
      setSubmitError(
        linkError instanceof Error
          ? linkError.message
          : "No se pudo vincular el texto a las horas del evento."
      );
    }
  };

  const handleLinkEventDate = async () => {
    if (typeof onLinkEventDate !== "function") return;
    setSubmitError("");

    try {
      await onLinkEventDate();
    } catch (linkError) {
      setSubmitError(
        linkError instanceof Error
          ? linkError.message
          : "No se pudo vincular el elemento a la fecha del evento."
      );
    }
  };

  const handleLinkStoryText = async () => {
    if (typeof onLinkStoryText !== "function") return;
    setSubmitError("");

    try {
      await onLinkStoryText();
    } catch (linkError) {
      setSubmitError(
        linkError instanceof Error
          ? linkError.message
          : "No se pudo vincular el texto a Texto historia."
      );
    }
  };

  return (
    <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
          Campos dinamicos
        </p>
        {saving ? (
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">
            Guardando...
          </span>
        ) : null}
      </div>

      {renderHint()}

      {hasLinkedField ? (
        <div className="mt-2 rounded-md border border-violet-200 bg-white p-2 text-[11px] text-violet-800">
          <strong>Campo activo:</strong> {selectedField.label || selectedField.key}
          <div className="text-[10px] text-violet-600">
            key: {selectedField.key} - grupo: {selectedField.group || "Datos principales"}
          </div>
        </div>
      ) : null}

      {canUseStoryTextLink ? (
        <div className="mt-2 rounded-md border border-violet-200 bg-white p-2">
          <p className="mb-1 text-[11px] font-semibold text-violet-700">
            Contenido
          </p>
          <div className="space-y-1.5">
            <button
              type="button"
              className={sectionButtonNeutral}
              disabled={!canConfigure || saving}
              onClick={handleLinkStoryText}
            >
              Texto historia
            </button>
          </div>
        </div>
      ) : null}

      {canUseEventPersonNameLinks || canUseEventLocationLinks || canUseEventTimeLinks || canUseEventDateLinks ? (
        <div className="mt-2 rounded-md border border-violet-200 bg-white p-2">
          <p className="mb-1 text-[11px] font-semibold text-violet-700">
            Detalles del evento
          </p>
          <div className="space-y-1.5">
            {canUseEventDateLinks ? (
              <button
                type="button"
                className={sectionButtonNeutral}
                disabled={!canConfigure || saving}
                onClick={handleLinkEventDate}
              >
                Vincular a fecha del evento
              </button>
            ) : null}
            {canUseEventPersonNameLinks ? (
              <>
                <button
                  type="button"
                  className={sectionButtonNeutral}
                  disabled={!canConfigure || saving}
                  onClick={() => handleLinkEventPersonName(EVENT_PERSON_NAME_ROLES.PRIMARY)}
                >
                  Vincular a primera persona
                </button>
                <button
                  type="button"
                  className={sectionButtonNeutral}
                  disabled={!canConfigure || saving}
                  onClick={() => handleLinkEventPersonName(EVENT_PERSON_NAME_ROLES.SECONDARY)}
                >
                  Vincular a segunda persona
                </button>
                <button
                  type="button"
                  className={sectionButtonNeutral}
                  disabled={!canConfigure || saving}
                  onClick={() => handleLinkEventPersonName(EVENT_PERSON_NAME_ROLES.COUPLE)}
                >
                  Vincular a nombres juntos
                </button>
              </>
            ) : null}
            {canUseEventLocationLinks ? (
              <>
                <button
                  type="button"
                  className={sectionButtonNeutral}
                  disabled={!canConfigure || saving}
                  onClick={() => handleLinkEventLocation(EVENT_LOCATION_ROLES.VENUE_NAME)}
                >
                  Vincular a nombre del lugar
                </button>
                <button
                  type="button"
                  className={sectionButtonNeutral}
                  disabled={!canConfigure || saving}
                  onClick={() => handleLinkEventLocation(EVENT_LOCATION_ROLES.VENUE_ADDRESS)}
                >
                  Vincular a direccion
                </button>
              </>
            ) : null}
            {canUseEventTimeLinks ? (
              <>
                <button
                  type="button"
                  className={sectionButtonNeutral}
                  disabled={!canConfigure || saving}
                  onClick={() => handleLinkEventTime(EVENT_TIME_ROLES.START_TIME)}
                >
                  Vincular a Hora inicio
                </button>
                <button
                  type="button"
                  className={sectionButtonNeutral}
                  disabled={!canConfigure || saving}
                  onClick={() => handleLinkEventTime(EVENT_TIME_ROLES.END_TIME)}
                >
                  Vincular a Hora fin
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasLinkedField ? (
        <div className="mt-2 space-y-1.5">
          <button
            type="button"
            className={sectionButtonNeutral}
            disabled={!canConfigure || typeof onUnlinkField !== "function"}
            onClick={() => {
              setSubmitError("");
              Promise.resolve(onUnlinkField?.()).catch((unlinkError) => {
                setSubmitError(
                  unlinkError instanceof Error
                    ? unlinkError.message
                    : "No se pudo desvincular el elemento."
                );
              });
            }}
          >
            Desvincular de campo
          </button>
          <button
            type="button"
            className={sectionButtonNeutral}
            disabled={!canConfigure || typeof onViewUsage !== "function"}
            onClick={() => onViewUsage?.(selectedField.key)}
          >
            Ver donde se usa
          </button>
        </div>
      ) : null}

      {submitError || error ? (
        <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
          {submitError || error}
        </p>
      ) : null}
    </section>
  );
}

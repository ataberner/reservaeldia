import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, GripVertical, Pencil, Plus, Settings2, X } from "lucide-react";
import UnifiedColorPicker from "@/components/color/UnifiedColorPicker";
import {
  countActiveCustomQuestions,
  countActiveQuestions,
  createDefaultRsvpConfig,
  getOrderedQuestions,
  normalizeRsvpConfig,
} from "@/domain/rsvp/config";
import {
  MIDNIGHT_RSVP_BUTTON_STYLE_ID,
  createRsvpButtonStylePatch,
} from "@/domain/rsvp/buttonStyles";
import { readEditorObjectByType } from "@/lib/editorRuntimeBridge";
import { isFunctionalCtaHidden } from "@/domain/functionalCtaButtons";
import {
  addQuestionOption,
  removeQuestionOption,
  reorderQuestion,
  setModalSettings,
  setQuestionLabel,
  setQuestionOptionLabel,
  setQuestionRequired,
  setQuestionType,
  toggleQuestionActive,
} from "@/domain/rsvp/editorOps";
import styles from "./MiniToolbarTabRsvp.module.css";

const QUESTION_TYPE_OPTIONS = Object.freeze([
  { value: "short_text", label: "Texto corto" },
  { value: "long_text", label: "Texto largo" },
  { value: "single_select", label: "Opciones" },
  { value: "boolean", label: "Si / No" },
  { value: "number", label: "Numero" },
  { value: "phone", label: "Telefono" },
]);

const QUESTION_TYPE_LABELS = QUESTION_TYPE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

const COMPACT_ACTION_BUTTON_CLASS =
  "flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-md border border-violet-200 px-2.5 py-1.5 text-[11px] font-semibold text-violet-800 transition hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300";

function getQuestionTypeLabel(question) {
  return QUESTION_TYPE_LABELS[question?.type] || "Texto";
}

function getFieldSelectorLabel(question) {
  if (question?.source === "custom" && /^Pregunta personalizada \d+$/i.test(question.label || "")) {
    return "Crear campo personalizado";
  }
  return question?.label || "Campo";
}

function moveRowsForDragPreview(rows, from, to) {
  if (
    !Array.isArray(rows) ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= rows.length ||
    to >= rows.length ||
    from === to
  ) {
    return rows;
  }

  const nextRows = [...rows];
  const [draggedRow] = nextRows.splice(from, 1);
  nextRows.splice(to, 0, draggedRow);
  return nextRows;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function resolveDragPreviewLeft(dragState) {
  const baseLeft = Number(dragState?.rowLeft) || 0;
  const rawLeft = (Number(dragState?.pointerX) || 0) - (Number(dragState?.grabOffsetX) || 0);
  return clampNumber(rawLeft, baseLeft - 32, baseLeft + 32);
}

function normalizeConfig(input) {
  if (!input || typeof input !== "object") {
    return createDefaultRsvpConfig("minimal");
  }
  return normalizeRsvpConfig(input, { forceEnabled: false });
}

function findRsvpButton() {
  return readEditorObjectByType("rsvp-boton");
}

function emitRsvpConfigUpdate(nextConfig) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("rsvp-config-update", {
      detail: { config: nextConfig },
    })
  );
}

function inputClassName() {
  return "w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs text-zinc-800 focus:border-violet-500 focus:outline-none";
}

function buildDefaultRsvpButtonPayload() {
  const defaultButtonStyle = createRsvpButtonStylePatch(MIDNIGHT_RSVP_BUTTON_STYLE_ID);

  return {
    id: `rsvp-${Date.now()}`,
    tipo: "rsvp-boton",
    texto: "Confirmar asistencia",
    x: 300,
    y: 100,
    ancho: 220,
    alto: 50,
    fontSize: 18,
    fontFamily: "sans-serif",
    align: "center",
    ...defaultButtonStyle,
  };
}

function insertDefaultRsvpButton() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("insertar-elemento", {
      detail: buildDefaultRsvpButtonPayload(),
    })
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      {children}
    </label>
  );
}

function useCloseOnEscape(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);
}

function FormSettingsModal({
  open,
  config,
  onClose,
  onChange,
}) {
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  useCloseOnEscape(open, onClose);

  if (!open || !portalTarget) return null;

  const updateConfig = (nextConfig) => {
    onChange(normalizeConfig(nextConfig));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[340] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[1.5px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rsvp-form-settings-title"
        className="w-full max-h-[82vh] overflow-hidden rounded-t-2xl border border-violet-100 bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3">
          <div>
            <h4 id="rsvp-form-settings-title" className="text-sm font-semibold text-slate-900">
              Ajustes del formulario
            </h4>
            <p className="mt-0.5 text-xs text-slate-600">
              Textos y estilo del formulario que ven tus invitados.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            aria-label="Cerrar ajustes"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[62vh] space-y-3 overflow-y-auto p-4">
          <Field label="Titulo principal">
            <input
              type="text"
              className={inputClassName()}
              value={config.modal.title}
              onChange={(event) =>
                updateConfig(setModalSettings(config, { title: event.target.value }))
              }
            />
          </Field>
          <Field label="Texto de ayuda">
            <textarea
              rows={3}
              className={`${inputClassName()} resize-y`}
              value={config.modal.subtitle}
              onChange={(event) =>
                updateConfig(setModalSettings(config, { subtitle: event.target.value }))
              }
            />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Field label="Texto del boton">
              <input
                type="text"
                className={inputClassName()}
                value={config.modal.submitLabel}
                onChange={(event) =>
                  updateConfig(setModalSettings(config, { submitLabel: event.target.value }))
                }
              />
            </Field>
            <Field label="Color boton">
              <div className="flex min-h-[38px] items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-2 py-1.5">
                <span className="text-[11px] font-semibold text-zinc-700">
                  {String(config.modal.primaryColor || "#773dbe").toUpperCase()}
                </span>
                <UnifiedColorPicker
                  value={config.modal.primaryColor}
                  fallbackColor="#773dbe"
                  showGradients={false}
                  panelWidth={272}
                  title="Color del boton"
                  triggerClassName="h-7 w-7 rounded border border-zinc-300"
                  onChange={(nextColor) =>
                    updateConfig(setModalSettings(config, { primaryColor: nextColor }))
                  }
                />
              </div>
            </Field>
          </div>
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
          >
            Listo
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

function buildOptionLabelDrafts(options = []) {
  return (Array.isArray(options) ? options : []).reduce((acc, option) => {
    if (!option?.id) return acc;
    acc[option.id] = String(option.label ?? "");
    return acc;
  }, {});
}

function FieldEditorModal({
  open,
  config,
  question,
  onClose,
  onChange,
  onRemove,
}) {
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  const selectOptions = Array.isArray(question?.options) ? question.options : [];
  const selectOptionIds = selectOptions.map((option) => option.id).join("|");
  const activeQuestionId = question?.id || "";
  const questionRef = useRef(question);
  const selectOptionsRef = useRef(selectOptions);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftOptionLabels, setDraftOptionLabels] = useState({});
  questionRef.current = question;
  selectOptionsRef.current = selectOptions;
  useCloseOnEscape(open, onClose);

  useEffect(() => {
    if (!open || !activeQuestionId) return;
    setDraftLabel(String(questionRef.current?.label ?? ""));
    setDraftOptionLabels(buildOptionLabelDrafts(selectOptionsRef.current));
  }, [open, activeQuestionId]);

  useEffect(() => {
    if (!open || !activeQuestionId) return;
    setDraftOptionLabels((prev) => {
      const next = {};
      selectOptionsRef.current.forEach((option) => {
        if (!option?.id) return;
        next[option.id] = Object.prototype.hasOwnProperty.call(prev, option.id)
          ? prev[option.id]
          : String(option.label ?? "");
      });
      return next;
    });
  }, [open, activeQuestionId, selectOptionIds]);

  if (!open || !portalTarget || !question) return null;

  const updateConfig = (nextConfig) => {
    onChange(normalizeConfig(nextConfig));
  };
  const handleQuestionLabelChange = (value) => {
    setDraftLabel(value);
    updateConfig(setQuestionLabel(config, question.id, value));
  };
  const handleOptionLabelChange = (optionId, value) => {
    setDraftOptionLabels((prev) => ({
      ...prev,
      [optionId]: value,
    }));
    updateConfig(setQuestionOptionLabel(config, question.id, optionId, value));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[346] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[1.5px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rsvp-field-editor-title"
        className="w-full max-h-[86vh] overflow-hidden rounded-t-2xl border border-violet-100 bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3">
          <div className="min-w-0">
            <h4 id="rsvp-field-editor-title" className="text-sm font-semibold text-slate-900">
              Editar campo
            </h4>
            <p className="mt-0.5 truncate text-xs text-slate-600">
              {question.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            aria-label="Cerrar editor de campo"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[66vh] space-y-3 overflow-y-auto p-4">
          <Field label="Nombre del campo">
            <input
              type="text"
              className={inputClassName()}
              value={draftLabel}
              onChange={(event) => handleQuestionLabelChange(event.target.value)}
            />
          </Field>

          <Field label="Tipo de respuesta">
            <select
              className={inputClassName()}
              value={question.type}
              onChange={(event) =>
                updateConfig(setQuestionType(config, question.id, event.target.value))
              }
            >
              {QUESTION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex min-h-[42px] items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="text-xs font-medium text-slate-700">Obligatorio</span>
            <input
              type="checkbox"
              checked={question.required}
              onChange={(event) =>
                updateConfig(setQuestionRequired(config, question.id, event.target.checked))
              }
              className="h-4 w-4 accent-violet-700"
            />
          </label>

          {question.type === "single_select" ? (
            <section className="space-y-2 rounded-lg border border-violet-100 bg-violet-50/45 p-3">
              <div className="flex items-center justify-between gap-2">
                <h5 className="text-xs font-semibold text-slate-800">Opciones</h5>
                <button
                  type="button"
                  onClick={() => updateConfig(addQuestionOption(config, question.id))}
                  className="rounded-md border border-violet-200 bg-white px-2 py-1 text-[11px] font-semibold text-violet-800 transition hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                >
                  Agregar opcion
                </button>
              </div>

              <div className="space-y-1.5">
                {selectOptions.map((option) => (
                  <div key={option.id} className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <input
                      type="text"
                      className={inputClassName()}
                      value={draftOptionLabels[option.id] ?? String(option.label ?? "")}
                      onChange={(event) => handleOptionLabelChange(option.id, event.target.value)}
                    />
                    <button
                      type="button"
                      disabled={selectOptions.length <= 1}
                      onClick={() =>
                        updateConfig(removeQuestionOption(config, question.id, option.id))
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Quitar opcion"
                      title="Quitar opcion"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <button
            type="button"
            onClick={onRemove}
            className="min-h-[40px] w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
          >
            {question.source === "custom" ? "Eliminar campo personalizado" : "Quitar del formulario"}
          </button>
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
          >
            Listo
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

function FieldSelectorModal({
  open,
  questions,
  onClose,
  onSelect,
  canAddMoreQuestions,
  activeCustomCount,
  maxCustomQuestions,
}) {
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  useCloseOnEscape(open, onClose);

  if (!open || !portalTarget) return null;

  const hasQuestions = questions.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[345] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[1.5px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rsvp-field-selector-title"
        className="w-full max-h-[82vh] overflow-hidden rounded-t-2xl border border-violet-100 bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3">
          <div className="min-w-0">
            <h4 id="rsvp-field-selector-title" className="text-sm font-semibold text-slate-900">
              Agregar otro campo
            </h4>
            <p className="mt-0.5 text-xs text-slate-600">
              Campos disponibles para el formulario de asistencia.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            aria-label="Cerrar selector"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[min(62vh,420px)] overflow-y-auto p-3 sm:p-4">
          {!canAddMoreQuestions ? (
            <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/70 p-3 text-xs text-violet-800">
              Llegaste al maximo de preguntas.
            </div>
          ) : !hasQuestions ? (
            <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/70 p-3 text-xs text-violet-800">
              Todos los campos disponibles ya fueron agregados.
            </div>
          ) : (
            <div className="space-y-2">
              {questions.map((question) => {
                const customBlocked =
                  question.source === "custom" && activeCustomCount >= maxCustomQuestions;
                const disabled = customBlocked;
                const selectorLabel = getFieldSelectorLabel(question);

                return (
                  <button
                    key={question.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(question)}
                    className="flex min-h-[52px] w-full items-start rounded-lg border border-violet-100 bg-white px-3 py-2 text-left transition hover:border-violet-200 hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="min-w-0">
                      <span
                        className="block overflow-hidden break-words text-xs font-medium leading-[1.25] text-slate-800"
                        title={selectorLabel}
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {selectorLabel}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {question.source === "custom"
                          ? "Campo personalizado"
                          : getQuestionTypeLabel(question)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

function renderPreviewField(question, value, onChange) {
  const baseClass =
    "w-full min-h-[52px] rounded-[18px] border border-slate-200/90 bg-white px-4 py-3 text-[14px] text-slate-800 shadow-[0_8px_20px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.7)] transition placeholder:text-slate-400 focus:border-violet-300 focus:outline-none focus:ring-4 focus:ring-violet-100/80";
  const selectStyle = {
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    paddingRight: "44px",
    backgroundImage:
      'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 20 20%27 fill=%27none%27%3E%3Cpath d=%27M5 7.5L10 12.5L15 7.5%27 stroke=%2764748B%27 stroke-width=%271.8%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E")',
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 16px center",
    backgroundSize: "14px 14px",
  };

  if (question.type === "long_text") {
    return (
      <textarea
        rows={3}
        value={value}
        onChange={(event) => onChange(question.id, event.target.value)}
        className={`${baseClass} min-h-[124px] resize-y`}
        placeholder="Respuesta del invitado"
      />
    );
  }

  if (question.type === "single_select") {
    return (
      <select
        className={`${baseClass} bg-white`}
        style={selectStyle}
        value={value}
        onChange={(event) => onChange(question.id, event.target.value)}
      >
        <option value="">Seleccionar</option>
        {(Array.isArray(question.options) ? question.options : []).map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (question.type === "boolean") {
    return (
      <select
        className={`${baseClass} bg-white`}
        style={selectStyle}
        value={value}
        onChange={(event) => onChange(question.id, event.target.value)}
      >
        <option value="">Seleccionar</option>
        <option value="yes">Si</option>
        <option value="no">No</option>
      </select>
    );
  }

  if (question.type === "number") {
    return (
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(event) => onChange(question.id, event.target.value)}
        className={baseClass}
        placeholder="0"
      />
    );
  }

  return (
    <input
      type={question.type === "phone" ? "tel" : "text"}
      value={value}
      onChange={(event) => onChange(question.id, event.target.value)}
      className={baseClass}
      placeholder="Respuesta del invitado"
    />
  );
}

function RsvpPreviewModal({ open, config, onClose }) {
  const [previewValues, setPreviewValues] = useState({});
  useCloseOnEscape(open, onClose);

  useEffect(() => {
    if (!open) {
      setPreviewValues({});
    }
  }, [open]);

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!open || !portalTarget) return null;

  const activeQuestions = getOrderedQuestions(config).filter((question) => question.active);
  const handlePreviewChange = (questionId, nextValue) => {
    setPreviewValues((prev) => ({
      ...prev,
      [questionId]: nextValue,
    }));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[1.5px] sm:p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rsvp-preview-title"
        aria-describedby="rsvp-preview-subtitle"
        className="relative w-full max-w-[548px] overflow-hidden rounded-[30px] border border-violet-200/70 bg-[#fffafc] shadow-[0_36px_90px_rgba(15,23,42,0.26)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[84px] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.9),_transparent_62%),linear-gradient(135deg,rgba(237,233,254,0.82),rgba(250,232,255,0.74)_52%,rgba(224,242,254,0.58))] sm:h-[92px]" />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/92 text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:-translate-y-px hover:bg-white sm:right-4 sm:top-4"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative max-h-[84vh] overflow-y-auto px-5 pb-5 pt-8 sm:px-7 sm:pb-7 sm:pt-9">
          <div
            className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/84 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700 shadow-[0_8px_24px_rgba(167,139,250,0.14)]"
            style={{ fontFamily: '"Montserrat", "Segoe UI", sans-serif' }}
          >
            Confirmar asistencia
          </div>

          <h5
            id="rsvp-preview-title"
            className="mt-5 max-w-[430px] text-[33px] font-semibold leading-[0.98] tracking-[-0.02em] text-slate-900 sm:text-[38px]"
            style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}
          >
            {config.modal.title}
          </h5>
          {config.modal.subtitle ? (
            <p
              id="rsvp-preview-subtitle"
              className="mt-5 max-w-[440px] text-[14px] leading-[1.85] text-slate-500 sm:text-[15px]"
              style={{ fontFamily: '"Montserrat", "Segoe UI", sans-serif' }}
            >
              {config.modal.subtitle}
            </p>
          ) : null}

          <form
            className="mt-6 rounded-[24px] border border-violet-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.88))] p-5 shadow-[0_18px_40px_rgba(139,92,246,0.08)] sm:mt-7 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <div className="space-y-4 sm:space-y-5">
              {activeQuestions.map((question) => (
                <div key={question.id} className="space-y-2">
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                    style={{ fontFamily: '"Montserrat", "Segoe UI", sans-serif' }}
                  >
                    {question.label}
                    {question.required ? " *" : ""}
                  </label>
                  {renderPreviewField(
                    question,
                    String(previewValues[question.id] ?? ""),
                    handlePreviewChange
                  )}
                </div>
              ))}
            </div>

            {activeQuestions.length === 0 ? (
              <div
                className="rounded-[18px] border border-dashed border-violet-200 bg-white/90 p-4 text-[13px] leading-relaxed text-slate-500"
                style={{ fontFamily: '"Montserrat", "Segoe UI", sans-serif' }}
              >
                No hay preguntas activas para previsualizar.
              </div>
            ) : null}

            <div className="pt-2">
              <button
                type="button"
                onClick={(event) => event.preventDefault()}
                className="w-full rounded-full px-4 py-4 text-[14px] font-semibold text-white shadow-[0_18px_34px_rgba(139,92,246,0.26)] transition hover:-translate-y-px"
                style={{ backgroundColor: config.modal.primaryColor || "#773dbe" }}
              >
                {config.modal.submitLabel || "Enviar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

export default function MiniToolbarTabRsvp({
  forcePresetSelection = false,
  onPresetSelectionComplete,
  simplifiedForAssistant = false,
  assistantSubstep = null,
}) {
  const [config, setConfig] = useState(() => createDefaultRsvpConfig("minimal"));
  const [rsvpButton, setRsvpButton] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fieldSelectorOpen, setFieldSelectorOpen] = useState(false);
  const [fieldEditorQuestionId, setFieldEditorQuestionId] = useState(null);
  const [rsvpDragState, setRsvpDragState] = useState(null);
  const rsvpQuestionListRef = useRef(null);
  const rsvpQuestionRowNodesRef = useRef(new Map());
  const rsvpQuestionDragSessionRef = useRef(null);
  const rsvpQuestionDragCleanupRef = useRef(null);

  const normalizedConfig = useMemo(() => normalizeConfig(config), [config]);
  const orderedQuestions = useMemo(() => getOrderedQuestions(normalizedConfig), [normalizedConfig]);

  const activeQuestions = orderedQuestions.filter((question) => question.active);
  const inactiveQuestions = orderedQuestions.filter((question) => !question.active);
  const displayedActiveQuestions = useMemo(() => {
    if (!rsvpDragState) return activeQuestions;
    return moveRowsForDragPreview(
      activeQuestions,
      rsvpDragState.fromIndex,
      rsvpDragState.toIndex
    );
  }, [rsvpDragState, activeQuestions]);
  const draggedRsvpQuestion = useMemo(() => {
    if (!rsvpDragState) return null;
    return (
      activeQuestions.find((question) => question.id === rsvpDragState.questionId) ||
      activeQuestions[rsvpDragState.fromIndex] ||
      null
    );
  }, [rsvpDragState, activeQuestions]);
  const editingQuestion = useMemo(() => {
    if (!fieldEditorQuestionId) return null;
    return orderedQuestions.find((question) => question.id === fieldEditorQuestionId) || null;
  }, [fieldEditorQuestionId, orderedQuestions]);

  const activeCount = countActiveQuestions(normalizedConfig);
  const activeCustomCount = countActiveCustomQuestions(normalizedConfig);
  const maxQuestions = normalizedConfig.limits?.maxQuestions || 12;
  const maxCustomQuestions = normalizedConfig.limits?.maxCustomQuestions || 2;
  const assistantScope = simplifiedForAssistant
    ? String(assistantSubstep?.scope || "").trim()
    : "";
  const showActivationBlock =
    !simplifiedForAssistant || !assistantScope || assistantScope === "activation";
  const showActiveQuestionsBlock =
    !simplifiedForAssistant ||
    !assistantScope ||
    assistantScope === "active" ||
    assistantScope === "activation";
  const showAddQuestionAction =
    !simplifiedForAssistant ||
    !assistantScope ||
    assistantScope === "add" ||
    assistantScope === "activation";
  const rsvpContainerClass = simplifiedForAssistant
    ? "flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto pr-1 md:overflow-hidden"
    : "flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto pr-1";
  const rsvpActivationGroupClass = simplifiedForAssistant
    ? "shrink-0 space-y-2"
    : "contents";
  const rsvpScrollableSectionClass = simplifiedForAssistant
    ? "min-h-0 flex shrink-0 flex-col overflow-visible md:flex-1 md:shrink md:overflow-hidden"
    : "";
  const rsvpListClass = simplifiedForAssistant
    ? "space-y-1.5 pr-1 md:min-h-0 md:flex-1 md:overflow-y-auto"
    : "space-y-1.5";

  const canAddMoreQuestions = activeCount < maxQuestions;
  const rsvpButtonId = rsvpButton?.id || null;
  const isRsvpActive = Boolean(rsvpButton && !isFunctionalCtaHidden(rsvpButton));

  const updateConfig = (nextConfig) => {
    const normalized = normalizeConfig(nextConfig);
    setConfig(normalized);
    emitRsvpConfigUpdate(normalized);
  };

  const handleSelectFieldToAdd = (question) => {
    if (!question?.id) return;

    const customBlocked =
      question.source === "custom" && activeCustomCount >= maxCustomQuestions;
    if (!canAddMoreQuestions || customBlocked) return;

    updateConfig(toggleQuestionActive(normalizedConfig, question.id, true));
    setFieldSelectorOpen(false);
    setFieldEditorQuestionId(question.id);
  };

  const handleRemoveField = (questionId) => {
    if (!questionId) return;
    updateConfig(toggleQuestionActive(normalizedConfig, questionId, false));
    setFieldEditorQuestionId((currentId) => (currentId === questionId ? null : currentId));
  };

  const handleActivationToggle = () => {
    const nextEnabled = !isRsvpActive;
    if (rsvpButtonId) {
      window.dispatchEvent(
        new CustomEvent("actualizar-elemento", {
          detail: {
            id: rsvpButtonId,
            cambios: {
              hidden: !nextEnabled,
            },
          },
        })
      );
      if (nextEnabled) {
        updateConfig({
          ...normalizedConfig,
          enabled: true,
        });
      }
      return;
    }

    updateConfig({
      ...normalizedConfig,
      enabled: nextEnabled,
    });

    if (nextEnabled) {
      insertDefaultRsvpButton();
    }
  };

  const handlePrimaryAction = () => {
    if (rsvpButtonId && !isFunctionalCtaHidden(rsvpButton)) {
      if (normalizedConfig.enabled !== true) {
        updateConfig({
          ...normalizedConfig,
          enabled: true,
        });
      }
      setPreviewOpen(true);
      return;
    }

    updateConfig({
      ...normalizedConfig,
      enabled: true,
    });
    if (rsvpButtonId) {
      window.dispatchEvent(
        new CustomEvent("actualizar-elemento", {
          detail: {
            id: rsvpButtonId,
            cambios: {
              hidden: false,
            },
          },
        })
      );
      return;
    }

    insertDefaultRsvpButton();
  };

  const setRsvpQuestionRowNode = useCallback((questionId, node) => {
    if (!questionId) return;
    if (node) {
      rsvpQuestionRowNodesRef.current.set(questionId, node);
    } else {
      rsvpQuestionRowNodesRef.current.delete(questionId);
    }
  }, []);

  const cleanupRsvpQuestionDrag = useCallback(() => {
    if (rsvpQuestionDragCleanupRef.current) {
      rsvpQuestionDragCleanupRef.current();
      rsvpQuestionDragCleanupRef.current = null;
    }
    rsvpQuestionDragSessionRef.current = null;
    setRsvpDragState(null);
  }, []);

  const resolveRsvpQuestionDropIndex = useCallback((clientY) => {
    const listNode = rsvpQuestionListRef.current;
    if (!listNode) return -1;

    const rows = Array.from(listNode.querySelectorAll("[data-rsvp-question-row='true']"));
    if (rows.length === 0) return -1;

    for (let index = 0; index < rows.length; index += 1) {
      const rect = rows[index].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return index;
      }
    }

    return rows.length - 1;
  }, []);

  const commitSidebarQuestionReorder = useCallback((from, to) => {
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < 0 ||
      from >= activeQuestions.length ||
      to >= activeQuestions.length ||
      from === to
    ) {
      return false;
    }

    const fromQuestion = activeQuestions[from];
    const toQuestion = activeQuestions[to];
    if (!fromQuestion?.id || !toQuestion?.id) return false;

    updateConfig(reorderQuestion(normalizedConfig, fromQuestion.id, toQuestion.id));
    return true;
  }, [normalizedConfig, activeQuestions]);

  const handleRsvpQuestionHandleKeyDown = useCallback((event, question) => {
    const from = activeQuestions.findIndex((item) => item.id === question?.id);
    let to = from;

    if (event.key === "ArrowUp") {
      to = from - 1;
    } else if (event.key === "ArrowDown") {
      to = from + 1;
    } else if (event.key === "Home") {
      to = 0;
    } else if (event.key === "End") {
      to = activeQuestions.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    commitSidebarQuestionReorder(from, to);
  }, [commitSidebarQuestionReorder, activeQuestions]);

  const handleRsvpQuestionDragStart = useCallback((event, question, visualIndex) => {
    if (activeQuestions.length < 2 || !question?.id) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const fromIndex = Number(visualIndex);
    if (!Number.isInteger(fromIndex) || fromIndex < 0) return;

    event.preventDefault();
    event.stopPropagation();

    if (rsvpQuestionDragCleanupRef.current) {
      rsvpQuestionDragCleanupRef.current();
      rsvpQuestionDragCleanupRef.current = null;
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; window listeners below own the drag lifecycle.
    }

    const rowNode = event.currentTarget.closest("[data-rsvp-question-row='true']");
    const rowRect = rowNode?.getBoundingClientRect?.();

    rsvpQuestionDragSessionRef.current = {
      pointerId: event.pointerId,
      fromIndex,
      toIndex: fromIndex,
      questionId: question.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      rowLeft: rowRect?.left || 0,
      rowWidth: rowRect?.width || 0,
      rowHeight: rowRect?.height || 58,
      grabOffsetX: rowRect ? event.clientX - rowRect.left : 0,
      grabOffsetY: rowRect ? event.clientY - rowRect.top : 0,
    };
    setRsvpDragState({
      questionId: question.id,
      fromIndex,
      toIndex: fromIndex,
      pointerX: event.clientX,
      pointerY: event.clientY,
      rowLeft: rowRect?.left || 0,
      rowWidth: rowRect?.width || 0,
      rowHeight: rowRect?.height || 58,
      grabOffsetX: rowRect ? event.clientX - rowRect.left : 0,
      grabOffsetY: rowRect ? event.clientY - rowRect.top : 0,
    });

    const handleMove = (moveEvent) => {
      const session = rsvpQuestionDragSessionRef.current;
      if (!session || moveEvent.pointerId !== session.pointerId) return;

      moveEvent.preventDefault();
      const toIndex = resolveRsvpQuestionDropIndex(moveEvent.clientY);
      const nextToIndex = toIndex >= 0 ? toIndex : session.toIndex;

      session.toIndex = nextToIndex;
      session.pointerX = moveEvent.clientX;
      session.pointerY = moveEvent.clientY;
      setRsvpDragState({
        questionId: session.questionId,
        fromIndex: session.fromIndex,
        toIndex: nextToIndex,
        pointerX: session.pointerX,
        pointerY: session.pointerY,
        rowLeft: session.rowLeft,
        rowWidth: session.rowWidth,
        rowHeight: session.rowHeight,
        grabOffsetX: session.grabOffsetX,
        grabOffsetY: session.grabOffsetY,
      });
    };

    const finishDrag = (endEvent, cancelled = false) => {
      const session = rsvpQuestionDragSessionRef.current;
      if (!session || endEvent.pointerId !== session.pointerId) return;

      endEvent.preventDefault();
      if (!cancelled && session.fromIndex !== session.toIndex) {
        commitSidebarQuestionReorder(session.fromIndex, session.toIndex);
      }
      cleanupRsvpQuestionDrag();
    };

    const handleUp = (upEvent) => finishDrag(upEvent, false);
    const handleCancel = (cancelEvent) => finishDrag(cancelEvent, true);

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp, true);
    window.addEventListener("pointercancel", handleCancel, true);

    rsvpQuestionDragCleanupRef.current = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp, true);
      window.removeEventListener("pointercancel", handleCancel, true);
    };
  }, [
    cleanupRsvpQuestionDrag,
    commitSidebarQuestionReorder,
    resolveRsvpQuestionDropIndex,
    activeQuestions.length,
  ]);

  useEffect(() => cleanupRsvpQuestionDrag, [cleanupRsvpQuestionDrag]);

  useEffect(() => {
    if (!forcePresetSelection) return;
    onPresetSelectionComplete?.();
  }, [forcePresetSelection, onPresetSelectionComplete]);

  useEffect(() => {
    const syncConfigFromWindow = (event) => {
      const detailConfig = event?.detail?.config;
      if (detailConfig && typeof detailConfig === "object") {
        setConfig(normalizeConfig(detailConfig));
        return;
      }

      if (window._rsvpConfigActual && typeof window._rsvpConfigActual === "object") {
        setConfig(normalizeConfig(window._rsvpConfigActual));
      }
    };

    const syncButton = () => {
      setRsvpButton(findRsvpButton());
    };

    syncConfigFromWindow();
    syncButton();

    window.addEventListener("rsvp-config-changed", syncConfigFromWindow);
    window.addEventListener("editor-selection-change", syncButton);

    return () => {
      window.removeEventListener("rsvp-config-changed", syncConfigFromWindow);
      window.removeEventListener("editor-selection-change", syncButton);
    };
  }, []);

  return (
    <>
      <div className={rsvpContainerClass}>
        {showActivationBlock && (
        <div className={rsvpActivationGroupClass}>
        <section className={styles.activationPanel}>
          <div className={styles.activationHeader}>
            <h3 className={styles.activationTitle}>Pedir confirmación de asistencia</h3>
            <button
              type="button"
              role="switch"
              aria-checked={isRsvpActive}
              aria-label={
                isRsvpActive
                  ? "Desactivar confirmación de asistencia"
                  : "Activar confirmación de asistencia"
              }
              onClick={handleActivationToggle}
              className={`${styles.activationSwitch} ${
                isRsvpActive ? styles.activationSwitchOn : ""
              }`}
            >
              <span className={styles.activationSwitchThumb} aria-hidden="true" />
            </button>
          </div>
        </section>

        {!simplifiedForAssistant && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/55 p-3">
          <h3 className="text-[13px] font-semibold text-slate-900">Boton de asistencia</h3>

          <div className="mt-2">
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="inline-flex min-h-[38px] w-full items-center justify-center gap-1 rounded-md border border-violet-300 bg-white px-2 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            >
              <Eye className="h-3.5 w-3.5" />
              {rsvpButtonId
                ? isFunctionalCtaHidden(rsvpButton)
                  ? "Mostrar boton"
                  : "Vista previa"
                : "Agregar boton"}
            </button>
          </div>
        </div>
        )}
        </div>
        )}

        {showActiveQuestionsBlock && (
        <section className={`space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 ${rsvpScrollableSectionClass}`}>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Campos del formulario</h4>

          <div
            ref={rsvpQuestionListRef}
            role="list"
            className={rsvpListClass}
          >
            {displayedActiveQuestions.map((question, index) => {
              const isDraggingQuestion = rsvpDragState?.questionId === question.id;
              const isDropTarget = rsvpDragState && rsvpDragState.toIndex === index;

              return (
              <article
                key={question.id}
                ref={(node) => setRsvpQuestionRowNode(question.id, node)}
                role="listitem"
                data-rsvp-question-row="true"
                className={`relative flex min-h-[58px] items-center gap-2 rounded-lg border bg-white p-1.5 transition ${
                  isDraggingQuestion
                    ? "border-purple-200 bg-purple-50 opacity-40"
                    : "border-zinc-200"
                } ${isDropTarget ? "shadow-[0_0_0_2px_rgba(168,85,247,0.22)]" : ""}`}
              >
                {isDropTarget && (
                  <span className="absolute -top-0.5 left-2 right-2 h-0.5 rounded bg-purple-400" />
                )}
                <button
                  type="button"
                  onPointerDown={(event) => handleRsvpQuestionDragStart(event, question, index)}
                  onKeyDown={(event) => handleRsvpQuestionHandleKeyDown(event, question)}
                  disabled={activeQuestions.length < 2}
                  aria-label={`Reordenar ${question.label}`}
                  title="Arrastra desde aqui para mover"
                  className="flex h-10 w-8 shrink-0 touch-none items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-zinc-500 cursor-grab active:cursor-grabbing disabled:cursor-default disabled:text-zinc-300"
                >
                  <GripVertical size={16} aria-hidden="true" />
                </button>
                <div className="min-w-0 flex-1">
                  <div
                    className="overflow-hidden break-words text-xs font-medium leading-[1.2] text-slate-800"
                    title={question.label}
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {question.label}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] leading-[1.2] text-slate-500">
                    {getQuestionTypeLabel(question)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setFieldEditorQuestionId(question.id)}
                  className="rounded border border-violet-200 p-1 text-violet-700 hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                  title="Editar campo"
                  aria-label={`Editar ${question.label}`}
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => handleRemoveField(question.id)}
                  className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                  title="Quitar campo"
                  aria-label={`Quitar ${question.label}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </article>
              );
            })}
            {rsvpDragState && draggedRsvpQuestion && (
              <div
                aria-hidden="true"
                className="pointer-events-none fixed z-[100] flex min-h-[58px] items-center gap-2 rounded-lg border border-purple-300 bg-white p-1.5 shadow-xl ring-2 ring-purple-100"
                style={{
                  left: `${resolveDragPreviewLeft(rsvpDragState)}px`,
                  top: `${(rsvpDragState.pointerY || 0) - (rsvpDragState.grabOffsetY || 0)}px`,
                  width: rsvpDragState.rowWidth ? `${rsvpDragState.rowWidth}px` : undefined,
                }}
              >
                <span className="flex h-10 w-8 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-zinc-500">
                  <GripVertical size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-zinc-700">
                    Mover a posicion {Number(rsvpDragState.toIndex || 0) + 1}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-400">
                    {draggedRsvpQuestion.label}
                  </span>
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-zinc-600">
                  <X className="h-3 w-3" aria-hidden="true" />
                </span>
              </div>
            )}

            {activeQuestions.length === 0 ? (
              <div className="rounded-md border border-dashed border-emerald-200 bg-white p-2 text-[11px] text-emerald-700">
                No hay campos activos.
              </div>
            ) : null}
          </div>
        </section>
        )}

        {showAddQuestionAction && (
        <section className="shrink-0 rounded-xl border border-violet-200 bg-violet-50/55 p-2">
          {canAddMoreQuestions && inactiveQuestions.length > 0 ? (
            <button
              type="button"
              onClick={() => setFieldSelectorOpen(true)}
              className={`${COMPACT_ACTION_BUTTON_CLASS} bg-white`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Agregar otro campo
            </button>
          ) : (
            <div className="rounded-md border border-dashed border-violet-200 bg-white p-2 text-[11px] text-violet-700">
              {canAddMoreQuestions
                ? "Todos los campos disponibles ya fueron agregados."
                : "Llegaste al maximo de preguntas."}
            </div>
          )}
        </section>
        )}

        <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={`${COMPACT_ACTION_BUTTON_CLASS} bg-violet-50`}
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            Ajustes del formulario
          </button>
        </section>
      </div>

      <FieldSelectorModal
        open={fieldSelectorOpen}
        questions={inactiveQuestions}
        onClose={() => setFieldSelectorOpen(false)}
        onSelect={handleSelectFieldToAdd}
        canAddMoreQuestions={canAddMoreQuestions}
        activeCustomCount={activeCustomCount}
        maxCustomQuestions={maxCustomQuestions}
      />

      <FieldEditorModal
        open={Boolean(editingQuestion)}
        config={normalizedConfig}
        question={editingQuestion}
        onClose={() => setFieldEditorQuestionId(null)}
        onChange={updateConfig}
        onRemove={() => handleRemoveField(editingQuestion?.id)}
      />

      <FormSettingsModal
        open={settingsOpen}
        config={normalizedConfig}
        onClose={() => setSettingsOpen(false)}
        onChange={updateConfig}
      />

      <RsvpPreviewModal
        open={previewOpen}
        config={normalizedConfig}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}

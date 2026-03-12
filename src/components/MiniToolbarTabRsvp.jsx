import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Eye, GripVertical, Plus, Settings2, X } from "lucide-react";
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
import {
  moveQuestion,
  setCustomQuestionType,
  setMenuOptionLabel,
  setModalSettings,
  setQuestionLabel,
  setQuestionRequired,
  toggleQuestionActive,
} from "@/domain/rsvp/editorOps";

function normalizeConfig(input) {
  if (!input || typeof input !== "object") {
    return createDefaultRsvpConfig("minimal");
  }
  return normalizeRsvpConfig(input, { forceEnabled: false });
}

function findRsvpButtonId() {
  if (typeof window === "undefined") return null;
  const objects = Array.isArray(window._objetosActuales) ? window._objetosActuales : [];
  const rsvpButton = objects.find((obj) => obj?.tipo === "rsvp-boton");
  return rsvpButton?.id || null;
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

function AdvancedSettingsModal({
  open,
  config,
  onClose,
  onChange,
  maxQuestions,
  maxCustomQuestions,
}) {
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  useCloseOnEscape(open, onClose);

  if (!open || !portalTarget) return null;

  const orderedQuestions = getOrderedQuestions(config);
  const activeQuestions = orderedQuestions.filter((question) => question.active);
  const inactiveQuestions = orderedQuestions.filter((question) => !question.active);
  const activeCount = countActiveQuestions(config);
  const activeCustomCount = countActiveCustomQuestions(config);

  const canAddMoreQuestions = activeCount < maxQuestions;

  const updateConfig = (nextConfig) => {
    onChange(normalizeConfig(nextConfig));
  };

  return createPortal(
    <div className="fixed inset-0 z-[340] flex items-center justify-center bg-slate-950/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-violet-100 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Configuracion avanzada</h4>
            <p className="mt-0.5 text-xs text-slate-600">Color, textos y etiquetas del formulario.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[78vh] space-y-4 overflow-y-auto p-4">
          <section className="space-y-2 rounded-xl border border-slate-200 p-3">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Textos</h5>
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
              <input
                type="text"
                className={inputClassName()}
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
                <div className="flex items-center justify-between rounded-md border border-zinc-300 bg-white px-2 py-1.5">
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
          </section>

          <section className="space-y-2 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Preguntas activas</h5>
              <span className="text-[11px] text-slate-500">
                {activeCount}/{maxQuestions} - personalizadas {activeCustomCount}/{maxCustomQuestions}
              </span>
            </div>

            <div className="space-y-2">
              {activeQuestions.map((question, index) => (
                <article key={question.id} className="rounded-md border border-slate-200 bg-white p-2.5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 break-words text-[11px] font-semibold text-violet-700">
                      {index + 1}. {question.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateConfig(toggleQuestionActive(config, question.id, false))}
                      className="shrink-0 rounded border border-slate-200 px-1.5 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
                    >
                      Quitar
                    </button>
                  </div>

                  <Field label="Texto de la pregunta">
                    <input
                      type="text"
                      className={inputClassName()}
                      value={question.label}
                      onChange={(event) =>
                        updateConfig(setQuestionLabel(config, question.id, event.target.value))
                      }
                    />
                  </Field>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700">
                      <input
                        type="checkbox"
                        checked={question.required}
                        onChange={(event) =>
                          updateConfig(setQuestionRequired(config, question.id, event.target.checked))
                        }
                      />
                      Obligatoria
                    </label>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => updateConfig(moveQuestion(config, question.id, "up"))}
                      className="ml-auto rounded border border-slate-200 px-1.5 py-1 text-[10px] disabled:opacity-40"
                    >
                      Subir
                    </button>
                    <button
                      type="button"
                      disabled={index === activeQuestions.length - 1}
                      onClick={() => updateConfig(moveQuestion(config, question.id, "down"))}
                      className="rounded border border-slate-200 px-1.5 py-1 text-[10px] disabled:opacity-40"
                    >
                      Bajar
                    </button>
                  </div>

                  {question.source === "custom" ? (
                    <div className="mt-2">
                      <Field label="Tipo de respuesta">
                        <select
                          className={inputClassName()}
                          value={question.type}
                          onChange={(event) =>
                            updateConfig(setCustomQuestionType(config, question.id, event.target.value))
                          }
                        >
                          <option value="short_text">Texto corto</option>
                          <option value="long_text">Texto largo</option>
                        </select>
                      </Field>
                    </div>
                  ) : null}

                  {question.id === "menu_type" && Array.isArray(question.options) ? (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-[11px] font-medium text-slate-600">Opciones de menu</p>
                      {question.options.map((option) => (
                        <input
                          key={option.id}
                          type="text"
                          className={inputClassName()}
                          value={option.label}
                          onChange={(event) =>
                            updateConfig(setMenuOptionLabel(config, option.id, event.target.value))
                          }
                        />
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className="space-y-2 rounded-xl border border-slate-200 p-3">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Agregar preguntas</h5>
            <div className="space-y-1.5">
              {inactiveQuestions.map((question) => {
                const customBlocked =
                  question.source === "custom" && activeCustomCount >= maxCustomQuestions;
                const disabled = !canAddMoreQuestions || customBlocked;

                return (
                  <div
                    key={question.id}
                    className="flex items-start justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-xs font-medium text-slate-800">{question.label}</div>
                      <div className="text-[11px] text-slate-500">
                        {question.source === "custom" ? "Pregunta personalizada" : "Pregunta sugerida"}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => updateConfig(toggleQuestionActive(config, question.id, true))}
                      className="shrink-0 rounded border border-violet-200 px-1.5 py-1 text-[10px] text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Agregar
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
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
}) {
  const [config, setConfig] = useState(() => createDefaultRsvpConfig("minimal"));
  const [rsvpButtonId, setRsvpButtonId] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const normalizedConfig = useMemo(() => normalizeConfig(config), [config]);
  const orderedQuestions = useMemo(() => getOrderedQuestions(normalizedConfig), [normalizedConfig]);

  const activeQuestions = orderedQuestions.filter((question) => question.active);
  const inactiveQuestions = orderedQuestions.filter((question) => !question.active);

  const activeCount = countActiveQuestions(normalizedConfig);
  const activeCustomCount = countActiveCustomQuestions(normalizedConfig);
  const maxQuestions = normalizedConfig.limits?.maxQuestions || 12;
  const maxCustomQuestions = normalizedConfig.limits?.maxCustomQuestions || 2;

  const canAddMoreQuestions = activeCount < maxQuestions;

  const updateConfig = (nextConfig) => {
    const normalized = normalizeConfig(nextConfig);
    setConfig(normalized);
    emitRsvpConfigUpdate(normalized);
  };

  const handlePrimaryAction = () => {
    if (rsvpButtonId) {
      setPreviewOpen(true);
      return;
    }

    const defaultButtonStyle = createRsvpButtonStylePatch(MIDNIGHT_RSVP_BUTTON_STYLE_ID);

    window.dispatchEvent(
      new CustomEvent("insertar-elemento", {
        detail: {
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
        },
      })
    );
  };

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
      setRsvpButtonId(findRsvpButtonId());
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
      <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto pr-1">
        <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 p-3">
          <h3 className="text-[13px] font-semibold text-slate-900">Confirmar asistencia</h3>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-violet-300 bg-white px-2 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-100"
            >
              <Eye className="h-3.5 w-3.5" />
              {rsvpButtonId ? "Vista previa" : "Agregar boton"}
            </button>
            <button
              type="button"
              onClick={() => setAdvancedOpen(true)}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-violet-200 bg-violet-100 px-2 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-200"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Avanzado
            </button>
          </div>
        </div>

        <section className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Activas</h4>

          <div className="space-y-1.5">
            {activeQuestions.map((question, index) => (
              <article
                key={question.id}
                className="flex min-h-[56px] items-center gap-2 rounded-lg border border-emerald-200 bg-white px-2 py-2"
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
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
                </div>

                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => updateConfig(moveQuestion(normalizedConfig, question.id, "up"))}
                  className="rounded border border-emerald-200 p-1 text-emerald-700 disabled:opacity-35"
                  title="Subir"
                  aria-label="Subir pregunta"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  disabled={index === activeQuestions.length - 1}
                  onClick={() => updateConfig(moveQuestion(normalizedConfig, question.id, "down"))}
                  className="rounded border border-emerald-200 p-1 text-emerald-700 disabled:opacity-35"
                  title="Bajar"
                  aria-label="Bajar pregunta"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  onClick={() => updateConfig(toggleQuestionActive(normalizedConfig, question.id, false))}
                  className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50"
                  title="Quitar pregunta"
                  aria-label="Quitar pregunta"
                >
                  <X className="h-3 w-3" />
                </button>
              </article>
            ))}

            {activeQuestions.length === 0 ? (
              <div className="rounded-md border border-dashed border-emerald-200 bg-white p-2 text-[11px] text-emerald-700">
                No hay preguntas activas.
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/55 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-violet-800">Para agregar</h4>

          <div className="space-y-1.5">
            {inactiveQuestions.map((question) => {
              const customBlocked =
                question.source === "custom" && activeCustomCount >= maxCustomQuestions;
              const disabled = !canAddMoreQuestions || customBlocked;

              return (
                <div
                  key={question.id}
                  className="flex min-h-[56px] items-center justify-between gap-2 rounded-lg border border-violet-200 bg-white px-2 py-2"
                >
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
                  </div>

                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => updateConfig(toggleQuestionActive(normalizedConfig, question.id, true))}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-200 text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-35"
                    title="Agregar pregunta"
                    aria-label="Agregar pregunta"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}

            {!canAddMoreQuestions ? (
              <div className="rounded-md border border-dashed border-violet-200 bg-white p-2 text-[11px] text-violet-700">
                Llegaste al maximo de preguntas.
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <AdvancedSettingsModal
        open={advancedOpen}
        config={normalizedConfig}
        onClose={() => setAdvancedOpen(false)}
        onChange={updateConfig}
        maxQuestions={maxQuestions}
        maxCustomQuestions={maxCustomQuestions}
      />

      <RsvpPreviewModal
        open={previewOpen}
        config={normalizedConfig}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}

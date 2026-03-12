import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Eye, ExternalLink, Gift, Plus, Settings2, X } from "lucide-react";
import { createDefaultGiftConfig, hasVisibleGiftMethods, normalizeGiftConfig } from "@/domain/gifts/config";
import { getFunctionalCtaDefaultText } from "@/domain/functionalCtaButtons";
import {
  MIDNIGHT_RSVP_BUTTON_STYLE_ID,
  createRsvpButtonStylePatch,
} from "@/domain/rsvp/buttonStyles";

const DEFAULT_GIFT_BUTTON_TEXT = getFunctionalCtaDefaultText("regalo-boton") || "Ver regalos";

const BANK_FIELD_DEFS = Object.freeze([
  {
    key: "holder",
    label: "Titular",
    placeholder: "Nombre del titular",
    copyLabel: "Titular",
  },
  {
    key: "bank",
    label: "Banco",
    placeholder: "Nombre del banco",
    copyLabel: "Banco",
  },
  {
    key: "alias",
    label: "Alias",
    placeholder: "alias.cuenta",
    copyLabel: "Alias",
  },
  {
    key: "cbu",
    label: "CBU / CVU",
    placeholder: "0000000000000000000000",
    copyLabel: "CBU",
  },
  {
    key: "cuit",
    label: "CUIT",
    placeholder: "20-00000000-0",
    copyLabel: "CUIT",
  },
]);

const GIFT_METHOD_DEFS = Object.freeze([
  {
    key: "holder",
    label: "Titular",
  },
  {
    key: "bank",
    label: "Banco",
  },
  {
    key: "alias",
    label: "Alias",
  },
  {
    key: "cbu",
    label: "CBU / CVU",
  },
  {
    key: "cuit",
    label: "CUIT",
  },
  {
    key: "giftListLink",
    label: "Lista externa",
  },
]);

function normalizeConfig(input) {
  if (!input || typeof input !== "object") {
    return createDefaultGiftConfig();
  }
  return normalizeGiftConfig(input, { forceEnabled: false });
}

function emitGiftConfigUpdate(nextConfig) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("gift-config-update", {
      detail: { config: nextConfig },
    })
  );
}

function getObjects() {
  if (typeof window === "undefined") return [];
  return Array.isArray(window._objetosActuales) ? window._objetosActuales : [];
}

function findGiftButton() {
  return getObjects().find((obj) => obj?.tipo === "regalo-boton") || null;
}

function findGiftButtonId() {
  return findGiftButton()?.id || null;
}

function updateGiftButtonText(buttonId, text) {
  if (typeof window === "undefined" || !buttonId) return;
  window.dispatchEvent(
    new CustomEvent("actualizar-elemento", {
      detail: {
        id: buttonId,
        cambios: {
          texto: String(text || "").trim() || DEFAULT_GIFT_BUTTON_TEXT,
        },
      },
    })
  );
}

function inputClassName() {
  return "w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100";
}

function copyWithFallback(value) {
  const text = String(value || "");
  if (!text) return Promise.resolve(false);

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => false);
  }

  if (typeof document === "undefined") return Promise.resolve(false);

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  document.body.removeChild(textarea);
  return Promise.resolve(copied);
}

function Field({ label, children, hint = "" }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-rose-700">
        {label}
      </span>
      {children}
      {hint ? <span className="block text-[11px] leading-relaxed text-slate-500">{hint}</span> : null}
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

function buildGiftMethodItems(config) {
  return GIFT_METHOD_DEFS.map((item) => {
    const isGiftList = item.key === "giftListLink";
    const rawValue = isGiftList ? config?.giftListUrl : config?.bank?.[item.key];
    const value = String(rawValue || "").trim();
    const active = Boolean(config?.visibility?.[item.key]);
    const complete = value.length > 0;
    return {
      ...item,
      active,
      complete,
      value,
      preview: complete ? value : "Sin completar todavia",
    };
  });
}

function GiftAdvancedSettingsModal({
  open,
  config,
  buttonText,
  giftListDraft,
  targetFieldKey,
  onClose,
  onChange,
  onButtonTextChange,
  onBankFieldChange,
  onGiftListDraftChange,
  onGiftListCommit,
}) {
  const fieldRefs = useRef({});
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  useCloseOnEscape(open, onClose);

  useEffect(() => {
    if (!open || !targetFieldKey) return;

    const rafId = window.requestAnimationFrame(() => {
      const targetNode = fieldRefs.current?.[targetFieldKey];
      if (!targetNode) return;
      targetNode.scrollIntoView({ block: "center", behavior: "smooth" });
      targetNode.focus?.();
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [open, targetFieldKey]);

  if (!open || !portalTarget) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[340] overflow-y-auto bg-slate-950/45 px-4 pb-6 pt-6 sm:flex sm:items-center sm:justify-center sm:px-6"
      onClick={onClose}
    >
      <div
        className="mx-auto flex max-h-[calc(100vh-3rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-2xl sm:my-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between border-b border-rose-100 bg-gradient-to-r from-rose-50 via-amber-50 to-white px-4 py-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Configuracion avanzada</h4>
            <p className="mt-0.5 text-xs text-slate-600">
              Edita textos, datos bancarios y el link externo desde un solo lugar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <section className="space-y-3 rounded-xl border border-rose-200 p-3">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-rose-700">
              General
            </h5>

            <Field label="Texto del boton" hint="Se refleja sobre el elemento del canvas.">
              <input
                type="text"
                className={inputClassName()}
                value={buttonText}
                onChange={(event) => onButtonTextChange(event.target.value)}
                placeholder={DEFAULT_GIFT_BUTTON_TEXT}
              />
            </Field>

            <Field label="Texto introductorio">
              <textarea
                rows={4}
                className={`${inputClassName()} min-h-[112px] resize-y`}
                value={config.introText}
                onChange={(event) =>
                  onChange({
                    ...config,
                    introText: event.target.value,
                  })
                }
                placeholder="Texto introductorio para el modal"
              />
            </Field>
          </section>

          <section className="space-y-3 rounded-xl border border-amber-200 p-3">
            <div>
              <h5 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Datos bancarios
              </h5>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Los campos visibles se activan o desactivan desde el panel principal.
              </p>
            </div>

            <div className="space-y-3">
              {BANK_FIELD_DEFS.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  hint={config.visibility[field.key] ? "Visible en el modal." : "Oculto en el modal."}
                >
                  <input
                    ref={(node) => {
                      fieldRefs.current[field.key] = node;
                    }}
                    type="text"
                    className={inputClassName()}
                    value={config.bank[field.key]}
                    onChange={(event) => onBankFieldChange(field.key, event.target.value)}
                    placeholder={field.placeholder}
                  />
                </Field>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 p-3">
            <div>
              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                Lista externa
              </h5>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Si el boton de lista esta activo, este link se abre en una nueva pestana.
              </p>
            </div>

            <Field
              label="Link lista regalos"
              hint={config.visibility.giftListLink ? "Visible en el modal." : "Oculto en el modal."}
            >
              <input
                ref={(node) => {
                  fieldRefs.current.giftListLink = node;
                }}
                type="url"
                className={inputClassName()}
                value={giftListDraft}
                onChange={(event) => onGiftListDraftChange(event.target.value)}
                onBlur={() => onGiftListCommit(giftListDraft)}
                placeholder="https://..."
              />
            </Field>
          </section>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

function GiftPreviewModal({ open, config, onClose }) {
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const copyTimeoutsRef = useRef({});
  const [copiedFields, setCopiedFields] = useState({});

  const visibleBankFields = useMemo(
    () =>
      BANK_FIELD_DEFS.filter(({ key }) => {
        const value = String(config?.bank?.[key] || "").trim();
        return config?.visibility?.[key] && value;
      }),
    [config]
  );

  const showGiftList = Boolean(config?.visibility?.giftListLink && config?.giftListUrl);
  const hasVisibleMethods = visibleBankFields.length > 0 || showGiftList;

  useEffect(() => {
    if (open) return;

    Object.values(copyTimeoutsRef.current).forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    copyTimeoutsRef.current = {};
    setCopiedFields({});
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus?.();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element instanceof HTMLElement);

      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      Object.values(copyTimeoutsRef.current).forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      copyTimeoutsRef.current = {};
      const lastFocused = lastFocusedRef.current;
      if (lastFocused && typeof lastFocused.focus === "function") {
        lastFocused.focus();
      }
    };
  }, [onClose, open]);

  const handleCopy = async (fieldKey, value) => {
    const copied = await copyWithFallback(value);
    if (!copied) return;

    setCopiedFields((prev) => ({
      ...prev,
      [fieldKey]: true,
    }));

    if (copyTimeoutsRef.current[fieldKey]) {
      clearTimeout(copyTimeoutsRef.current[fieldKey]);
    }

    copyTimeoutsRef.current[fieldKey] = setTimeout(() => {
      setCopiedFields((prev) => ({
        ...prev,
        [fieldKey]: false,
      }));
      delete copyTimeoutsRef.current[fieldKey];
    }, 1800);
  };

  if (!open || !portalTarget) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[1.5px] sm:p-5"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-preview-title"
        aria-describedby="gift-preview-intro"
        className="relative w-full max-w-[520px] overflow-hidden rounded-[28px] border border-rose-200/80 bg-[#fffdfa] shadow-[0_28px_80px_rgba(15,23,42,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[102px] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.88),_transparent_58%),linear-gradient(135deg,rgba(254,205,211,0.95),rgba(255,241,242,0.92)_48%,rgba(254,249,195,0.78))] sm:h-[112px]" />

        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-white/95 text-slate-600 shadow-sm transition hover:bg-rose-50 sm:right-4 sm:top-4"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative max-h-[84vh] overflow-y-auto px-4 pb-4 pt-9 sm:px-6 sm:pb-6 sm:pt-10">
          <div className="flex min-h-[78px] flex-col items-center justify-center px-2 pb-3 pt-0.5 text-center sm:min-h-[86px] sm:px-6 sm:pb-4 sm:pt-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-rose-700 shadow-sm">
              <Gift className="h-3.5 w-3.5" />
              Regalos
            </div>

            <h5
              id="gift-preview-title"
              className="mt-3 max-w-[420px] text-[20px] font-semibold leading-[1.06] text-slate-900 sm:text-[22px]"
            >
              Un gesto con amor
            </h5>
          </div>

          <p
            id="gift-preview-intro"
            className="mx-auto mb-3.5 max-w-[430px] px-1 text-center text-[12px] leading-[1.75] text-slate-600 sm:mb-4 sm:text-[13px]"
          >
            {config?.introText}
          </p>

          <div className="space-y-2">
            {visibleBankFields.map((field) => {
              const value = String(config?.bank?.[field.key] || "").trim();
              const isCopied = Boolean(copiedFields[field.key]);
              return (
                <article
                  key={field.key}
                  className="rounded-[16px] border border-rose-100 bg-white/95 p-2 shadow-[0_6px_18px_rgba(244,63,94,0.06)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-600">
                        {field.label}
                      </div>
                      <div className="mt-0.5 break-all text-[12px] font-medium leading-[1.45] text-slate-800">
                        {value}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(field.key, value)}
                      className={`inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-[12px] border px-2.5 py-1.5 text-[12px] font-semibold transition ${
                        isCopied
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                      }`}
                    >
                      {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {isCopied ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </article>
              );
            })}

            {showGiftList ? (
              <a
                href={config.giftListUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-[16px] border border-slate-200 bg-slate-900 px-4 py-2.5 text-[12px] font-semibold text-white shadow-[0_10px_22px_rgba(15,23,42,0.16)] transition hover:bg-slate-800"
              >
                <ExternalLink className="h-3 w-3" />
                Ver lista de regalos
              </a>
            ) : null}

            {!hasVisibleMethods ? (
              <div className="rounded-[16px] border border-dashed border-rose-200 bg-white/80 px-4 py-3.5 text-center text-[12px] leading-relaxed text-slate-500">
                Pueden acompanarnos con un detalle cuando quieran. Cuando agreguen alias, CBU o una lista externa, apareceran aqui.
              </div>
            ) : null}
          </div>
        </div>

      </div>
    </div>,
    portalTarget
  );
}

export default function MiniToolbarTabRegalos() {
  const [config, setConfig] = useState(() => createDefaultGiftConfig());
  const [giftButtonId, setGiftButtonId] = useState(null);
  const [buttonText, setButtonText] = useState(DEFAULT_GIFT_BUTTON_TEXT);
  const [giftListDraft, setGiftListDraft] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedTargetKey, setAdvancedTargetKey] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const normalizedConfig = useMemo(() => normalizeConfig(config), [config]);
  const hasVisibleMethods = useMemo(() => hasVisibleGiftMethods(normalizedConfig), [normalizedConfig]);
  const methodItems = useMemo(() => buildGiftMethodItems(normalizedConfig), [normalizedConfig]);
  const activeItems = methodItems.filter((item) => item.active);
  const inactiveItems = methodItems.filter((item) => !item.active);

  const syncButtonState = () => {
    const giftButton = findGiftButton();
    setGiftButtonId(giftButton?.id || null);
    if (giftButton && typeof giftButton.texto === "string") {
      setButtonText(giftButton.texto || DEFAULT_GIFT_BUTTON_TEXT);
    }
  };

  const updateConfig = (nextConfig) => {
    const normalized = normalizeConfig(nextConfig);
    setConfig(normalized);
    emitGiftConfigUpdate(normalized);
  };

  const updateBankField = (fieldKey, value) => {
    const nextValue = String(value || "");
    updateConfig({
      ...normalizedConfig,
      bank: {
        ...normalizedConfig.bank,
        [fieldKey]: nextValue,
      },
      visibility: {
        ...normalizedConfig.visibility,
        [fieldKey]:
          nextValue.trim().length > 0 ? true : normalizedConfig.visibility[fieldKey],
      },
    });
  };

  const updateGiftListUrl = (value) => {
    const nextValue = String(value || "");
    setGiftListDraft(nextValue);
    updateConfig({
      ...normalizedConfig,
      giftListUrl: nextValue,
      visibility: {
        ...normalizedConfig.visibility,
        giftListLink:
          nextValue.trim().length > 0 ? true : normalizedConfig.visibility.giftListLink,
      },
    });
  };

  const handlePrimaryAction = () => {
    if (giftButtonId) {
      setPreviewOpen(true);
      return;
    }

    const defaultButtonStyle = createRsvpButtonStylePatch(MIDNIGHT_RSVP_BUTTON_STYLE_ID);

    window.dispatchEvent(
      new CustomEvent("insertar-elemento", {
        detail: {
          id: `gift-${Date.now()}`,
          tipo: "regalo-boton",
          texto: String(buttonText || "").trim() || DEFAULT_GIFT_BUTTON_TEXT,
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

  const handleButtonTextChange = (nextText) => {
    setButtonText(nextText);
    if (giftButtonId) {
      updateGiftButtonText(giftButtonId, nextText);
    }
  };

  const openAdvancedAtField = (targetKey = null) => {
    setAdvancedTargetKey(targetKey);
    setAdvancedOpen(true);
  };

  const toggleMethodVisibility = (key, nextVisible) => {
    updateConfig({
      ...normalizedConfig,
      visibility: {
        ...normalizedConfig.visibility,
        [key]: nextVisible,
      },
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncConfigFromWindow = (event) => {
      const detailConfig = event?.detail?.config;
      if (detailConfig && typeof detailConfig === "object") {
        const nextConfig = normalizeConfig(detailConfig);
        setConfig(nextConfig);
        setGiftListDraft(nextConfig.giftListUrl || "");
        return;
      }

      if (window._giftConfigActual && typeof window._giftConfigActual === "object") {
        const nextConfig = normalizeConfig(window._giftConfigActual);
        setConfig(nextConfig);
        setGiftListDraft(nextConfig.giftListUrl || "");
      }
    };

    syncConfigFromWindow();
    syncButtonState();

    window.addEventListener("gift-config-changed", syncConfigFromWindow);
    window.addEventListener("editor-selection-change", syncButtonState);

    return () => {
      window.removeEventListener("gift-config-changed", syncConfigFromWindow);
      window.removeEventListener("editor-selection-change", syncButtonState);
    };
  }, []);

  return (
    <>
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto pr-1">
        <section className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 via-amber-50 to-white p-3 shadow-sm">
          <h3 className="text-center text-[13px] font-semibold text-slate-900">Regalos</h3>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-rose-300 bg-white px-2 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100"
            >
              <Eye className="h-3.5 w-3.5" />
              {giftButtonId ? "Vista previa" : "Agregar boton"}
            </button>
            <button
              type="button"
              onClick={() => openAdvancedAtField()}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-rose-200 bg-rose-100 px-2 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-200"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Avanzado
            </button>
          </div>
        </section>

        <section className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
            Activas
          </h4>

          <div className="space-y-1.5">
            {activeItems.map((item) => (
              <article
                key={item.key}
                role={item.complete ? undefined : "button"}
                tabIndex={item.complete ? -1 : 0}
                onClick={() => {
                  if (!item.complete) openAdvancedAtField(item.key);
                }}
                onKeyDown={(event) => {
                  if (item.complete) return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  openAdvancedAtField(item.key);
                }}
                className={`flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-2 py-2 ${
                  item.complete
                    ? ""
                    : "cursor-pointer transition hover:border-amber-300 hover:bg-amber-50/60 focus:outline-none focus:ring-2 focus:ring-amber-200"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-slate-800" title={item.label}>
                    {item.label}
                  </div>
                  <div
                    className={`truncate text-[11px] ${
                      item.complete ? "text-emerald-700" : "text-amber-700"
                    }`}
                    title={item.preview}
                  >
                    {item.preview}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleMethodVisibility(item.key, false);
                  }}
                  className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50"
                  title="Ocultar item"
                  aria-label={`Ocultar ${item.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </article>
            ))}

            {activeItems.length === 0 ? (
              <div className="rounded-md border border-dashed border-emerald-200 bg-white p-2 text-[11px] text-emerald-700">
                No hay items visibles.
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/55 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-violet-800">
            Para agregar
          </h4>

          <div className="space-y-1.5">
            {inactiveItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-white px-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-slate-800" title={item.label}>
                    {item.label}
                  </div>
                  <div className="text-[11px] text-slate-500">{item.description}</div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleMethodVisibility(item.key, true)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-200 text-violet-700 hover:bg-violet-100"
                  title={`Agregar ${item.label}`}
                  aria-label={`Agregar ${item.label}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {inactiveItems.length === 0 ? (
              <div className="rounded-md border border-dashed border-violet-200 bg-white p-2 text-[11px] text-violet-700">
                Ya activaste todos los items disponibles.
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <GiftAdvancedSettingsModal
        open={advancedOpen}
        config={normalizedConfig}
        buttonText={buttonText}
        giftListDraft={giftListDraft}
        targetFieldKey={advancedTargetKey}
        onClose={() => {
          setAdvancedOpen(false);
          setAdvancedTargetKey(null);
        }}
        onChange={updateConfig}
        onButtonTextChange={handleButtonTextChange}
        onBankFieldChange={updateBankField}
        onGiftListDraftChange={setGiftListDraft}
        onGiftListCommit={updateGiftListUrl}
      />

      <GiftPreviewModal
        open={previewOpen}
        config={normalizedConfig}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}

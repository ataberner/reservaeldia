import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Eye, ExternalLink, Gift, Pencil, Plus, Settings2, X } from "lucide-react";
import { createDefaultGiftConfig, hasVisibleGiftMethods, normalizeGiftConfig } from "@/domain/gifts/config";
import {
  getFunctionalCtaDefaultText,
  isFunctionalCtaHidden,
} from "@/domain/functionalCtaButtons";
import { readEditorObjectByType } from "@/lib/editorRuntimeBridge";
import {
  MIDNIGHT_RSVP_BUTTON_STYLE_ID,
  createRsvpButtonStylePatch,
} from "@/domain/rsvp/buttonStyles";
import styles from "./MiniToolbarTabRegalos.module.css";

const DEFAULT_GIFT_BUTTON_TEXT = getFunctionalCtaDefaultText("regalo-boton") || "Ver regalos";
const COMPACT_GIFT_ACTION_BUTTON_CLASS =
  "inline-flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300";

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
    placeholder: "Nombre del titular",
    description: "Nombre de la persona titular de la cuenta.",
    inputType: "text",
  },
  {
    key: "bank",
    label: "Banco",
    placeholder: "Nombre del banco",
    description: "Banco o billetera donde reciben el regalo.",
    inputType: "text",
  },
  {
    key: "alias",
    label: "Alias",
    placeholder: "alias.cuenta",
    description: "Alias para transferencias.",
    inputType: "text",
  },
  {
    key: "cbu",
    label: "CBU / CVU",
    placeholder: "0000000000000000000000",
    description: "CBU, CVU o numero de cuenta.",
    inputType: "text",
  },
  {
    key: "cuit",
    label: "CUIT",
    placeholder: "20-00000000-0",
    description: "CUIT o identificacion asociada.",
    inputType: "text",
  },
  {
    key: "giftListLink",
    label: "Lista externa",
    placeholder: "https://...",
    description: "Link a una lista de regalos externa.",
    inputType: "url",
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

function findGiftButton() {
  return readEditorObjectByType("regalo-boton");
}

function buildDefaultGiftButtonPayload(buttonText) {
  const defaultButtonStyle = createRsvpButtonStylePatch(MIDNIGHT_RSVP_BUTTON_STYLE_ID);

  return {
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
  };
}

function insertDefaultGiftButton(buttonText) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("insertar-elemento", {
      detail: buildDefaultGiftButtonPayload(buttonText),
    })
  );
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
      preview: complete ? value : "Falta completar",
    };
  });
}

function getGiftMethodByKey(methodKey) {
  return GIFT_METHOD_DEFS.find((item) => item.key === methodKey) || null;
}

function getGiftMethodValue(config, methodKey) {
  if (methodKey === "giftListLink") return String(config?.giftListUrl || "");
  return String(config?.bank?.[methodKey] || "");
}

function GiftSettingsModal({
  open,
  config,
  buttonText,
  onClose,
  onChange,
  onButtonTextChange,
}) {
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  useCloseOnEscape(open, onClose);

  if (!open || !portalTarget) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[340] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[1.5px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-settings-title"
        className="w-full max-h-[82vh] overflow-hidden rounded-t-2xl border border-rose-100 bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-rose-100 bg-gradient-to-r from-rose-50 via-amber-50 to-white px-4 py-3">
          <div>
            <h4 id="gift-settings-title" className="text-sm font-semibold text-slate-900">
              Ajustes de regalos
            </h4>
            <p className="mt-0.5 text-xs text-slate-600">
              Textos generales del modal y del boton en la invitacion.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            aria-label="Cerrar ajustes"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[62vh] space-y-3 overflow-y-auto p-4">
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

          <Field label="Texto del boton" hint="Se refleja sobre el elemento del canvas.">
            <input
              type="text"
              className={inputClassName()}
              value={buttonText}
              onChange={(event) => onButtonTextChange(event.target.value)}
              placeholder={DEFAULT_GIFT_BUTTON_TEXT}
            />
          </Field>
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            Listo
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

function GiftMethodSelectorModal({ open, methods, onClose, onSelect }) {
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  useCloseOnEscape(open, onClose);

  if (!open || !portalTarget) return null;

  const hasMethods = methods.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[342] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[1.5px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-method-selector-title"
        className="w-full max-h-[82vh] overflow-hidden rounded-t-2xl border border-rose-100 bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-rose-100 bg-gradient-to-r from-rose-50 via-amber-50 to-white px-4 py-3">
          <div className="min-w-0">
            <h4 id="gift-method-selector-title" className="text-sm font-semibold text-slate-900">
              Agregar dato de regalo
            </h4>
            <p className="mt-0.5 text-xs text-slate-600">
              Elegi un dato para mostrar en el modal de regalos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            aria-label="Cerrar selector"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[min(62vh,420px)] overflow-y-auto p-3 sm:p-4">
          {!hasMethods ? (
            <div className="rounded-lg border border-dashed border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800">
              Todos los datos disponibles ya fueron agregados.
            </div>
          ) : (
            <div className="space-y-2">
              {methods.map((method) => (
                <button
                  key={method.key}
                  type="button"
                  onClick={() => onSelect(method)}
                  className="flex min-h-[54px] w-full items-start rounded-lg border border-rose-100 bg-white px-3 py-2 text-left transition hover:border-rose-200 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-medium leading-[1.25] text-slate-800">
                      {method.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                      {method.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

function GiftMethodEditorModal({
  open,
  config,
  method,
  onClose,
  onValueChange,
  onToggleVisible,
  onRemove,
}) {
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  const methodKey = method?.key || "";
  const [draftValue, setDraftValue] = useState("");
  useCloseOnEscape(open, () => {
    if (methodKey) {
      onValueChange(methodKey, draftValue);
    }
    onClose();
  });

  useEffect(() => {
    if (!open || !methodKey) return;
    setDraftValue(getGiftMethodValue(config, methodKey));
  }, [open, methodKey]);

  if (!open || !portalTarget || !method) return null;

  const isGiftList = method.key === "giftListLink";
  const visible = Boolean(config?.visibility?.[method.key]);
  const isComplete = String(draftValue || "").trim().length > 0;
  const commitDraftValue = () => {
    onValueChange(method.key, draftValue);
  };
  const closeEditor = () => {
    commitDraftValue();
    onClose();
  };
  const removeAndClose = () => {
    onRemove(method.key);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[344] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[1.5px] sm:items-center sm:p-4"
      onClick={closeEditor}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-method-editor-title"
        className="w-full max-h-[86vh] overflow-hidden rounded-t-2xl border border-rose-100 bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-rose-100 bg-gradient-to-r from-rose-50 via-amber-50 to-white px-4 py-3">
          <div className="min-w-0">
            <h4 id="gift-method-editor-title" className="text-sm font-semibold text-slate-900">
              Editar dato
            </h4>
            <p className="mt-0.5 truncate text-xs text-slate-600">{method.label}</p>
          </div>
          <button
            type="button"
            onClick={closeEditor}
            className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            aria-label="Cerrar editor"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[66vh] space-y-3 overflow-y-auto p-4">
          <label className="flex min-h-[42px] items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50/45 px-3 py-2">
            <span className="text-xs font-medium text-slate-700">Mostrar en la invitacion</span>
            <input
              type="checkbox"
              checked={visible}
              onChange={(event) => onToggleVisible(method.key, event.target.checked)}
              className="h-4 w-4 accent-rose-700"
            />
          </label>

          <Field
            label={method.label}
            hint={
              isComplete
                ? method.description
                : "Falta completar este dato para que aparezca en el modal publico."
            }
          >
            <input
              type={method.inputType === "url" ? "url" : "text"}
              className={inputClassName()}
              value={draftValue}
              onChange={(event) => {
                const nextValue = event.target.value;
                setDraftValue(nextValue);
                if (!isGiftList) {
                  onValueChange(method.key, nextValue);
                }
              }}
              onBlur={commitDraftValue}
              placeholder={method.placeholder}
              autoFocus
            />
          </Field>

          <button
            type="button"
            onClick={removeAndClose}
            className="min-h-[40px] w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
          >
            Quitar de datos visibles
          </button>
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={closeEditor}
            className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            Listo
          </button>
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
        className="relative w-full max-w-[540px] overflow-hidden rounded-[30px] border border-rose-200/70 bg-[#fffaf7] shadow-[0_36px_90px_rgba(15,23,42,0.26)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[84px] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.9),_transparent_62%),linear-gradient(135deg,rgba(254,205,211,0.82),rgba(255,244,246,0.72)_52%,rgba(254,249,195,0.56))] sm:h-[92px]" />

        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:-translate-y-px hover:bg-white sm:right-4 sm:top-4"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative max-h-[84vh] overflow-y-auto px-5 pb-5 pt-8 sm:px-7 sm:pb-7 sm:pt-9">
          <div className="flex flex-col items-center text-center">
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/84 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700 shadow-[0_8px_24px_rgba(244,114,182,0.12)]"
              style={{ fontFamily: '"Montserrat", "Segoe UI", sans-serif' }}
            >
              <Gift className="h-3 w-3" />
              Regalos
            </div>

            <h5
              id="gift-preview-title"
              className="mt-5 max-w-[430px] text-[33px] font-semibold leading-[0.98] tracking-[-0.02em] text-slate-900 sm:text-[38px]"
              style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}
            >
              Un gesto con amor
            </h5>
          </div>

          <p
            id="gift-preview-intro"
            className="mx-auto mt-5 max-w-[442px] text-center text-[14px] leading-[1.85] text-slate-500 sm:text-[15px]"
            style={{ fontFamily: '"Montserrat", "Segoe UI", sans-serif' }}
          >
            {config?.introText}
          </p>

          <div className="mx-auto mb-6 mt-6 h-px w-full max-w-[456px] bg-gradient-to-r from-transparent via-rose-200/80 to-transparent" />

          <div className="space-y-3.5 sm:space-y-4">
            {visibleBankFields.map((field) => {
              const value = String(config?.bank?.[field.key] || "").trim();
              const isCopied = Boolean(copiedFields[field.key]);
              return (
                <article
                  key={field.key}
                  className="rounded-[22px] border border-rose-100/80 bg-[#fffdfb] px-4 py-4 shadow-[0_16px_38px_rgba(244,63,94,0.08)]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-500"
                        style={{ fontFamily: '"Montserrat", "Segoe UI", sans-serif' }}
                      >
                        {field.label}
                      </div>
                      <div
                        className="mt-2 break-all text-[15px] font-medium leading-[1.55] text-slate-900 sm:text-[16px]"
                        style={{ fontFamily: '"Montserrat", "Segoe UI", sans-serif' }}
                      >
                        {value}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(field.key, value)}
                      className={`inline-flex min-h-[46px] w-full shrink-0 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-[13px] font-semibold transition sm:w-auto sm:min-w-[126px] ${
                        isCopied
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-rose-200 bg-rose-50/90 text-rose-700 hover:bg-rose-100"
                      }`}
                      style={{ fontFamily: '"Montserrat", "Segoe UI", sans-serif' }}
                    >
                      {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
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
                className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[20px] border border-slate-900/10 bg-slate-900 px-4 py-3 text-[13px] font-semibold text-white shadow-[0_16px_34px_rgba(15,23,42,0.18)] transition hover:bg-slate-800"
                style={{ fontFamily: '"Montserrat", "Segoe UI", sans-serif' }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ver lista de regalos
              </a>
            ) : null}

            {!hasVisibleMethods ? (
              <div
                className="rounded-[22px] border border-dashed border-rose-200 bg-[#fffdfb] px-4 py-5 text-center text-[13px] leading-[1.8] text-slate-500"
                style={{ fontFamily: '"Montserrat", "Segoe UI", sans-serif' }}
              >
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

export default function MiniToolbarTabRegalos({
  simplifiedForAssistant = false,
}) {
  const [config, setConfig] = useState(() => ({
    ...createDefaultGiftConfig(),
    enabled: false,
  }));
  const [giftButton, setGiftButton] = useState(null);
  const [buttonText, setButtonText] = useState(DEFAULT_GIFT_BUTTON_TEXT);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [methodSelectorOpen, setMethodSelectorOpen] = useState(false);
  const [editingMethodKey, setEditingMethodKey] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const normalizedConfig = useMemo(() => normalizeConfig(config), [config]);
  const hasVisibleMethods = useMemo(() => hasVisibleGiftMethods(normalizedConfig), [normalizedConfig]);
  const methodItems = useMemo(() => buildGiftMethodItems(normalizedConfig), [normalizedConfig]);
  const activeItems = methodItems.filter((item) => item.active);
  const inactiveItems = methodItems.filter((item) => !item.active);
  const editingMethod = useMemo(() => getGiftMethodByKey(editingMethodKey), [editingMethodKey]);
  const giftButtonId = giftButton?.id || null;
  const isGiftActive = normalizedConfig.enabled === true;
  const giftsContainerClass = simplifiedForAssistant
    ? "flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto pr-1 md:overflow-hidden"
    : "flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto pr-1";
  const giftsActivationGroupClass = simplifiedForAssistant
    ? "shrink-0 space-y-2"
    : "contents";
  const giftsScrollableSectionClass = simplifiedForAssistant
    ? "min-h-0 flex shrink-0 flex-col overflow-visible md:flex-1 md:shrink md:overflow-hidden"
    : "";
  const giftsListClass = simplifiedForAssistant
    ? "space-y-1.5 pr-1 md:min-h-0 md:flex-1 md:overflow-y-auto"
    : "space-y-1.5";

  const syncButtonState = () => {
    const giftButton = findGiftButton();
    setGiftButton(giftButton || null);
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
    if (giftButtonId && !isFunctionalCtaHidden(giftButton)) {
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
    if (giftButtonId) {
      window.dispatchEvent(
        new CustomEvent("actualizar-elemento", {
          detail: {
            id: giftButtonId,
            cambios: {
              hidden: false,
            },
          },
        })
      );
      return;
    }

    insertDefaultGiftButton(buttonText);
  };

  const handleActivationToggle = () => {
    const nextEnabled = !isGiftActive;
    if (giftButtonId) {
      window.dispatchEvent(
        new CustomEvent("actualizar-elemento", {
          detail: {
            id: giftButtonId,
            cambios: {
              hidden: !nextEnabled,
            },
          },
        })
      );
      updateConfig({
        ...normalizedConfig,
        enabled: nextEnabled,
      });
      return;
    }

    updateConfig({
      ...normalizedConfig,
      enabled: nextEnabled,
    });

    if (nextEnabled) {
      insertDefaultGiftButton(buttonText);
    }
  };

  const handleButtonTextChange = (nextText) => {
    setButtonText(nextText);
    if (giftButtonId) {
      updateGiftButtonText(giftButtonId, nextText);
    }
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

  const handleMethodValueChange = (key, value) => {
    if (key === "giftListLink") {
      updateGiftListUrl(value);
      return;
    }
    updateBankField(key, value);
  };

  const handleSelectMethodToAdd = (method) => {
    if (!method?.key) return;
    toggleMethodVisibility(method.key, true);
    setMethodSelectorOpen(false);
    setEditingMethodKey(method.key);
  };

  const handleRemoveMethod = (key) => {
    if (!key) return;
    toggleMethodVisibility(key, false);
    setEditingMethodKey((currentKey) => (currentKey === key ? null : currentKey));
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncConfigFromWindow = (event) => {
      const detailConfig = event?.detail?.config;
      if (detailConfig && typeof detailConfig === "object") {
        const nextConfig = normalizeConfig(detailConfig);
        setConfig(nextConfig);
        return;
      }

      if (window._giftConfigActual && typeof window._giftConfigActual === "object") {
        const nextConfig = normalizeConfig(window._giftConfigActual);
        setConfig(nextConfig);
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
      <div className={giftsContainerClass}>
        <div className={giftsActivationGroupClass}>
          <section className={styles.activationPanel}>
            <div className={styles.activationHeader}>
              <h3 className={styles.activationTitle}>Mostrar opciones de regalos</h3>
              <button
                type="button"
                role="switch"
                aria-checked={isGiftActive}
                aria-label={
                  isGiftActive
                    ? "Desactivar boton de regalos"
                    : "Activar boton de regalos"
                }
                onClick={handleActivationToggle}
                className={`${styles.activationSwitch} ${
                  isGiftActive ? styles.activationSwitchOn : ""
                }`}
              >
                <span className={styles.activationSwitchThumb} aria-hidden="true" />
              </button>
            </div>
            
          </section>

          {isGiftActive && !hasVisibleMethods ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/75 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
              Agrega al menos un dato visible y completo para que el boton funcione al publicar.
            </div>
          ) : null}
        </div>

        <section className={`space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 ${giftsScrollableSectionClass}`}>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
            Datos visibles
          </h4>

          <div className={giftsListClass}>
            {activeItems.map((item) => (
              <article
                key={item.key}
                role="button"
                tabIndex={0}
                onClick={() => setEditingMethodKey(item.key)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setEditingMethodKey(item.key);
                }}
                className={`flex min-h-[54px] items-center gap-2 rounded-lg border bg-white px-2 py-2 transition focus:outline-none focus:ring-2 ${
                  item.complete
                    ? "border-emerald-200 hover:bg-emerald-50/55 focus:ring-emerald-200"
                    : "border-amber-200 hover:bg-amber-50/65 focus:ring-amber-200"
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
                    setEditingMethodKey(item.key);
                  }}
                  className="rounded border border-rose-200 p-1 text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                  title="Editar dato"
                  aria-label={`Editar ${item.label}`}
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRemoveMethod(item.key);
                  }}
                  className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                  title="Ocultar dato"
                  aria-label={`Ocultar ${item.label}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </article>
            ))}

            {activeItems.length === 0 ? (
              <div className="rounded-md border border-dashed border-emerald-200 bg-white p-2 text-[11px] text-emerald-700">
                No hay datos visibles.
              </div>
            ) : null}
          </div>
        </section>

        <section className="shrink-0 rounded-xl border border-rose-200 bg-rose-50/55 p-2">
          {inactiveItems.length > 0 ? (
            <button
              type="button"
              onClick={() => setMethodSelectorOpen(true)}
              className={`${COMPACT_GIFT_ACTION_BUTTON_CLASS} border-rose-200 bg-white text-rose-800 hover:bg-rose-100`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Agregar dato de regalo
            </button>
          ) : (
            <div className="rounded-md border border-dashed border-rose-200 bg-white p-2 text-[11px] text-rose-700">
              Todos los datos disponibles ya fueron agregados.
            </div>
          )}
        </section>

        <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handlePrimaryAction}
              className={`${COMPACT_GIFT_ACTION_BUTTON_CLASS} border-rose-200 bg-white text-rose-800 hover:bg-rose-50`}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {giftButtonId
                ? isFunctionalCtaHidden(giftButton)
                  ? "Mostrar boton"
                  : "Vista previa"
                : "Agregar boton"}
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className={`${COMPACT_GIFT_ACTION_BUTTON_CLASS} border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100`}
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              Ajustes de regalos
            </button>
          </div>
        </section>
      </div>

      <GiftMethodSelectorModal
        open={methodSelectorOpen}
        methods={inactiveItems}
        onClose={() => setMethodSelectorOpen(false)}
        onSelect={handleSelectMethodToAdd}
      />

      <GiftMethodEditorModal
        open={Boolean(editingMethod)}
        config={normalizedConfig}
        method={editingMethod}
        onClose={() => setEditingMethodKey(null)}
        onValueChange={handleMethodValueChange}
        onToggleVisible={toggleMethodVisibility}
        onRemove={handleRemoveMethod}
      />

      <GiftSettingsModal
        open={settingsOpen}
        config={normalizedConfig}
        buttonText={buttonText}
        onClose={() => setSettingsOpen(false)}
        onChange={updateConfig}
        onButtonTextChange={handleButtonTextChange}
      />

      <GiftPreviewModal
        open={previewOpen}
        config={normalizedConfig}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}

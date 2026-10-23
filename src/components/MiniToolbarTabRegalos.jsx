import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Pencil, Plus, Settings2, X } from "lucide-react";
import { createDefaultGiftConfig, getGiftAccounts, getGiftLinks, hasVisibleGiftMethods, normalizeGiftConfig } from "@/domain/gifts/config";
import {
  buildFunctionalCtaButtonPayload,
  getFunctionalCtaDefaultText,
  isFunctionalCtaHidden,
} from "@/domain/functionalCtaButtons";
import { readEditorObjectByType } from "@/lib/editorRuntimeBridge";
import styles from "./MiniToolbarTabRegalos.module.css";
import GiftDataModal from "./editor/gifts/GiftDataModal";
import { loadGiftLinkMetadata } from "@/domain/gifts/service";
import GiftPreview from "./editor/gifts/GiftPreview";
import { GIFT_BANK_FIELDS } from "./editor/gifts/giftEditorDraft";

const DEFAULT_GIFT_BUTTON_TEXT = getFunctionalCtaDefaultText("regalo-boton") || "Ver regalos";
const COMPACT_GIFT_ACTION_BUTTON_CLASS =
  "inline-flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300";

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
  return buildFunctionalCtaButtonPayload("regalo-boton", {
    text: String(buttonText || "").trim() || DEFAULT_GIFT_BUTTON_TEXT,
  });
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
  const [dataEditor, setDataEditor] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const normalizedConfig = useMemo(() => normalizeConfig(config), [config]);
  const hasVisibleMethods = useMemo(() => hasVisibleGiftMethods(normalizedConfig), [normalizedConfig]);
  const visibleAccounts = getGiftAccounts(normalizedConfig).map((account) => ({
    ...account,
    fields: GIFT_BANK_FIELDS.filter(({ key }) => account.visibility[key] && account.bank[key]),
  })).filter((account) => account.fields.length > 0);
  const visibleLinks = getGiftLinks(normalizedConfig).filter((link) => link.visible && link.url);
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
            {visibleAccounts.map((account) => (
              <button key={account.id} type="button" onClick={() => setDataEditor({ initialTab: "accounts", initialAccount: account.id })} className={styles.summaryRow}>
                <span className={styles.summaryCurrency}>{account.currency}</span>
                <span className={styles.summaryCopy}><strong>Cuenta en {account.id === "usd" ? "dólares" : "pesos"}</strong><small>{account.fields.map(({ label }) => label).join(" · ")}</small></span>
                <Pencil size={14} aria-hidden="true" />
              </button>
            ))}
            {visibleLinks.map((link) => (
              <button key={link.id} type="button" onClick={() => setDataEditor({ initialTab: "links", initialLinkId: link.id })} className={styles.summaryRow}>
                <span className={styles.summaryCopy}><strong>{link.title || "Regalo"}</strong><small>{link.url}</small></span><Pencil size={14} aria-hidden="true" />
              </button>
            ))}
            {!visibleAccounts.length && !visibleLinks.length ? <div className="rounded-md border border-dashed border-emerald-200 bg-white p-2 text-[11px] text-emerald-700">No hay datos visibles.</div> : null}
          </div>
        </section>
        <section className="shrink-0 rounded-xl border border-rose-200 bg-rose-50/55 p-2">
          <button type="button" onClick={() => setDataEditor({ initialTab: "accounts" })} className={`${COMPACT_GIFT_ACTION_BUTTON_CLASS} border-rose-200 bg-white text-rose-800 hover:bg-rose-100`}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />Agregar dato de regalo
          </button>
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

      {dataEditor ? <GiftDataModal config={normalizedConfig} {...dataEditor} loadLinkMetadata={loadGiftLinkMetadata} onClose={() => setDataEditor(null)} onSave={(nextConfig) => { updateConfig({ ...nextConfig, enabled: normalizedConfig.enabled, introText: normalizedConfig.introText }); setDataEditor(null); }} /> : null}

      <GiftSettingsModal
        open={settingsOpen}
        config={normalizedConfig}
        buttonText={buttonText}
        onClose={() => setSettingsOpen(false)}
        onChange={updateConfig}
        onButtonTextChange={handleButtonTextChange}
      />

      {previewOpen ? <GiftPreview config={normalizedConfig} onClose={() => setPreviewOpen(false)} /> : null}
    </>
  );
}

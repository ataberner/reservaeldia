import React, { useEffect, useState } from "react";
import { ArrowLeft, Eye, Landmark, Link } from "lucide-react";
import { normalizeGiftConfig } from "@/domain/gifts/config";
import GiftDialog from "./GiftDialog";
import GiftAccountsEditor from "./GiftAccountsEditor";
import GiftLinksEditor from "./GiftLinksEditor";
import { GiftPreviewContent } from "./GiftPreview";
import { getEditableGiftLinks, initialAutoVisibleFields, validateGiftEditorDraft, validateGiftLink } from "./giftEditorDraft";
import useGiftLinkMetadata from "./useGiftLinkMetadata";
import styles from "./GiftsEditor.module.css";

export default function GiftDataModal({ config, initialTab = "accounts", initialAccount = "ars", initialLinkId = null, onClose, onSave, loadLinkMetadata }) {
  const { draft, setDraft, metadataStates, changeLink, removeLink, requestMetadata, cancelPending } = useGiftLinkMetadata(config, loadLinkMetadata);
  const [autoVisibleFields, setAutoVisibleFields] = useState(() => initialAutoVisibleFields(normalizeGiftConfig(config, { forceEnabled: false })));
  const [tab, setTab] = useState(initialTab);
  const [preview, setPreview] = useState(false);
  const [editingId, setEditingId] = useState(initialLinkId);
  const [validation, setValidation] = useState({ message: "", linkId: null });
  const setError = (message, linkId = null) => setValidation({ message, linkId });
  useEffect(() => {
    if (!validation.message || !validation.linkId) return;
    const link = getEditableGiftLinks(draft).find((item) => item.id === validation.linkId);
    if (!link || !validateGiftLink(draft, link)) setValidation({ message: "", linkId: null });
  }, [draft, validation]);
  const close = () => { cancelPending(); onClose(); };
  const save = () => {
    const result = validateGiftEditorDraft(draft);
    if (result.error) { setError(result.error, result.linkId); setTab("links"); setPreview(false); setEditingId(result.linkId); return; }
    cancelPending();
    onSave(result.config);
  };
  const selectTab = (next) => { setTab(next); setError(""); };
  const navigateTabs = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "accounts" : event.key === "End" ? "links" : tab === "accounts" ? "links" : "accounts";
    selectTab(next);
    document.getElementById(`gift-tab-${next}`)?.focus();
  };
  return <GiftDialog title={preview ? "Así lo verán tus invitados" : "Agregar datos de regalo"} description={preview ? "Vista previa de los cambios, antes de guardarlos." : "Compartí tus cuentas y armá una lista con ideas para regalar."} onClose={close} footer={<>
    <button type="button" className={styles.textButton} onClick={() => setPreview(!preview)}>{preview ? <ArrowLeft size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}{preview ? "Volver a editar" : "Como invitado"}</button>
    <div className={styles.footerActions}><button type="button" className={styles.secondaryButton} onClick={close}>Cancelar</button><button type="button" className={styles.primaryButton} onClick={save}>Guardar datos</button></div>
  </>}>
    {preview ? <div className={styles.scrollBody}><GiftPreviewContent config={normalizeGiftConfig(draft, { forceEnabled: false })} /></div> : <>
      <div role="tablist" aria-label="Tipos de regalos" className={styles.tabs} onKeyDown={navigateTabs}>{[{ id: "accounts", label: "Cuentas bancarias", Icon: Landmark }, { id: "links", label: "Lista de regalos", Icon: Link }].map(({ id, label, Icon }) => <button key={id} id={`gift-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`gift-panel-${id}`} tabIndex={tab === id ? 0 : -1} className={tab === id ? styles.activeTab : ""} onClick={() => selectTab(id)}><Icon size={17} aria-hidden="true" />{label}</button>)}</div>
      <div className={styles.scrollBody} role="tabpanel" id={`gift-panel-${tab}`} aria-labelledby={`gift-tab-${tab}`}>
        {tab === "accounts" ? <GiftAccountsEditor draft={draft} setDraft={setDraft} autoVisibleFields={autoVisibleFields} setAutoVisibleFields={setAutoVisibleFields} initialAccount={initialAccount} /> : <GiftLinksEditor draft={draft} setDraft={setDraft} editingId={editingId} setEditingId={setEditingId} error={validation.message} setError={setError} metadataAvailable={typeof loadLinkMetadata === "function"} metadataStates={metadataStates} onRequestMetadata={requestMetadata} onLinkChange={changeLink} onLinkRemove={removeLink} />}
      </div>
    </>}
  </GiftDialog>;
}

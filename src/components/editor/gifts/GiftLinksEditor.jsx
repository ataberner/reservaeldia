import React, { useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { GIFT_MAX_LINKS, sanitizeGiftLinkUrl } from "@/domain/gifts/config";
import { getEditableGiftLinks, getGiftLinkDomain, validateGiftLink } from "./giftEditorDraft";
import { GiftLinkImage } from "./GiftPreview";
import styles from "./GiftsEditor.module.css";

function MetadataStatus({ status }) {
  const messages = {
    loading: "Buscando nombre e imagen…",
    found: "Búsqueda terminada. Podés revisar y editar los datos.",
    empty: "No encontramos nombre ni imagen. Podés completarlos manualmente.",
    unavailable: "No pudimos leer este enlace. Podés completar los datos manualmente.",
  };
  return messages[status] ? <p className={styles.help} role="status" aria-live="polite">{messages[status]}</p> : null;
}

export default function GiftLinksEditor({ draft, setDraft, editingId, setEditingId, error, setError, metadataAvailable, metadataStates, onRequestMetadata, onLinkChange, onLinkRemove }) {
  const [newUrl, setNewUrl] = useState("");
  const titleRef = useRef(null);
  const urlRef = useRef(null);
  const links = getEditableGiftLinks(draft);
  useEffect(() => { if (editingId) titleRef.current?.focus(); }, [editingId]);

  const addLink = (event) => {
    event.preventDefault();
    const url = sanitizeGiftLinkUrl(newUrl);
    if (!url) { setError("Ingresá un enlace válido que empiece con https:// o http://."); urlRef.current?.focus(); return; }
    if (links.some((link) => sanitizeGiftLinkUrl(link.url) === url)) { setError("Este enlace ya está en tu lista de regalos."); return; }
    if (draft.giftLinks.length >= GIFT_MAX_LINKS) { setError(`Podés agregar hasta ${GIFT_MAX_LINKS} regalos.`); return; }
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `gift-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const newLink = { id, url, title: "", imageUrl: "", visible: true };
    setDraft((current) => ({ ...current, giftLinks: [...current.giftLinks, newLink] }));
    onRequestMetadata(newLink);
    setNewUrl("");
    setError("");
    setEditingId(id);
  };
  const changeLink = (id, changes) => { onLinkChange(id, changes); setError(""); };
  const finishEdit = (link) => { const validation = validateGiftLink(draft, link); setError(validation, link.id); if (!validation) setEditingId(null); };

  return <div className={styles.panel}>
    <p className={styles.panelHelp}>Sumá enlaces de productos, experiencias o una lista externa. Podés incluir enlaces de Mercado Libre o Mercado Pago.</p>
    <form className={styles.addLinkForm} onSubmit={addLink} noValidate>
      <label htmlFor="gift-new-link">Enlace del regalo</label><div className={styles.inputAction}><input ref={urlRef} id="gift-new-link" type="url" value={newUrl} onChange={(event) => { setNewUrl(event.target.value); setError(""); }} placeholder="https://..." maxLength={2000} autoComplete="off" /><button type="submit" className={styles.primaryButton} disabled={draft.giftLinks.length >= GIFT_MAX_LINKS}><Plus size={16} aria-hidden="true" />Agregar</button></div>
      <p className={styles.help}>{metadataAvailable ? "Buscaremos el nombre y la imagen cuando el sitio los comparta. Siempre podés editarlos." : "Completá el nombre y, si querés, una imagen."}</p>
    </form>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <div className={styles.listHeading}><h3>Tu lista de regalos</h3><span>{links.length}</span></div>
    <div className={styles.linkList}>{links.map((link) => editingId === link.id ? (
      <article key={link.id} className={styles.linkEditor}>
        <div className={styles.editHeading}><h4>{link.id === "legacy" ? "Lista externa existente" : "Editar regalo"}</h4><label className={styles.visibility}><input type="checkbox" checked={link.visible} onChange={(event) => changeLink(link.id, { visible: event.target.checked })} /><span>Visible</span></label></div>
        {link.id !== "legacy" ? <div className={styles.field}><label htmlFor={`gift-title-${link.id}`}>Nombre del regalo</label><input ref={titleRef} id={`gift-title-${link.id}`} type="text" value={link.title} maxLength={120} placeholder="Por ejemplo, una cafetera para casa" onChange={(event) => changeLink(link.id, { title: event.target.value })} /></div> : null}
        <div className={styles.field}><label htmlFor={`gift-url-${link.id}`}>Enlace</label><input ref={link.id === "legacy" ? titleRef : undefined} id={`gift-url-${link.id}`} type="url" value={link.url} maxLength={2000} onChange={(event) => changeLink(link.id, { url: event.target.value })} /></div>
        {link.id !== "legacy" && metadataAvailable ? <div className={styles.metadataControls}><button type="button" className={styles.textButton} disabled={metadataStates[link.id]?.status === "loading" || !sanitizeGiftLinkUrl(link.url)} onClick={() => onRequestMetadata(link)}><RefreshCw size={14} aria-hidden="true" />Completar desde el enlace</button><MetadataStatus status={metadataStates[link.id]?.status} /></div> : null}
        {link.id !== "legacy" ? <div className={styles.imageEditor}><GiftLinkImage imageUrl={link.imageUrl} /><div className={styles.field}><label htmlFor={`gift-image-${link.id}`}>URL de imagen <span className={styles.help}>(opcional)</span></label><input id={`gift-image-${link.id}`} type="url" value={link.imageUrl} maxLength={2000} placeholder="https://.../foto.jpg" onChange={(event) => changeLink(link.id, { imageUrl: event.target.value })} /><p className={styles.help}>Usá un enlace directo a una imagen. Sin foto, el regalo se muestra con un ícono.</p></div></div> : <p className={styles.help}>Este enlace conserva tu lista externa actual.</p>}
        <div className={styles.editHeading}><button type="button" className={styles.textButton} onClick={() => finishEdit(link)}><Check size={16} aria-hidden="true" />Listo</button><button type="button" className={styles.textButton} onClick={() => { onLinkRemove(link.id); setEditingId(null); setError(""); urlRef.current?.focus(); }}><Trash2 size={15} aria-hidden="true" />Quitar regalo</button></div>
      </article>
    ) : (
      <article key={link.id} className={styles.linkCard}><GiftLinkImage imageUrl={link.imageUrl} /><div className={styles.linkCopy}><strong>{link.title || "Completá el nombre del regalo"}</strong><span>{getGiftLinkDomain(link.url)}</span><MetadataStatus status={metadataStates[link.id]?.status} /><label className={styles.visibility}><input type="checkbox" checked={link.visible} onChange={(event) => changeLink(link.id, { visible: event.target.checked })} /><span>{link.visible ? "Visible para tus invitados" : "Oculto"}</span></label></div><div className={styles.linkActions}><button type="button" className={styles.iconButton} onClick={() => { setEditingId(link.id); setError(""); }} aria-label={`Editar ${link.title || "regalo"}`}><Pencil size={16} aria-hidden="true" /></button><button type="button" className={styles.iconButton} onClick={() => { onLinkRemove(link.id); setError(""); }} aria-label={`Quitar ${link.title || "regalo"}`}><Trash2 size={16} aria-hidden="true" /></button></div></article>
    ))}</div>
    {!links.length ? <p className={styles.emptyState}>Todavía no agregaste regalos. Pegá el primer enlace para empezar.</p> : null}
    {draft.giftLinks.length >= GIFT_MAX_LINKS ? <p className={styles.help}>Llegaste al máximo de {GIFT_MAX_LINKS} regalos.</p> : null}
  </div>;
}

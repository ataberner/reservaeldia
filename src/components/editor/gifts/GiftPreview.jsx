import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Gift } from "lucide-react";
import { getGiftAccounts, getGiftLinks, sanitizeGiftImageUrl } from "@/domain/gifts/config";
import { GIFT_BANK_FIELDS, getGiftLinkDomain } from "./giftEditorDraft";
import GiftDialog from "./GiftDialog";
import styles from "./GiftsEditor.module.css";

export function GiftLinkImage({ imageUrl }) {
  const safeUrl = sanitizeGiftImageUrl(imageUrl);
  const [failedUrl, setFailedUrl] = useState("");
  return (
    <div className={styles.thumbnail}>
      {safeUrl && failedUrl !== safeUrl ? (
        <img src={safeUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(safeUrl)} />
      ) : <><Gift size={24} aria-hidden="true" /><span>Sin imagen</span></>}
    </div>
  );
}

async function copyGiftValue(value) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true; }
  } catch { /* Continue with the local fallback when clipboard permission is unavailable. */ }
  const previousFocus = document.activeElement;
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  let copied = false;
  try { copied = document.execCommand("copy"); } catch { copied = false; }
  input.remove();
  previousFocus?.focus?.();
  return copied;
}

export function GiftPreviewContent({ config }) {
  const [copyState, setCopyState] = useState({});
  const timers = useRef({});
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  const accounts = getGiftAccounts(config).map((account) => ({
    ...account,
    fields: GIFT_BANK_FIELDS.filter(({ key }) => account.visibility[key] && account.bank[key]),
  })).filter((account) => account.fields.length > 0);
  const links = getGiftLinks(config).filter((link) => link.visible && link.url);
  const copy = async (key, value) => {
    const success = await copyGiftValue(value);
    setCopyState((state) => ({ ...state, [key]: success ? "Copiado" : "No se pudo copiar" }));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => setCopyState((state) => ({ ...state, [key]: "" })), 2000);
  };
  return (
    <div className={styles.guestContent}>
      <div className={styles.guestIntro}><span className={styles.eyebrow}>Regalos</span><h3>Un regalo con mucho amor</h3><p>{config.introText}</p></div>
      {accounts.length > 0 ? <div className={styles.guestSection}><h4>Una transferencia</h4>{accounts.map((account) => (
        <article className={styles.guestAccount} key={account.id}>
          <div className={styles.accountHeading}><span className={styles.currency}>{account.currency}</span><strong>Cuenta en {account.id === "usd" ? "dólares" : "pesos"}</strong></div>
          {account.fields.map(({ key, label }) => {
            const copyKey = `${account.id}-${key}`;
            return <div className={styles.copyRow} key={key}><div><span>{account.id === "usd" && key === "cbu" ? "CBU" : label}</span><strong>{account.bank[key]}</strong></div><button type="button" className={styles.copyButton} onClick={() => copy(copyKey, account.bank[key])} aria-label={`Copiar ${label} ${account.currency}`}>{copyState[copyKey] === "Copiado" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}<span aria-live="polite">{copyState[copyKey] || "Copiar"}</span></button></div>;
          })}
        </article>
      ))}</div> : null}
      {links.length > 0 ? <div className={styles.guestSection}><h4>Lista de regalos</h4><div className={styles.linkList}>{links.map((link) => (
        <article className={styles.linkCard} key={link.id}><GiftLinkImage imageUrl={link.imageUrl} /><div className={styles.linkCopy}><strong>{link.title || getGiftLinkDomain(link.url)}</strong><span>{getGiftLinkDomain(link.url)}</span><a href={link.url} target="_blank" rel="noopener noreferrer" className={styles.textButton} aria-label={`Ver ${link.title || getGiftLinkDomain(link.url)} (abre en otra pestaña)`}>{link.id === "legacy" ? "Ver lista de regalos" : "Ver regalo"}<ExternalLink size={15} aria-hidden="true" /></a></div></article>
      ))}</div></div> : null}
      {!accounts.length && !links.length ? <p className={styles.emptyState}>Cuando agregues al menos un dato visible o un enlace, aparecerá acá.</p> : null}
    </div>
  );
}

export default function GiftPreview({ config, onClose }) {
  return <GiftDialog title="Vista previa de regalos" description="Así se verán los datos al abrir Regalos en tu invitación." onClose={onClose} compact><div className={styles.scrollBody}><GiftPreviewContent config={config} /></div></GiftDialog>;
}

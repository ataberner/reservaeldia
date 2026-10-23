import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { GIFT_BANK_FIELDS, accountKeys, setAccountVisibility, updateAccountField } from "./giftEditorDraft";
import styles from "./GiftsEditor.module.css";

export default function GiftAccountsEditor({ draft, setDraft, autoVisibleFields, setAutoVisibleFields, initialAccount = "ars" }) {
  const [openAccount, setOpenAccount] = useState(initialAccount);
  return <div className={styles.panel}>
    <p className={styles.panelHelp}>Podés usar una cuenta, las dos o solo una lista de regalos. Elegí qué datos mostrar de cada cuenta.</p>
    {[{ id: "ars", currency: "ARS", title: "Cuenta en pesos" }, { id: "usd", currency: "USD", title: "Cuenta en dólares" }].map((account) => {
      const { bankKey, visibilityKey } = accountKeys(account.id);
      const bank = draft[bankKey];
      const visibility = draft[visibilityKey];
      const visible = GIFT_BANK_FIELDS.some(({ key }) => visibility[key] && bank[key].trim());
      const hasData = GIFT_BANK_FIELDS.some(({ key }) => bank[key].trim());
      const expanded = openAccount === account.id;
      const field = ({ key, label, placeholder, maxLength }) => {
        const fieldLabel = account.id === "usd" && key === "cbu" ? "CBU" : label;
        const inputId = `gift-${account.id}-${key}`;
        return <div className={styles.field} key={key}><div className={styles.fieldTop}><label htmlFor={inputId}>{fieldLabel}</label><label className={styles.visibility}><input type="checkbox" checked={Boolean(visibility[key])} onChange={(event) => { setAutoVisibleFields((current) => current.filter((fieldId) => fieldId !== `${account.id}.${key}`)); setDraft((current) => ({ ...current, [visibilityKey]: { ...current[visibilityKey], [key]: event.target.checked } })); }} aria-label={`Mostrar ${fieldLabel} de cuenta ${account.currency}`} /><span>Mostrar</span></label></div><input id={inputId} type="text" value={bank[key]} maxLength={maxLength} placeholder={placeholder} autoComplete="off" onChange={(event) => setDraft((current) => updateAccountField(current, account.id, key, event.target.value, { showNewField: autoVisibleFields.includes(`${account.id}.${key}`) }))} /></div>;
      };
      return <article key={account.id} className={`${styles.account} ${expanded ? styles.accountOpen : ""}`}>
        <div className={styles.accountHeader}><button type="button" onClick={() => setOpenAccount(expanded ? "" : account.id)} className={styles.accountToggle} aria-expanded={expanded} aria-controls={`gift-account-${account.id}`}><span className={styles.currency}>{account.currency}</span><span className={styles.accountLabel}><strong>{account.title}</strong><small>{!hasData ? "Agregar datos · opcional" : visible ? "Visible para tus invitados" : "Datos guardados, cuenta oculta"}</small></span>{expanded ? <ChevronUp size={17} aria-hidden="true" /> : <ChevronDown size={17} aria-hidden="true" />}</button><label className={styles.visibility}><input type="checkbox" checked={visible} disabled={!hasData} onChange={(event) => { setAutoVisibleFields((current) => current.filter((fieldId) => !fieldId.startsWith(`${account.id}.`))); setDraft((current) => setAccountVisibility(current, account.id, event.target.checked)); }} aria-label={`Mostrar cuenta en ${account.id === "usd" ? "dólares" : "pesos"}`} /><span>Visible</span></label></div>
        {expanded ? <div id={`gift-account-${account.id}`} className={styles.accountBody}><div className={styles.fieldGrid}>{GIFT_BANK_FIELDS.slice(0, 4).map(field)}</div><details className={styles.optionalFields} open={Boolean(bank.cuit) || undefined}><summary>Más datos opcionales</summary>{field(GIFT_BANK_FIELDS[4])}</details><p className={styles.help}>Los campos vacíos no se muestran. Ocultar conserva los datos para usarlos después.</p></div> : null}
      </article>;
    })}
  </div>;
}

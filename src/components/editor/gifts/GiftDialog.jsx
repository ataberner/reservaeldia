import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Gift, X } from "lucide-react";
import styles from "./GiftsEditor.module.css";

export default function GiftDialog({ title, description, onClose, children, footer, compact = false }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll(
        'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]'
      ) || []).filter((node) => node.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className={`${styles.dialog} ${compact ? styles.compactDialog : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
        <header className={styles.header}>
          <span className={styles.headerIcon}><Gift size={22} aria-hidden="true" /></span>
          <div className={styles.headerCopy}>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className={styles.iconButton} aria-label="Cerrar regalos"><X size={20} aria-hidden="true" /></button>
        </header>
        {children}
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>, document.body
  );
}

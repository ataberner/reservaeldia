import {
  getGiftAccounts,
  getGiftLinks,
  hasVisibleGiftMethods,
  normalizeGiftConfig,
  type GiftsConfig,
} from "../gifts/config";

type GiftModalRuntimeOptions = {
  previewMode?: boolean;
};

function escapeAttr(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const BANK_FIELD_META = [
  { key: "holder", label: "Titular" },
  { key: "bank", label: "Banco" },
  { key: "alias", label: "Alias" },
  { key: "cbu", label: "CBU / CVU" },
  { key: "cuit", label: "CUIT" },
] as const;

export function generarModalRegalosHTML(
  cfg: GiftsConfig,
  _runtimeOptions: GiftModalRuntimeOptions = {}
): string {
  const normalized = normalizeGiftConfig(cfg);

  if (!normalized.enabled || !hasVisibleGiftMethods(normalized)) {
    return "";
  }

  const bankAccountsHtml = getGiftAccounts(normalized)
    .map((account) => {
      const visibleFields = BANK_FIELD_META.filter(({ key }) => (
        account.visibility[key] && account.bank[key].length > 0
      ));
      if (!visibleFields.length) return "";

      const accountTitle = account.id === "usd" ? "Cuenta en dólares" : "Cuenta en pesos";
      const rows = visibleFields.map((field) => {
        const fieldLabel = account.id === "usd" && field.key === "cbu" ? "CBU" : field.label;
        return `
        <div class="gift-card-copy">
          <div class="gift-card-body">
            <div class="gift-card-label">${escapeHtml(fieldLabel)}</div>
            <div class="gift-card-value">${escapeHtml(account.bank[field.key])}</div>
          </div>
          <button
            type="button"
            class="gift-copy-button"
            aria-label="Copiar ${escapeAttr(fieldLabel)} de ${escapeAttr(accountTitle.toLowerCase())}"
            data-gift-copy="1"
            data-copy-value="${escapeAttr(account.bank[field.key])}"
            data-copy-default="Copiar"
            data-copy-success="Copiado"
          >Copiar</button>
        </div>
      `.trim();
      }).join("");

      return `
        <article class="gift-card gift-account" data-gift-account="${account.id}">
          <div class="gift-account-heading">
            <span class="gift-currency">${account.currency}</span>
            <h3>${accountTitle}</h3>
          </div>
          ${rows}
        </article>
      `.trim();
    })
    .join("");

  const giftLinkCardsHtml = getGiftLinks(normalized)
    .filter((link) => link.visible && link.url)
    .map((link) => {
      const domain = new URL(link.url).hostname.replace(/^www\./i, "");
      const title = link.title || domain;
      const image = link.imageUrl
        ? `<img data-gift-image="1" src="${escapeAttr(link.imageUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
        : "";
      return `
        <article class="gift-card gift-link-card" data-gift-link-id="${escapeAttr(link.id)}">
          <div class="gift-link-preview" aria-hidden="true">
            <span class="gift-link-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8H7.5a2.5 2.5 0 1 1 2.4-3.2L12 8Zm0 0h4.5a2.5 2.5 0 1 0-2.4-3.2L12 8Z"/></svg>
            </span>
            ${image}
          </div>
          <div class="gift-link-copy">
            <h4>${escapeHtml(title)}</h4>
            <span class="gift-link-domain">${escapeHtml(domain)}</span>
            <a class="gift-link-button" href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(`Ver ${title} (abre en otra pestaña)`)}">
              ${link.id === "legacy" ? "Ver lista de regalos" : "Ver regalo"} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </article>
      `.trim();
    })
    .join("");

  const giftListHtml = giftLinkCardsHtml
    ? `<section class="gift-list" aria-labelledby="gift-list-title"><h3 id="gift-list-title" class="gift-section-title">Lista de regalos</h3><div class="gift-link-list">${giftLinkCardsHtml}</div></section>`
    : "";

  return `
<style>
  #modal-regalos {
    --gift-accent: #692b9a;
    --gift-soft: #faf5ff;
    --gift-line: #e8e1eb;
    position: fixed;
    inset: 0;
    display: none;
    z-index: 10000;
    align-items: center;
    justify-content: center;
    padding: 14px;
    background: rgba(15, 23, 42, 0.56);
    backdrop-filter: blur(1.5px);
  }

  #modal-regalos * {
    box-sizing: border-box;
    font-family: "Montserrat", "Segoe UI", sans-serif;
  }

  #modal-regalos :focus-visible {
    outline: 3px solid #a16ac7;
    outline-offset: 3px;
  }

  #modal-regalos .gift-shell {
    position: relative;
    width: 100%;
    max-width: 548px;
    overflow: hidden;
    border-radius: 22px;
    border: 1px solid var(--gift-line);
    background: #ffffff;
    box-shadow: 0 36px 90px rgba(15, 23, 42, 0.26);
  }

  #modal-regalos .gift-content {
    position: relative;
    max-height: calc(84vh - 64px);
    max-height: min(calc(84dvh - 64px), 816px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px 24px 24px;
  }

  #modal-regalos .gift-toolbar {
    position: relative;
    display: flex;
    height: 64px;
    align-items: center;
    justify-content: center;
    padding: 14px 64px;
  }

  #modal-regalos .gift-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4px 10px 0;
    text-align: center;
  }

  #modal-regalos .gift-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 9999px;
    border: 1px solid var(--gift-line);
    background: var(--gift-soft);
    padding: 7px 14px;
    color: var(--gift-accent);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  #modal-regalos .gift-chip-heart {
    font-size: 13px;
    line-height: 1;
  }

  #modal-regalos .gift-close {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: 2;
    display: inline-flex;
    width: 44px;
    height: 44px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--gift-line);
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.9);
    color: #64748b;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    transition: transform 0.15s ease, background-color 0.15s ease;
  }

  #modal-regalos .gift-close:hover {
    background: #ffffff;
    transform: translateY(-1px);
  }

  #modal-regalos .gift-title {
    margin: 20px 0 0;
    max-width: 430px;
    font-size: 26px;
    font-weight: 600;
    line-height: 1.25;
    color: #111827;
    letter-spacing: -0.02em;
  }

  #modal-regalos .gift-intro {
    margin: 14px auto 0;
    max-width: 442px;
    font-family: "Montserrat", "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.75;
    color: #64748b;
    text-align: center;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  #modal-regalos .gift-divider {
    width: 100%;
    max-width: 456px;
    height: 1px;
    margin: 24px auto 0;
    background: var(--gift-line);
  }

  #modal-regalos .gift-methods {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 24px;
  }

  #modal-regalos .gift-card {
    border-radius: 14px;
    border: 1px solid var(--gift-line);
    background: #ffffff;
    padding: 16px;
  }

  #modal-regalos .gift-account-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  #modal-regalos .gift-account-heading h3,
  #modal-regalos .gift-section-title {
    margin: 0;
    color: #262626;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
  }

  #modal-regalos .gift-currency {
    display: inline-flex;
    min-width: 42px;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background: var(--gift-soft);
    color: var(--gift-accent);
    font-size: 12px;
    font-weight: 600;
  }

  #modal-regalos .gift-card-copy {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 0;
    border-top: 1px solid var(--gift-line);
  }

  #modal-regalos .gift-card-body {
    min-width: 0;
    flex: 1;
  }

  #modal-regalos .gift-card-label {
    color: #6d6572;
    font-family: "Montserrat", "Segoe UI", sans-serif;
    font-size: 11px;
    font-weight: 400;
  }

  #modal-regalos .gift-card-value {
    margin-top: 3px;
    color: #111827;
    font-family: "Montserrat", "Segoe UI", sans-serif;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  #modal-regalos .gift-copy-button,
  #modal-regalos .gift-link-button,
  #modal-regalos .gift-footer-close {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    padding: 10px 14px;
    font-family: "Montserrat", "Segoe UI", sans-serif;
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition: transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
  }

  #modal-regalos .gift-copy-button {
    flex-shrink: 0;
    border: 1px solid var(--gift-line);
    background: var(--gift-soft);
    color: var(--gift-accent);
    min-width: 80px;
    font-size: 12px;
  }

  #modal-regalos .gift-copy-button.is-copied {
    border-color: #bbf7d0;
    background: #ecfdf3;
    color: #047857;
  }

  #modal-regalos .gift-copy-button:hover,
  #modal-regalos .gift-link-button:hover,
  #modal-regalos .gift-footer-close:hover {
    transform: translateY(-1px);
  }

  #modal-regalos .gift-link-button {
    gap: 6px;
    margin-top: 3px;
    padding: 6px 0;
    color: var(--gift-accent);
    background: transparent;
    font-size: 12px;
    line-height: 1.4;
  }

  #modal-regalos .gift-list {
    margin-top: 6px;
  }

  #modal-regalos .gift-link-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }

  #modal-regalos .gift-link-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
  }

  #modal-regalos .gift-link-preview {
    position: relative;
    flex-shrink: 0;
    width: 76px;
    height: 80px;
    overflow: hidden;
    border-radius: 9px;
    background: var(--gift-soft);
  }

  #modal-regalos .gift-link-placeholder,
  #modal-regalos .gift-link-preview img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  #modal-regalos .gift-link-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9770b0;
  }

  #modal-regalos .gift-link-placeholder svg {
    width: 32px;
    height: 32px;
  }

  #modal-regalos .gift-link-preview img {
    object-fit: cover;
  }

  #modal-regalos .gift-link-preview img[hidden] {
    display: none;
  }

  #modal-regalos .gift-link-copy {
    min-width: 0;
    flex: 1;
    overflow-wrap: anywhere;
  }

  #modal-regalos .gift-link-copy h4 {
    margin: 0;
    color: #262626;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.5;
  }

  #modal-regalos .gift-link-domain {
    display: block;
    margin-top: 3px;
    color: #6d6572;
    font-size: 12px;
    line-height: 1.5;
  }

  #modal-regalos .gift-copy-status {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  #modal-regalos .gift-actions {
    margin-top: 18px;
  }

  #modal-regalos .gift-footer-close {
    width: 100%;
    border: 1px solid var(--gift-line);
    background: #ffffff;
    color: #475569;
  }

  @media (max-width: 640px) {
    #modal-regalos {
      padding: 12px;
    }

    #modal-regalos .gift-content {
      padding: 4px 16px 16px;
    }

    #modal-regalos .gift-hero {
      padding: 2px 4px 0;
    }

    #modal-regalos .gift-title {
      margin-top: 18px;
      font-size: 23px;
    }

    #modal-regalos .gift-intro {
      margin-top: 14px;
      font-size: 14px;
      line-height: 1.8;
    }

    #modal-regalos .gift-divider {
      margin-top: 22px;
    }

    #modal-regalos .gift-card {
      padding: 14px;
    }

    #modal-regalos .gift-card-copy {
      gap: 10px;
    }

    #modal-regalos .gift-copy-button {
      min-width: 68px;
      padding: 8px 10px;
    }

    #modal-regalos .gift-link-card {
      padding: 10px;
    }

    #modal-regalos .gift-link-preview {
      width: 60px;
      height: 68px;
    }
  }
</style>

<div id="modal-regalos" aria-hidden="true">
  <div class="gift-shell" role="dialog" aria-modal="true" aria-labelledby="gift-title" aria-describedby="gift-intro">
    <div class="gift-toolbar">
      <div class="gift-chip">
        <span class="gift-chip-heart" aria-hidden="true">♥</span>
        Regalos
      </div>
      <button id="gift-close" class="gift-close" type="button" aria-label="Cerrar">×</button>
    </div>

    <div class="gift-content">
      <div class="gift-hero">
        <h2 id="gift-title" class="gift-title">Un regalo con mucho amor</h2>
      </div>

      <p id="gift-intro" class="gift-intro">${escapeHtml(normalized.introText)}</p>
      <div class="gift-divider" aria-hidden="true"></div>

      <div class="gift-methods">
        ${bankAccountsHtml}
        ${giftListHtml}
      </div>

      <div class="gift-actions">
        <button id="gift-cancel" class="gift-footer-close" type="button">Cerrar</button>
      </div>
      <p class="gift-copy-status" role="status" aria-live="polite"></p>
    </div>
  </div>
</div>

<script>
(function(){
  var modal = document.getElementById("modal-regalos");
  if (!modal) return;

  var dialog = modal.querySelector(".gift-shell");
  var closeButton = document.getElementById("gift-close");
  var cancelButton = document.getElementById("gift-cancel");
  var copyStatus = modal.querySelector(".gift-copy-status");
  var body = document.body;
  var previousOverflow = "";
  var lastFocused = null;
  var copyTimers = new Map();

  Array.prototype.forEach.call(modal.querySelectorAll("[data-gift-image]"), function(image){
    function showFallback(){ image.hidden = true; }
    image.addEventListener("error", showFallback);
    if (image.complete && image.naturalWidth === 0) showFallback();
  });

  function isOpen(){
    return modal.style.display === "flex";
  }

  function getFocusable(){
    if (!dialog) return [];
    return Array.prototype.slice.call(
      dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
    );
  }

  function setCopyButtonState(button, copied){
    if (!button) return;
    var defaultLabel = button.getAttribute("data-copy-default") || "Copiar";
    var successLabel = button.getAttribute("data-copy-success") || "Copiado";
    button.textContent = copied ? successLabel : defaultLabel;
    button.classList.toggle("is-copied", copied);
  }

  function resetCopyButtons(){
    if (copyStatus) copyStatus.textContent = "";
    if (copyTimers.size) {
      copyTimers.forEach(function(timerId){
        window.clearTimeout(timerId);
      });
      copyTimers.clear();
    }

    Array.prototype.forEach.call(
      modal.querySelectorAll("[data-gift-copy]"),
      function(button){
        setCopyButtonState(button, false);
      }
    );
  }

  function fallbackCopy(text){
    return new Promise(function(resolve){
      var textarea = document.createElement("textarea");
      var activeElement = document.activeElement;
      try {
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        body.appendChild(textarea);
        textarea.select();
        var ok = document.execCommand("copy");
        resolve(Boolean(ok));
      } catch (_error) {
        resolve(false);
      } finally {
        textarea.remove();
        if (activeElement && typeof activeElement.focus === "function") activeElement.focus();
      }
    });
  }

  function copyValue(value){
    var text = String(value || "");
    if (!text) return Promise.resolve(false);

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return Promise.resolve().then(function(){
        return navigator.clipboard.writeText(text);
      }).then(function(){ return true; }).catch(function(){ return fallbackCopy(text); });
    }
    return fallbackCopy(text);
  }

  function openModal(trigger){
    if (isOpen()) return;
    previousOverflow = body.style.overflow;
    lastFocused = trigger || document.activeElement;
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    body.style.overflow = "hidden";
    window.requestAnimationFrame(function(){
      if (isOpen() && closeButton && typeof closeButton.focus === "function") {
        closeButton.focus();
      }
    });
  }

  function closeModal(){
    if (!isOpen()) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    body.style.overflow = previousOverflow || "";
    resetCopyButtons();
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  function handleOpenIntent(event){
    var trigger = event.target && event.target.closest ? event.target.closest("[data-gift-open]") : null;
    if (!trigger) return;
    event.preventDefault();
    openModal(trigger);
  }

  document.addEventListener("click", handleOpenIntent);
  document.addEventListener("keydown", function(event){
    var trigger = event.target && event.target.closest ? event.target.closest("[data-gift-open]") : null;
    if (trigger && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openModal(trigger);
      return;
    }

    if (!isOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== "Tab") return;
    var focusable = getFocusable();
    if (!focusable.length) return;

    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    var active = document.activeElement;

    if (!dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  if (closeButton) closeButton.addEventListener("click", closeModal);
  if (cancelButton) cancelButton.addEventListener("click", closeModal);

  modal.addEventListener("click", function(event){
    if (event.target === modal) {
      closeModal();
      return;
    }

    var copyButton = event.target && event.target.closest ? event.target.closest("[data-gift-copy]") : null;
    if (!copyButton) return;

    var copyValueRaw = copyButton.getAttribute("data-copy-value") || "";
    copyValue(copyValueRaw).then(function(ok){
      if (!isOpen()) return;
      if (copyStatus) copyStatus.textContent = ok ? "Dato copiado." : "No se pudo copiar. Podés seleccionar el dato y copiarlo manualmente.";
      if (!ok) return;
      setCopyButtonState(copyButton, true);

      if (copyTimers.has(copyButton)) {
        window.clearTimeout(copyTimers.get(copyButton));
      }

      var timerId = window.setTimeout(function(){
        setCopyButtonState(copyButton, false);
        copyTimers.delete(copyButton);
      }, 1800);

      copyTimers.set(copyButton, timerId);
    });
  });
})();
</script>
`.trim();
}

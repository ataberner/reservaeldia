import { normalizeGiftConfig, type GiftsConfig } from "../gifts/config";

type GiftModalRuntimeOptions = {
  previewMode?: boolean;
};

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

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
  { key: "holder", label: "Titular", copyLabel: "Titular" },
  { key: "bank", label: "Banco", copyLabel: "Banco" },
  { key: "alias", label: "Alias", copyLabel: "Alias" },
  { key: "cbu", label: "CBU / CVU", copyLabel: "CBU" },
  { key: "cuit", label: "CUIT", copyLabel: "CUIT" },
] as const;

export function generarModalRegalosHTML(
  cfg: GiftsConfig,
  _runtimeOptions: GiftModalRuntimeOptions = {}
): string {
  const normalized = normalizeGiftConfig(cfg);

  const visibleBankFields = BANK_FIELD_META.filter(({ key }) => {
    const value = String(normalized.bank[key] || "").trim();
    return normalized.visibility[key] && value.length > 0;
  });
  const showGiftList = Boolean(normalized.visibility.giftListLink && normalized.giftListUrl);
  const hasVisibleMethods = visibleBankFields.length > 0 || showGiftList;

  if (!normalized.enabled || !hasVisibleMethods) {
    return "";
  }

  const bankRowsHtml = visibleBankFields
    .map(
      (field) => `
        <article class="gift-card">
          <div class="gift-card-copy">
            <div class="gift-card-body">
              <div class="gift-card-label">${escapeHtml(field.label)}</div>
              <div class="gift-card-value">${escapeHtml(normalized.bank[field.key])}</div>
            </div>
            <button
              type="button"
              class="gift-copy-button"
              data-gift-copy="1"
              data-copy-value="${escapeAttr(normalized.bank[field.key])}"
              data-copy-default="Copiar"
              data-copy-success="Copiado"
            >
              Copiar
            </button>
          </div>
        </article>
      `.trim()
    )
    .join("");

  const giftListHtml = showGiftList
    ? `
      <a
        class="gift-link-button"
        href="${escapeAttr(normalized.giftListUrl)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Ver lista de regalos
      </a>
    `.trim()
    : "";

  const emptyStateHtml = hasVisibleMethods
    ? ""
    : `
      <div class="gift-empty-state">
        Pueden acompanarnos con un detalle cuando quieran. Cuando agreguen alias, CBU o una lista externa, apareceran aqui.
      </div>
    `.trim();

  const serializedConfig = serializeForInlineScript({
    introText: normalized.introText,
    hasVisibleMethods,
  });

  return `
<style>
  #modal-regalos {
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
    font-family: "Cormorant Garamond", "Montserrat", "Segoe UI", sans-serif;
  }

  #modal-regalos .gift-shell {
    position: relative;
    width: 100%;
    max-width: 548px;
    overflow: hidden;
    border-radius: 30px;
    border: 1px solid rgba(251, 191, 204, 0.68);
    background:
      radial-gradient(circle at top, rgba(255,255,255,0.96), transparent 56%),
      linear-gradient(180deg, #fffaf7 0%, #fff7f3 100%);
    box-shadow: 0 36px 90px rgba(15, 23, 42, 0.26);
  }

  #modal-regalos .gift-shell::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 92px;
    background: linear-gradient(135deg, rgba(254, 205, 211, 0.82), rgba(255, 244, 246, 0.72) 52%, rgba(254, 249, 195, 0.56));
    pointer-events: none;
  }

  #modal-regalos .gift-content {
    position: relative;
    max-height: 84vh;
    overflow-y: auto;
    padding: 32px 24px 24px;
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
    border: 1px solid rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.84);
    padding: 7px 14px;
    color: #be185d;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    box-shadow: 0 8px 24px rgba(244, 114, 182, 0.12);
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
    width: 40px;
    height: 40px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.9);
    color: #64748b;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
    transition: transform 0.15s ease, background-color 0.15s ease;
  }

  #modal-regalos .gift-close:hover {
    background: #ffffff;
    transform: translateY(-1px);
  }

  #modal-regalos .gift-title {
    margin: 20px 0 0;
    max-width: 430px;
    font-size: 40px;
    line-height: 0.96;
    color: #111827;
    letter-spacing: -0.02em;
  }

  #modal-regalos .gift-intro {
    margin: 20px auto 0;
    max-width: 442px;
    font-family: "Montserrat", "Segoe UI", sans-serif;
    font-size: 15px;
    line-height: 1.85;
    color: #64748b;
    text-align: center;
  }

  #modal-regalos .gift-divider {
    width: 100%;
    max-width: 456px;
    height: 1px;
    margin: 24px auto 0;
    background: linear-gradient(90deg, transparent, rgba(251, 191, 204, 0.85), transparent);
  }

  #modal-regalos .gift-methods {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 24px;
  }

  #modal-regalos .gift-card {
    border-radius: 22px;
    border: 1px solid rgba(251, 191, 204, 0.52);
    background: rgba(255, 253, 251, 0.96);
    padding: 16px;
    box-shadow: 0 16px 38px rgba(244, 63, 94, 0.08);
  }

  #modal-regalos .gift-card-copy {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  #modal-regalos .gift-card-body {
    min-width: 0;
    flex: 1;
  }

  #modal-regalos .gift-card-label {
    color: #f43f5e;
    font-family: "Montserrat", "Segoe UI", sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  #modal-regalos .gift-card-value {
    margin-top: 8px;
    color: #111827;
    font-family: "Montserrat", "Segoe UI", sans-serif;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.55;
    word-break: break-word;
  }

  #modal-regalos .gift-copy-button,
  #modal-regalos .gift-link-button,
  #modal-regalos .gift-footer-close {
    display: inline-flex;
    min-height: 46px;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    padding: 12px 18px;
    font-family: "Montserrat", "Segoe UI", sans-serif;
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition: transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
  }

  #modal-regalos .gift-copy-button {
    flex-shrink: 0;
    border: 1px solid #fecdd3;
    background: rgba(255, 241, 242, 0.92);
    color: #be185d;
    min-width: 126px;
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
    width: 100%;
    border: 1px solid rgba(15, 23, 42, 0.08);
    background: linear-gradient(135deg, #111827, #1f2937);
    color: #ffffff;
    box-shadow: 0 16px 34px rgba(15, 23, 42, 0.18);
  }

  #modal-regalos .gift-empty-state {
    border-radius: 22px;
    border: 1px dashed rgba(251, 191, 204, 0.72);
    background: rgba(255, 253, 251, 0.96);
    padding: 18px 16px;
    color: #64748b;
    font-family: "Montserrat", "Segoe UI", sans-serif;
    font-size: 13px;
    line-height: 1.8;
    text-align: center;
  }

  #modal-regalos .gift-actions {
    margin-top: 18px;
  }

  #modal-regalos .gift-footer-close {
    width: 100%;
    border: 1px solid rgba(251, 207, 232, 0.78);
    background: rgba(255, 255, 255, 0.92);
    color: #475569;
  }

  @media (max-width: 640px) {
    #modal-regalos {
      padding: 12px;
    }

    #modal-regalos .gift-content {
      padding: 30px 18px 18px;
    }

    #modal-regalos .gift-hero {
      padding: 2px 4px 0;
    }

    #modal-regalos .gift-title {
      margin-top: 18px;
      font-size: 33px;
    }

    #modal-regalos .gift-intro {
      margin-top: 18px;
      font-size: 14px;
      line-height: 1.8;
    }

    #modal-regalos .gift-divider {
      margin-top: 22px;
    }

    #modal-regalos .gift-card {
      padding: 16px;
    }

    #modal-regalos .gift-card-copy {
      flex-direction: column;
      align-items: stretch;
    }

    #modal-regalos .gift-copy-button {
      width: 100%;
      min-width: 0;
    }
  }
</style>

<div id="modal-regalos">
  <div class="gift-shell" role="dialog" aria-modal="true" aria-labelledby="gift-title" aria-describedby="gift-intro">
    <button id="gift-close" class="gift-close" type="button" aria-label="Cerrar">×</button>

    <div class="gift-content">
      <div class="gift-hero">
        <div class="gift-chip">
          <span class="gift-chip-heart" aria-hidden="true">♥</span>
          Regalos
        </div>

        <h2 id="gift-title" class="gift-title">Un gesto con amor</h2>
      </div>

      <p id="gift-intro" class="gift-intro">${escapeHtml(normalized.introText)}</p>
      <div class="gift-divider" aria-hidden="true"></div>

      <div class="gift-methods">
        ${bankRowsHtml}
        ${giftListHtml}
        ${emptyStateHtml}
      </div>

      <div class="gift-actions">
        <button id="gift-cancel" class="gift-footer-close" type="button">Cerrar</button>
      </div>
    </div>
  </div>
</div>

<script>
(function(){
  var GIFT_CONFIG = ${serializedConfig};
  var modal = document.getElementById("modal-regalos");
  if (!modal || !GIFT_CONFIG) return;

  var dialog = modal.querySelector(".gift-shell");
  var closeButton = document.getElementById("gift-close");
  var cancelButton = document.getElementById("gift-cancel");
  var body = document.body;
  var previousOverflow = "";
  var lastFocused = null;
  var copyTimers = new Map();

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

  function copyValue(value){
    var text = String(value || "");
    if (!text) return Promise.resolve(false);

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text).then(function(){ return true; }).catch(function(){ return false; });
    }

    return new Promise(function(resolve){
      try {
        var textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        body.appendChild(textarea);
        textarea.select();
        var ok = document.execCommand("copy");
        body.removeChild(textarea);
        resolve(Boolean(ok));
      } catch (_error) {
        resolve(false);
      }
    });
  }

  function openModal(trigger){
    if (isOpen()) return;
    previousOverflow = body.style.overflow;
    lastFocused = trigger || document.activeElement;
    modal.style.display = "flex";
    body.style.overflow = "hidden";
    window.requestAnimationFrame(function(){
      if (closeButton && typeof closeButton.focus === "function") {
        closeButton.focus();
      }
    });
  }

  function closeModal(){
    if (!isOpen()) return;
    modal.style.display = "none";
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

    if (event.shiftKey && active === first) {
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

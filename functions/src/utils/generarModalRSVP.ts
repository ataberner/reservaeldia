import { getActiveQuestions, normalizeRsvpConfig, type RSVPConfig } from "../rsvp/config";

type RsvpModalRuntimeOptions = {
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

export function generarModalRSVPHTML(
  cfg: RSVPConfig,
  runtimeOptions: RsvpModalRuntimeOptions = {}
): string {
  const normalized = normalizeRsvpConfig(cfg);
  if (!normalized.enabled) return "";

  const activeQuestions = getActiveQuestions(normalized);
  const payloadConfig = {
    ...normalized,
    questions: activeQuestions,
    // Compatibility: preview keeps the same serialized public endpoint and exits
    // before network submission through the runtime previewMode branch below.
    previewMode: runtimeOptions.previewMode === true,
    submitEndpoint: "https://us-central1-reservaeldia-7a440.cloudfunctions.net/publicRsvpSubmit",
  };

  const serializedConfig = serializeForInlineScript(payloadConfig);

  return `
<style>
  #modal-rsvp {
    position: fixed;
    inset: 0;
    display: none;
    z-index: 9999;
    align-items: center;
    justify-content: center;
    padding: 14px;
    background: rgba(15, 23, 42, 0.56);
    backdrop-filter: blur(1.5px);
  }

  #modal-rsvp * {
    box-sizing: border-box;
    font-family: "Montserrat", "Segoe UI", sans-serif;
  }

  #modal-rsvp .rsvp-shell {
    position: relative;
    width: 100%;
    max-width: 548px;
    border-radius: 30px;
    border: 1px solid rgba(221, 214, 254, 0.72);
    background: linear-gradient(180deg, #fffafc 0%, #fdfbff 100%);
    box-shadow: 0 36px 90px rgba(15, 23, 42, 0.26);
    overflow: hidden;
  }

  #modal-rsvp .rsvp-shell::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 92px;
    background: linear-gradient(135deg, rgba(237, 233, 254, 0.82), rgba(250, 232, 255, 0.74) 52%, rgba(224, 242, 254, 0.58));
    pointer-events: none;
  }

  #modal-rsvp .rsvp-content {
    position: relative;
    max-height: 84vh;
    overflow-y: auto;
    padding: 32px 24px 24px;
  }

  #modal-rsvp .rsvp-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    border: 1px solid rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.84);
    padding: 7px 14px;
    color: #6d28d9;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    box-shadow: 0 8px 24px rgba(167, 139, 250, 0.14);
  }

  #modal-rsvp .rsvp-close {
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
    background: rgba(255, 255, 255, 0.92);
    color: #64748b;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
    transition: transform 0.15s ease, background-color 0.15s ease;
  }

  #modal-rsvp .rsvp-close:hover {
    background: #ffffff;
    transform: translateY(-1px);
  }

  #modal-rsvp #rsvp-title {
    margin: 20px 0 0;
    max-width: 430px;
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 40px;
    font-weight: 600;
    line-height: 0.96;
    letter-spacing: -0.02em;
    color: #0f172a;
  }

  #modal-rsvp #rsvp-subtitle {
    margin: 20px 0 0;
    max-width: 440px;
    font-size: 15px;
    line-height: 1.85;
    color: #64748b;
  }

  #modal-rsvp .rsvp-form-shell {
    margin-top: 28px;
    border-radius: 24px;
    border: 1px solid rgba(221, 214, 254, 0.82);
    background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,250,252,0.88));
    padding: 22px;
    box-shadow: 0 18px 40px rgba(139, 92, 246, 0.08);
  }

  #modal-rsvp #rsvp-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  #modal-rsvp #rsvp-fields {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  #modal-rsvp .rsvp-field-wrap {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  #modal-rsvp .rsvp-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
  }

  #modal-rsvp .rsvp-control {
    width: 100%;
    min-height: 52px;
    padding: 14px 16px;
    border: 1px solid rgba(226, 232, 240, 0.95);
    border-radius: 18px;
    font-size: 14px;
    color: #1f2937;
    background: #ffffff;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.75);
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  }

  #modal-rsvp .rsvp-control::placeholder {
    color: #94a3b8;
  }

  #modal-rsvp .rsvp-control:focus {
    outline: none;
    border-color: #c4b5fd;
    box-shadow: 0 0 0 4px rgba(196, 181, 253, 0.24);
  }

  #modal-rsvp textarea.rsvp-control {
    min-height: 124px;
    resize: vertical;
  }

  #modal-rsvp select.rsvp-control {
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    padding-right: 46px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%2364748B' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 16px center;
    background-size: 14px 14px;
  }

  #modal-rsvp .rsvp-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 4px;
  }

  #modal-rsvp #rsvp-send {
    width: 100%;
    min-height: 54px;
    padding: 14px 18px;
    border: none;
    border-radius: 9999px;
    color: #ffffff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 18px 34px rgba(139, 92, 246, 0.26);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  #modal-rsvp #rsvp-send:disabled {
    opacity: 0.92;
    cursor: wait;
    filter: saturate(0.9);
  }

  #modal-rsvp #rsvp-send:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  #modal-rsvp .rsvp-inline-loader {
    display: inline-block;
    width: 14px;
    height: 14px;
    margin-right: 8px;
    border-radius: 9999px;
    border: 2px solid rgba(255, 255, 255, 0.5);
    border-top-color: #ffffff;
    vertical-align: -2px;
    animation: rsvp-spin 0.8s linear infinite;
  }

  #modal-rsvp #rsvp-cancel {
    width: 100%;
    min-height: 46px;
    padding: 12px 16px;
    border-radius: 9999px;
    border: 1px solid rgba(226, 232, 240, 0.95);
    background: rgba(255, 255, 255, 0.92);
    color: #475569;
    font-size: 13px;
    cursor: pointer;
  }

  #modal-rsvp #rsvp-cancel:hover {
    background: #f8fafc;
  }

  #modal-rsvp #rsvp-cancel:disabled,
  #modal-rsvp .rsvp-close:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  #modal-rsvp .rsvp-status {
    display: none;
    align-items: flex-start;
    gap: 10px;
    border-radius: 16px;
    border: 1px solid transparent;
    padding: 12px 14px;
    font-size: 13px;
    line-height: 1.5;
  }

  #modal-rsvp .rsvp-status.show {
    display: flex;
  }

  #modal-rsvp .rsvp-status-icon {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border-radius: 9999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    margin-top: 1px;
  }

  #modal-rsvp .rsvp-status-info {
    border-color: #bfdbfe;
    background: #eff6ff;
    color: #1e40af;
  }

  #modal-rsvp .rsvp-status-info .rsvp-status-icon {
    border: 2px solid #60a5fa;
    border-top-color: transparent;
    background: transparent;
    animation: rsvp-spin 0.8s linear infinite;
  }

  #modal-rsvp .rsvp-status-success {
    border-color: #bbf7d0;
    background: #f0fdf4;
    color: #166534;
  }

  #modal-rsvp .rsvp-status-success .rsvp-status-icon {
    background: #22c55e;
    color: #ffffff;
  }

  #modal-rsvp .rsvp-status-error {
    border-color: #fecaca;
    background: #fff1f2;
    color: #9f1239;
  }

  #modal-rsvp .rsvp-status-error .rsvp-status-icon {
    background: #fb7185;
    color: #ffffff;
  }

  @keyframes rsvp-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 640px) {
    #modal-rsvp {
      padding: 12px;
    }

    #modal-rsvp .rsvp-content {
      padding: 30px 18px 18px;
    }

    #modal-rsvp .rsvp-badge {
      font-size: 9px;
      padding: 7px 12px;
    }

    #modal-rsvp #rsvp-title {
      margin-top: 18px;
      font-size: 33px;
    }

    #modal-rsvp #rsvp-subtitle {
      margin-top: 18px;
      font-size: 14px;
    }

    #modal-rsvp .rsvp-form-shell {
      margin-top: 24px;
      padding: 18px;
      border-radius: 22px;
    }

    #modal-rsvp #rsvp-form {
      gap: 16px;
    }

    #modal-rsvp #rsvp-fields {
      gap: 16px;
    }

    #modal-rsvp textarea.rsvp-control {
      min-height: 116px;
    }
  }
</style>

<div id="modal-rsvp">
  <div class="rsvp-shell" role="dialog" aria-modal="true" aria-labelledby="rsvp-title" aria-describedby="rsvp-subtitle">
    <button id="rsvp-close" class="rsvp-close" type="button" aria-label="Cerrar">×</button>

    <div class="rsvp-content">
      <div class="rsvp-badge">Confirmar asistencia</div>
      <h2 id="rsvp-title"></h2>
      <p id="rsvp-subtitle"></p>

      <div class="rsvp-form-shell">
        <form id="rsvp-form">
          <div id="rsvp-fields"></div>
          <div id="rsvp-status" class="rsvp-status" role="status" aria-live="polite"></div>
          <div class="rsvp-actions">
            <button id="rsvp-send" type="submit"></button>
            <button id="rsvp-cancel" type="button">Cerrar</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>

<script>
(function(){
  var RSVP_CONFIG = ${serializedConfig};

  function toText(value){
    if (value === null || typeof value === "undefined") return "";
    return String(value);
  }

  function clampText(value, maxLength){
    var text = toText(value).trim();
    if (!text) return "";
    return text.slice(0, maxLength);
  }

  function getSlugDePagina() {
    var docSlug = document.documentElement && document.documentElement.dataset
      ? document.documentElement.dataset.slug
      : "";
    if (docSlug) return docSlug;

    var bodySlug = document.body && document.body.dataset ? document.body.dataset.slug : "";
    if (bodySlug) return bodySlug;

    var querySlug = new URLSearchParams(location.search).get("slug");
    if (querySlug) return querySlug;

    var pathnameParts = location.pathname.split("/").filter(Boolean);
    var iIdx = pathnameParts.indexOf("i");
    if (iIdx >= 0 && pathnameParts[iIdx + 1]) return pathnameParts[iIdx + 1];

    var pubIdx = pathnameParts.indexOf("publicadas");
    if (pubIdx >= 0 && pathnameParts[pubIdx + 1]) return pathnameParts[pubIdx + 1];

    var canonical = document.querySelector('link[rel="canonical"]');
    var canonicalHref = canonical && canonical.getAttribute
      ? canonical.getAttribute("href")
      : "";
    if (canonicalHref) {
      try {
        var canonicalUrl = new URL(canonicalHref, location.origin);
        var canonicalParts = canonicalUrl.pathname.split("/").filter(Boolean);
        var ci = canonicalParts.indexOf("i");
        if (ci >= 0 && canonicalParts[ci + 1]) return canonicalParts[ci + 1];
        var cp = canonicalParts.indexOf("publicadas");
        if (cp >= 0 && canonicalParts[cp + 1]) return canonicalParts[cp + 1];
      } catch (_canonicalError) {}
    }

    try {
      var pathAfterO = location.pathname.split("/o/")[1];
      if (pathAfterO) {
        var decoded = decodeURIComponent(pathAfterO);
        var parts = decoded.split("/").filter(Boolean);
        var pIdx = parts.indexOf("publicadas");
        if (pIdx >= 0 && parts[pIdx + 1]) return parts[pIdx + 1];
      }
    } catch (_error) {}

    return "sin-slug";
  }

  function normalizeBoolean(value){
    if (typeof value === "boolean") return value;
    var raw = clampText(value, 20).toLowerCase();
    if (["si", "sí", "yes", "true", "1"].indexOf(raw) >= 0) return true;
    if (["no", "false", "0"].indexOf(raw) >= 0) return false;
    return null;
  }

  function normalizeAttendance(value){
    if (value === true || value === "yes") return "yes";
    if (value === false || value === "no") return "no";
    var raw = clampText(value, 20).toLowerCase();
    if (["si", "sí", "yes", "true", "1"].indexOf(raw) >= 0) return "yes";
    if (["no", "false", "0"].indexOf(raw) >= 0) return "no";
    return "unknown";
  }

  function normalizeNumber(value){
    var raw = toText(value).trim();
    if (!raw) return null;
    var n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.round(n));
  }

  function serializeSingleValue(question, rawValue){
    if (question.type === "short_text" || question.type === "phone") {
      var txt = clampText(rawValue, 120);
      return txt ? txt : null;
    }

    if (question.type === "long_text") {
      var longTxt = clampText(rawValue, 400);
      return longTxt ? longTxt : null;
    }

    if (question.type === "number") {
      return normalizeNumber(rawValue);
    }

    if (question.type === "single_select") {
      var option = clampText(rawValue, 120);
      return option ? option : null;
    }

    if (question.type === "boolean") {
      return normalizeBoolean(rawValue);
    }

    return rawValue;
  }

  function createField(question){
    var wrapper = document.createElement("div");
    wrapper.setAttribute("data-rsvp-question", question.id);
    wrapper.className = "rsvp-field-wrap";

    var label = document.createElement("label");
    label.className = "rsvp-label";
    label.textContent = question.label + (question.required ? " *" : "");
    wrapper.appendChild(label);

    var control = null;

    if (question.type === "long_text") {
      control = document.createElement("textarea");
      control.rows = 3;
    } else if (question.type === "single_select") {
      control = document.createElement("select");
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Seleccionar";
      control.appendChild(placeholder);
      (Array.isArray(question.options) ? question.options : []).forEach(function(option){
        var opt = document.createElement("option");
        opt.value = option.id;
        opt.textContent = option.label;
        control.appendChild(opt);
      });
    } else if (question.type === "boolean") {
      control = document.createElement("select");
      var placeholderBool = document.createElement("option");
      placeholderBool.value = "";
      placeholderBool.textContent = "Seleccionar";
      control.appendChild(placeholderBool);

      var yesOption = document.createElement("option");
      yesOption.value = "yes";
      yesOption.textContent = "Si";
      control.appendChild(yesOption);

      var noOption = document.createElement("option");
      noOption.value = "no";
      noOption.textContent = "No";
      control.appendChild(noOption);
    } else {
      control = document.createElement("input");
      control.type = question.type === "number" ? "number" : "text";
      if (question.type === "phone") control.inputMode = "tel";
      if (question.type === "number") {
        control.min = "0";
        control.step = "1";
        control.inputMode = "numeric";
      }
    }

    control.setAttribute("data-rsvp-field", question.id);
    control.setAttribute("data-rsvp-type", question.type);
    control.className = "rsvp-control";

    wrapper.appendChild(control);
    return wrapper;
  }

  function collectAnswers(questions){
    var answers = {};

    for (var i = 0; i < questions.length; i += 1) {
      var question = questions[i];
      var control = document.querySelector('[data-rsvp-field="' + question.id + '"]');
      var value = control ? control.value : null;
      answers[question.id] = serializeSingleValue(question, value);
    }

    return answers;
  }

  function validateAnswers(questions, answers){
    for (var i = 0; i < questions.length; i += 1) {
      var question = questions[i];
      if (!question.required) continue;
      var value = answers[question.id];

      var isEmpty =
        value === null ||
        typeof value === "undefined" ||
        (typeof value === "string" && value.trim() === "");

      if (isEmpty) {
        return {
          valid: false,
          message: "Completa el campo obligatorio: " + question.label,
          fieldId: question.id,
        };
      }
    }

    return { valid: true };
  }

  function computeMetrics(answers){
    var attendance = normalizeAttendance(answers.attendance);
    var partySize = normalizeNumber(answers.party_size);
    var confirmedGuests = attendance === "yes" ? (partySize && partySize > 0 ? partySize : 1) : 0;

    var menuTypeId = clampText(answers.menu_type, 80);
    var childrenCount = normalizeNumber(answers.children_count) || 0;
    var dietaryNotes = clampText(answers.dietary_notes, 400);
    var needsTransport = normalizeBoolean(answers.needs_transport) === true;

    return {
      attendance: attendance,
      confirmedGuests: confirmedGuests,
      menuTypeId: menuTypeId || null,
      childrenCount: childrenCount,
      hasDietaryRestrictions: Boolean(dietaryNotes),
      needsTransport: needsTransport,
    };
  }

  function mapLegacyPayload(answers, metrics){
    var nombre = clampText(answers.full_name, 120) || null;
    var asistencia = metrics.attendance === "yes"
      ? "si"
      : (metrics.attendance === "no" ? "no" : null);

    var confirma = metrics.attendance === "yes"
      ? true
      : (metrics.attendance === "no" ? false : null);

    var cantidad = normalizeNumber(answers.party_size);
    var mensaje = clampText(answers.host_message, 400) || null;

    return {
      nombre: nombre,
      asistencia: asistencia,
      confirma: confirma,
      cantidad: cantidad,
      mensaje: mensaje,
    };
  }

  function postOptionalSheet(sheetUrl, payload){
    if (!sheetUrl) return;

    try {
      fetch(sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(function(){});
    } catch (_error) {}
  }

  function resolveSubmitEndpoint() {
    var configured = RSVP_CONFIG && RSVP_CONFIG.submitEndpoint
      ? String(RSVP_CONFIG.submitEndpoint).trim()
      : "";
    if (configured) return configured;

    return "https://us-central1-reservaeldia-7a440.cloudfunctions.net/publicRsvpSubmit";
  }

  function isPreviewMode() {
    if (RSVP_CONFIG && RSVP_CONFIG.previewMode === true) return true;

    var htmlPreview = document.documentElement && document.documentElement.dataset
      ? String(document.documentElement.dataset.preview || "").toLowerCase()
      : "";
    if (htmlPreview === "1" || htmlPreview === "true") return true;

    var bodyPreview = document.body && document.body.dataset
      ? String(document.body.dataset.preview || "").toLowerCase()
      : "";
    if (bodyPreview === "1" || bodyPreview === "true") return true;

    return false;
  }

  function boot(){
    var modal = document.getElementById("modal-rsvp");
    if (!modal) return;

    var closeBtn = document.getElementById("rsvp-close");
    var cancelBtn = document.getElementById("rsvp-cancel");
    var sendBtn = document.getElementById("rsvp-send");
    var form = document.getElementById("rsvp-form");
    var titleNode = document.getElementById("rsvp-title");
    var subtitleNode = document.getElementById("rsvp-subtitle");
    var fieldsRoot = document.getElementById("rsvp-fields");
    var statusNode = document.getElementById("rsvp-status");

    if (!form || !titleNode || !subtitleNode || !fieldsRoot || !sendBtn) return;

    var questions = Array.isArray(RSVP_CONFIG.questions)
      ? RSVP_CONFIG.questions.slice().sort(function(a, b){ return (a.order || 0) - (b.order || 0); })
      : [];

    titleNode.textContent = RSVP_CONFIG.modal && RSVP_CONFIG.modal.title
      ? RSVP_CONFIG.modal.title
      : "Confirmar asistencia";

    subtitleNode.textContent = RSVP_CONFIG.modal && RSVP_CONFIG.modal.subtitle
      ? RSVP_CONFIG.modal.subtitle
      : "";

    sendBtn.textContent = RSVP_CONFIG.modal && RSVP_CONFIG.modal.submitLabel
      ? RSVP_CONFIG.modal.submitLabel
      : "Enviar";

    var primaryColor = RSVP_CONFIG.modal && RSVP_CONFIG.modal.primaryColor
      ? RSVP_CONFIG.modal.primaryColor
      : "#773dbe";

    sendBtn.style.background = primaryColor;

    fieldsRoot.innerHTML = "";
    questions.forEach(function(question){
      fieldsRoot.appendChild(createField(question));
    });

    var defaultSubmitLabel = sendBtn.textContent || "Enviar";
    var isSubmitting = false;
    var previewMode = isPreviewMode();

    function clearStatus(){
      if (!statusNode) return;
      statusNode.className = "rsvp-status";
      statusNode.textContent = "";
    }

    function setStatus(type, message){
      if (!statusNode) return;
      statusNode.className = "rsvp-status show rsvp-status-" + type;
      statusNode.textContent = "";

      var iconNode = document.createElement("span");
      iconNode.className = "rsvp-status-icon";
      iconNode.setAttribute("aria-hidden", "true");
      if (type === "success") iconNode.textContent = "✓";
      if (type === "error") iconNode.textContent = "!";

      var textNode = document.createElement("span");
      textNode.textContent = message;

      statusNode.appendChild(iconNode);
      statusNode.appendChild(textNode);
    }

    function setSubmitting(nextValue){
      isSubmitting = nextValue === true;

      Array.prototype.forEach.call(
        form.querySelectorAll("[data-rsvp-field]"),
        function(control){
          control.disabled = isSubmitting;
        }
      );

      sendBtn.disabled = isSubmitting;
      if (cancelBtn) cancelBtn.disabled = isSubmitting;
      if (closeBtn) closeBtn.disabled = isSubmitting;

      if (isSubmitting) {
        sendBtn.innerHTML = '<span class="rsvp-inline-loader" aria-hidden="true"></span>Enviando...';
      } else {
        sendBtn.textContent = defaultSubmitLabel;
      }
    }

    function openModal(){
      if (isSubmitting) return;
      clearStatus();
      form.reset();
      setSubmitting(false);
      modal.style.display = "flex";
    }

    function closeModal(){
      if (isSubmitting) return;
      modal.style.display = "none";
    }

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

    modal.addEventListener("click", function(event){
      if (isSubmitting) return;
      if (event.target === modal) closeModal();
    });

    document.addEventListener("keydown", function(event){
      if (isSubmitting) return;
      if (event.key === "Escape" && modal.style.display === "flex") {
        closeModal();
      }
    });

    document
      .querySelectorAll('[data-rsvp-open], [data-accion="abrir-rsvp"], .rsvp-boton')
      .forEach(function(element){
        element.addEventListener("click", function(event){
          event.preventDefault();
          openModal();
        });
      });

    form.addEventListener("submit", function(event){
      event.preventDefault();
      if (isSubmitting) return;
      clearStatus();

      var answers = collectAnswers(questions);
      var validation = validateAnswers(questions, answers);
      if (!validation.valid) {
        setStatus("error", validation.message);
        var invalidControl = document.querySelector('[data-rsvp-field="' + validation.fieldId + '"]');
        if (invalidControl && typeof invalidControl.focus === "function") {
          invalidControl.focus();
        }
        return;
      }

      if (previewMode) {
        setStatus(
          "success",
          "Vista previa: la respuesta no se envio. Publica la invitacion para recibir RSVPs reales."
        );
        return;
      }

      var metrics = computeMetrics(answers);
      var legacy = mapLegacyPayload(answers, metrics);
      var slug = getSlugDePagina();
      var submitEndpoint = resolveSubmitEndpoint();

      if (!slug || slug === "sin-slug") {
        setStatus("error", "No se pudo identificar la invitacion. Recarga la pagina e intenta nuevamente.");
        return;
      }

      var basePayload = {
        version: 2,
        schemaVersion: 2,
        schemaQuestionIds: questions.map(function(question){ return question.id; }),
        answers: answers,
        metrics: metrics,
        nombre: legacy.nombre,
        asistencia: legacy.asistencia,
        confirma: legacy.confirma,
        cantidad: legacy.cantidad,
        mensaje: legacy.mensaje,
        userAgent: String(navigator.userAgent || "").slice(0, 512),
      };

      postOptionalSheet(RSVP_CONFIG.sheetUrl, {
        slug: slug,
        answers: answers,
        metrics: metrics,
        ts: Date.now(),
      });

      setSubmitting(true);
      setStatus("info", "Enviando confirmacion...");

      function submitViaEndpoint() {
        return fetch(submitEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            slug: slug,
            ...basePayload,
          }),
        }).then(function(response){
          if (!response.ok) {
            return response.text().then(function(text){
              throw new Error(text || ("HTTP " + response.status));
            });
          }

          return response.json().catch(function(){ return { ok: true }; });
        }).then(function(result){
          if (result && result.ok === false) {
            throw new Error(result.message || "Error guardando RSVP");
          }
          return result;
        });
      }

      submitViaEndpoint()
        .then(function(){
          setSubmitting(false);
          form.reset();
          setStatus("success", "Confirmacion enviada con exito. Gracias por responder.");
        })
        .catch(function(error){
          setSubmitting(false);
          console.error("[RSVP] Error guardando confirmacion", error);
          setStatus("error", "No se pudo guardar la confirmacion. Intenta nuevamente.");
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
    return;
  }

  boot();
})();
</script>
`;
}

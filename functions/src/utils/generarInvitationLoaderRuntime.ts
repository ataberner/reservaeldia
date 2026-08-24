const {
  INVITATION_LOADER_PRESENTATION_HTML,
} = require("../../shared/invitationLoaderPresentation.cjs");

export function generarInvitationLoaderRuntimeHTML(): string {
  return `
${INVITATION_LOADER_PRESENTATION_HTML}

<script>
(function(){
  var RUNTIME_READY_EVENT = "invitation-runtime-ready";
  var RUNTIME_FAIL_EVENT = "invitation-runtime-failed";
  var LOADER_HIDDEN_EVENT = "invitation-loader-hidden";
  var MAX_WAIT_MS = 10000;
  var EXIT_FALLBACK_MS = 300;
  var closed = false;
  var failed = false;

  function dispatchLoaderEvent(name){
    try {
      window.dispatchEvent(new CustomEvent(name));
    } catch (_error) {
      // noop
    }
  }

  function closeLoader(){
    if (closed || failed) return;
    closed = true;

    if (document.body) {
      document.body.setAttribute("data-loader-ready", "1");
      document.body.removeAttribute("data-loader-error");
    }

    var loader = document.getElementById("inv-loader");
    if (!loader) {
      dispatchLoaderEvent(LOADER_HIDDEN_EVENT);
      return;
    }

    var exitFinished = false;
    var exitTimer = 0;
    var finishExit = function(){
      if (exitFinished) return;
      exitFinished = true;
      loader.removeEventListener("transitionend", onTransitionEnd);
      if (exitTimer) window.clearTimeout(exitTimer);
      if (loader.parentNode) {
        loader.parentNode.removeChild(loader);
      }
      dispatchLoaderEvent(LOADER_HIDDEN_EVENT);
    };
    var onTransitionEnd = function(event){
      if (event.target !== loader || event.propertyName !== "opacity") return;
      finishExit();
    };

    loader.addEventListener("transitionend", onTransitionEnd);
    loader.classList.add("inv-loader--exit");
    exitTimer = window.setTimeout(finishExit, EXIT_FALLBACK_MS);
  }

  function showLoaderError(event){
    if (closed || failed) return;
    failed = true;
    if (document.body) {
      document.body.setAttribute("data-loader-ready", "0");
      document.body.setAttribute("data-loader-error", "1");
    }

    var loader = document.getElementById("inv-loader");
    if (!loader) return;
    loader.classList.add("inv-loader--error");
    loader.setAttribute("role", "alert");
    loader.setAttribute("aria-label", "No se pudo completar la carga de la invitacion");

    var label = loader.querySelector(".inv-loader__label");
    if (label) label.textContent = "No pudimos cargar la invitacion";

    var retry = loader.querySelector("[data-invitation-retry='true']");
    if (retry && retry.getAttribute("data-retry-bound") !== "1") {
      retry.setAttribute("data-retry-bound", "1");
      retry.addEventListener("click", function(){
        try {
          window.location.reload();
        } catch (_error) {
          window.location.href = window.location.href;
        }
      });
    }

    var reason = String(event && event.detail && event.detail.reason || "loader-timeout");
    loader.setAttribute("data-loader-error-reason", reason.slice(0, 80));
  }

  function armEvents(){
    if (document.body) {
      document.body.setAttribute("data-loader-ready", "0");
    }

    window.addEventListener(RUNTIME_READY_EVENT, closeLoader, { once: true });
    window.addEventListener(RUNTIME_FAIL_EVENT, showLoaderError, { once: true });

    window.setTimeout(function(){
      showLoaderError({ detail: { reason: "loader-timeout" } });
    }, MAX_WAIT_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", armEvents, { once: true });
  } else {
    armEvents();
  }
})();
</script>
`.trim();
}

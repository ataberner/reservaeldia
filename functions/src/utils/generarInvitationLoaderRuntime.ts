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
  var closed = false;

  function dispatchLoaderEvent(name){
    try {
      window.dispatchEvent(new CustomEvent(name));
    } catch (_error) {
      // noop
    }
  }

  function closeLoader(){
    if (closed) return;
    closed = true;

    if (document.body) {
      document.body.setAttribute("data-loader-ready", "1");
    }

    var loader = document.getElementById("inv-loader");
    if (!loader) return;

    loader.classList.add("inv-loader--exit");
    window.setTimeout(function(){
      if (loader.parentNode) {
        loader.parentNode.removeChild(loader);
      }
      dispatchLoaderEvent(LOADER_HIDDEN_EVENT);
    }, 520);
  }

  function armEvents(){
    if (document.body) {
      document.body.setAttribute("data-loader-ready", "0");
    }

    window.addEventListener(RUNTIME_READY_EVENT, closeLoader, { once: true });
    window.addEventListener(RUNTIME_FAIL_EVENT, closeLoader, { once: true });

    window.setTimeout(closeLoader, MAX_WAIT_MS);
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

export type InvitationMusicResource = {
  url: string;
  id: string;
  source: "catalog" | "user";
  title?: string;
  artist?: string;
};

type InvitationMusicConfig = { enabled?: boolean; volume?: number; loop?: boolean };

/** The gate and player own one document; they never reconstruct invitation DOM. */
export function generarInvitationMusicRuntimeHTML(
  config: InvitationMusicConfig | null | undefined,
  resource: InvitationMusicResource | null | undefined
): string {
  if (config?.enabled !== true || !resource?.url || !/^https?:\/\//i.test(resource.url)) return "";
  const numericVolume = Number(config.volume);
  const runtimeConfig = JSON.stringify({
    url: resource.url,
    volume: Number.isFinite(numericVolume) ? Math.max(0, Math.min(1, numericVolume)) : 0.35,
    loop: config.loop !== false,
  }).replace(/</g, "\\u003c");

  return `
<style id="invitation-music-style">
  html[data-invitation-entry="pending"]:has(#invitation-entry-gate),
  body[data-invitation-entry="pending"]:has(> #invitation-entry-gate) {
    overflow: hidden !important;
    overscroll-behavior: none !important;
  }
  body[data-invitation-entry="pending"] > .inv {
    filter: blur(8px);
    pointer-events: none;
    user-select: none;
  }
  body[data-invitation-entry="pending"] > .inv *,
  body[data-invitation-entry="pending"] > .inv *::before,
  body[data-invitation-entry="pending"] > .inv *::after {
    animation-play-state: paused !important;
  }
  #invitation-entry-gate {
    position: fixed; inset: 0; z-index: 2147483000;
    display: flex; align-items: center; justify-content: center;
    padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
    box-sizing: border-box; background: rgba(28, 17, 44, 0.3);
    font-family: Inter, system-ui, -apple-system, sans-serif;
  }
  body[data-loader-ready="0"] #invitation-entry-gate { visibility: hidden; }
  #invitation-entry-gate[hidden], #invitation-music-control[hidden] { display: none; }
  .invitation-entry-card {
    box-sizing: border-box; width: min(100%, 390px); max-height: 100%; overflow: auto;
    padding: 34px 28px 26px; border: 1px solid rgba(255,255,255,.8);
    border-radius: 28px; background: rgba(255,255,255,.96); text-align: center;
    box-shadow: 0 24px 80px rgba(24,12,40,.22); color: #332448;
  }
  .invitation-entry-icon { font-size: 30px; color: #7842bd; margin-bottom: 16px; }
  .invitation-entry-card h2 { margin: 0 0 12px; font-size: 26px; line-height: 1.2; letter-spacing: -.6px; }
  .invitation-entry-card p { margin: 0 0 26px; font-size: 15px; line-height: 1.65; color: #746781; }
  .invitation-entry-card button {
    width: 100%; min-height: 48px; border: 0; border-radius: 999px;
    font: inherit; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  #invitation-enter-music { background: #7743b9; color: white; box-shadow: 0 6px 18px rgba(119,67,185,.19); }
  #invitation-enter-silent { margin-top: 10px; background: transparent; color: #796b85; }
  .invitation-entry-card button:focus-visible, #invitation-music-control:focus-visible {
    outline: 3px solid #bf9cea; outline-offset: 4px;
  }
  #invitation-music-control {
    position: fixed; z-index: 9000; left: max(18px, env(safe-area-inset-left));
    bottom: max(18px, env(safe-area-inset-bottom)); width: 48px; height: 48px;
    border: 1px solid #e5d9f3; border-radius: 50%; background: rgba(255,255,255,.94);
    color: #7743b9; box-shadow: 0 4px 20px rgba(43,24,63,.16);
    font: 20px system-ui, sans-serif; cursor: pointer; touch-action: manipulation;
  }
</style>
<div id="invitation-entry-gate" role="dialog" aria-modal="true" aria-labelledby="invitation-entry-title" aria-describedby="invitation-entry-description">
  <div class="invitation-entry-card">
    <div class="invitation-entry-icon" aria-hidden="true">♫</div>
    <h2 id="invitation-entry-title">¿Ingresar con música?</h2>
    <p id="invitation-entry-description">Disfrutá la invitación con la canción elegida por los novios.</p>
    <button id="invitation-enter-music" type="button">♫ Sí, con música</button>
    <button id="invitation-enter-silent" type="button">Entrar sin música</button>
  </div>
</div>
<button id="invitation-music-control" type="button" aria-label="Reproducir música" title="Reproducir música" hidden>♫</button>
<script>
(function(){
  if (window.__invitationMusicRuntime) return;
  var config = ${runtimeConfig};
  var gate = document.getElementById("invitation-entry-gate");
  var enterMusic = document.getElementById("invitation-enter-music");
  var enterSilent = document.getElementById("invitation-enter-silent");
  var control = document.getElementById("invitation-music-control");
  var invitation = document.querySelector(".inv");
  var previousInert = invitation && invitation.hasAttribute("inert");
  var previousAriaHidden = invitation && invitation.getAttribute("aria-hidden");
  var audio = null;
  var resolved = false;
  var disposed = false;
  var playbackRequested = false;
  var playbackGeneration = 0;
  var peerHost = null;
  document.documentElement.setAttribute("data-invitation-entry", "pending");
  document.body.setAttribute("data-invitation-entry", "pending");
  if (invitation) { invitation.setAttribute("inert", ""); invitation.setAttribute("aria-hidden", "true"); }

  function updateControl(playing){
    var label = playing ? "Pausar música" : "Continuar música";
    control.textContent = playing ? "Ⅱ" : "♫";
    control.setAttribute("aria-label", label);
    control.setAttribute("title", label);
    control.setAttribute("data-playing", playing ? "true" : "false");
  }
  function pause(){
    playbackGeneration++;
    playbackRequested = false;
    if (audio) audio.pause();
    updateControl(false);
  }
  function onPeerPlayback(event){
    if (event.detail !== window) pause();
  }
  // Desktop/mobile mockups share a host, but each keeps its own entry decision.
  try {
    if (window.parent !== window && window.parent.document) {
      peerHost = window.parent;
      peerHost.addEventListener("invitation-music-play", onPeerPlayback);
    }
  } catch (_error) { peerHost = null; }

  function startAudio(){
    if (disposed) return;
    var generation = ++playbackGeneration;
    playbackRequested = true;
    control.hidden = false;
    try {
      if (!audio) {
        audio = new Audio();
        audio.preload = "none";
        audio.loop = config.loop;
        audio.volume = config.volume;
        audio.src = config.url;
        audio.addEventListener("playing", function(){
          if (disposed || !playbackRequested) { audio.pause(); return; }
          updateControl(true);
        });
        audio.addEventListener("pause", function(){ updateControl(false); });
        audio.addEventListener("ended", function(){ playbackRequested = false; updateControl(false); });
        audio.addEventListener("error", function(){ playbackRequested = false; updateControl(false); });
      }
      if (peerHost) peerHost.dispatchEvent(new peerHost.CustomEvent("invitation-music-play", { detail: window }));
      // Called synchronously inside the gesture. A rejected or pending play promise
      // can never hold access to the invitation hostage.
      var playback = audio.play();
      if (playback && typeof playback.catch === "function") {
        playback.catch(function(){
          if (generation !== playbackGeneration || disposed) return;
          playbackRequested = false;
          updateControl(false);
        });
      }
    } catch (_error) {
      playbackRequested = false;
      updateControl(false);
    }
  }
  function resolveEntry(moveFocus){
    if (resolved || disposed) return;
    resolved = true;
    gate.hidden = true;
    document.documentElement.setAttribute("data-invitation-entry", "resolved");
    document.body.setAttribute("data-invitation-entry", "resolved");
    if (invitation) {
      if (!previousInert) invitation.removeAttribute("inert");
      if (previousAriaHidden === null) invitation.removeAttribute("aria-hidden");
      else invitation.setAttribute("aria-hidden", previousAriaHidden);
    }
    // A fresh entry starts at the first viewport even after browser restoration.
    // Afterwards, the document/body remain the sole native scroll authority.
    var scrollingRoot = document.scrollingElement || document.documentElement;
    scrollingRoot.scrollTop = 0;
    scrollingRoot.scrollLeft = 0;
    if (document.body !== scrollingRoot) {
      document.body.scrollTop = 0;
      document.body.scrollLeft = 0;
    }
    window.scrollTo(0, 0);
    window.dispatchEvent(new CustomEvent("invitation-entry-resolved"));
    if (moveFocus && invitation) {
      var hadTabIndex = invitation.hasAttribute("tabindex");
      if (!hadTabIndex) invitation.setAttribute("tabindex", "-1");
      invitation.focus({ preventScroll: true });
      if (!hadTabIndex) invitation.removeAttribute("tabindex");
    }
  }
  function resolveWithoutMusic(){ resolveEntry(false); }
  function enterWithMusic(){
    if (resolved || disposed) return;
    startAudio();
    resolveEntry(true);
  }
  function enterWithoutMusic(){ resolveEntry(true); }
  function togglePlayback(){
    if (playbackRequested) pause();
    else startAudio();
  }
  function focusGate(){
    if (!resolved && !disposed) enterMusic.focus({ preventScroll: true });
  }
  function trapGateFocus(event){
    if (resolved || disposed) return;
    if (event.key === "Escape") { event.preventDefault(); enterWithoutMusic(); return; }
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === enterMusic) {
      event.preventDefault(); enterSilent.focus();
    } else if (!event.shiftKey && document.activeElement === enterSilent) {
      event.preventDefault(); enterMusic.focus();
    }
  }
  function dispose(){
    if (disposed) return;
    disposed = true;
    pause();
    if (audio) { audio.removeAttribute("src"); audio.load(); }
    if (peerHost) peerHost.removeEventListener("invitation-music-play", onPeerPlayback);
    window.removeEventListener("invitation-loader-hidden", focusGate);
    window.removeEventListener("pagehide", onPageHide);
    gate.removeEventListener("keydown", trapGateFocus);
    enterMusic.removeEventListener("click", enterWithMusic);
    enterSilent.removeEventListener("click", enterWithoutMusic);
    control.removeEventListener("click", togglePlayback);
  }
  function onPageHide(event){
    if (event.persisted) pause();
    else dispose();
  }
  enterMusic.addEventListener("click", enterWithMusic);
  enterSilent.addEventListener("click", enterWithoutMusic);
  control.addEventListener("click", togglePlayback);
  gate.addEventListener("keydown", trapGateFocus);
  window.addEventListener("invitation-loader-hidden", focusGate, { once: true });
  window.addEventListener("pagehide", onPageHide);
  window.__invitationMusicRuntime = { resolveWithoutMusic: resolveWithoutMusic, pause: pause, dispose: dispose };
})();
</script>
`.trim();
}

const INVITATION_LOADER_PRESENTATION_HTML = `
<style>
  body[data-loader-ready="0"] {
    overflow: hidden;
  }

  body[data-loader-ready="0"] .inv {
    opacity: 0;
  }

  body[data-loader-ready="1"] .inv {
    opacity: 1;
    transition: opacity 360ms ease;
  }

  .inv-loader {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background:
      radial-gradient(120% 90% at 80% 20%, rgba(239, 219, 255, 0.64) 0%, rgba(239, 219, 255, 0) 62%),
      radial-gradient(120% 90% at 14% 82%, rgba(105, 43, 154, 0.12) 0%, rgba(105, 43, 154, 0) 66%),
      linear-gradient(180deg, #FAF5FF 0%, #FFFFFF 100%);
    transition: opacity 420ms ease, visibility 420ms ease;
  }

  .inv-loader--exit {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .inv-loader__stage {
    position: relative;
    width: 112px;
    height: 112px;
    display: grid;
    place-items: center;
  }

  .inv-loader__halo {
    position: absolute;
    inset: 10px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.98) 0%, rgba(239, 219, 255, 0.82) 56%, rgba(105, 43, 154, 0.14) 100%);
    box-shadow:
      0 12px 30px rgba(105, 43, 154, 0.2),
      inset 0 0 0 1px rgba(255, 255, 255, 0.64);
    animation: invLoaderHalo 2.3s ease-in-out infinite;
  }

  .inv-loader__ring {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    border: 2px solid rgba(105, 43, 154, 0.18);
    border-top-color: rgba(105, 43, 154, 0.92);
    border-right-color: rgba(105, 43, 154, 0.52);
    animation: invLoaderSpin 1.15s linear infinite;
  }

  .inv-loader__heart {
    position: relative;
    z-index: 1;
    width: 34px;
    height: 34px;
    display: block;
    animation: invLoaderBeat 1.4s ease-in-out infinite;
  }

  .inv-loader__heart-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .inv-loader__heart-path {
    fill: none;
    stroke: #692B9A;
    stroke-width: 2.15;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 3px 8px rgba(105, 43, 154, 0.2));
  }

  .inv-loader__label {
    margin: 0;
    font-family: "DM Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 0.1px;
    color: #262626;
    text-align: center;
  }

  @keyframes invLoaderSpin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes invLoaderHalo {
    0%, 100% {
      transform: scale(0.98);
      opacity: 0.86;
    }
    50% {
      transform: scale(1.02);
      opacity: 1;
    }
  }

  @keyframes invLoaderBeat {
    0%, 100% {
      transform: scale(1);
    }
    42% {
      transform: scale(1.12);
    }
    64% {
      transform: scale(0.98);
    }
  }

  @media (max-width: 767px) {
    .inv-loader__stage {
      width: 96px;
      height: 96px;
    }

    .inv-loader__heart {
      width: 30px;
      height: 30px;
    }

    .inv-loader__label {
      font-size: 14px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .inv-loader__halo,
    .inv-loader__ring,
    .inv-loader__heart {
      animation: none !important;
    }
  }
</style>

<div id="inv-loader" class="inv-loader" role="status" aria-live="polite" aria-label="Cargando invitacion">
  <div class="inv-loader__stage">
    <span class="inv-loader__halo" aria-hidden="true"></span>
    <span class="inv-loader__ring" aria-hidden="true"></span>
    <span class="inv-loader__heart" aria-hidden="true">
      <svg class="inv-loader__heart-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          class="inv-loader__heart-path"
          d="M12 20.2c-.2 0-.4-.1-.5-.2C8.5 17.4 3 13.3 3 8.5 3 5.8 5.1 3.8 7.7 3.8c1.6 0 3.1.8 4.1 2.2 1-1.4 2.5-2.2 4.1-2.2C18.5 3.8 20.6 5.8 20.6 8.5c0 4.8-5.5 8.9-8.5 11.5-.1.1-.3.2-.5.2z"
        />
      </svg>
    </span>
  </div>
  <p class="inv-loader__label">Preparando tu invitación...</p>
</div>
`.trim();

module.exports = {
  INVITATION_LOADER_PRESENTATION_HTML,
};

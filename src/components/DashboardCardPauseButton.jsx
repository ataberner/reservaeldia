import { Pause, Play } from "lucide-react";

const BUTTON_MODE = {
  pause: "pause",
  resume: "resume",
};

const MODE_STYLES = {
  [BUTTON_MODE.pause]: {
    button:
      "border-[#f0dac0]/95 bg-gradient-to-br from-[#fffaf2]/95 via-[#ffeecf]/95 to-[#ffe2b8]/95 text-[#9e5600] shadow-[0_8px_18px_rgba(140,81,8,0.2)] hover:border-[#e8c79b] hover:text-[#884900] hover:shadow-[0_14px_24px_rgba(140,81,8,0.28)] focus-visible:ring-[#bf6a00]",
    overlay: "bg-gradient-to-br from-white/72 via-white/12 to-transparent",
    spinner: "border-[#9e5600]/75",
  },
  [BUTTON_MODE.resume]: {
    button:
      "border-[#bde8dc]/95 bg-gradient-to-br from-[#effffb]/95 via-[#d8f9ef]/95 to-[#bdf2e5]/95 text-[#0f7e63] shadow-[0_8px_18px_rgba(11,109,82,0.2)] hover:border-[#9ddbc9] hover:text-[#0a6750] hover:shadow-[0_14px_24px_rgba(11,109,82,0.28)] focus-visible:ring-[#0f8b6b]",
    overlay: "bg-gradient-to-br from-white/68 via-white/10 to-transparent",
    spinner: "border-[#0f7e63]/75",
  },
};

function normalizeMode(mode) {
  return mode === BUTTON_MODE.resume ? BUTTON_MODE.resume : BUTTON_MODE.pause;
}

export default function DashboardCardPauseButton({
  mode = BUTTON_MODE.pause,
  title,
  ariaLabel,
  isPending = false,
  disabled = false,
  onClick,
}) {
  const safeMode = normalizeMode(mode);
  const styles = MODE_STYLES[safeMode];
  const defaultTitle =
    safeMode === BUTTON_MODE.resume
      ? "Reanudar invitacion"
      : "Pausar invitacion";
  const buttonTitle = title || defaultTitle;
  const isDisabled = disabled || isPending;

  return (
    <button
      type="button"
      className={`group/publish-toggle inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-[11px] border backdrop-blur-[3px] transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.04] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-70 ${styles.button}`}
      onClick={onClick}
      disabled={isDisabled}
      title={buttonTitle}
      aria-label={ariaLabel || buttonTitle}
    >
      <span className={`pointer-events-none absolute inset-[1px] rounded-[9px] ${styles.overlay}`} />

      {isPending ? (
        <span className={`relative z-10 h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent ${styles.spinner}`} />
      ) : (
        safeMode === BUTTON_MODE.resume ? (
          <Play className="relative z-10 h-3.5 w-3.5 transition-transform duration-200 group-hover/publish-toggle:scale-[1.12] group-hover/publish-toggle:translate-x-[0.5px] group-focus-visible/publish-toggle:scale-[1.12] group-focus-visible/publish-toggle:translate-x-[0.5px]" />
        ) : (
          <Pause className="relative z-10 h-3.5 w-3.5 transition-transform duration-200 group-hover/publish-toggle:scale-[1.12] group-focus-visible/publish-toggle:scale-[1.12]" />
        )
      )}
    </button>
  );
}

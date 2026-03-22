// IMPORTANTISIMO: usa exactamente el mismo tipo que espera el renderer.
export const TIPO_COUNTDOWN = "countdown";

const genId = () => `count-${Date.now().toString(36)}`;

export function insertarCountdown({ targetISO, preset, position }) {
  const props = preset?.props || {};
  const presetId = preset?.id;

  const anchoBase = 800;
  const width = position?.width ?? 600;
  const height = position?.height ?? 90;
  const x = position?.x ?? (anchoBase - width) / 2;
  const y = position?.y ?? 140;

  const detail = {
    id: genId(),
    tipo: TIPO_COUNTDOWN,
    x,
    y,
    width,
    height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    targetISO,
    ...props,
    presetId,
  };

  window.dispatchEvent(new CustomEvent("insertar-elemento", { detail }));
}

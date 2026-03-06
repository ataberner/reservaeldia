export function normalizeFinishMode(mode) {
  if (mode === "immediate" || mode === "raf" || mode === "timeout100") return mode;
  return "raf";
}

export function normalizeWidthMode(mode) {
  return mode === "fit-content" ? "fit-content" : "measured";
}

// Loaded only by the mounted, authorized venue results map. Next bundles the
// worker as a same-origin hashed asset; no third-party executable is injected.
export async function loadVenueMapRuntime() {
  const runtime = await import("maplibre-gl");
  runtime.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
  return runtime;
}

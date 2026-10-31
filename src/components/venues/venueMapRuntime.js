// Loaded only by the mounted, authorized venue results map. Next bundles the
// worker as a same-origin hashed asset; no third-party executable is injected.
export async function loadVenueMapRuntime() {
  const runtime = await import("maplibre-gl");
  // Next 15.3's Pages bundler treats a package URL as a server ESM external.
  // Resolve the pinned, self-contained worker as an asset instead.
  runtime.setWorkerUrl(new URL("../../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
  return runtime;
}

const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const { assertEditorFlowSession, contract, origin, waitForFixture } = await import("./editorFlowFixtures.mjs");
  const session = assertEditorFlowSession();
  await waitForFixture(async () => {
    try { return (await fetch(`${origin}/favicon.ico`, { signal: AbortSignal.timeout(2000) })).status === 200; } catch { return false; }
  }, "Local Next did not become ready", 60000);
  const evidence = { project: contract.LOCAL_PROJECT, remoteEffects: false, purpose: "cold route compilation only; no authentication or fixtures", routes: [] };
  for (const route of ["/admin/proveedores/", "/", "/dashboard/"]) {
    const started = Date.now();
    const response = await fetch(`${origin}${route}`, { signal: AbortSignal.timeout(180000), redirect: "error" });
    if (response.status !== 200) throw new Error(`Local route ${route} returned ${response.status}`);
    await response.arrayBuffer();
    evidence.routes.push({ route, status: response.status, elapsedMs: Date.now() - started });
    console.log(`Local route compiled: ${route}`);
  }
  fs.writeFileSync(path.join(session, "provider-admin-search-warmup-evidence.json"), JSON.stringify(evidence, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

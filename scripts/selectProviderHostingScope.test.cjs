const test = require("node:test");
const assert = require("node:assert/strict");
const { selectScope } = require("./selectProviderHostingScope.cjs");
const venue = "src/components/venues/VenuesLanding.jsx";
const panel = "src/components/admin/providers/ProviderDirectoryAdmin.jsx";
test("venue release accepts its exact UI, backend, verification and operational files", () => {
  assert.equal(selectScope([venue, "functions/src/providers/directoryRegions.ts", "src/components/marketplace/useProviderDirectory.js", "src/components/appHeader/AppHeader.jsx", "src/components/marketplace/MarketplaceHeaderNavigation.test.mjs", "scripts/local/providerDirectory.browser.test.mjs", "scripts/prepareProviderPanelHosting.cjs", ".github/workflows/providers-private-candidate.yml", "deployment/venues/README.md"]), "venues");
  assert.equal(selectScope([venue, "scripts/local/evidence.cjs", "scripts/local/staticBuild.test.cjs"]), "venues");
});
test("panel remains supported and unrelated ordinary releases keep their existing path", () => {
  assert.equal(selectScope([panel, "src/components/admin/providers/ProviderAdmin.module.css", "deployment/provider-panel/README.md"]), "panel");
  assert.equal(selectScope(["src/pages/preguntas-frecuentes.js"]), "full");
});
test("scoped page with unknown files or another scoped page is rejected, never full", () => {
  for (const file of ["src/pages/_app.js", "firebase.json", "firestore.rules", "src/components/venues/Unexpected.jsx", "functions/src/index.ts"]) assert.throws(() => selectScope([venue, file]), /unreviewed/, file);
  assert.throws(() => selectScope([panel, venue]), /Multiple scoped/);
  assert.throws(() => selectScope([panel, "src/pages/index.js"]), /unreviewed/);
});

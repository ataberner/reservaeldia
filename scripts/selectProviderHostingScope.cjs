"use strict";

// Select only reviewed, bounded release scopes. Unknown changes accompanying a
// scoped page fail closed instead of falling back to a full-site publication.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const common = new Set([
  "docs/architecture/LANDING_DASHBOARD_STYLING_MAP.md",
  "scripts/prepareProviderPanelHosting.cjs", "scripts/prepareProviderPanelHosting.test.cjs",
  "scripts/selectProviderHostingScope.cjs", "scripts/selectProviderHostingScope.test.cjs",
  ".github/workflows/firebase-hosting-merge.yml", ".github/workflows/firebase-hosting-pull-request.yml",
  ".github/workflows/providers-private-candidate.yml",
]);
const panel = new Set([
  "src/components/admin/providers/ProviderDirectoryAdmin.jsx", "src/components/admin/providers/ProviderAdmin.module.css",
  "src/components/admin/providers/providerAdmin.test.mjs", "scripts/local/providerAdminSearch.browser.test.mjs",
  "deployment/provider-panel/README.md",
]);
const venues = new Set([
  "src/components/venues/VenuesLanding.jsx", "src/components/venues/VenuesLanding.module.css",
  "src/components/venues/VenueResultCard.jsx", "src/components/venues/VenueResultsMap.jsx",
  "src/components/venues/VenueResultsMap.module.css", "src/components/venues/VenueSearchForm.jsx",
  "src/components/venues/VenuesLanding.test.mjs", "src/components/venues/venueMapModel.js",
  "src/components/venues/venueMapModel.test.mjs", "src/components/marketplace/useProviderDirectory.js",
  "src/components/marketplace/providerDirectory.test.mjs", "scripts/local/providerDirectory.browser.test.mjs",
  "src/components/appHeader/AppHeader.jsx", "src/components/marketplace/MarketplaceHeader.jsx",
  "src/components/marketplace/ProviderDirectoryDetail.jsx",
  "src/components/marketplace/MarketplaceHeaderNavigation.test.mjs",
  "functions/src/providers/directoryModel.ts", "functions/src/providers/directoryService.ts",
  "functions/src/providers/directoryRegions.ts", "functions/src/providers/directoryRegionLocalities.ts",
  "functions/src/providers/normalization.ts", "functions/providersDirectory.test.mjs",
  "docs/architecture/PROVIDER_DATA_MODEL.md", "docs/testing/PROVIDER_PRIVATE_DIRECTORY.md",
  "docs/operations/PROVIDER_BETA_PRIVATE_DEPLOYMENT.md",
  "deployment/venues/README.md",
]);

function selectScope(files) {
  assert.ok(Array.isArray(files) && files.every(file => typeof file === "string" && file && !file.includes("\0")), "Invalid changed-file inventory");
  const hasPanel = files.some(file => ["src/components/admin/providers/ProviderDirectoryAdmin.jsx", "src/components/admin/providers/ProviderAdmin.module.css"].includes(file));
  const hasVenues = files.some(file => file.startsWith("src/components/venues/") || file === "src/pages/lugares.jsx");
  assert.ok(!(hasPanel && hasVenues), "Multiple scoped pages changed; reconcile the release explicitly");
  if (!hasPanel && !hasVenues) return "full";
  const allowed = hasPanel ? panel : venues;
  const unknown = files.filter(file => !common.has(file) && !allowed.has(file));
  assert.equal(unknown.length, 0, `Scoped publication includes unreviewed changes: ${unknown.join(", ")}`);
  return hasPanel ? "panel" : "venues";
}

function changedFiles(before, after = "HEAD") {
  assert.match(before || "", /^[a-f0-9]{40}$/, "A resolved base commit is required");
  assert.ok(after === "HEAD" || /^[a-f0-9]{40}$/.test(after), "A resolved head commit is required");
  execFileSync("git", ["cat-file", "-e", `${before}^{commit}`], { stdio: "pipe" });
  return execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", before, after], { encoding: "utf8" }).split("\0").filter(Boolean);
}

module.exports = { selectScope, changedFiles };
if (require.main === module) {
  try {
    assert.ok(process.argv.length === 3 || process.argv.length === 4, "Provide base and optional head commit");
    const scope = selectScope(changedFiles(process.argv[2], process.argv[3] || "HEAD"));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `scope=${scope}\n`);
    console.log(`Hosting publication scope: ${scope}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

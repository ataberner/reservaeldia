import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const heroSource = readFileSync(new URL("./LandingHero.jsx", import.meta.url), "utf8");
const heroStyles = readFileSync(
  new URL("./LandingHero.module.css", import.meta.url),
  "utf8"
);
const dashboardHomeSource = readFileSync(
  new URL("../dashboard/home/DashboardHomeView.jsx", import.meta.url),
  "utf8"
);
const landingPageSource = readFileSync(
  new URL("../../pages/index.js", import.meta.url),
  "utf8"
);

test("dashboard hero opts into the dashboard-only responsive variant", () => {
  assert.match(heroSource, /variant = "landing"/);
  assert.match(
    heroSource,
    /variant === "dashboard" && styles\.heroDashboard/
  );
  assert.match(
    dashboardHomeSource,
    /<LandingHero[\s\S]*?variant="dashboard"[\s\S]*?\/>/
  );
  assert.doesNotMatch(landingPageSource, /variant="dashboard"/);
});

test("dashboard hero zooms only across the tablet breakpoint", () => {
  assert.match(
    heroStyles,
    /\.hero\s*\{[\s\S]*?--landing-hero-bg-size:\s*125% auto;/
  );
  assert.match(
    heroStyles,
    /@media \(min-width: 621px\) and \(max-width: 1024px\)\s*\{[\s\S]*?\.heroDashboard\s*\{[\s\S]*?--landing-hero-bg-size:\s*200% auto;/
  );
  assert.match(heroStyles, /@media \(max-width: 620px\)/);
});

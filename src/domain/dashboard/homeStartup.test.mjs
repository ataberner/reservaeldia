import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isDashboardHomeContentReady } from "./homeStartup.js";

const dashboardSource = readFileSync(
  new URL("../../pages/dashboard.js", import.meta.url),
  "utf8"
);
const homeViewSource = readFileSync(
  new URL("../../components/dashboard/home/DashboardHomeView.jsx", import.meta.url),
  "utf8"
);
const loaderSource = readFileSync(
  new URL(
    "../../components/dashboard/home/DashboardHomeStartupLoader.jsx",
    import.meta.url
  ),
  "utf8"
);
const loaderStyles = readFileSync(
  new URL(
    "../../components/dashboard/home/DashboardHomeStartupLoader.module.css",
    import.meta.url
  ),
  "utf8"
);
const startupHookSource = readFileSync(
  new URL("../../hooks/useDashboardStartupLoaders.js", import.meta.url),
  "utf8"
);

const loadedState = {
  loadingDrafts: false,
  loadingPublications: false,
  loadingTemplates: false,
  loadingConfig: false,
};

test("dashboard home is ready only after every required source settles", () => {
  assert.equal(isDashboardHomeContentReady(loadedState), true);

  for (const key of Object.keys(loadedState)) {
    assert.equal(
      isDashboardHomeContentReady({ ...loadedState, [key]: true }),
      false,
      `${key} must keep the startup loader visible`
    );
  }

  assert.equal(
    isDashboardHomeContentReady({
      loadingDrafts: false,
      loadingPublications: false,
      loadingTemplates: false,
    }),
    false
  );
});

test("dashboard home readiness has one data-driven authority and no forced reveal timeout", () => {
  assert.match(homeViewSource, /isDashboardHomeContentReady\(\{/);
  assert.match(
    startupHookSource,
    /showHomeStartupLoader\s*=\s*isHomeView\s*&&\s*!homeViewReady/
  );
  assert.doesNotMatch(startupHookSource, /HOME_DASHBOARD_LOADER_MAX_MS/);
  assert.doesNotMatch(startupHookSource, /homeLoaderForcedDone/);
});

test("dashboard entry uses the accessible heart loader and hides partial content", () => {
  assert.match(dashboardSource, /<DashboardHomeStartupLoader/);
  assert.doesNotMatch(dashboardSource, /Afinando los detalles/);
  assert.match(
    dashboardSource,
    /aria-hidden=\{showHomeStartupLoader \? "true" : undefined\}/
  );
  assert.match(
    dashboardSource,
    /inert=\{showHomeStartupLoader \? true : undefined\}/
  );
  assert.match(loaderSource, /<Heart className=\{styles\.heart\}/);
  assert.match(loaderSource, /Preparando tu espacio\.\.\./);
  assert.match(loaderSource, /role="status"/);
  assert.match(loaderSource, /aria-live="polite"/);
});

test("dashboard loader fades out, beats softly, and respects reduced motion", () => {
  assert.match(loaderSource, /exiting \? styles\.exiting/);
  assert.match(loaderStyles, /\.root\s*\{[\s\S]*?transition:\s*opacity 320ms ease-out/);
  assert.match(loaderStyles, /\.exiting\s*\{[\s\S]*?opacity:\s*0/);
  assert.match(loaderStyles, /dashboardHomeLoaderBeat 1\.65s ease-in-out infinite/);
  assert.match(loaderStyles, /\.message\s*\{[\s\S]*?color:\s*#667085/);
  assert.match(
    loaderStyles,
    /@media \(max-width: 767px\)[\s\S]*?\.stage\s*\{[\s\S]*?width:\s*80px/
  );
  assert.match(
    loaderStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation:\s*none/
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appHeaderSource = readFileSync(
  new URL("./AppHeader.jsx", import.meta.url),
  "utf8"
);
const dashboardHomeSource = readFileSync(
  new URL("../dashboard/home/DashboardHomeView.jsx", import.meta.url),
  "utf8"
);
const dashboardHeaderSource = readFileSync(
  new URL("../DashboardHeader.jsx", import.meta.url),
  "utf8"
);

test("authenticated header navigation uses existing same-document dashboard anchors", () => {
  const authenticatedTargets = [
    "#dashboard-home-template-collections",
    "#dashboard-como-funciona",
    "#dashboard-precios",
  ];

  authenticatedTargets.forEach((href) => {
    assert.match(dashboardHeaderSource, new RegExp(href));
    assert.match(dashboardHomeSource, new RegExp(href.slice(1)));
  });

  assert.match(
    dashboardHeaderSource,
    /const dashboardHomeNavItems =[\s\S]*vistaActual === "home"[\s\S]*navItems=\{dashboardHomeNavItems\}/
  );
});

test("header navigation remains keyboard-native and shares mobile menu cleanup", () => {
  assert.match(
    appHeaderSource,
    /const renderCenterNavItems[\s\S]*<a[\s\S]*href=\{item\.href\}[\s\S]*onClick=\{closeTransientMenus\}/
  );
  assert.match(
    appHeaderSource,
    /renderCenterNavItems\(styles\.mobileCenterNav, \{ mobile: true \}\)/
  );
});

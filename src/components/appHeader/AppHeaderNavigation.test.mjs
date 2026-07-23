import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appHeaderSource = readFileSync(
  new URL("./AppHeader.jsx", import.meta.url),
  "utf8"
);
const templateShowcaseStyles = readFileSync(
  new URL("../landing/LandingTemplateShowcase.module.css", import.meta.url),
  "utf8"
);
const howItWorksStyles = readFileSync(
  new URL("../landing/LandingHowItWorks.module.css", import.meta.url),
  "utf8"
);
const pricingStyles = readFileSync(
  new URL("../landing/LandingPricing.module.css", import.meta.url),
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
const landingFooterSource = readFileSync(
  new URL("../landing/LandingFooter.jsx", import.meta.url),
  "utf8"
);
const appHeaderStyles = readFileSync(
  new URL("./AppHeader.module.css", import.meta.url),
  "utf8"
);
const landingPageSource = readFileSync(
  new URL("../../pages/index.js", import.meta.url),
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
    /const renderCenterNavItems[\s\S]*<a[\s\S]*href=\{item\.href\}[\s\S]*onClick=\{\(event\) => handleCenterNavClick\(event, item\)\}/
  );
  assert.match(
    appHeaderSource,
    /renderCenterNavItems\(styles\.mobileCenterNav, \{ mobile: true \}\)/
  );
});

test("landing header smooth-scrolls its existing hashes without hijacking dashboard navigation", () => {
  ["#plantillas", "#como-funciona", "#precios"].forEach((href) => {
    assert.match(appHeaderSource, new RegExp(href));
  });

  assert.match(
    appHeaderSource,
    /if \(!isLanding \|\| !LANDING_SMOOTH_SCROLL_TARGETS\.has\(href\)\) return/
  );
  assert.match(appHeaderSource, /event\.preventDefault\(\)/);
  assert.match(appHeaderSource, /window\.history\.pushState\(null, "", href\)/);
  assert.match(
    appHeaderSource,
    /"\(prefers-reduced-motion: reduce\)"[\s\S]*behavior: reduceMotion \? "instant" : "smooth"/
  );
  assert.match(
    appHeaderSource,
    /target\.scrollIntoView\(\{[\s\S]*block: "start"/
  );
});

test("landing hash targets compensate the fixed header without affecting dashboard templates", () => {
  assert.match(
    templateShowcaseStyles,
    /\.root:not\(\.rootDashboard\)\s*\{\s*scroll-margin-top:\s*57px;/
  );
  assert.match(
    howItWorksStyles,
    /\.howItWorksSection\s*\{[\s\S]*scroll-margin-top:\s*57px;/
  );
  assert.match(
    pricingStyles,
    /\.pricingSection\s*\{[\s\S]*scroll-margin-top:\s*57px;/
  );
});

test("shared public navigation routes FAQ links to the indexable FAQ page", () => {
  assert.match(
    appHeaderSource,
    /key: "faq",[\s\S]*href: "\/preguntas-frecuentes\/"/
  );
  assert.match(
    dashboardHeaderSource,
    /key: "faq",[\s\S]*href: "\/preguntas-frecuentes\/"/
  );
  assert.match(
    landingFooterSource,
    /Preguntas Frecuentes", href: "\/preguntas-frecuentes\/"/
  );
  assert.match(
    dashboardHomeSource,
    /Preguntas Frecuentes", href: "\/preguntas-frecuentes\/"/
  );
  assert.match(
    landingFooterSource,
    /Contacto",[\s\S]*href: "\/preguntas-frecuentes\/#contactar-equipo-reserva-el-dia"/
  );
  assert.match(
    dashboardHomeSource,
    /Contacto",[\s\S]*href: "\/preguntas-frecuentes\/#contactar-equipo-reserva-el-dia"/
  );
});

test("expanded header navigation keeps the established mobile drawer at intermediate widths", () => {
  assert.match(
    appHeaderSource,
    /hasExpandedNavigation = centerNavItems\.length > 3/
  );
  assert.match(
    appHeaderStyles,
    /@media \(min-width: 860px\) and \(max-width: 1099px\)[\s\S]*\.expandedNavigation \.mobileToggle[\s\S]*display: inline-flex/
  );
});

test("linked public header actions preserve auth entry on the landing route", () => {
  assert.match(
    appHeaderSource,
    /if \(action\.href && !action\.disabled\)[\s\S]*<Link[\s\S]*href=\{action\.href\}/
  );
  assert.match(
    landingPageSource,
    /const authAction = params\.get\("auth"\)[\s\S]*authAction === "login"[\s\S]*authAction === "register"[\s\S]*params\.delete\("auth"\)/
  );
});

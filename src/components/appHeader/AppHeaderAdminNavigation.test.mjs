import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboardHeaderSource = readFileSync(
  new URL("../DashboardHeader.jsx", import.meta.url),
  "utf8"
);
const appHeaderSource = readFileSync(
  new URL("./AppHeader.jsx", import.meta.url),
  "utf8"
);
const siteManagementRouteSource = readFileSync(
  new URL("../../pages/admin/gestion-sitio.jsx", import.meta.url),
  "utf8"
);

test("admin tools in the account menu open dedicated routes in a new tab", () => {
  assert.match(
    dashboardHeaderSource,
    /key: "creative-panel",[\s\S]*href: "\/admin\/panel-creativo",[\s\S]*target: "_blank",[\s\S]*rel: "noopener noreferrer"/
  );
  assert.match(
    dashboardHeaderSource,
    /key: "site-management",[\s\S]*href: "\/admin\/gestion-sitio",[\s\S]*target: "_blank",[\s\S]*rel: "noopener noreferrer"/
  );
  assert.match(
    appHeaderSource,
    /if \(item\.href && !item\.disabled\)[\s\S]*<Link[\s\S]*href=\{item\.href\}[\s\S]*target=\{item\.target\}[\s\S]*rel=\{item\.rel\}/
  );
});

test("the dedicated site-management route remains superadmin-only", () => {
  assert.match(
    siteManagementRouteSource,
    /useAdminAccess\(authUser\)[\s\S]*isSuperAdmin/
  );
  assert.match(
    siteManagementRouteSource,
    /if \(authUser && isSuperAdmin\) return;[\s\S]*router\.replace\("\/dashboard"\)/
  );
  assert.match(
    siteManagementRouteSource,
    /<SiteManagementBoard[\s\S]*isSuperAdmin=\{isSuperAdmin\}/
  );
});

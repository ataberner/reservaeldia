import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./PublicadasGrid.jsx", import.meta.url),
  "utf8"
);

test("mobile selector and desktop list are mutually exclusive at lg", () => {
  const mobileSelectorIndex = source.indexOf(
    '<div className="min-w-0 max-w-full lg:hidden">'
  );
  const desktopListIndex = source.indexOf('className="hidden min-w-0 lg:block');
  const detailIndex = source.indexOf('aria-label="Detalle de la invitacion seleccionada"');

  assert.ok(mobileSelectorIndex >= 0, "mobile selector wrapper must exist");
  assert.ok(desktopListIndex > mobileSelectorIndex, "desktop list follows mobile selector");
  assert.ok(detailIndex > desktopListIndex, "detail follows the active selection control");
  assert.match(source, /<MobileInvitationSelector[\s\S]*?rows=\{filteredInvitationRows\}/);
  assert.match(source, /<InvitationListPanel[\s\S]*?rows=\{invitationPagination\.items\}/);
});

test("mobile selector is native, labelled and reuses the existing selection callback", () => {
  assert.match(source, /function MobileInvitationSelector\(/);
  assert.match(source, /<label[\s\S]*?htmlFor=\{selectId\}[\s\S]*?Elegir invitacion/);
  assert.match(source, /<select[\s\S]*?id=\{selectId\}[\s\S]*?value=\{selectedId \|\| ""\}/);
  assert.match(source, /const selectedRow = findInvitationById\(rows, event\.target\.value\)/);
  assert.match(source, /if \(selectedRow\) onSelect\(selectedRow\)/);
  assert.match(source, /disabled=\{!rows\.length\}/);
});

test("detail wrapper avoids the legacy global section selector and keeps desktop scroll", () => {
  assert.doesNotMatch(source, /<section[\s>]/);
  assert.match(source, /role="region"/);
  assert.match(source, /lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain/);
});

test("mobile layout contracts prevent page-width overflow while desktop keeps its grid", () => {
  assert.match(source, /w-full min-w-0 max-w-full lg:h-full/);
  assert.match(source, /min-w-0 max-w-full lg:hidden/);
  assert.match(source, /flex min-w-0 flex-wrap gap-2 pb-1 lg:flex-nowrap lg:overflow-x-auto/);
  assert.match(source, /break-words[\s\S]*?lg:truncate lg:break-normal/);
  assert.match(source, /sm:hidden[\s\S]*?pagination\.page[\s\S]*?hidden items-center gap-2 sm:flex/);
  assert.match(source, /lg:grid-cols-\[360px_minmax\(0,1fr\)\]/);
  assert.match(source, /flex min-w-0 flex-col gap-5 lg:flex-row/);
  assert.match(source, /w-full max-w-full[\s\S]*?lg:w-64/);
});

test("mobile preview shows the top cover raster and restores current desktop sizing", () => {
  assert.match(source, /data-mobile-cover-preview="true"/);
  assert.match(source, /aspect-\[4\/3\][\s\S]*?lg:aspect-auto xl:h-36/);
  assert.match(source, /object-cover object-top lg:min-h-\[180px\] xl:min-h-0/);
  assert.doesNotMatch(source, /<iframe[\s>]/);
  assert.doesNotMatch(source, /srcDoc=/);
});

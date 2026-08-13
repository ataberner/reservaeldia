import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const showcaseSource = readFileSync(
  new URL("./LandingTemplateShowcase.jsx", import.meta.url),
  "utf8"
);
const showcaseStyles = readFileSync(
  new URL("./LandingTemplateShowcase.module.css", import.meta.url),
  "utf8"
);

test("public template loading renders a carousel-shaped skeleton rail", () => {
  assert.match(showcaseSource, /const LANDING_TEMPLATE_SKELETON_COUNT = 4/);
  assert.match(
    showcaseSource,
    /if \(loading\) \{[\s\S]*?<LandingTemplateCarouselBlock id="plantillas" ariaBusy>[\s\S]*?<LandingTemplateShowcaseSkeleton \/>/
  );
  assert.match(
    showcaseSource,
    /Array\.from\(\{ length: LANDING_TEMPLATE_SKELETON_COUNT \}\)/
  );
  assert.doesNotMatch(showcaseSource, /styles\.loadingState/);
});

test("settled template data replaces skeletons while error and empty states stay terminal", () => {
  assert.equal(
    (showcaseSource.match(/<LandingTemplateShowcaseSkeleton \/>/g) || []).length,
    1
  );
  assert.match(
    showcaseSource,
    /finally \{[\s\S]*?setLoading\(false\)/
  );
  assert.match(showcaseSource, /if \(error \|\| sections\.length === 0\)/);
  assert.match(
    showcaseSource,
    /return \([\s\S]*?<LandingTemplateCarouselBlock id="plantillas">[\s\S]*?sections\.map\(\(section\)/
  );
});

test("skeletons are inert and expose only one polite loading announcement", () => {
  const skeletonSource = showcaseSource.match(
    /function LandingTemplateShowcaseSkeleton\(\) \{[\s\S]*?\n\}/
  )?.[0];

  assert.ok(skeletonSource);
  assert.match(skeletonSource, /role="status"/);
  assert.match(skeletonSource, /aria-live="polite"/);
  assert.match(skeletonSource, /aria-hidden="true"/);
  assert.doesNotMatch(skeletonSource, /<button\b/);
});

test("skeleton cards share real card geometry and respect reduced motion", () => {
  assert.match(
    showcaseStyles,
    /--landing-template-card-width:\s*293px;[\s\S]*?--landing-template-preview-height:\s*410px;/
  );
  assert.match(
    showcaseStyles,
    /\.templateCard\s*\{[\s\S]*?width:\s*var\(--landing-template-card-width\)/
  );
  assert.match(
    showcaseStyles,
    /\.skeletonPreview\s*\{[\s\S]*?width:\s*var\(--landing-template-card-width\);[\s\S]*?height:\s*var\(--landing-template-preview-height\)/
  );
  assert.match(
    showcaseStyles,
    /\.railViewport\s*\{[\s\S]*?overflow-x:\s*auto/
  );
  assert.match(
    showcaseStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.skeletonSurface::after\s*\{[\s\S]*?animation:\s*none/
  );
});

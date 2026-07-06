import test from "node:test";
import assert from "node:assert/strict";

import {
  LANDING_CANONICAL_URL,
  LANDING_DESCRIPTION,
  LANDING_SHARE_IMAGE_URL,
  LANDING_TITLE,
  buildLandingStructuredData,
  serializeLandingStructuredData,
} from "./landingMetadata.js";

function getGraphNodesByType(structuredData, type) {
  return structuredData["@graph"].filter((node) => node["@type"] === type);
}

test("landing structured data serializes as valid JSON-LD", () => {
  const structuredData = buildLandingStructuredData();
  const serialized = serializeLandingStructuredData(structuredData);

  assert.deepEqual(JSON.parse(serialized), structuredData);
  assert.equal(structuredData["@context"], "https://schema.org");
  assert.ok(Array.isArray(structuredData["@graph"]));
});

test("landing structured data exposes the approved organization, website, and webpage graph", () => {
  const structuredData = buildLandingStructuredData();

  const [organization] = getGraphNodesByType(structuredData, "Organization");
  const [website] = getGraphNodesByType(structuredData, "WebSite");
  const [webpage] = getGraphNodesByType(structuredData, "WebPage");

  assert.equal(organization.url, LANDING_CANONICAL_URL);
  assert.equal(website.url, LANDING_CANONICAL_URL);
  assert.equal(website.publisher["@id"], organization["@id"]);

  assert.equal(webpage.url, LANDING_CANONICAL_URL);
  assert.equal(webpage.name, LANDING_TITLE);
  assert.equal(webpage.description, LANDING_DESCRIPTION);
  assert.equal(webpage.isPartOf["@id"], website["@id"]);
  assert.equal(webpage.about["@id"], organization["@id"]);
  assert.equal(webpage.primaryImageOfPage.url, LANDING_SHARE_IMAGE_URL);
  assert.equal(webpage.primaryImageOfPage.width, 1200);
  assert.equal(webpage.primaryImageOfPage.height, 630);
});

test("landing structured data does not publish unapproved AEO content schemas", () => {
  const structuredData = buildLandingStructuredData();
  const graphTypes = new Set(structuredData["@graph"].map((node) => node["@type"]));

  for (const blockedType of [
    "FAQPage",
    "Product",
    "Service",
    "SoftwareApplication",
    "BreadcrumbList",
  ]) {
    assert.equal(graphTypes.has(blockedType), false);
  }

  assert.equal(
    structuredData["@graph"].some((node) => node.potentialAction),
    false
  );
});

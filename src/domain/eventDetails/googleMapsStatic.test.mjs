import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGoogleMapsStaticImageSrc,
  getGoogleMapsStaticApiKey,
  resolveGoogleMapsStaticLocation,
} from "./googleMapsStatic.js";

function parseStaticMapsUrl(src) {
  assert.ok(src, "expected a static maps URL");
  return new URL(src);
}

test("builds a Google Static Maps URL from lat/lng with marker and render defaults", () => {
  const url = parseStaticMapsUrl(
    buildGoogleMapsStaticImageSrc(
      {
        googleLat: -34.603722,
        googleLng: -58.381592,
        width: 361,
        height: 220,
      },
      { apiKey: "test-key" }
    )
  );

  assert.equal(url.origin + url.pathname, "https://maps.googleapis.com/maps/api/staticmap");
  assert.equal(url.searchParams.get("key"), "test-key");
  assert.equal(url.searchParams.get("center"), "-34.603722,-58.381592");
  assert.equal(url.searchParams.get("markers"), "color:red|-34.603722,-58.381592");
  assert.equal(url.searchParams.get("size"), "361x220");
  assert.equal(url.searchParams.get("scale"), "2");
  assert.equal(url.searchParams.get("maptype"), "roadmap");
  assert.equal(url.searchParams.get("language"), "es-419");
  assert.equal(url.searchParams.get("region"), "AR");
});

test("clamps Google Static Maps size, zoom, and scale to supported limits", () => {
  const url = parseStaticMapsUrl(
    buildGoogleMapsStaticImageSrc(
      {
        googleLat: 10,
        googleLng: 20,
        width: 1200,
        height: 900,
        googleMapZoom: 99,
      },
      {
        apiKey: "test-key",
        scale: 3,
      }
    )
  );

  assert.equal(url.searchParams.get("size"), "640x640");
  assert.equal(url.searchParams.get("zoom"), "21");
  assert.equal(url.searchParams.get("scale"), "2");
});

test("returns an empty URL when key or location is missing", () => {
  assert.equal(
    buildGoogleMapsStaticImageSrc(
      {
        googleLat: -34.603722,
        googleLng: -58.381592,
      },
      { apiKey: "" }
    ),
    ""
  );

  assert.equal(
    buildGoogleMapsStaticImageSrc(
      {
        width: 361,
        height: 220,
      },
      { apiKey: "test-key" }
    ),
    ""
  );
});

test("uses formatted address as fallback when coordinates are unavailable", () => {
  const address = "Av. Corrientes 1234, Buenos Aires, Argentina";
  const url = parseStaticMapsUrl(
    buildGoogleMapsStaticImageSrc(
      {
        googleLat: null,
        googleLng: null,
        googleFormattedAddress: address,
        googleDisplayName: "Teatro",
        width: 400,
        height: 300,
      },
      { apiKey: "test-key" }
    )
  );

  assert.equal(resolveGoogleMapsStaticLocation({ googleFormattedAddress: address }), address);
  assert.equal(url.searchParams.get("center"), address);
  assert.equal(url.searchParams.get("markers"), `color:red|${address}`);
  assert.equal(url.searchParams.get("size"), "400x300");
});

test("reads the public Google Maps key from the provided environment", () => {
  assert.equal(
    getGoogleMapsStaticApiKey({ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "  public-key  " }),
    "public-key"
  );
});

test("reads the public Google Maps key from process.env when no override is provided", () => {
  const previous = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "  process-public-key  ";

  try {
    assert.equal(getGoogleMapsStaticApiKey(), "process-public-key");
  } finally {
    if (typeof previous === "undefined") {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = previous;
    }
  }
});

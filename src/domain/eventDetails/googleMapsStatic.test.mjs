import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGoogleMapsStaticImageSrc,
  buildGoogleMapsStaticLocationKey,
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

  assert.equal(url.searchParams.get("size"), "640x480");
  assert.equal(url.searchParams.get("zoom"), "21");
  assert.equal(url.searchParams.get("scale"), "2");
});

test("static map requests use the effective canvas dimensions even for tiny saved maps", () => {
  for (const dimensions of [{ width: 1, height: 220 }, { width: 361, height: 1 }, { width: 10, height: 10 }]) {
    const url = parseStaticMapsUrl(buildGoogleMapsStaticImageSrc({
      googleLat: -34.6, googleLng: -58.4, ...dimensions,
    }, { apiKey: "synthetic" }));
    assert.equal(url.searchParams.get("size"), `${Math.max(200, dimensions.width)}x${Math.max(200, dimensions.height)}`);
  }
});

test("static map resolution preserves landscape and portrait proportions within pixel rounding", () => {
  for (const [width, height] of [[800, 220], [220, 800], [1200, 900], [850.5, 350.25]]) {
    const url = parseStaticMapsUrl(buildGoogleMapsStaticImageSrc({
      googleLat: -34.6, googleLng: -58.4, width, height,
    }, { apiKey: "synthetic" }));
    const [requestWidth, requestHeight] = url.searchParams.get("size").split("x").map(Number);
    assert.equal(Math.max(requestWidth, requestHeight), 640);
    const factor = 640 / Math.max(width, height);
    assert.ok(Math.abs(requestWidth - width * factor) <= 0.5);
    assert.ok(Math.abs(requestHeight - height * factor) <= 0.5);
  }
});

test("map image identity follows location while ignoring authored size and zoom", () => {
  const location = { googlePlaceId: "place-a", googleLat: -34.6, googleLng: -58.4 };
  const key = buildGoogleMapsStaticLocationKey(location);
  assert.ok(key);
  assert.equal(buildGoogleMapsStaticLocationKey({ ...location, width: 500, height: 350, googleMapZoom: 18 }), key);
  assert.notEqual(buildGoogleMapsStaticLocationKey({ ...location, googlePlaceId: "place-b" }), key);
  assert.notEqual(buildGoogleMapsStaticLocationKey({ ...location, googleLat: -35 }), key);
  assert.notEqual(buildGoogleMapsStaticLocationKey({ googleFormattedAddress: "Address A" }), buildGoogleMapsStaticLocationKey({ googleFormattedAddress: "Address B" }));
  assert.equal(buildGoogleMapsStaticLocationKey({ googlePlaceId: "no-location" }), "");
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

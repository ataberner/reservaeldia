import assert from "node:assert/strict";
import test from "node:test";
import { GOOGLE_MAP_MIN_SIZE, resolveGoogleMapDimensions } from "./googleMapGeometry.js";
import { buildEventGoogleMapObjectPatch } from "./location.js";

test("map dimensions preserve valid authored dimensions and enforce the existing minimum", () => {
  assert.equal(GOOGLE_MAP_MIN_SIZE, 200);
  for (const [input, expected] of [
    [{ width: 361, height: 220 }, { width: 361, height: 220 }],
    [{ width: 800.5, height: "350.25" }, { width: 800.5, height: 350.25 }],
    [{ width: 1, height: 10 }, { width: 200, height: 200 }],
    [{ width: -20, height: 0 }, { width: 200, height: 200 }],
  ]) {
    const before = structuredClone(input);
    assert.deepEqual(resolveGoogleMapDimensions(input), expected);
    assert.deepEqual(input, before);
  }
});

test("absent or nonfinite map dimensions resolve to finite defaults", () => {
  assert.deepEqual(resolveGoogleMapDimensions(), { width: 361, height: 220 });
  assert.deepEqual(resolveGoogleMapDimensions(null), { width: 361, height: 220 });
  for (const value of [undefined, null, "", "  ", "invalid", NaN, Infinity, -Infinity]) {
    assert.deepEqual(resolveGoogleMapDimensions({ width: value, height: value }), { width: 361, height: 220 });
  }
});

test("location insertion uses the same map geometry without changing location metadata", () => {
  const input = {
    width: 25, height: Infinity, googlePlaceId: "synthetic-place",
    googleLat: -34.6, googleLng: -58.4, showMap: true,
  };
  const result = buildEventGoogleMapObjectPatch(input);
  assert.deepEqual({ width: result.width, height: result.height }, resolveGoogleMapDimensions(input));
  assert.equal(result.googlePlaceId, input.googlePlaceId);
  assert.equal(result.googleLat, input.googleLat);
  assert.equal(result.mostrarMapa, true);
});

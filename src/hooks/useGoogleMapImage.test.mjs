import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import useGoogleMapImage from "./useGoogleMapImage.js";

const require = createRequire(import.meta.url);
const { JSDOM } = require("../../functions/node_modules/jsdom");
let sequence = 0;

async function withMapImage(run) {
  const dom = new JSDOM("<div id='root'></div>");
  const requests = new Map();
  const history = [];
  const globals = ["window", "document", "Image", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  class FakeImage {
    complete = false;
    naturalWidth = 0;
    set src(value) { this.url = value; requests.set(value, this); }
    get src() { return this.url; }
  }
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Image = FakeImage;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById("root"));
  const prefix = `https://synthetic.test/maps/${++sequence}`;
  function Host({ src, locationKey }) {
    history.push(useGoogleMapImage(src, locationKey));
    return null;
  }
  const render = async (name, locationKey) => {
    const start = history.length;
    await act(async () => root.render(React.createElement(Host, {
      src: name ? `${prefix}/${name}` : null, locationKey,
    })));
    return history.slice(start);
  };
  const settle = async (name, successful = true) => {
    const image = requests.get(`${prefix}/${name}`);
    assert.ok(image, `expected a request for ${name}`);
    await act(async () => {
      image.complete = true;
      image.naturalWidth = successful ? 400 : 0;
      if (successful) image.onload();
      else image.onerror();
    });
    return image;
  };
  try {
    await run({ render, settle, history, current: () => history.at(-1), requests });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of globals) {
      if (previous.get(key)) Object.defineProperty(globalThis, key, previous.get(key));
      else delete globalThis[key];
    }
  }
}

test("map resizing keeps the last valid image through loading and errors, then replaces it", async () => {
  await withMapImage(async ({ render, settle, current, requests }) => {
    await render("size-361", "location-a");
    assert.equal(current(), null);
    const first = await settle("size-361");
    assert.equal(first.crossOrigin, "anonymous");
    assert.equal(current(), first);
    const resizeRenders = await render("size-450", "location-a");
    assert.ok(resizeRenders.every((image) => image === first));
    await settle("size-450", false);
    assert.equal(current(), first);
    await render("size-500", "location-a");
    assert.equal(current(), first);
    const final = await settle("size-500");
    assert.equal(current(), final);
    assert.equal(requests.size, 3);
  });
});

test("a location change never exposes the previous image or a late resize response", async () => {
  await withMapImage(async ({ render, settle, current }) => {
    await render("a-small", "location-a");
    await settle("a-small");
    await render("a-large", "location-a");
    const changeRenders = await render("b-small", "location-b");
    assert.ok(changeRenders.every((image) => image === null));
    await settle("a-large");
    assert.equal(current(), null);
    const second = await settle("b-small");
    assert.equal(current(), second);
    await render("c-small", "location-c");
    await settle("c-small", false);
    assert.equal(current(), null);
  });
});

test("hiding a map clears its visible image and cached reopening reuses the shared loader", async () => {
  await withMapImage(async ({ render, settle, current, requests }) => {
    await render("a", "location-a");
    const loaded = await settle("a");
    const hiddenRenders = await render(null, "location-a");
    assert.ok(hiddenRenders.every((image) => image === null));
    await render("a", "location-a");
    assert.equal(current(), loaded);
    assert.equal(requests.size, 1);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function runInFreshProcess(body) {
  const child = spawnSync(process.execPath, ["--require", "../scripts/local/networkGuard.cjs", "-e", `
    const assert = require('node:assert/strict');
    const loaded = name => Object.keys(require.cache).some(file => file.replaceAll('\\\\', '/').includes('/node_modules/' + name + '/'));
    require('./lib/index.js');
    ${body}
    assert.deepEqual(require('../scripts/local/networkGuard.cjs').attempts, []);
  `], { cwd: new URL("./", import.meta.url), encoding: "utf8", timeout: 30_000, windowsHide: true });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr || child.stdout);
}

test("full entrypoint defers JSDOM until real share HTML processing, preserving synchronous output", () => {
  runInFreshProcess(`
    assert.equal(loaded('jsdom'), false, 'Discovery must not load JSDOM through any branch');
    const share = require('./lib/payments/publishedShareImage.js');
    assert.equal(share.preparePublishedShareImageHtml(''), '');
    assert.equal(loaded('jsdom'), false, 'Empty HTML does not need a DOM');
    const input = '<div class="inv"><section class="sec"><p>María &amp; José</p><div class="objeto mapa-google"><iframe src="https://www.google.com/maps/embed/x"></iframe></div><iframe src="https://example.invalid/keep"></iframe></section></div>';
    const expected = '<html><head></head><body><div class="inv"><section class="sec"><p>María &amp; José</p><iframe src="https://example.invalid/keep"></iframe></section></div></body></html>';
    assert.equal(share.preparePublishedShareImageHtml(input), expected);
    assert.equal(loaded('jsdom'), true, 'The real HTML processor must load JSDOM at runtime');
    const cachedDom = require.cache[require.resolve('jsdom')];
    assert.equal(share.preparePublishedShareImageHtml(input), expected);
    assert.equal(require.cache[require.resolve('jsdom')], cachedDom);
  `);
});

test("full entrypoint defers OpenAI until its real client factory, preserving class and options", () => {
  runInFreshProcess(`
    assert.equal(loaded('openai'), false);
    const { createDesignerAiOpenAiClient } = require('./lib/designerAi/service.js');
    assert.throws(() => createDesignerAiOpenAiClient(''), error => error.kind === 'missing-secret');
    assert.equal(loaded('openai'), false, 'Invalid configuration must not load the SDK');
    const client = createDesignerAiOpenAiClient(' synthetic-discovery-test-key ');
    assert.equal(loaded('openai'), true);
    assert.equal(client.constructor, require('openai').default);
    assert.equal(client.apiKey, 'synthetic-discovery-test-key');
    assert.equal(client.timeout, 25000);
    assert.equal(client.maxRetries, 1);
    assert.equal(typeof client.responses.create, 'function');
  `);
});

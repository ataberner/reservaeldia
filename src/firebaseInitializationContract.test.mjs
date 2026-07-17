import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

test("Firebase client initialization does not enable duplicate IndexedDB persistence", async () => {
  const source = await readFile(resolve(ROOT, "src/firebase.js"), "utf8");

  assert.equal((source.match(/initializeApp\s*\(/g) || []).length, 1);
  assert.equal((source.match(/getFirestore\s*\(/g) || []).length, 1);
  assert.equal(/enableIndexedDbPersistence\s*\(/.test(source), false);
  assert.equal(/persistentLocalCache\s*\(/.test(source), false);
  assert.equal(/initializeFirestore\s*\(/.test(source), false);
  assert.equal(/setPersistence\s*\(/.test(source), false);
});

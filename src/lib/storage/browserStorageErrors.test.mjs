import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyBrowserStorageError,
  isRecoverableIndexedDbError,
} from "./browserStorageErrors.js";

test("recognizes the exact WebKit IndexedDB connection loss message", () => {
  const error = new DOMException(
    "Connection to Indexed Database server lost. Refresh the page to try again",
    "UnknownError"
  );

  const classification = classifyBrowserStorageError(error);

  assert.equal(classification.isIndexedDbError, true);
  assert.equal(classification.recoverable, true);
  assert.equal(classification.reason, "indexeddb-connection-unavailable");
});

test("recognizes equivalent WebKit IndexedDB internal server failures", () => {
  const error = new DOMException(
    "An internal error was encountered in the Indexed Database server",
    "AbortError"
  );

  assert.equal(isRecoverableIndexedDbError(error), true);
});

test("recognizes AbortError only when IndexedDB evidence is present", () => {
  const error = new DOMException("The IndexedDB transaction was aborted", "AbortError");

  assert.equal(isRecoverableIndexedDbError(error), true);
});

test("does not classify unrelated UnknownError failures as IndexedDB", () => {
  const error = new DOMException("No se pudo cargar la imagen", "UnknownError");

  const classification = classifyBrowserStorageError(error);

  assert.equal(classification.isIndexedDbError, false);
  assert.equal(classification.reason, "unrelated");
});

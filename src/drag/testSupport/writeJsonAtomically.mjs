import { randomUUID } from "node:crypto";
import { openSync, closeSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";

const nativeFs = { openSync, closeSync, writeFileSync, renameSync, unlinkSync };

// Test artifacts only. The previous file stays intact until a complete sibling
// file replaces it. Never unlink the destination to work around a Windows
// rename failure. This protects against write errors, not power-loss durability.
export function writeJsonAtomically(filename, value, { fs = nativeFs } = {}) {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) throw new TypeError("Artifact must be JSON serializable");
  const destination = path.resolve(filename);
  const temporary = path.join(path.dirname(destination),
    `.${path.basename(destination)}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor = null;
  let ownsTemporary = false;
  try {
    descriptor = fs.openSync(temporary, "wx");
    ownsTemporary = true;
    fs.writeFileSync(descriptor, serialized, "utf8");
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporary, destination);
    ownsTemporary = false;
  } catch (error) {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch {}
    }
    if (ownsTemporary) {
      try { fs.unlinkSync(temporary); } catch (cleanupError) {
        if (cleanupError?.code !== "ENOENT") error.cleanupError = cleanupError;
      }
    }
    throw error;
  }
}

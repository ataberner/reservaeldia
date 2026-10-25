// Pure verification for the narrowly authorized provider-object metadata PATCH.
// Object fields and version metadata: https://cloud.google.com/storage/docs/json_api/v1/objects
// ACL fields (including their own opaque etag):
// https://cloud.google.com/storage/docs/json_api/v1/objectAccessControls
// An ACL etag is version evidence, not a grant. Its value need not equal the
// object etag, and a metadata update need not change every ACL etag.

const TOKEN_KEY = 'firebaseStorageDownloadTokens';
const CHECK_NAMES = [
  'identity', 'bucket', 'generation', 'size', 'crc32c', 'md5',
  'metageneration', 'tokenAbsent', 'cacheControl', 'stableMetadata', 'acl',
  'etagChanged', 'updatedAdvanced', 'patchResponseMatches',
];
const has = (value, key) => Object.hasOwn(value, key);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function cloneJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || ancestors.has(value) ||
    (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) {
    throw new Error('metadata_must_be_json');
  }
  ancestors.add(value);
  const copy = Array.isArray(value)
    ? value.map(item => cloneJson(item, ancestors))
    : Object.fromEntries(Object.keys(value).map(key => [key, cloneJson(value[key], ancestors)]));
  ancestors.delete(value);
  return copy;
}

function metadataObject(value) {
  if (!record(value)) throw new Error('metadata_object_required');
  const result = cloneJson(value);
  if (has(result, 'metadata') && !record(result.metadata)) throw new Error('custom_metadata_object_required');
  return result;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const encoded = value => JSON.stringify(canonical(value));
const equal = (left, right) => encoded(left) === encoded(right);

function containsToken(value, tokens) {
  if (typeof value === 'string') return tokens.some(token => value.includes(token));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) =>
    tokens.some(token => key.includes(token)) || containsToken(item, tokens));
}

/** Strip the token before any serialization/encryption; never hash its value. */
export function snapshotMetadata(raw) {
  const object = metadataObject(raw);
  const rawToken = object.metadata?.[TOKEN_KEY];
  if (rawToken !== undefined && rawToken !== null && typeof rawToken !== 'string') {
    throw new Error('metadata_token_must_be_string');
  }
  const tokenPresent = nonempty(rawToken);
  if (object.metadata) delete object.metadata[TOKEN_KEY];
  const tokens = tokenPresent
    ? [...new Set([rawToken, ...rawToken.split(',').map(token => token.trim())].filter(Boolean))]
    : [];
  if (tokens.length && containsToken(object, tokens)) throw new Error('metadata_token_repeated_outside_token_field');
  return {object, tokenPresent};
}

function normalizedAcl(object, ignoreEtags) {
  if (!Array.isArray(object.acl) || object.acl.some(entry => !record(entry))) return null;
  return object.acl.map(entry => {
    const value = {...entry};
    if (ignoreEtags) delete value.etag;
    return canonical(value);
  }).sort((left, right) => {
    const a = encoded(left), b = encoded(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function stableObject(object) {
  const value = cloneJson(object);
  for (const key of ['cacheControl', 'metageneration', 'updated', 'etag']) delete value[key];
  // GCS can omit the now-empty custom metadata map after removing its last key.
  // Normalize only absent versus empty; all other metadata fields remain exact.
  value.metadata ??= {};
  delete value.metadata[TOKEN_KEY];
  if (Array.isArray(value.acl)) value.acl = normalizedAcl(value, true);
  return value;
}

function responseObject(object) {
  const value = cloneJson(object);
  if (Array.isArray(value.acl)) value.acl = normalizedAcl(value, false);
  return value;
}

function unsignedInteger(value, positive = false) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const result = BigInt(value);
  return positive && result === 0n ? null : result;
}

// RFC3339 with nanosecond precision: Date.parse alone would hide a sub-ms
// regression and accepts some invalid calendar dates by normalizing them.
function updatedInstant(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction = '', zone] = match;
  const base = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const milliseconds = Date.parse(base);
  if (!Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day) || date.getUTCHours() !== Number(hour) ||
    date.getUTCMinutes() !== Number(minute) || date.getUTCSeconds() !== Number(second)) return null;
  let offset = 0;
  if (zone !== 'Z') {
    const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4, 6));
    if (hours > 23 || minutes > 59) return null;
    offset = (hours * 60 + minutes) * (zone[0] === '+' ? 1 : -1);
  }
  return BigInt(milliseconds) * 1000000n + BigInt(fraction.padEnd(9, '0') || '0') - BigInt(offset) * 60000000000n;
}

/** Inputs are full JSON metadata objects, including snapshotMetadata(raw).object. */
export function verifyMetadataUpdate(before, after, patchResponse = null) {
  const previous = metadataObject(before), current = metadataObject(after);
  const patch = patchResponse === null ? null : metadataObject(patchResponse);
  const previousAcl = normalizedAcl(previous, true), currentAcl = normalizedAcl(current, true);
  const acl = previousAcl !== null && currentAcl !== null && equal(previousAcl, currentAcl);
  const oldVersion = unsignedInteger(previous.metageneration, true);
  const newVersion = unsignedInteger(current.metageneration, true);
  const oldUpdated = updatedInstant(previous.updated), newUpdated = updatedInstant(current.updated);
  const checks = {
    identity: nonempty(previous.name) && previous.name === current.name,
    bucket: nonempty(previous.bucket) && previous.bucket === current.bucket,
    generation: unsignedInteger(previous.generation, true) !== null && previous.generation === current.generation,
    size: unsignedInteger(previous.size) !== null && previous.size === current.size,
    crc32c: nonempty(previous.crc32c) && previous.crc32c === current.crc32c,
    md5: has(previous, 'md5Hash') === has(current, 'md5Hash') && previous.md5Hash === current.md5Hash &&
      (!has(previous, 'md5Hash') || nonempty(previous.md5Hash)),
    metageneration: oldVersion !== null && newVersion !== null && newVersion === oldVersion + 1n,
    tokenAbsent: !has(current.metadata || {}, TOKEN_KEY),
    cacheControl: current.cacheControl === 'private,no-store',
    stableMetadata: equal(stableObject(previous), stableObject(current)),
    acl,
    etagChanged: nonempty(previous.etag) && nonempty(current.etag) && previous.etag !== current.etag,
    updatedAdvanced: oldUpdated !== null && newUpdated !== null && newUpdated >= oldUpdated,
    patchResponseMatches: patch === null ? null : equal(responseObject(patch), responseObject(current)),
  };
  const versionObservations = {
    // Only attribute an ACL difference to etags when the grant metadata matches.
    // Do not infer permissions from an absent ACL or an opaque version value.
    aclEtagsChanged: acl ? !equal(normalizedAcl(previous, false), normalizedAcl(current, false)) : null,
  };
  return {checks, versionObservations};
}

export function allChecksPass(checks, {allowMissingPatchResponse = false} = {}) {
  if (!record(checks) || !CHECK_NAMES.every(name => has(checks, name))) return false;
  return Object.entries(checks).every(([name, value]) => value === true ||
    (allowMissingPatchResponse === true && name === 'patchResponseMatches' && value === null));
}

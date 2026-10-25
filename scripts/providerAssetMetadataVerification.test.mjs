import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotMetadata, verifyMetadataUpdate, allChecksPass} from './providerAssetMetadataVerification.mjs';

const TOKEN = 'fixture-token-11111111-2222-3333-4444-555555555555';
function fixture() {
  const before = {
    kind: 'storage#object', bucket: 'fixture-bucket', name: 'providers/fixture/photo.html',
    id: 'fixture-bucket/providers/fixture/photo.html/1234567890123456789',
    selfLink: 'https://example.invalid/object/fixture', generation: '1234567890123456789',
    metageneration: '2', size: '4567', crc32c: 'AAAAAA==', md5Hash: 'AAAAAAAAAAAAAAAAAAAAAA==',
    etag: 'object-version-before', updated: '2026-10-24T04:00:00.123456789Z',
    timeCreated: '2026-07-01T00:00:00Z', contentType: 'text/html', cacheControl: 'public,max-age=3600',
    contentDisposition: 'inline', storageClass: 'STANDARD', componentCount: 1,
    temporaryHold: false, eventBasedHold: false,
    customerEncryption: {encryptionAlgorithm: 'AES256', keySha256: 'fixture-non-secret-key-hash'},
    owner: {entity: 'project-owners-fixture', entityId: 'fixture-owner-id'},
    metadata: {firebaseStorageDownloadTokens: TOKEN, internalNote: 'fixture-value'},
    futureField: {nested: ['kept', {exact: true}]},
    acl: [
      {kind: 'storage#objectAccessControl', id: 'acl-owner-id', selfLink: 'https://example.invalid/acl/owner',
        bucket: 'fixture-bucket', object: 'providers/fixture/photo.html', generation: '1234567890123456789',
        entity: 'project-owners-fixture', entityId: 'fixture-owner-id', role: 'OWNER',
        projectTeam: {projectNumber: '123', team: 'owners'}, etag: 'opaque-owner-before'},
      {kind: 'storage#objectAccessControl', id: 'acl-reader-id', selfLink: 'https://example.invalid/acl/reader',
        bucket: 'fixture-bucket', object: 'providers/fixture/photo.html', generation: '1234567890123456789',
        entity: 'domain-example.invalid', domain: 'example.invalid', role: 'READER',
        unknownAclField: {preserved: true}, etag: 'opaque-reader-before'},
    ],
  };
  const after = structuredClone(before);
  delete after.metadata.firebaseStorageDownloadTokens;
  Object.assign(after, {metageneration: '3', cacheControl: 'private,no-store',
    etag: 'object-version-after', updated: '2026-10-24T04:00:01.123456789Z'});
  after.acl[0].etag = 'independent-acl-version-after';
  after.acl[1].etag = 'another-independent-acl-version-after';
  return {before, after};
}

test('accepts the exact metadata change and independent opaque ACL etags', () => {
  const {before, after} = fixture();
  const result = verifyMetadataUpdate(before, after, after);
  assert.equal(allChecksPass(result.checks), true);
  assert.equal(result.versionObservations.aclEtagsChanged, true);
});

test('ACL etags can stay unchanged or partly change; they need not equal the object etag', () => {
  for (const changeOne of [false, true]) {
    const {before, after} = fixture();
    after.acl = structuredClone(before.acl);
    if (changeOne) after.acl[1].etag = 'independent-new-value';
    const result = verifyMetadataUpdate(before, after, after);
    assert.equal(allChecksPass(result.checks), true);
    assert.equal(result.versionObservations.aclEtagsChanged, changeOne);
  }
});

test('ACL ordering and JSON property ordering do not affect either comparison', () => {
  const {before, after} = fixture();
  after.acl.reverse();
  const patch = Object.fromEntries(Object.entries(structuredClone(after)).reverse());
  patch.acl.reverse();
  assert.equal(allChecksPass(verifyMetadataUpdate(before, after, patch).checks), true);
});

const aclChanges = [
  ['entity', acl => { acl[1].entity = 'allUsers'; }],
  ['role', acl => { acl[1].role = 'OWNER'; }],
  ['domain', acl => { acl[1].domain = 'changed.invalid'; }],
  ['entityId', acl => { acl[0].entityId = 'another-id'; }],
  ['projectTeam', acl => { acl[0].projectTeam.team = 'editors'; }],
  ['project number', acl => { acl[0].projectTeam.projectNumber = '999'; }],
  ['ACL id', acl => { acl[0].id = 'different-acl-id'; }],
  ['ACL selfLink', acl => { acl[0].selfLink += '/changed'; }],
  ['ACL unknown field', acl => { acl[1].unknownAclField.preserved = false; }],
  ['ACL add', acl => { acl.push({...acl[1], entity: 'allAuthenticatedUsers'}); }],
  ['ACL remove', acl => { acl.pop(); }],
  ['ACL duplicate', acl => { acl.push({...acl[0]}); }],
];
for (const [name, change] of aclChanges) test(`rejects ${name} changes even when PATCH and GET agree`, () => {
  const {before, after} = fixture();
  change(after.acl);
  const result = verifyMetadataUpdate(before, after, after);
  assert.equal(result.checks.acl, false);
  assert.equal(result.checks.stableMetadata, false);
  assert.equal(allChecksPass(result.checks), false);
});

const protectedChanges = [
  ['object owner', object => { object.owner.entity = 'another-owner'; }],
  ['object id', object => { object.id += '/changed'; }],
  ['object selfLink', object => { object.selfLink += '/changed'; }],
  ['custom metadata', object => { object.metadata.internalNote = 'changed'; }],
  ['custom metadata removed', object => { delete object.metadata.internalNote; }],
  ['custom metadata added', object => { object.metadata.newField = 'value'; }],
  ['contentType', object => { object.contentType = 'text/plain'; }],
  ['encryption', object => { object.customerEncryption.keySha256 = 'different-key'; }],
  ['temporary hold', object => { object.temporaryHold = true; }],
  ['event hold', object => { object.eventBasedHold = true; }],
  ['unknown nested field', object => { object.futureField.nested[1].exact = false; }],
  ['unknown field added', object => { object.additionalUnknown = 'not-authorized'; }],
  ['unknown field removed', object => { delete object.futureField; }],
];
for (const [name, change] of protectedChanges) test(`rejects ${name} changes`, () => {
  const {before, after} = fixture();
  change(after);
  const result = verifyMetadataUpdate(before, after, after);
  assert.equal(result.checks.stableMetadata, false);
  assert.equal(allChecksPass(result.checks), false);
});

const invalidChanges = [
  ['name', after => { after.name = 'another-object'; }, 'identity'],
  ['bucket', after => { after.bucket = 'another-bucket'; }, 'bucket'],
  ['generation', after => { after.generation = '1234567890123456790'; }, 'generation'],
  ['size', after => { after.size = '4568'; }, 'size'],
  ['CRC32C', after => { after.crc32c = 'BBBBBB=='; }, 'crc32c'],
  ['MD5', after => { after.md5Hash = 'BBBBBBBBBBBBBBBBBBBBBB=='; }, 'md5'],
  ['same metageneration', after => { after.metageneration = '2'; }, 'metageneration'],
  ['skipped metageneration', after => { after.metageneration = '4'; }, 'metageneration'],
  ['invalid metageneration', after => { after.metageneration = 'three'; }, 'metageneration'],
  ['remaining token', after => { after.metadata.firebaseStorageDownloadTokens = TOKEN; }, 'tokenAbsent'],
  ['null token key', after => { after.metadata.firebaseStorageDownloadTokens = null; }, 'tokenAbsent'],
  ['cache policy', after => { after.cacheControl = 'public,max-age=1'; }, 'cacheControl'],
  ['unchanged object etag', (after, before) => { after.etag = before.etag; }, 'etagChanged'],
  ['empty object etag', after => { after.etag = ''; }, 'etagChanged'],
  ['invalid updated', after => { after.updated = 'not-a-date'; }, 'updatedAdvanced'],
  ['invalid calendar updated', after => { after.updated = '2026-02-30T00:00:00Z'; }, 'updatedAdvanced'],
  ['earlier updated', after => { after.updated = '2026-10-24T03:59:59Z'; }, 'updatedAdvanced'],
  ['earlier nanosecond updated', after => { after.updated = '2026-10-24T04:00:00.123456788Z'; }, 'updatedAdvanced'],
  ['missing ACL', after => { delete after.acl; }, 'acl'],
];
for (const [name, change, check] of invalidChanges) test(`rejects ${name}`, () => {
  const {before, after} = fixture();
  change(after, before);
  const result = verifyMetadataUpdate(before, after, after);
  assert.equal(result.checks[check], false);
  assert.equal(allChecksPass(result.checks), false);
});

test('equal updated instant and large metagenerations are valid', () => {
  const {before, after} = fixture();
  before.metageneration = '9007199254740993';
  after.metageneration = '9007199254740994';
  after.updated = '2026-10-24T01:00:00.123456789-03:00';
  assert.equal(allChecksPass(verifyMetadataUpdate(before, after, after).checks), true);
});

test('missing optional MD5 is preserved, not synthesized', () => {
  const {before, after} = fixture();
  delete before.md5Hash;
  delete after.md5Hash;
  assert.equal(allChecksPass(verifyMetadataUpdate(before, after, after).checks), true);
  after.md5Hash = 'unexpected-new-value';
  assert.equal(allChecksPass(verifyMetadataUpdate(before, after, after).checks), false);
});

test('PATCH and GET must match all fields, including object and ACL etags', () => {
  for (const change of [
    patch => { patch.etag = 'different-object-etag'; },
    patch => { patch.acl[0].etag = 'different-acl-etag'; },
    patch => { patch.futureField.nested[1].exact = false; },
    patch => { patch.metageneration = '4'; },
  ]) {
    const {before, after} = fixture(), patch = structuredClone(after);
    change(patch);
    const result = verifyMetadataUpdate(before, after, patch);
    assert.equal(result.checks.patchResponseMatches, false);
    assert.equal(allChecksPass(result.checks, {allowMissingPatchResponse: true}), false);
  }
});

test('missing PATCH response is allowed only by the explicit reconciliation option', () => {
  const {before, after} = fixture();
  const {checks} = verifyMetadataUpdate(before, after);
  assert.equal(checks.patchResponseMatches, null);
  assert.equal(allChecksPass(checks), false);
  assert.equal(allChecksPass(checks, {allowMissingPatchResponse: true}), true);
  assert.equal(allChecksPass({}), false);
  const partial = {...checks};
  delete partial.acl;
  assert.equal(allChecksPass(partial, {allowMissingPatchResponse: true}), false);
  assert.equal(allChecksPass({...checks, extraSafetyCheck: false}, {allowMissingPatchResponse: true}), false);
});

test('snapshot is independent, removes only the token, and serializes no token', () => {
  const {before, after} = fixture();
  const original = structuredClone(before), snapshot = snapshotMetadata(before);
  assert.equal(snapshot.tokenPresent, true);
  assert.equal(Object.hasOwn(snapshot.object.metadata, 'firebaseStorageDownloadTokens'), false);
  assert.equal(JSON.stringify(snapshot).includes(TOKEN), false);
  assert.deepEqual(snapshot.object.customerEncryption, before.customerEncryption);
  assert.deepEqual(snapshot.object.owner, before.owner);
  assert.deepEqual(snapshot.object.futureField, before.futureField);
  assert.equal(allChecksPass(verifyMetadataUpdate(snapshot.object, after, after).checks), true);
  snapshot.object.acl[0].role = 'READER';
  snapshot.object.futureField.nested.push('local-only');
  assert.deepEqual(before, original);
  assert.equal(snapshotMetadata(after).tokenPresent, false);
});

test('normalizes only missing versus empty metadata after removing its sole token', () => {
  const {before, after} = fixture();
  delete before.metadata.internalNote;
  delete after.metadata;
  const snapshot = snapshotMetadata(before);
  assert.deepEqual(snapshot.object.metadata, {});
  assert.equal(allChecksPass(verifyMetadataUpdate(snapshot.object, after, after).checks), true);
});

test('snapshot refuses a token repeated in any other field or key without echoing it', () => {
  for (const leak of [
    value => { value.metadata.copy = TOKEN; },
    value => { value.futureField.nested.push(`https://example.invalid/?token=${TOKEN}`); },
    value => { value[TOKEN] = 'sensitive-key'; },
  ]) {
    const {before} = fixture();
    leak(before);
    assert.throws(() => snapshotMetadata(before), error =>
      error.message === 'metadata_token_repeated_outside_token_field' && !error.message.includes(TOKEN));
  }
});

test('snapshot detects an individual token from a comma-separated token value', () => {
  const {before} = fixture();
  before.metadata.firebaseStorageDownloadTokens = `${TOKEN},fixture-second-token-value`;
  before.futureField.copy = 'fixture-second-token-value';
  assert.throws(() => snapshotMetadata(before), /metadata_token_repeated_outside_token_field/);
});

test('invalid JSON or custom metadata aborts with a data-free error', () => {
  const {before, after} = fixture();
  before.futureField.cyclic = before;
  assert.throws(() => snapshotMetadata(before), {message: 'metadata_must_be_json'});
  after.metadata = null;
  assert.throws(() => verifyMetadataUpdate(fixture().before, after), {message: 'custom_metadata_object_required'});
});

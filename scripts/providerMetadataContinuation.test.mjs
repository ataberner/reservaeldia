import test from "node:test";
import assert from "node:assert/strict";
import { createReader } from "./inventoryLegacyDrafts.mjs";
import { TARGET, InventoryError, makePseudonymizer } from "./draftInventoryModel.mjs";
import { initialState } from "./inventoryContinuation.mjs";
import { PROVIDER_FIELDS, assertProviderReadRequest, sanitizeProvider, imageReference, runProviders, providerSummary, captureFlaggedMetadata, flaggedMetadataGuard, captureNamespaceRoots, namespaceRootGuard } from "./providerMetadataContinuation.mjs";
const root = `https://firestore.googleapis.com/v1/projects/${TARGET.project}/databases/(default)/documents`;
const pseudonym = makePseudonymizer(Buffer.alloc(32, 3));
const query = () => ({ structuredQuery: { from: [{ collectionId: "proveedores" }], select: { fields: PROVIDER_FIELDS.map(fieldPath => ({ fieldPath })) },
  orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit: 10 } });

test("provider guard accepts only its exact fixed projection and cursor", () => {
  assert.doesNotThrow(() => assertProviderReadRequest(`${root}:runQuery`, "POST", query()));
  for (const mutate of [q => q.structuredQuery.from[0].collectionId = "usuarios", q => q.structuredQuery.select.fields.push({fieldPath:"contacto"}),
    q => q.structuredQuery.limit = 100, q => q.structuredQuery.startAt = {before:false,values:[{referenceValue:"other-project/private"}]}]) {
    const body = query(); mutate(body); assert.throws(() => assertProviderReadRequest(`${root}:runQuery`, "POST", body), InventoryError);
  }
  for (const [url,method] of [[`${root}:runQuery`,"GET"],[`${root}:commit`,"POST"],["https://untrusted.invalid","POST"]])
    assert.throws(() => assertProviderReadRequest(url, method, query()), InventoryError);
});

test("default transport guard stays strict and injected provider guard changes no HTTP behavior", async () => {
  let requests = 0;
  const fetchImpl = async (_url, options) => { requests++; assert.equal(options.method,"POST"); assert.equal(options.redirect,"error"); return new Response("[]",{status:200}); };
  await assert.rejects(createReader({token:"synthetic",fetchImpl}).request(`${root}:runQuery`,{method:"POST",body:query()}),InventoryError);
  assert.equal(requests,0);
  assert.deepEqual(await createReader({token:"synthetic",fetchImpl,requestGuard:assertProviderReadRequest}).request(`${root}:runQuery`,{method:"POST",body:query()}),[]);
  assert.equal(requests,1);
});

test("image references match names and token aliases without persisting raw URLs or tokens", () => {
  const name = "proveedores/synthetic-provider/image.webp", token = "synthetic-secret-token";
  const result = imageReference(`https://firebasestorage.googleapis.com/v0/b/${TARGET.bucket}/o/${encodeURIComponent(name)}?alt=media&token=${token}`,"url",pseudonym);
  assert.equal(result.targetName,name); assert.equal(result.tokenAliases[0],pseudonym("token",token));
  assert.doesNotMatch(JSON.stringify(result),/synthetic-secret-token|https:|alt=media/);
  assert.equal(imageReference("https://evil.invalid/private?token=secret","url",pseudonym).kind,"external_or_unrecognized_url");
});

test("provider projection discards array map private fields and classifies visibility without ownership inference", () => {
  const fields = {estado:{stringValue:"importado"},activo:{booleanValue:true},visible:{booleanValue:false},imagenes:{mapValue:{fields:{
    galeria:{arrayValue:{values:[{mapValue:{fields:{storagePath:{stringValue:"proveedores/synthetic/a.webp"},alt:{stringValue:"private-person"},urlOriginal:{stringValue:"https://private.invalid"}}}}]}}
  }}}};
  const row=sanitizeProvider({name:`projects/${TARGET.project}/databases/(default)/documents/proveedores/synthetic`,fields},pseudonym);
  assert.equal(row.publicEligible,false); assert.equal(row.refs[0].field,"imagenes.galeria[0].storagePath");
  assert.doesNotMatch(JSON.stringify(row),/private-person|private.invalid|urlOriginal/);
});

test("provider pagination resumes exact checkpoint and exposes only safe matches", async () => {
  const state=initialState({target:TARGET});state.stage="complete";const calls=[];
  state.objects=[{name:"proveedores/synthetic/image.webp",alias:"synthetic-object-alias",generation:"1",life:"live",exposure:{downloadTokenPresent:true},tokenAliases:[]}];
  const reader={usage:{requests:0,bytes:0},request:async(url,options)=>{
    assertProviderReadRequest(url,"POST",options.body);calls.push(options.body);reader.usage.requests++;reader.usage.bytes+=10;
    const resumed=options.body.structuredQuery.startAt;
    return Array.from({length:resumed?1:10},(_,i)=>({document:{name:`projects/${TARGET.project}/databases/(default)/documents/proveedores/private-${resumed?10:i}`,fields:{estado:{stringValue:"importado"}}}}));
  }};
  let checkpoint;
  await runProviders(state,reader,value=>{checkpoint=structuredClone(value);},{maxPages:1});
  assert.equal(checkpoint.providerInventory.done,false);assert.equal(checkpoint.providerInventory.rows.length,10);
  await runProviders(checkpoint,reader,()=>{},{maxPages:1});
  assert.equal(checkpoint.providerInventory.done,true);assert.equal(checkpoint.providerInventory.rows.length,11);
  assert.equal(calls[1].structuredQuery.startAt.values[0].referenceValue,state.providerInventory.cursor);
  assert.doesNotMatch(JSON.stringify(providerSummary(checkpoint)),/private-|proveedores\/synthetic/);
});

test("HTTP errors remain redacted under injected guard", async () => {
  const reader=createReader({token:"synthetic",requestGuard:assertProviderReadRequest,fetchImpl:async()=>new Response("private raw body token=secret",{status:403})});
  await assert.rejects(reader.request(`${root}:runQuery`,{method:"POST",body:query()}),error=>error instanceof InventoryError && error.message==="remote_403");
});

test("flagged metadata requests are exact generation reads, resumable, with checksum private", async () => {
  const state=initialState({target:TARGET});state.stage="complete";state.bucket={uniformBucketLevelAccess:false};
  const name="proveedores/synthetic/image.webp";
  state.objects=[{name,alias:pseudonym("object",name),generation:"123",metageneration:"2",stage:"proveedores_versions",exposure:{downloadTokenPresent:true},tokenAliases:[]}];
  const guard=flaggedMetadataGuard(state);let requests=0;
  const reader={usage:{requests:0,bytes:0},request:async(address,options)=>{
    guard(address,"GET",undefined);assert.equal(new URL(address).searchParams.get("generation"),"123");assert.equal(new URL(address).searchParams.has("alt"),false);
    assert.throws(()=>guard(address+"&alt=media","GET"),InventoryError);assert.throws(()=>guard(address,"PATCH",{}),InventoryError);
    requests++;reader.usage.requests++;reader.usage.bytes+=100;
    return {name,generation:"123",metageneration:"2",crc32c:"AAAAAA==",md5Hash:"AAAAAAAAAAAAAAAAAAAAAA==",metadata:{firebaseStorageDownloadTokens:"synthetic-secret"},acl:[]};
  }};
  await captureFlaggedMetadata(state,reader,()=>{});await captureFlaggedMetadata(state,reader,()=>{});
  assert.equal(requests,1);assert.equal(state.flaggedMetadata.rows[0].crc32c,"AAAAAA==");
  const summary=JSON.stringify(providerSummary(state));assert.doesNotMatch(summary,/synthetic-secret|AAAAAA==|proveedores\/synthetic/);
});

test("namespace root probes allow only two exact current metadata URLs and preserve 404 versus failure", async () => {
  const state=initialState({target:TARGET});state.bucket={uniformBucketLevelAccess:false};const guard=namespaceRootGuard(state);let requests=0;
  const reader={usage:{requests:0,bytes:0},request:async(address)=>{
    guard(address,"GET");assert.throws(()=>guard(address+"&alt=media","GET"),InventoryError);assert.throws(()=>guard(address,"DELETE"),InventoryError);
    requests++;reader.usage.requests++;
    if (new URL(address).pathname.endsWith("/borradores")) throw new InventoryError("remote_404");
    return {name:"proveedores",generation:"1",metageneration:"1",metadata:{firebaseStorageDownloadTokens:"synthetic-private-token"},acl:[]};
  }};
  await captureNamespaceRoots(state,reader,()=>{});await captureNamespaceRoots(state,reader,()=>{});
  assert.equal(requests,2);assert.equal(state.namespaceRootMetadata.done,true);
  assert.equal(state.namespaceRootMetadata.rows[0].present,false);assert.equal(state.namespaceRootMetadata.rows[1].present,true);
  assert.doesNotMatch(JSON.stringify(providerSummary(state)),/synthetic-private-token/);
  assert.equal(providerSummary(state).namespaceRoots.complete,true);
  state.namespaceRootMetadata.rows[1].exposure.aclObservation="unobserved";
  assert.equal(providerSummary(state).namespaceRoots.complete,false);
  const failed=initialState({target:TARGET});failed.bucket={};
  await captureNamespaceRoots(failed,{usage:{requests:0,bytes:0},request:async()=>{throw new InventoryError("remote_403");}},()=>{});
  assert.equal(failed.namespaceRootMetadata.done,false);assert.equal(failed.namespaceRootMetadata.rows.length,0);
});

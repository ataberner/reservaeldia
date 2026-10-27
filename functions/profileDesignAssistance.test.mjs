import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const require=createRequire(import.meta.url);
const {cleanEnvironment}=require("../scripts/local/session.cjs");
const configuredBuildRoot=process.env.PROFILE_ASSISTANCE_BUILD_ROOT;
const testContext=process.env.NODE_TEST_CONTEXT;
const environment=cleanEnvironment(path.join(root,".local-isolation/profile-assistance-unit"));
for(const name of Object.keys(process.env))delete process.env[name];
Object.assign(process.env,environment);
if(testContext)process.env.NODE_TEST_CONTEXT=testContext;
require("../scripts/local/networkGuard.cjs");
const buildRoot=configuredBuildRoot || path.join(root,"functions");
const load=createRequire(path.join(buildRoot,"package.json"));
const {FieldValue,Timestamp}=load("firebase-admin/firestore");
const {ensureAdminApp}=load("./lib/firebaseAdmin.js");
const app=ensureAdminApp();
const db=app.firestore(),auth=app.auth();
const documents=new Map(),users=new Map();
let writes=0,analyticsCalls=0;
function materialize(value){
 if(value&&typeof value.isEqual==="function"&&value.isEqual(FieldValue.serverTimestamp()))return Timestamp.fromMillis(1800000000000);
 if(Array.isArray(value))return value.map(materialize);
 if(value&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,materialize(child)]));
 return value;
}
function merge(old,next){
 const result={...old};
 for(const[key,value]of Object.entries(next)){
  result[key]=value&&Object.getPrototypeOf(value)===Object.prototype?merge(result[key]||{},value):value;
 }
 return result;
}
const snapshot=key=>({id:key.split("/").at(-1),exists:documents.has(key),data:()=>documents.get(key)});
function document(key){return {path:key,get:async()=>snapshot(key),set:async(value,options)=>{
 writes++;documents.set(key,options?.merge?merge(documents.get(key)||{},materialize(value)):materialize(value));
}};}
db.collection=name=>({doc:id=>document(name+"/"+id)});
auth.getUser=async uid=>{assert.ok(users.has(uid));return users.get(uid);};
auth.updateUser=async(uid,patch)=>{users.set(uid,{...users.get(uid),...patch});};
load("./lib/analytics/service.js").recordBusinessAnalyticsEvent=async()=>{analyticsCalls++;};
const handlers=load("./lib/index.js");
const profile={nombre:"Persona",apellido:"Sintética",fechaNacimiento:"1990-02-03"};
const request=(data,uid="owner")=>({data,...(uid?{auth:{uid,token:{}}}:{})});
users.set("owner",{uid:"owner",email:"owner@example.test",displayName:"Persona",providerData:[],metadata:{}});

test("the actual callable preserves ownership, optionality and old-client data",async()=>{
 const emailRequest={requested:true,whatsapp:null};
 let result=await handlers.upsertUserProfile.run(request({...profile,uid:"victim",designAssistance:emailRequest}));
 assert.deepEqual(result.profile.designAssistance,emailRequest);
 assert.equal(result.profile.uid,"owner");
 assert.equal(result.profile.email,"owner@example.test");
 assert.equal(documents.has("usuarios/victim"),false);
 assert.equal(documents.get("usuarios/owner").designAssistance.updatedAt.toMillis(),1800000000000);
 assert.equal(analyticsCalls,1);
 let status=await handlers.getMyProfileStatus.run(request({}));
 assert.equal(status.profileComplete,true);
 assert.deepEqual(status.profile.designAssistance,emailRequest);
 await handlers.upsertUserProfile.run(request({...profile,designAssistance:{requested:true,whatsapp:"+54 9 (11) 1234-5678"}}));
 const saved=documents.get("usuarios/owner").designAssistance;
 documents.get("usuarios/owner").uiPreferences={assistantTourOptOut:true};
 await handlers.upsertUserProfile.run(request(profile));
 assert.deepEqual(documents.get("usuarios/owner").designAssistance,saved);
 assert.equal(documents.get("usuarios/owner").uiPreferences.assistantTourOptOut,true);
 status=await handlers.getMyProfileStatus.run(request({}));
 assert.deepEqual(status.profile.designAssistance,{requested:true,whatsapp:"+5491112345678"});
 await handlers.upsertUserProfile.run(request({...profile,designAssistance:{requested:false,whatsapp:"+5491112345678"}}));
 status=await handlers.getMyProfileStatus.run(request({}));
 assert.deepEqual(status.profile.designAssistance,{requested:false,whatsapp:null});
 assert.equal(status.profileComplete,true);
});

test("bad consent, bad phone and anonymous callers perform no writes",async()=>{
 const before=writes;
 for(const designAssistance of [null,[],{requested:"true"},{requested:true,whatsapp:"bad"},{requested:true,whatsapp:24}]){
  await assert.rejects(handlers.upsertUserProfile.run(request({...profile,designAssistance})),error=>error.code==="invalid-argument");
 }
 for(const name of ["upsertUserProfile","getMyProfileStatus","listUsersDirectory","getUserDirectoryDetail"]){
  await assert.rejects(handlers[name].run(request(profile,null)),error=>error.code==="unauthenticated");
 }
 for(const name of ["listUsersDirectory","getUserDirectoryDetail"]){
  await assert.rejects(handlers[name].run(request({uid:"owner"})),error=>error.code==="permission-denied");
 }
 assert.equal(writes,before);
});

test.after(async()=>{await app.delete();});

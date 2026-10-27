import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import React, {act} from "react";
import swc from "next/dist/build/swc/index.js";

const require=createRequire(import.meta.url);
const {JSDOM}=require("../../../functions/node_modules/jsdom");
const source=readFileSync(new URL("./ProfileCompletionModal.js",import.meta.url),"utf8");
const {code}=await swc.transform(source,{
  filename:"ProfileCompletionModal.js",
  jsc:{parser:{syntax:"ecmascript",jsx:true},transform:{react:{runtime:"automatic"}}},
  module:{type:"commonjs"}
});
const module={exports:{}};
new Function("require","module","exports",code)(id=>{
  if(id==="./ProfileCompletionModal.module.css")return new Proxy({},{get:(_,key)=>String(key)});
  return require(id);
},module,module.exports);
const Modal=module.exports.default;

test("profile dialog submits explicit optional consent and preserves inputs through failures",async()=>{
  const dom=new JSDOM('<!doctype html><html><body><button id="previous">Previous</button><div id="root"></div></body></html>',{url:"https://fixture.invalid"});
  const previousDescriptors=new Map();
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,
    HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){
    previousDescriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  const {createRoot}=await import("react-dom/client");
  const root=createRoot(document.getElementById("root"));
  const submissions=[];
  let reject=false,finish;
  const initialValues={nombre:"Sofía",apellido:"Martínez",fechaNacimiento:"1996-06-15"};
  const props={initialValues,onSubmit:async payload=>{
    submissions.push(payload);
    if(reject)throw Error("Fallo sintético");
    if(finish===null)await new Promise(resolve=>{finish=resolve;});
  }};
  const submit=()=>act(async()=>document.querySelector("form").dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true})));
  const click=selector=>act(async()=>document.querySelector(selector).click());
  const change=async(selector,value)=>act(async()=>{
    const input=document.querySelector(selector);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(input,value);
    input.dispatchEvent(new window.Event("input",{bubbles:true}));
  });
  try{
    document.getElementById("previous").focus();
    await act(async()=>root.render(React.createElement(Modal,props)));
    assert.equal(document.activeElement.getAttribute("role"),"dialog");
    assert.equal(document.body.style.overflow,"hidden");
    assert.match(document.body.textContent,/sin costo adicional/);
    assert.match(document.body.textContent,/por tu cuenta/);
    assert.doesNotMatch(document.body.textContent,/Si no dejás tu número/);
    assert.equal(document.getElementById("profile-assistance").checked,false);
    assert.equal(document.getElementById("profile-whatsapp"),null);
    await submit();
    assert.deepEqual(submissions.at(-1).designAssistance,{requested:false,whatsapp:null});
    await click("#profile-assistance");
    assert.equal(document.getElementById("profile-whatsapp").required,false);
    await submit();
    assert.deepEqual(submissions.at(-1).designAssistance,{requested:true,whatsapp:null});
    await change("#profile-whatsapp","invalid");
    await submit();
    assert.equal(submissions.length,2);
    assert.ok(document.getElementById("profile-whatsapp-error"));
    await change("#profile-whatsapp","+54 9 11 1234 5678");
    await submit();
    assert.deepEqual(submissions.at(-1).designAssistance,{requested:true,whatsapp:"+5491112345678"});
    reject=true;
    await submit();
    assert.match(document.querySelector('[role="alert"]').textContent,/Fallo sintético/);
    assert.equal(document.querySelector('[type="submit"]').disabled,false);
    assert.equal(document.getElementById("profile-whatsapp").value,"+54 9 11 1234 5678");
    reject=false;
    await click("#profile-assistance");
    await submit();
    assert.deepEqual(submissions.at(-1).designAssistance,{requested:false,whatsapp:null});
    finish=null;
    const before=submissions.length;
    await submit();
    assert.equal(document.querySelector('[type="submit"]').disabled,true);
    await submit();
    assert.equal(submissions.length,before+1);
    await act(async()=>finish());
    await change("#profile-nombre","");
    await submit();
    assert.equal(submissions.length,before+1);
    assert.ok(document.getElementById("profile-nombre-error"));
    await act(async()=>root.unmount());
    assert.equal(document.body.style.overflow,"");
    assert.equal(document.activeElement.id,"previous");
  }finally{
    try{await act(async()=>root.unmount());}catch{}
    dom.window.close();
    for(const [key,descriptor]of previousDescriptors){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
  }
});

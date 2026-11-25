import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionApi} from '../public/reader/session-api.js';
const pdf=name=>({name:name+'.pdf',bytes:new TextEncoder().encode('%PDF-1.7 '+name)});
const api=()=>createSessionApi({confirmRemoval:()=>true});
test('original PDF bytes survive caller mutations and transferred parser copies',async()=>{
 const a=api(),input=pdf('source'),original=input.bytes.slice(),r=await a.importPdf(input);input.bytes.fill(0);
 const opened=await a.openSavedReport(r.id);assert.deepEqual(opened.bytes,original);
 structuredClone(opened.bytes,{transfer:[opened.bytes.buffer]});
 assert.deepEqual((await a.openSavedReport(r.id)).bytes,original);
 const list=await a.listReports();assert.equal(list[0].documents[0].bytes,undefined);list[0].documents[0].name='changed';assert.equal((await a.listReports())[0].documents[0].name,'source.pdf');
});
test('each tab starts empty and repeated imports do not duplicate the report',async()=>{
 const a=api(),b=api(),r=await a.importPdf(pdf('a'));assert.equal((await a.importPdf(pdf('a'))).id,r.id);assert.equal((await a.listReports()).length,1);assert.deepEqual(await b.listReports(),[]);
});
test('adding Argus sources retains report identity, originals, and import date',async()=>{
 const a=api(),files=['analyst','a6','options'].map(pdf),one=await a.importBundle({documents:files.slice(0,1)});
 await a.saveSnapshot({id:one.id,snapshot:{version:2,items:[{raw:'1'}]}});
 const full=await a.importBundle({documents:files,updateId:one.id});assert.equal(full.id,one.id);assert.equal(full.importedAt,one.importedAt);assert.equal(full.documents.length,3);assert.equal(await a.getSnapshot(one.id),null);
 assert.deepEqual((await a.openSavedReport(one.id)).documents.map(d=>d.bytes),files.map(d=>d.bytes));
});
test('invalid or incomplete Argus updates leave the previous source set intact',async()=>{
 const a=api(),r=await a.importBundle({documents:[pdf('analyst')]});
 await assert.rejects(a.importBundle({updateId:r.id,documents:[pdf('a6')]}),/Keep the current/);
 await assert.rejects(a.importBundle({updateId:r.id,documents:[pdf('analyst'),pdf('analyst')]}),/same PDF/);
 await assert.rejects(a.importPdf({name:'broken.pdf',bytes:new Uint8Array([1,2,3,4,5,6])}),/valid PDF/);
 assert.equal((await a.listReports()).length,1);assert.equal((await a.openSavedReport(r.id)).documents.length,1);
});
test('snapshots remain distinct copies and clear removes all report data',async()=>{
 const a=api(),r=await a.importPdf(pdf('snapshot')),s={version:2,items:[{raw:'(1.23)',period:'2040',basis:'GAAP'}]};
 await a.saveSnapshot({id:r.id,snapshot:s});s.items[0].raw='altered';assert.equal((await a.getSnapshot(r.id)).items[0].raw,'(1.23)');
 const second=await a.getSnapshot(r.id);second.items=[];assert.equal((await a.getSnapshot(r.id)).items.length,1);
 a.clearSession();assert.equal(a.hasReports(),false);await assert.rejects(a.getSnapshot(r.id),/no longer/);await assert.rejects(a.openSavedReport(r.id),/no longer/);assert.deepEqual(await a.listReports(),[]);
});
test('clearing during an import prevents late completion from restoring it',async()=>{
 const a=api(),pending=a.importPdf(pdf('pending'));a.clearSession();await assert.rejects(pending,/session was cleared/);assert.deepEqual(await a.listReports(),[]);
});
test('canceling removal keeps the report; confirming removes only that report',async()=>{
 let yes=false;const a=createSessionApi({confirmRemoval:()=>yes}),r=await a.importPdf(pdf('a')),other=await a.importPdf(pdf('b'));
 assert.equal((await a.removeReport({id:r.id,name:'a'})).removed,false);assert.equal((await a.listReports()).length,2);yes=true;
 assert.equal((await a.removeReport({id:r.id,name:'a'})).removed,true);assert.deepEqual((await a.listReports()).map(x=>x.id),[other.id]);
});
test('original PDF opens as a temporary blob at requested page and clear revokes it',async()=>{
 const a=api(),r=await a.importPdf(pdf('source')),tab={location:{},close(){}};
 const previous=globalThis.window;globalThis.window={open:()=>tab};
 try{await a.openOriginalPdf({id:r.id,page:7});assert.match(tab.location.href,/#page=7$/);const url=tab.location.href.split('#')[0];assert.equal((await fetch(url)).status,200);a.clearSession();await assert.rejects(fetch(url));}
 finally{globalThis.window=previous;a.clearSession();}
});

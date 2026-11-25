import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,cp,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const root=new URL('../',import.meta.url);
test('shipped PDF engine and worker both match the documented vendor release',async()=>{
 const meta=await readFile(new URL('public/reader/vendor/VERSION.md',root),'utf8');
 for(const file of ['pdf.min.mjs','pdf.worker.min.mjs']){
  const hash=createHash('sha256').update(await readFile(new URL('public/reader/vendor/'+file,root))).digest('hex');
  assert.ok(meta.includes('`'+file+'`: `'+hash+'`'),file+' does not match vendor/VERSION.md');
 }
});
test('website packaging refuses unexpected private artifacts before producing a ZIP',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'reader-package-'));
 try{
  for(const name of ['public','package-release.py','package.json'])await cp(new URL(name,root),path.join(dir,name),{recursive:true});
  await writeFile(path.join(dir,'public','research-notes.json'),'{"fictional":true}');
  const proc=spawnSync('python3',['package-release.py','--site-only','upload.zip'],{cwd:dir,encoding:'utf8'});
  assert.notEqual(proc.status,0);assert.match(proc.stderr,/Unapproved website asset: research-notes\.json/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

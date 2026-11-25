// Private opt-in: the local manifest and expected rows are data, never executable code.
// Add new layouts by editing the manifest and golden rows outside the repository.
import assert from 'node:assert/strict';
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
import {extractPdfDocument} from '../public/reader/pdf-document.js';
import {analyzeReport} from '../public/reader/parser.js';
import {detectResearchDocument,parseArgusDocument} from '../public/reader/argus-parser.js';
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
const pdfjs=await import('../public/reader/vendor/pdf.min.mjs');
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../public/reader/vendor/pdf.worker.min.mjs',import.meta.url).href;
assert.ok(process.env.READER_HANDOFF,'Set READER_HANDOFF to the private folder containing corpus-manifest.json, table-goldens.json, and reports/.');
const root=await realpath(process.env.READER_HANDOFF);
const json=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
const {companies}=await json('corpus-manifest.json'),{tables:gold}=await json('table-goldens.json');assert.ok(companies.length && gold.length);
const verified=new Set();let count=0,rows=0,values=0;
for(const {ticker,files} of companies)for(const [type,relative] of Object.entries(files)){
 const location=await realpath(path.resolve(root,relative));assert.ok(location.startsWith(root+path.sep),'Reference reports must stay inside the private folder');
 const pdf=await extractPdfDocument(pdfjs,new Uint8Array(await readFile(location)));
 const actualType=detectResearchDocument(pdf.text).type;assert.equal(actualType,type.replaceAll('_','-'),ticker+' source');
 const report=actualType==='morningstar'?analyzeReport(pdf.text,{}, {document:pdf,fileName:path.basename(location)}):parseArgusDocument({...pdf,rawText:pdf.text,fileName:path.basename(location)});
 assert.equal(report.ticker,ticker);const tables=actualType==='morningstar'?[...report.forecastModel.tables,...report.forecastModel.supplementalTables]:report.tables;
 const checks=gold.filter(g=>g.type===type&&g.ticker===ticker);assert.ok(checks.length,ticker+' '+type+' has no independently checked rows');
 for(const g of checks){const t=tables.find(t=>t.id===g.table),label=[ticker,type,g.table].join(' / ');
   assert.ok(t,label);assert.equal(t.sourcePage,g.page,label+' page');assert.deepEqual(t.columns.map(c=>c.label??c),g.columns,label+' periods');
   for(const spec of g.rows){
     const row=t.rows.find(r=>r.label===spec.metric);assert.ok(row,label+' / '+spec.metric);assert.deepEqual(row.values,spec.values,label+' / '+spec.metric);
     if(spec.unit!==undefined)assert.equal(row.unit,spec.unit,label+' units');
     if(spec.periodTypes)assert.deepEqual((row.columnMeta??t.columnMeta??t.columns).map(c=>c.period),spec.periodTypes,label+' actual/forecast');
     rows++;values+=spec.values.length;
   }
   verified.add(g);
 }
 count++;
}
assert.equal(verified.size,gold.length,'Goldens with no corresponding input report');
console.log('Matched '+count+' PDFs, '+verified.size+' source tables, '+rows+' independently checked rows and '+values+' printed cells.');

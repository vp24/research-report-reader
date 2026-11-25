import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
import {continuedMorningstar,pdfFromPages} from './sample-pdf.mjs';
import {extractPdfDocument} from '../public/reader/pdf-document.js';
import {analyzeReport,buildPlainTextSummary} from '../public/reader/parser.js';
import {createSnapshot} from '../public/reader/report-comparison.js';
import {parseArgusDocument} from '../public/reader/argus-parser.js';
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
const pdfjs=await import('../public/reader/vendor/pdf.min.mjs');
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../public/reader/vendor/pdf.worker.min.mjs',import.meta.url).href;
async function load(opts){const d=await extractPdfDocument(pdfjs,new Uint8Array(continuedMorningstar(opts)));return analyzeReport(d.text,{}, {document:d});}
const revenue=r=>r.forecastModel.importantMetrics.groups.flatMap(g=>g.metrics).filter(m=>m.id==='revenue');
test('a repeated model section keeps every year and each number’s original source',async()=>{
 const r=await load(),rows=revenue(r);assert.equal(rows.length,1);
 assert.deepEqual(rows[0].series.map(c=>[c.year,c.period,c.value,c.sourcePage]),[['2034','actual','11.20',2],['2035','actual','12.30',2],['2036','forecast','(0.40)',3],['2037','forecast','0',3]]);
 const t=r.forecastModel.tables;assert.equal(new Set(t.map(t=>t.id)).size,t.length);
 const rev=r.forecastModel.importantMetrics.revisions.metrics.find(m=>m.id==='revenue');
 assert.deepEqual(rev.pairs,[{year:'2036',current:'17.30',prior:'19.10'},{year:'2037',current:'20.80',prior:'--'}]);
 assert.match(buildPlainTextSummary(r),/Revenue 2037: current 20.80; prior --.*p\. 5/);
});
test('changed editions, currency scales and conflicting values are kept as independent source rows',async()=>{
 for(const options of [{unit:'USD Mil'},{date:'1 Jun 2036'},{overlap:true}]){
  const r=await load(options),rows=revenue(r);assert.equal(rows.length,2,JSON.stringify(options));
  assert.equal(rows[0].series[0].sourcePage,2);assert.equal(rows[1].series[0].sourcePage,3);
  assert.equal(r.forecastModel.importantMetrics.coverage.found,3,'two distinct financials and one revision, regardless of the number of pages');
  if(options.overlap)assert.ok(r.captureIssues.some(i=>/conflict/i.test(i.reason)&&i.sourcePage===3));
 }
});
test('a printed continuation marker retains the original table family',async()=>{
 const r=await load({heading:'Financials (continued)'});
 assert.deepEqual(revenue(r)[0].series.map(c=>c.year),['2034','2035','2036','2037']);
});
test('reordered Morningstar headings keep their own currency, date, and PDF page',async()=>{
 const headers=[[32,715,'Economic Moat'],[165,715,'Fair Value Estimate'],[335,715,'Last Price'],[485,715,'Price/FVE']];
 for(const [moat,price,expected,status] of [['None','56.00 CAD','56.00 CAD','label-aligned'],['N/A','','','check source'],['Narrow','--','--','source-missing']]){
  const bytes=pdfFromPages([[[32,744,'Morningstar Equity Analyst Report'],[32,720,'Report as of 18 Aug 2036'],[32,700,'Invented Paper (TEST)']],
   [...headers,[32,699,moat],[165,699,'82.40 CAD'],...(price?[[335,699,price]]:[]),[485,699,'0.68'],[165,688,'4 Feb 2036 01:26, UTC'],[335,688,'12 Aug 2036']]]);
  const doc=await extractPdfDocument(pdfjs,new Uint8Array(bytes)),report=analyzeReport(doc.text,{}, {document:doc}),p=report.factEvidence;
  assert.equal(p.fairValue.value,'82.40 CAD');assert.equal(p.fairValue.date,'4 Feb 2036 01:26, UTC');assert.equal(p.fairValue.sourcePage,2);assert.ok(p.fairValue.sourceBounds);
  assert.equal(report.facts.economicMoat,moat);assert.equal(p.economicMoat.status,moat==='N/A'?'source-missing':'label-aligned');
  assert.equal(report.facts.priceFairValue,'0.68');assert.equal(p.currentPrice.value,expected||null);assert.equal(p.currentPrice.date,price?'12 Aug 2036':null);assert.equal(p.currentPrice.status,status);
  if(!price){assert.equal(p.currentPrice.sourceBounds,null);assert.ok(report.captureIssues.some(e=>e.metric==='Last Price'));}
  assert.match(buildPlainTextSummary(report),/82\.40 CAD · 4 Feb 2036 01:26, UTC · p\. 2/);
  const entry=createSnapshot({id:'synthetic'},report,'morningstar').items.find(i=>i.label==='fairValue');assert.equal(entry.sourcePage,2);assert.equal(entry.modelDate,p.fairValue.date);
 }
});
test('conflicting Argus headline values are preserved separately without assigning an arbitrary target',async()=>{
 const bytes=pdfFromPages([[[34,750,'Argus Analyst Report'],[34,720,'Invented Paper'],[310,720,'(NYSE: TEST)'],[34,690,'Report Created May 05, 2036'],[34,660,'Target Price'],[350,660,'$142.00']],
 [[34,735,'Other scenarios'],[34,710,'Target Price'],[350,710,'$156.00']]]);
 const doc=await extractPdfDocument(pdfjs,new Uint8Array(bytes));const report=parseArgusDocument({...doc,rawText:doc.text,type:'argus-analyst'});
 assert.equal(report.targetPrice,null);assert.equal(report.factEvidence.targetPrice,undefined);
 assert.deepEqual(report.sourceFacts.filter(f=>f.metric==='Target Price').map(f=>[f.raw,f.sourcePage]),[['$142.00',1],['$156.00',2]]);
 assert.ok(report.captureIssues.some(i=>i.metric==='Target Price'&&i.reason.includes('1, 2')));
});
test('a historical series cannot override or conflict with the single-value Argus overview',async()=>{
 const bytes=pdfFromPages([[[34,740,'Argus Analyst Report'],[34,713,'Example Instruments'],[310,713,'(NYSE: EXIQ)'],[34,690,'Revenue'],[200,690,'142.00'],[300,690,'153.00']],
 [[34,735,'Company Financials'],[34,710,'Revenue'],[350,710,'$27.20 Billion']]]);
 const doc=await extractPdfDocument(pdfjs,new Uint8Array(bytes)),report=parseArgusDocument({...doc,rawText:doc.text,type:'argus-analyst'});
 assert.equal(report.revenueTtm,'$27.20 Billion');assert.equal(report.factEvidence.revenueTtm.sourcePage,2);
 assert.ok(!report.captureIssues.some(i=>i.metric==='Revenue'));
});

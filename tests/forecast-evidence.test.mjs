import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMMatrix, ImageData, Path2D} from '@napi-rs/canvas';
import {extractPdfDocument} from '../public/reader/pdf-document.js';
import {parseArgusDocument,combineParsedArgusReports,buildArgusPlainTextSummary} from '../public/reader/argus-parser.js';
import {analyzeReport} from '../public/reader/parser.js';
import {chartExample,continuedMorningstar} from './sample-pdf.mjs';
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
const pdfjs=await import('../public/reader/vendor/pdf.min.mjs');
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../public/reader/vendor/pdf.worker.min.mjs',import.meta.url).href;
const pdf=bytes=>extractPdfDocument(pdfjs,new Uint8Array(bytes));
async function argus(opts){const d=await pdf(chartExample(opts));return parseArgusDocument({...d,rawText:d.text,type:'argus-analyst'});}
test('one missing quarterly label preserves the entire annual series and the other five quarters',async()=>{
 const r=await argus({quarterGap:true});
 assert.deepEqual(r.marketData.annual?.rows[0]?.values,['120.50','128.00']);
 const row=r.marketData.quarterly.rows[0];assert.equal(row.label,'EPS (EUR)');assert.deepEqual(row.values,['10.01',null,'12.03','(1.40)','0','N/A']);
 assert.equal(row.cells[1].period,'2041 Q2');assert.equal(row.cells[1].status,'not-captured');assert.equal(row.cells[1].sourceBounds,null);
 assert.equal(row.cells[4].value,0);assert.equal(row.cells[5].status,'source-missing');assert.equal(row.cells[5].sourcePrecision,'value');
 assert.ok(r.captureIssues.some(x=>x.reason.includes('2041 Q2')));
 assert.match(buildArgusPlainTextSummary(combineParsedArgusReports([r])),/10\.01\tNot captured\t12\.03/);
});
test('one missing annual label does not discard quarters, and does not turn an unmarked year into an actual',async()=>{
 const r=await argus({annualGap:true,marked:false});assert.deepEqual(r.marketData.annual?.rows[0]?.values,[null,'128.00']);
 const q=r.marketData.quarterly.rows[0];assert.equal(q.values.length,6);assert.equal(q.values[1],'11.02');assert.ok(q.cells.every(c=>c.periodType==='not specified'));
 assert.equal(r.marketData.annual.rows[0].cells[1].periodType,'not specified');
});
test('even with the expected total number of labels, a duplicate in one quarter cannot fill its empty neighbor',async()=>{
 const r=await argus({collision:true}),row=r.marketData.quarterly?.rows[0];
 assert.deepEqual(row?.values,['10.01',null,null,'(1.40)','0','N/A']);
 assert.equal(row.cells[2].validation,'review-alignment');assert.equal(row.cells[2].sourceBounds,null);
 assert.ok(r.captureIssues.some(v=>v.reason.includes('2041 Q3')&&v.rawValues.includes('71.80')&&!v.rawValues.includes('10.01')));
 assert.equal(row.cells[0].validation,'aligned');
});
test('one Morningstar figure highlights only its printed number, and current and previous revisions have separate boxes',async()=>{
 const d=await pdf(continuedMorningstar()),r=analyzeReport(d.text,{}, {document:d});
 const revenue=r.forecastModel.importantMetrics.groups.flatMap(g=>g.metrics).find(m=>m.id==='revenue');
 const rev=r.forecastModel.importantMetrics.revisions.metrics.find(m=>m.id==='revenue');
 const center=i=>({x:i.x+i.width/2,y:i.y-i.height/2});
 function inside(b,p){return b&&p.x>=b.left&&p.x<=b.right&&p.y>=b.top&&p.y<=b.bottom;}
 const actual=revenue.series[0];assert.equal(actual.sourcePrecision,'value');
 const items=d.pages[actual.sourcePage-1].items;assert.ok(inside(actual.sourceBounds,center(items.find(i=>i.text==='11.20'))));assert.ok(!inside(actual.sourceBounds,center(items.find(i=>i.text==='12.30'))));
 const entry=rev.pairSources['2037'],p=d.pages[entry.page-1],cur=center(p.items.find(i=>i.text==='20.80')),prev=center(p.items.find(i=>i.text==='--'));
 assert.ok(inside(entry.current.sourceBounds,cur));assert.ok(!inside(entry.current.sourceBounds,prev));assert.ok(inside(entry.prior.sourceBounds,prev));assert.ok(!inside(entry.prior.sourceBounds,cur));
});

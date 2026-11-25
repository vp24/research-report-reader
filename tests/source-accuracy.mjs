// Optional source validation: READER_CORPUS=/path/to/private/PDFs npm run test:source.
// PDFs are inputs only. No company-specific production rule or year is assumed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {extractPdfDocument,positionedLines} from '../public/reader/pdf-document.js';
import {parseArgusDocument} from '../public/reader/argus-parser.js';
import {analyzeReport} from '../public/reader/parser.js';
const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/../package.json':import.meta.url);
Object.assign(globalThis,require('@napi-rs/canvas'));
const pdfjs=await import('../public/reader/vendor/pdf.min.mjs');
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../public/reader/vendor/pdf.worker.min.mjs',import.meta.url).href;
assert.ok(process.env.READER_CORPUS,'Set READER_CORPUS to the private regression PDFs directory.');
const files=await readdir(process.env.READER_CORPUS);
const load=async file=>extractPdfDocument(pdfjs,new Uint8Array(await readFile(path.join(process.env.READER_CORPUS,file))));
const normalize=s=>s?.replace(/\s+/g,' ').trim();
for(const file of files.filter(f=>/_Argus_Analyst\.pdf$/i.test(f)))test(`${file}: categorical summary agrees with independent PDF text, not rating legend`,async()=>{
 const document=await load(file),report=parseArgusDocument({...document,rawText:document.text});
 const source=execFileSync('pdftotext',['-layout',path.join(process.env.READER_CORPUS,file),'-'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
 const rating=source.match(/Sector Rating\s+(OVER\s+WEIGHT|MARKET\s+WEIGHT|UNDER\s+WEIGHT)/i)?.[1];
 const sector=source.slice(source.indexOf('Sector Overview')).match(/\bSector[ \t]{2,}([^\n]+)/i)?.[1];
 assert.ok(rating,'Expected Key Statistics rating in this regression PDF');assert.equal(normalize(report.sectorRating),normalize(rating));
 assert.ok(sector);assert.equal(normalize(report.sector),normalize(sector));
 const shares=source.match(/Shares Outstanding\s+([\d,.]+\s+(?:Thousand|Million|Billion|Trillion))/i)?.[1];
 assert.ok(shares);assert.equal(normalize(report.sharesOutstanding),normalize(shares));
});
const example=files.find(f=>/_Morningstar\.pdf$/i.test(f));assert.ok(example);
const document=await load(example),original=analyzeReport(document.text,{}, {document});
test('Foreign-currency priority rows and revision figures retain every source period and currency',()=>{
 const changed=structuredClone(document);for(const p of changed.pages){for(const item of p.items)item.text=item.text.replace(/\bUSD\b/g,'JPY');p.lines=positionedLines(p.items);}changed.text=changed.text.replace(/\bUSD\b/g,'JPY');
 const report=analyzeReport(changed.text,{}, {document:changed});
 const originalRevisions=original.forecastModel.importantMetrics.revisions.metrics,revisions=report.forecastModel.importantMetrics.revisions.metrics;
 assert.ok(originalRevisions.length);assert.equal(revisions.length,originalRevisions.length);
 for(let i=0;i<revisions.length;i++){assert.equal(revisions[i].unit,'source');assert.match(revisions[i].sourceUnit,/JPY/);assert.deepEqual(revisions[i].pairs,originalRevisions[i].pairs);}
 const financials=report.forecastModel.importantMetrics.groups.find(g=>g.id==='earnings');assert.ok(financials?.metrics.length);
 for(const metric of financials.metrics.filter(m=>/JPY/.test(m.sourceUnit))){assert.equal(metric.unit,'source');assert.ok(metric.series.length);}
});
test('Supplemental sections on separate pages keep exact revision and driver source links',()=>{
 const changed=structuredClone(document),table=original.forecastModel.supplementalTables.find(t=>t.id==='forecastRevisions');assert.ok(table);
 const p=changed.pages.find(p=>p.number===table.sourcePage),rev=p.lines.find(l=>/^Forecast Revisions\b/.test(l.text)),drivers=p.lines.find(l=>/^Key Valuation Drivers\b/.test(l.text));assert.ok(rev&&drivers);
 const first=Math.max(...changed.pages.map(p=>p.number))+1;
 const parts=[{...p,number:first,items:p.items.filter(i=>i.y<rev.y)},{...p,number:first+1,items:p.items.filter(i=>i.y>=rev.y&&i.y<drivers.y)},{...p,number:first+2,items:p.items.filter(i=>i.y>=drivers.y)}];
 for(const part of parts)part.lines=positionedLines(part.items);
 changed.pages=changed.pages.filter(page=>page!==p).concat(parts);changed.pageCount=changed.pages.length;
 const report=analyzeReport(changed.text,{}, {document:changed}),important=report.forecastModel.importantMetrics;
 assert.equal(important.revisions.sourcePage,first+1);assert.ok(important.revisions.metrics.every(m=>m.sourcePage===first+1));
 assert.ok(important.drivers.length);assert.ok(important.drivers.every(m=>m.sourcePage===first+2));
 assert.deepEqual(important.revisions.metrics.map(m=>m.pairs),original.forecastModel.importantMetrics.revisions.metrics.map(m=>m.pairs));
});

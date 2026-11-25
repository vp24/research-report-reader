import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeReport,buildPlainTextSummary} from '../public/reader/parser.js';
import {combineParsedArgusReports,buildArgusPlainTextSummary,parseArgusDocument} from '../public/reader/argus-parser.js';
import {createSessionApi} from '../public/reader/session-api.js';
import {groupColumns,sourceTextValue} from '../public/reader/report-periods.js';

const sample=`Morningstar Equity Analyst Report
Example Instruments (EXIQ)
[[PAGE 5 OF 7]]
Morningstar Valuation Model Summary
Financials as of 13 Mar 2044 Actual Forecast
Fiscal Year, ends 30 Jun 2038A 2039A 2040E 2041E 2042E
Revenue (EUR Bil) 1.0 1.2 (1.45) N/A 0
Net Income (EUR Bil) 2.0 3.0 -- Nil NM
Operating Income (EUR Bil) 2 3 ? 5 6
© Morningstar
[[PAGE 6 OF 7]]
Financial Leverage (Reporting Currency) Actual Forecast
Fiscal Year, ends 30 Jun 2038A 2039A 2040E 2041E 2042E
Net Debt/EBITDA 2.0 1.0 0 (1.2) 1
Forecast Revisions as of 13 Mar 2044 2045 2047
Prior data as of 1 Dec 2043 Prior Current Prior Current
Revenue (EUR Bil) — 0 8 (2)
Net Income (EUR Bil) -- 1 N/A 2
© Morningstar`;
test('priority export retains every printed period, scale, markers and sign',()=>{
 const r=analyzeReport(sample),g=r.forecastModel.importantMetrics.groups[0],m=g.metrics.find(x=>x.id==='revenue');
 assert.equal(m.unit,'source');assert.equal(m.sourceUnit,'EUR Bil');
 assert.deepEqual(m.series.map(x=>x.value),['1.0','1.2','(1.45)','N/A','0']);
 assert.ok(!g.metrics.some(x=>x.id==='operatingIncome'),'A damaged text row must never shift amounts');
 const text=buildPlainTextSummary(r).split('IMPORTANT METRICS')[1].split('FORECAST REVISIONS')[0];
 assert.match(text,/2038 · Actual\t2039 · Actual\t2040 · Forecast\t2041 · Forecast\t2042 · Forecast/);
 assert.match(text,/Revenue\tEUR billions\t1.0\t1.2\t\(1.45\)\tN\/A\t0\t5/);
 assert.match(text,/Net income\tEUR billions\t2.0\t3.0\t--\tNil\tNM/);
});
test('revision dates never become forecast columns and prior/current follow printed order',()=>{
 const r=analyzeReport(sample),v=r.forecastModel.importantMetrics.revisions;
 assert.deepEqual(v.metrics[0].pairs,[{year:'2045',prior:'—',current:'0'},{year:'2047',prior:'8',current:'(2)'}]);
 assert.match(buildPlainTextSummary(r),/Revenue 2045: current 0; prior — \(EUR billions\).*p\. 6/);
 assert.equal(v.priorAsOf,'1 Dec 2043');assert.equal(v.asOf,'13 Mar 2044');
});
test('one fiscal period and same-year actual/estimate are not dropped or guessed',()=>{
 const r=analyzeReport(sample.replace(/Fiscal Year, ends 30 Jun 2038A 2039A 2040E 2041E 2042E\nRevenue \(EUR Bil\) [^\n]+/,'Fiscal Year, ends 30 Jun 2041E\nRevenue (EUR Bil) 4.31'));
 assert.deepEqual(r.forecastModel.tables[0].columns.map(c=>[c.label,c.period]),[['2041','forecast']]);
 const group={metrics:[{series:[{key:'a',label:'2041',period:'actual'},{key:'a',label:'2041',period:'forecast'}]}]};
 assert.equal(groupColumns(group).length,2);
 assert.equal(sourceTextValue(null,'review-alignment'),'Check source alignment');assert.equal(sourceTextValue('—'),'—');assert.equal(sourceTextValue(null),'Not captured');
});
const analyst={type:'argus-analyst',label:'Analyst Report',title:'Example Instruments',ticker:'EXIQ',reportDate:'5 May 2036',rating:'HOLD',targetPrice:'$44',currentPrice:'$41.25',tables:[]};
const a6={type:'argus-a6',label:'A6 Quantitative Report',ticker:'EXIQ',reportDate:'8 May 2036',currentPrice:'—',targetPrice:'$48',scores:[],peerRows:[],tables:[]};
test('newer PDF without a price cannot own an older price; unknown and absent sources stay distinct',()=>{
 const b=combineParsedArgusReports([a6,analyst]);assert.equal(b.latestReport.date,a6.reportDate);
 assert.deepEqual([b.latestPrice,b.latestPriceSource,b.latestPriceReportDate],['$41.25','Analyst Report','5 May 2036']);
 assert.equal(b.targetComparison.a6Upside,null);assert.equal(b.targetComparison.a6Target,'$48');assert.equal(b.targetComparison.analystTarget,'$44');
 const only=combineParsedArgusReports([a6]);assert.equal(only.latestPrice,null);assert.ok(only.completeness.checks.every(c=>c.id.startsWith('a6-')));
 assert.equal(combineParsedArgusReports([{...a6,currentPrice:'$42.60'},analyst]).latestPriceSource,a6.label);
});
test('Argus output preserves provenance for annual and quarterly columns and reviewed rows',()=>{
 const b=combineParsedArgusReports([{...analyst,tables:[{title:'Quarterly',sourcePage:3,columns:['FY39 Q4','FY40 Q1'],columnMeta:[{period:'actual'},{period:'forecast',estimateSource:'Argus'}],rows:[{label:'Invented series',values:['0','(4)']},{label:'Ambiguous',values:[null,null],validation:'review-alignment'}]}]}]);
 const summary=buildArgusPlainTextSummary(b);assert.match(summary,/PDF page 3\nMetric\tFY39 Q4 · actual\tFY40 Q1 · forecast · Argus/);assert.match(summary,/Invented series\t0\t\(4\)/);assert.match(summary,/Ambiguous\tCheck source alignment/);
});
const file=(s,type)=>({name:'report.pdf',sourceType:type,bytes:new TextEncoder().encode('%PDF-1.4 '+s)});
test('different sets with identical file names retain separate identity; reordering deduplicates',async()=>{
 const api=createSessionApi(),a=file('first','argus-analyst'),q=file('second','argus-a6');
 const first=await api.importBundle({documents:[a]});const full=await api.importBundle({documents:[q,a],updateId:first.id});
 const single=await api.importBundle({documents:[a]});assert.notEqual(single.id,full.id);assert.equal(single.documents.length,1);
 assert.equal((await api.importBundle({documents:[a,q]})).id,full.id);
 await assert.rejects(api.importBundle({documents:[a,q],updateId:single.id}),/already open/);
 const tab={location:{},close(){}},previous=globalThis.window;globalThis.window={open:()=>tab};
 try{await api.openOriginalPdf({id:full.id,index:0,sourceType:'argus-analyst',page:4});assert.match(tab.location.href,/#page=4$/);assert.match(await(await fetch(tab.location.href.split('#')[0])).text(),/first$/);}
 finally{globalThis.window=previous;api.clearSession();}
});
test('explicit Argus A/E/F/est. headers override historical defaults; unfamiliar bare years stay unresolved',async()=>{
 const {discoverTextTables}=await import('../public/reader/layout-tables.js');
 for(const [headers,expected] of [['2034A 2035E 2036F 2037 est.',['actual','forecast','forecast','forecast']],['2034 2035',['not specified','not specified']]]){
  const p=discoverTextTables('INVENTED SERIES '+headers+'\nWidgets '+expected.map((_,i)=>i+1).join(' '),'argus-analyst');
  assert.deepEqual(p.tables[0].columnMeta.map(c=>c.period),expected);assert.equal(p.tables[0].rows[0].values.length,expected.length);
 }
});
test('different series in one quarter never inherit the first row’s forecast source',()=>{
 const meta=period=>[{period,...(period==='forecast'&&{estimateSource:'consensus'})}];
 const table={title:'Quarterly estimates',sourcePage:2,columns:['FY45 Q2'],columnMeta:meta('actual'),rows:[{label:'Series A',values:['42'],columnMeta:meta('actual')},{label:'Series B',values:['51'],columnMeta:meta('forecast')}]};
 const b=combineParsedArgusReports([{...analyst,tables:[table]}]);const summary=buildArgusPlainTextSummary(b);
 assert.match(summary,/FY45 Q2 · By row/);assert.match(summary,/Series A\t42 · actual/);assert.match(summary,/Series B\t51 · forecast · consensus/);
});

test('comma-grouped prices and multi-digit option risk ranks are never shortened',()=>{
 const options=parseArgusDocument({type:'argus-options',rawText:'ARGUS Option Report\nCurrent Price: $1,742.50\nTarget Price: $1,900.00\nStrategy Risk Ranking: 10 of 12\nStrategy Risk Ranking: 11'});
 assert.equal(options.currentPrice,'$1,742.50');assert.equal(options.targetPrice,'$1,900.00');assert.equal(options.coveredCall.riskRanking,'10 of 12');assert.equal(options.diagonalSpread.riskRanking,'11');
 const a=parseArgusDocument({type:'argus-analyst',rawText:'Argus Analyst Report\nMarket Overview Price $1,742.50\nTarget Price $1,920.00'});assert.equal(a.currentPrice,'$1,742.50');
});

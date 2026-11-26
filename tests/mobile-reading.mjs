// Runs real browser engines with touch/mobile viewports and generated PDFs, never private files.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir} from 'node:fs/promises';
import {chromium,webkit,devices} from 'playwright';
import {sampleMorningstar,sampleArgus,sampleRevenue,sampleYears,continuedMorningstar,chartExample} from './sample-pdf.mjs';
const engines={chromium:[chromium,'Pixel 7'],webkit:[webkit,'iPhone 13']};
const server=spawn(process.execPath,['dev-server.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
const result=[];
try{
 const [out]=await once(server.stdout,'data');const origin=String(out).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];assert.ok(origin);
 for(const name of (process.env.READER_ENGINES || 'chromium,webkit').split(',')){
  const [engine,device]=engines[name],browser=await engine.launch(name==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--disable-dev-shm-usage']}:{});
  try{
   const page=await browser.newPage({...devices[device],reducedMotion:'reduce'});
   const errors=[],sent=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   page.on('request',r=>{if(!['GET','HEAD'].includes(r.method())||!r.url().startsWith(origin+'/')&&!/^(blob:|data:)/.test(r.url()))sent.push(r.method()+' '+r.url());});
   const mark=s=>{console.log('PASS',name,device,s);result.push(s);};
   const pick=async(id,...buffers)=>{const wait=page.waitForEvent('filechooser');await page.locator(id).tap();const f=await wait;await f.setFiles(buffers.map(buffer=>({name:'Report.pdf',mimeType:'application/pdf',buffer})));};
   const loaded=()=>page.waitForFunction(()=>document.querySelector('#status-pill').textContent==='In this session'&&!document.querySelector('#open-pdf').disabled);
   const tap=s=>page.locator(s).tap();
   const open=sel=>page.locator(sel).waitFor({state:'visible'});
   const back=async(id)=>{await page.evaluate(()=>history.back());await page.locator(id).waitFor({state:'hidden'});};
   const count=()=>page.evaluate(async()=>(await window.desktopApi.listReports()).length);
   const sized=async sel=>assert.ok((await page.locator(sel).boundingBox()).height>=44,sel+' should be a touch target');
   const noSideScroll=async sel=>assert.ok(await page.locator(sel).evaluate(e=>e.scrollWidth<=e.clientWidth+1),sel+' overflows');
   const chooseMetric=async re=>{const match=await page.locator('#metric-choice option').evaluateAll((opts,pattern)=>opts.find(o=>new RegExp(pattern,'i').test(o.parentElement.label+' / '+o.label))?.value,re);assert.notEqual(match,undefined,re);await page.locator('#metric-choice').selectOption(match);};
   const capture=async label=>{if(process.env.READER_SCREENSHOTS){await mkdir(process.env.READER_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.READER_SCREENSHOTS+'/'+name+'-'+label+'.png'});}};
   await page.goto(origin);await open('#quick-open-pdf');await sized('#quick-open-pdf');await capture('open');
   await tap('#welcome-install');assert.ok(await page.locator('#install-dialog').isVisible());await tap('#install-dialog header button');
   await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:p=>{window.receivedShare=p;return Promise.resolve();}}));
   await tap('.phone-shortcuts [data-share-reader]');assert.deepEqual(await page.evaluate(()=>window.receivedShare),{title:'Research Report Reader',url:origin+'/'});
   await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:undefined}));
   await tap('.phone-shortcuts [data-share-reader]');assert.equal(await page.locator('#reader-public-url').inputValue(),origin+'/');await tap('#share-reader-dialog header button');
   await tap('#toggle-sidebar');assert.equal(await page.evaluate(()=>document.activeElement.id),'close-library');await tap('#close-library');
   await pick('#quick-open-pdf',sampleMorningstar());await loaded();assert.equal(await count(),1);assert.equal(await page.locator('#provider-dialog').isVisible(),false);
   await tap('#mobile-forecast-jump');const panel=page.locator('#priority-grid .year-focus-control');await panel.locator('select').selectOption('2037');await panel.locator('.metric-reader-trigger').tap();
   await open('#metric-reader');await chooseMetric('financials / revenue');assert.deepEqual(await page.locator('.series-value strong').allTextContents(),sampleRevenue);
   assert.deepEqual(await page.locator('.series-period strong').allTextContents(),sampleYears);
   assert.deepEqual(await page.locator('.series-period small').allTextContents(),['Actual','Actual','Actual','Forecast','Forecast','Forecast','Forecast']);assert.match(await page.locator('#metric-series-context').innerText(),/EUR (bil|billion)/i);
   await sized('.metric-series li:first-child .metric-line');await noSideScroll('#metric-reader');await capture('metric');
   mark('one-tap import; readable touch targets; all seven years, signs, units, zero and N/A survive a one-year table filter');
   const line=page.locator('.metric-line').last();await line.tap();await page.waitForFunction(()=>document.querySelector('#source-viewer').dataset.renderedPage==='2');
   assert.match(await page.locator('.source-evidence').innerText(),/17\.80/);await back('#source-viewer');assert.equal(await page.locator('#metric-reader').isVisible(),true);
   assert.equal(await page.locator('.series-value strong').last().textContent(),'17.80');await back('#metric-reader');assert.equal(await panel.locator('select').inputValue(),'2037');assert.equal(await count(),1);
   mark('phone Back returns from the exact PDF value to the metric and then the filtered table, with the session intact');
   await pick('#toolbar-add-report',continuedMorningstar());await loaded();await page.locator('#priority-grid .revision-table').waitFor({state:'attached'});assert.equal(await count(),2);
   await tap('#mobile-forecast-jump');await panel.locator('.metric-reader-trigger').tap();await chooseMetric('revisions / revenue');
   assert.deepEqual(await page.locator('.series-value strong').allTextContents(),['17.30','19.10','20.80','--']);
   assert.match(await page.locator('.metric-line').last().innerText(),/Previous forecast · 9 Feb 2036/);
   await page.locator('.metric-line').last().tap();await page.waitForFunction(()=>document.querySelector('#source-viewer').dataset.renderedPage==='5');await tap('#source-close');await tap('.metric-close');
   await page.locator('#metric-reader').waitFor({state:'hidden'});await page.waitForFunction(()=>!history.state?.readerPanel);assert.equal(await page.locator('#metric-choice option').count(),0);
   mark('current and prior revisions retain separate dates, source pages, and the original missing marker; Close releases the detail view');
   await pick('#toolbar-add-report',sampleArgus('analyst'));await loaded();await open('#add-argus-sources');
   const current=await page.evaluate(async()=>(await window.desktopApi.listReports()).find(r=>r.provider==='Argus').id);await tap('#add-argus-sources');
   await pick('#argus-add-files',sampleArgus('a6'),sampleArgus('options'));await page.waitForFunction(()=>document.querySelectorAll('#argus-import-slots .added').length===3);await tap('#argus-open-report');await loaded();
   const entry=await page.evaluate(async id=>(await window.desktopApi.listReports()).find(r=>r.id===id),current);assert.equal(entry.documents.length,3);assert.equal(await count(),3);
   const targets=await page.locator('.argus-target-card').allInnerTexts();assert.match(targets[0],/1,200/);assert.match(targets[1],/1,320/);
   mark('one Argus file opens immediately; two more complete the same entry with separately attributed targets');
   await pick('#toolbar-add-report',sampleArgus('analyst'),sampleMorningstar());await open('#operation-error');assert.equal(await count(),3);await tap('#dismiss-error');
   await pick('#toolbar-add-report',chartExample({marked:false,collision:true}));await loaded();await page.waitForFunction(()=>document.querySelector('#argus-forecasts .metric-reader-trigger')!=null);
   await page.locator('#argus-report-view .phone-jump').tap();await page.locator('#argus-forecasts .metric-reader-trigger').tap();await chooseMetric('quarterly.* / .*');const texts=await page.locator('.series-value strong').allTextContents();
   assert.deepEqual(texts,['10.01','Not captured','Review','(1.40)','0','N/A']);assert.deepEqual(await page.locator('.series-period strong').allTextContents(),['2041 Q1','2041 Q2','2041 Q3','2042 Q1','2042 Q2','2042 Q3']);assert.match(await page.locator('.series-period small').first().innerText(),/not specified/i);
   await page.setViewportSize({width:320,height:650});await noSideScroll('#metric-reader');await noSideScroll('html');
   await page.setViewportSize({width:740,height:340});await noSideScroll('#metric-reader');await page.locator('.metric-line').last().tap();await open('#source-viewer');await tap('#source-close');await tap('.metric-close');await page.waitForFunction(()=>!history.state?.readerPanel);
   mark('a mixed import leaves existing reports intact; quarterly periods, ambiguous values and unclipped data work at 320px and in landscape');
   await page.reload();await open('#quick-open-pdf');await page.waitForFunction(()=>!!window.desktopApi);assert.equal(await count(),0);assert.equal(await page.locator('.metric-series li').count(),0);
   assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.deepEqual(sent,[]);assert.deepEqual(errors,[]);
   mark('refresh clears reports and figure details; no report uploads, cross-origin requests, or page errors');
  }finally{await browser.close();}
 }
 console.log(result.length+' mobile scenarios passed.');
}finally{server.kill();}

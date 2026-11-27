// Static-site acceptance checks. Private regression PDFs are never packaged.
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
assert.ok(process.env.READER_CORPUS,'Set READER_CORPUS to the private regression PDF directory.');
const origin='http://127.0.0.1:9392';
const server=spawn(process.execPath,['dev-server.mjs'],{env:{...process.env,PORT:'9392'},stdio:['ignore','pipe','pipe']});
let logs='',browser,checks=0;server.stderr.on('data',b=>logs+=b);
const errors=[],badResponses=[],dataRequests=[],dialogs=[];
const pass=name=>{checks++;console.log('PASS',name);};
const file=name=>path.join(process.env.READER_CORPUS,name);
const until=async f=>{const end=Date.now()+20000;while(Date.now()<end){if(await f())return;await new Promise(r=>setTimeout(r,80));}throw Error('Server startup timeout '+logs);};
const observe=page=>{
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!/net::ERR_INTERNET_DISCONNECTED/.test(m.text()))errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()});});
 page.on('request',r=>{if(r.method()!=='GET'||r.url().includes('/api/'))dataRequests.push(r.url());});
};
const loaded=async page=>{await page.waitForFunction(()=>document.getElementById('status-pill')?.textContent==='In this session'&&!document.getElementById('open-pdf')?.disabled,{},{timeout:60000});assert.equal(await page.locator('#operation-error').isVisible(),false);};
const choose=async(page,selector,files)=>{const picker=page.waitForEvent('filechooser');await page.locator(selector).click();await(await picker).setFiles(files);};
const noOverflow=async page=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Only tables should scroll horizontally');
try{
 await until(async()=>{try{return(await fetch(origin)).ok;}catch{return false;}});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();observe(page);
 let acceptDialog=true;page.on('dialog',d=>{dialogs.push(d.type());return acceptDialog?d.accept():d.dismiss();});
 await page.goto(origin);await page.locator('#empty-open-morningstar').waitFor();await page.waitForFunction(()=>!!window.desktopApi);
 assert.equal(await page.locator('#sign-out,#account-email').count(),0);assert.match(await page.locator('.empty-library-note').innerText(),/Refreshing or closing/);pass('Public mobile reader opens with clear session-only wording and no account');
 await choose(page,'#empty-open-morningstar',[file('PYPL_Morningstar.pdf')]);await loaded(page);
 assert.equal(await page.locator('#priority-grid table').first().locator('thead th').count(),9);await noOverflow(page);pass('Morningstar import retains all eight actual and forecast years');
 await page.locator('[data-scroll-target="priority-section"]').first().click();const table=page.locator('#priority-grid .key-metrics-table-scroll').first();await table.scrollIntoViewIfNeeded();assert.ok(await table.evaluate(e=>e.scrollWidth>e.clientWidth));await table.evaluate(e=>e.scrollLeft=e.scrollWidth);assert.ok(await table.evaluate(e=>e.scrollLeft>0));pass('Phone table scroll reaches the final forecast year');
 await page.locator('#toggle-sidebar').click();assert.equal(await page.locator('#workspace').evaluate(e=>e.inert),true);await page.locator('#close-library').click();assert.equal(await page.locator('#workspace').evaluate(e=>e.inert),false);pass('Phone report drawer opens and closes without covering active controls');
 await table.evaluate(e=>e.scrollLeft=0);await page.locator('#priority-grid td[data-evidence]').first().click();await page.waitForFunction(()=>document.getElementById('source-viewer').dataset.renderedPage);assert.ok(await page.locator('#source-canvas').isVisible());await page.locator('#source-close').click();pass('An individual number opens the original PDF source page');
 await page.setViewportSize({width:320,height:720});await noOverflow(page);assert.equal(await page.locator('#toggle-sidebar').evaluate(b=>b.getBoundingClientRect().right>document.querySelector('.top-title').getBoundingClientRect().left),false);await page.setViewportSize({width:390,height:844});pass('320px and 390px screens retain usable headers and local table scrolling');
 const session=await page.evaluate(()=>window.desktopApi.listReports()),ms=session[0];
 const second=await context.newPage();observe(second);await second.goto(origin);await second.waitForFunction(()=>!!window.desktopApi);assert.deepEqual(await second.evaluate(()=>window.desktopApi.listReports()),[]);assert.equal((await page.evaluate(()=>window.desktopApi.listReports())).length,1);await second.close();pass('A second tab has an independent empty session');
 const storage=await page.evaluate(async()=>({databases:await indexedDB.databases(),local:localStorage.length,session:sessionStorage.length}));assert.deepEqual(storage,{databases:[],local:0,session:0});assert.deepEqual(await context.cookies(),[]);pass('Opening a PDF writes no IndexedDB, local/session storage, or cookies');
 await choose(page,'#toolbar-add-report',[file('JPM_Argus_Analyst.pdf')]);await loaded(page);assert.ok(await page.locator('#add-argus-sources').isVisible());pass('One Argus PDF is enough, with a visible action to add other sources');
 const one=(await page.evaluate(()=>window.desktopApi.listReports())).find(r=>r.provider==='Argus');
 await page.locator('#add-argus-sources').click();await choose(page,'#argus-add-files',[file('JPM_Argus_A6.pdf')]);await page.waitForFunction(()=>document.querySelectorAll('#argus-import-slots .added').length===2);await page.locator('#argus-import-dialog footer [data-close]').click();assert.equal((await page.evaluate(()=>window.desktopApi.listReports())).find(r=>r.provider==='Argus').documents.length,1);pass('Canceling staged Argus additions preserves the open report');
 await page.locator('#add-argus-sources').click();await choose(page,'#argus-add-files',[file('JPM_Argus_A6.pdf'),file('JPM_Argus_Options.pdf')]);await page.locator('#argus-open-report').click();await loaded(page);
 const text=await page.locator('#argus-report-view').innerText();assert.match(text,/370/);assert.match(text,/392/);assert.match(text,/Over Weight/i);await noOverflow(page);
 const full=(await page.evaluate(()=>window.desktopApi.listReports())).find(r=>r.provider==='Argus');assert.equal(full.id,one.id);assert.equal(full.documents.length,3);pass('Adding remaining Argus sources keeps one entry and separate Analyst/A6 values');
 await page.setViewportSize({width:1440,height:1000});await page.locator(`[data-report-id="${ms.id}"]`).click();await loaded(page);assert.equal(await page.locator('#priority-grid table').first().locator('thead th').count(),9);await noOverflow(page);pass('Switching reports within the session retains all source years');
 if(process.env.READER_QA_OUTPUT){await mkdir(process.env.READER_QA_OUTPUT,{recursive:true});await page.screenshot({path:path.join(process.env.READER_QA_OUTPUT,'session-desktop.png')});}
 await context.setOffline(true);await page.locator('#connection-banner').waitFor({state:'visible'});assert.equal(await page.locator('#priority-grid table').first().locator('thead th').count(),9);await context.setOffline(false);pass('Already displayed financial tables remain readable when connectivity drops');
 await page.locator('#install-reader').click();await page.locator('#install-dialog').waitFor({state:'visible'});assert.match(await page.locator('#install-dialog').innerText(),/does not save reports/);await page.locator('#install-dialog button[type=submit]').click();pass('Home-screen instructions explain that installation does not retain PDFs');
 acceptDialog=false;await page.locator('#clear-session').click();await page.waitForFunction(()=>!document.getElementById('open-pdf').disabled);assert.equal((await page.evaluate(()=>window.desktopApi.listReports())).length,2);acceptDialog=true;
 await page.locator('#clear-session').click();await page.waitForFunction(()=>document.getElementById('report-count').textContent==='0');assert.deepEqual(await page.evaluate(()=>window.desktopApi.listReports()),[]);assert.equal(await page.locator('#priority-grid').textContent(),'');assert.equal(await page.locator('#argus-report-view').textContent(),'');assert.equal(await page.locator('#source-page-text').textContent(),'');assert.equal(await page.locator('#clear-session').isDisabled(),true);pass('Clear session can be canceled and fully removes displayed reports when confirmed');
 await choose(page,'#empty-open-morningstar',[file('PYPL_Morningstar.pdf')]);await loaded(page);await page.reload();await page.locator('#empty-state').waitFor({state:'visible'});await page.waitForFunction(()=>!!window.desktopApi);assert.deepEqual(await page.evaluate(()=>window.desktopApi.listReports()),[]);assert.ok(dialogs.includes('beforeunload'));pass('Refreshing warns where supported and opens an empty session');
 await choose(page,'#empty-open-morningstar',[file('PYPL_Morningstar.pdf')]);await loaded(page);await page.goto(origin+'/offline.html');await page.goBack();await page.locator('#empty-state').waitFor({state:'visible'});assert.deepEqual(await page.evaluate(()=>window.desktopApi.listReports()),[]);pass('Leaving and returning with Back does not restore the session');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const cached=await page.evaluate(async()=>{const keys=await caches.keys();return(await Promise.all(keys.map(async k=>(await(await caches.open(k)).keys()).map(r=>new URL(r.url).pathname)))).flat();});assert.deepEqual(cached.sort(),['/offline.html','/offline.js']);pass('Service worker caches only a generic offline screen, never reports');
 await context.setOffline(true);await page.goto(origin,{waitUntil:'domcontentloaded'});assert.match(await page.locator('h1').innerText(),/offline/i);await context.setOffline(false);await page.locator('#retry').click();await page.locator('#empty-state').waitFor({state:'visible'});pass('Offline fallback and retry return to an empty reader');
 const manifest=await(await fetch(origin+'/manifest.webmanifest')).json();for(const icon of manifest.icons)assert.equal((await fetch(origin+icon.src)).status,200);pass('Installation manifest and every launcher icon resolve');
 assert.deepEqual(dataRequests,[]);assert.deepEqual(badResponses,[]);assert.deepEqual(errors,[]);pass('No report uploads, API requests, failed assets, or browser/CSP errors');
 console.log(JSON.stringify({passed:checks,failed:0,browser:browser.version()}));
}catch(e){console.error(e);console.error('Browser errors:',errors);console.error('Failed responses:',badResponses);console.error(logs.slice(-1500));process.exitCode=1;}
finally{await browser?.close();await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);server.kill('SIGTERM');});}

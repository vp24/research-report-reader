import {createSessionApi} from './session-api.js';
import {installComparison} from './report-comparison.js';
import {setupInstall} from './install-reader.js';
const beforeLeave=event=>{event.preventDefault();event.returnValue='';};
window.desktopApi=createSessionApi({onChange:count=>{
 window.removeEventListener('beforeunload',beforeLeave);
 if(count)window.addEventListener('beforeunload',beforeLeave);
 document.getElementById('clear-session').disabled=!count;
}});
setupInstall();installComparison();
await import('./renderer.js');
// Navigating away ends the session, including a subsequent Back restoration.
window.addEventListener('pagehide',()=>{
 window.desktopApi.clearSession();
 document.dispatchEvent(new CustomEvent('reader:session-cleared'));
});
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
const banner=document.getElementById('connection-banner');
const connection=()=>{banner.hidden=navigator.onLine;};
window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();

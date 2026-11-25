const CACHE='reader-shell-v4.6-session';
const OFFLINE=['/offline.html','/offline.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(OFFLINE)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('reader-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  // Cache only the generic offline screen. Never cache report bytes or parsed data.
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));
  else if(event.request.method==='GET'&&new URL(event.request.url).origin===self.location.origin&&OFFLINE.includes(new URL(event.request.url).pathname))event.respondWith(caches.match(event.request).then(cached=>cached || fetch(event.request)));
});

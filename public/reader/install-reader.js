// Optional shortcuts. Sharing sends only the canonical site root, never a PDF,
// filename, active report, query parameters, fragments or account information.
export function setupInstall(){
 const button=document.getElementById('install-reader'),welcome=document.getElementById('welcome-install');
 const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const launchers=[button,welcome].filter(Boolean);
 launchers.forEach(b=>{b.hidden=standalone();});button.textContent='Install / add shortcut';
 const dialog=document.createElement('dialog');dialog.id='install-dialog';dialog.className='access-dialog';dialog.setAttribute('aria-labelledby','install-title');
 dialog.innerHTML='<form method="dialog"><header><h2 id="install-title">Add to Home Screen</h2><button type="submit" aria-label="Close installation instructions">Close</button></header><p id="install-steps"></p><button id="install-now" type="button" hidden>Install reader</button><p id="install-status" role="status"></p><small>An icon does not save reports. Keep the original PDFs. You can always open the reader from its link.</small></form>';
 const android=/Android/i.test(navigator.userAgent),apple=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const iosText='In Safari, tap Share (under More on some layouts), then Add to Home Screen. If offered, turn on Open as Web App and tap Add.';
 const androidText='In Chrome, open the ⋮ menu and choose Install and create shortcut, then Install. Some versions call it Add to Home screen.';
 dialog.querySelector('#install-steps').textContent=apple?iosText:android?androidText:'In Chrome or Edge, use the install option in the address bar or browser menu. On iPhone, use Safari’s Share menu; on Android, use Chrome’s ⋮ menu.';
 document.body.append(dialog);launchers.forEach(b=>b.onclick=()=>dialog.showModal());
 let pending;const native=dialog.querySelector('#install-now'),status=dialog.querySelector('#install-status');
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pending=event;native.hidden=false;});
 native.onclick=async()=>{if(!pending)return;const event=pending;pending=null;native.disabled=true;try{await event.prompt();const choice=await event.userChoice;status.textContent=choice.outcome==='accepted'?'Installation requested.':'You can install it later from your browser menu.';}catch{status.textContent='Use your browser menu to install this website.';}finally{native.hidden=true;native.disabled=false;}};
 window.addEventListener('appinstalled',()=>{launchers.forEach(b=>b.hidden=true);if(dialog.open)dialog.close();});

 const share=document.createElement('dialog');share.className='access-dialog share-reader';share.id='share-reader-dialog';share.setAttribute('aria-labelledby','share-title');
 share.innerHTML='<form method="dialog"><header><h2 id="share-title">Share reader link</h2><button type="submit">Close</button></header><p>Anyone can open this link. Your reports stay in this tab.</p><label for="reader-public-url">Website link</label><input id="reader-public-url" type="url" readonly><button type="button" id="copy-reader-url">Copy link</button><p role="status"></p></form>';
 document.body.append(share);
 const url=new URL('/',location.href).href,field=share.querySelector('input'),note=share.querySelector('[role=status]');field.value=url;
 const selectLink=()=>{field.focus();field.select();field.setSelectionRange(0,field.value.length);};
 share.querySelector('#copy-reader-url').onclick=async()=>{try{await navigator.clipboard.writeText(url);note.textContent='Link copied.';}catch{selectLink();note.textContent='The link is selected. Use Copy on your device.';}};
 document.querySelectorAll('[data-share-reader]').forEach(b=>b.addEventListener('click',async()=>{
   b.closest('details')?.removeAttribute('open');
   if(typeof navigator.share==='function'){
     try{await navigator.share({title:'Research Report Reader',url});return;}catch(e){if(e.name==='AbortError')return;}
   }
   note.textContent='';share.showModal();
 }));
}

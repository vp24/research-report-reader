// Keep installation discoverable even when a browser has no install prompt.
export function setupInstall(){
 const button=document.getElementById('install-reader');
 const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 button.hidden=standalone();button.textContent='Install / add shortcut';
 const dialog=document.createElement('dialog');dialog.id='install-dialog';dialog.className='access-dialog';
 dialog.innerHTML='<form method="dialog"><header><h2>Add to your device</h2><button type="submit" aria-label="Close installation instructions">Close</button></header><p>Open Report Reader from an app icon. No ChatGPT account is needed.</p><p><strong>Android or computer:</strong> In Chrome or Edge, open the browser menu and choose Install or Apps → Install this site as an app. The wording depends on your browser.</p><p><strong>iPhone or iPad:</strong> Open this website in Safari, tap Share, then Add to Home Screen.</p><button id="install-now" type="button" hidden>Install reader</button><p id="install-status" role="status"></p><small>Adding an icon does not save reports. Keep this tab open while reading; refreshing or closing it clears the session. Keep your original PDFs. An internet connection is needed to reopen the website.</small></form>';
 document.body.append(dialog);button.onclick=()=>dialog.showModal();
 let pending;const native=dialog.querySelector('#install-now'),status=dialog.querySelector('#install-status');
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pending=event;native.hidden=false;});
 native.onclick=async()=>{if(!pending)return;const event=pending;pending=null;native.disabled=true;try{await event.prompt();const choice=await event.userChoice;status.textContent=choice.outcome==='accepted'?'Installation requested.':'You can install it later from the browser menu.';}catch{status.textContent='Use your browser menu to install this website.';}finally{native.hidden=true;native.disabled=false;}};
 window.addEventListener('appinstalled',()=>{button.hidden=true;if(dialog.open)dialog.close();});
}

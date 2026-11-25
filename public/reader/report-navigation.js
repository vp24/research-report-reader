// Search the current report view without filtering out data or changing source values.
export function createReportFinder(workspace, getReport) {
  const doc = workspace.ownerDocument, view = doc.defaultView;
  const byId = id => doc.getElementById(id);
  const bar = byId('report-find-bar'), input = byId('report-find-input');
  const count = byId('report-find-count'), previous = byId('report-find-previous'), next = byId('report-find-next');
  let matches = [], position = -1, timer = null;
  let observer;
  function unmark() {
    doc.querySelectorAll('.report-find-match').forEach(mark => {
      const parent=mark.parentNode;
      mark.replaceWith(doc.createTextNode(mark.textContent)); parent?.normalize();
    });
    matches=[]; position=-1;
  }
  function connect() { observer.observe(workspace,{childList:true,subtree:true}); }
  function updateCount() {
    count.textContent = !input.value.trim() ? '' : matches.length ? `${position + 1} of ${matches.length}` : 'No matches in this view';
    previous.disabled = next.disabled = !matches.length;
  }
  function select(index, scroll = true) {
    if (!matches.length) { updateCount(); return; }
    matches[position]?.classList.remove('current-match');
    position=(index + matches.length) % matches.length;
    const match=matches[position]; match.classList.add('current-match');
    let parent=match.parentElement;
    while(parent && parent!==workspace){ if(parent.tagName==='DETAILS')parent.open=true; parent=parent.parentElement; }
    if(scroll) match.scrollIntoView({behavior:'instant',block:'center',inline:'center'});
    updateCount();
  }
  function search(scroll = true) {
    observer.disconnect(); unmark();
    const root=getReport(), query=input.value.trim().toLocaleLowerCase();
    if(root && !root.hidden && query){
      const walker=doc.createTreeWalker(root,view.NodeFilter.SHOW_TEXT);
      const nodes=[];
      while(walker.nextNode()){
        const node=walker.currentNode;
        if(!node.parentElement?.closest('button, nav, script, style, [hidden]') && node.textContent.toLocaleLowerCase().includes(query))nodes.push(node);
      }
      for(const node of nodes){
        const value=node.textContent, lower=value.toLocaleLowerCase(), fragment=doc.createDocumentFragment();
        let start=0, at;
        while((at=lower.indexOf(query,start))!==-1){
          fragment.append(doc.createTextNode(value.slice(start,at)));
          const mark=doc.createElement('mark');mark.className='report-find-match';mark.textContent=value.slice(at,at+query.length);
          fragment.append(mark);matches.push(mark);start=at+query.length;
        }
        fragment.append(doc.createTextNode(value.slice(start)));node.replaceWith(fragment);
      }
    }
    select(0,scroll); updateCount(); connect();
  }
  observer=new view.MutationObserver(() => {
    if(bar.hidden || !input.value.trim())return;
    view.clearTimeout(timer);timer=view.setTimeout(()=>search(false),60);
  });
  connect();
  function close() {
    view.clearTimeout(timer); observer.disconnect(); unmark(); input.value=''; bar.hidden=true; updateCount();connect();
  }
  function open() {
    if(!getReport() || getReport().hidden)return;
    bar.hidden=false; input.focus();input.select();
  }
  byId('find-report').onclick=open;
  byId('report-find-close').onclick=()=>{close();byId('find-report').focus();};
  previous.onclick=()=>select(position-1);next.onclick=()=>select(position+1);
  input.oninput=()=>{view.clearTimeout(timer);timer=view.setTimeout(()=>search(),150);};
  input.onkeydown=event=>{
    if(event.key==='Enter'){event.preventDefault();view.clearTimeout(timer);if(!matches.length)search();else select(position+(event.shiftKey?-1:1));}
    if(event.key==='Escape'){event.preventDefault();close();byId('find-report').focus();}
  };
  doc.addEventListener('keydown',event=>{
    if(event.key.toLowerCase()==='f'&&(event.ctrlKey||event.metaKey)&&!doc.querySelector('dialog[open]')&&!byId('find-report').disabled){event.preventDefault();open();}
  });
  return {close,reset:close};
}

export function installSectionNavigation(workspace) {
  const view=workspace.ownerDocument.defaultView;
  let scheduled=false;
  const links=()=>[...workspace.querySelectorAll('.section-nav [data-scroll-target], .argus-nav a')].filter(link=>!link.closest('[hidden]'));
  const target=link=>workspace.ownerDocument.getElementById(link.dataset.scrollTarget || link.getAttribute('href')?.slice(1));
  function update(){
    scheduled=false;
    const visible=links(); if(!visible.length)return;
    const line=visible[0].closest('nav').getBoundingClientRect().bottom+20;
    let current=visible[0];
    visible.forEach(link=>{if(target(link)?.getBoundingClientRect().top<=line)current=link;});
    if(workspace.scrollTop>0 && workspace.scrollTop+workspace.clientHeight>=workspace.scrollHeight-3)current=visible.at(-1);
    visible.forEach(link=>{if(link===current)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
  }
  function schedule(){if(scheduled)return;scheduled=true;(view.requestAnimationFrame?.bind(view)||view.setTimeout.bind(view))(update);}
  workspace.addEventListener('scroll',schedule,{passive:true});view.addEventListener('resize',schedule);
  new view.MutationObserver(schedule).observe(workspace,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open']});
  workspace.addEventListener('click',event=>{
    const link=event.target.closest('[data-scroll-target], .argus-nav a');if(!link)return;
    const section=target(link);if(!section)return;
    event.preventDefault();if(section.tagName==='DETAILS')section.open=true;
    section.scrollIntoView({behavior:view.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    schedule();
  });
  schedule();
}

// A different view of the same source cells. No series is recalculated, rounded,
// reclassified, or limited to the currently visible fiscal-year filter.
import {periodLabel} from './report-periods.js';

export function installMetricReader(doc, onSource) {
  const el=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
  const dialog=el('dialog','metric-reader');dialog.id='metric-reader';dialog.setAttribute('aria-labelledby','metric-reader-title');
  const header=el('header'),title=el('h2','','Figures by year');title.id='metric-reader-title';
  const closeButton=el('button','metric-close','Close');closeButton.type='button';header.append(title,closeButton);
  const picker=el('div','metric-picker'),label=el('label','','Metric'),select=el('select');select.id='metric-choice';label.htmlFor=select.id;
  const context=el('p','metric-series-context');context.id='metric-series-context';select.setAttribute('aria-describedby',context.id);
  picker.append(label,select,context);
  const scroll=el('div','metric-list-scroll'),list=el('ol','metric-series');list.setAttribute('aria-label','Reported periods');scroll.append(list);
  dialog.append(header,picker,scroll);doc.body.append(dialog);
  let records=[],trigger=null;

  function render(){
    const record=records[select.selectedIndex];list.replaceChildren();if(!record)return;
    const {row,table}=record;
    const cells=Array.from(row.cells).slice(1), headers=Array.from(table.tHead.rows[table.tHead.rows.length-1].cells);
    // A revision table's last header row contains just the period variants.
    const offset=headers.length===cells.length?0:1;
    const rowUnit=row.cells[0]?.querySelector('.metric-unit')?.textContent?.trim();
    const proofFor=td=>td.dataset.evidence ? JSON.parse(td.dataset.evidence) : {};
    const proofs=cells.map(proofFor);
    const specified=v=>v!=null && v!=='' && v!=='not specified' && v!=='unspecified';
    const units=[...new Set(proofs.map(p=>p.unit).filter(specified))];
    const bases=[...new Set(proofs.map(p=>p.basis).filter(specified))];
    const dates=[...new Set(proofs.map(p=>p.modelDate).filter(specified))];
    context.textContent=[table.dataset.seriesGroup,units.length===1?(rowUnit || units[0]):(units.length===0?rowUnit:null),bases.length===1?bases[0]:null,dates.length===1?'Model '+dates[0]:null].filter(Boolean).join(' · ');
    for(const [i,td] of cells.entries()){
      const proof=proofs[i],h=headers[i+offset];
      const rev=proof.variant==='current'||proof.variant==='prior'||td.classList.contains('revision-prior-column')||td.classList.contains('revision-current-column');
      const period=(rev?td.dataset.fiscalYear:proof.period) || h?.querySelector('.metric-period')?.textContent || h?.textContent?.split(' · ')[0] || td.dataset.fiscalYear || 'Period not specified';
      const kind=rev?((proof.variant==='prior'||td.classList.contains('revision-prior-column'))?'Previous forecast':'Current forecast'):proof.kind?periodLabel(proof.kind):h?.querySelector('.metric-period-label')?.textContent || '';
      const details=[kind,proof.estimateSource,rev||dates.length>1?proof.modelDate:null,units.length>1?proof.unit:null,bases.length>1?proof.basis:null].filter(specified).join(' · ');
      const displayed=[...td.childNodes].map(n=>n.nodeType===3||n.nodeName==='MARK'?n.textContent:'').join('').trim();
      // Never turn an ambiguous or unassigned value into an asserted number.
      const ambiguous=proof.validation==='review-alignment'||/^Ambiguous/i.test(proof.status||'');
      const value=ambiguous?'Review':displayed==='Review'||displayed==='Not captured'?displayed:displayed==='·'?'Not in source row':proof.raw!=null?String(proof.raw):displayed||'Not captured';
      const item=el('li'),canOpen=Boolean(td.dataset.sourceType&&td.dataset.sourcePage);
      if(i>0&&proof.kind==='forecast'&&proofs[i-1].kind==='actual')item.className='series-forecast-start';
      const line=el(canOpen?'button':'div','metric-line');if(canOpen)line.type='button';
      const left=el('span','series-period'),right=el('span','series-value');
      left.append(el('strong','',period));if(details)left.append(el('small','',details));
      right.append(el('strong','',value));if(canOpen){
        right.append(el('small','','PDF p. '+td.dataset.sourcePage+' ›'));
        line.addEventListener('click',()=>{line.focus({preventScroll:true});onSource(td);});
      }
      line.append(left,right);item.append(line);list.append(item);
    }
    scroll.scrollTop=0;
  }
  const reset=()=>{records=[];select.replaceChildren();list.replaceChildren();context.textContent='';};
  doc.addEventListener('reader:read-metric',e=>{
    if(dialog.open)return;
    reset();trigger=e.detail.trigger;
    for(const table of e.detail.tables){
      const group=el('optgroup');group.label=table.dataset.seriesGroup || 'Financial table';
      for(const row of table.querySelectorAll('tbody tr[data-series-label]')){
        if(row.cells.length<2)continue;
        const option=el('option','',row.dataset.seriesLabel);
        option.value=String(records.length);group.append(option);records.push({table,row});
      }
      if(group.children.length)select.append(group);
    }
    if(!records.length)return;
    select.selectedIndex=0;render();dialog.showModal();closeButton.focus({preventScroll:true});
  });
  select.addEventListener('change',render);
  closeButton.addEventListener('click',()=>{dialog.close();reset();});
  dialog.addEventListener('close',()=>{if(dialog.open)return;reset();if(trigger?.isConnected&&!trigger.closest('[hidden]'))trigger.focus({preventScroll:true});trigger=null;});
  return {dialog,close(){if(dialog.open)dialog.close();trigger=null;reset();}};
}

// A phone's Back action should dismiss the open reading layer first. The history
// marker contains no report ID, value, filename or route. True navigation still
// triggers the normal session cleanup.
export function installReadingBack(view,dialogs){
  const token=Math.random().toString(36).slice(2),history=view.history;
  const marker='readerPanel',owned=()=>history.state?.[marker]===token;
  const phone=view.matchMedia('(max-width: 760px)'),top=()=>[...dialogs].reverse().find(d=>d.open);
  let armed=false,unwinding=false,leaving=false;
  function sync(){
    if(leaving||unwinding)return;
    try{
      if(top()&&(phone.matches||armed)){
        if(!owned())history.pushState({...history.state,[marker]:token},'');
        armed=true;
      }else if(!top()&&armed&&owned()){
        unwinding=true;history.back();
      }
    }catch{armed=false;unwinding=false;} // Native dialog Close remains available.
  }
  const observer=new view.MutationObserver(sync);
  for(const d of dialogs)observer.observe(d,{attributes:true,attributeFilter:['open']});
  view.addEventListener('popstate',()=>{
    if(leaving)return;
    if(unwinding){unwinding=false;armed=false;sync();return;}
    if(armed&&!owned()){
      armed=false;top()?.close();sync();
    }else if(owned()&&!top()){
      const state={...history.state};delete state[marker];history.replaceState(state,'');armed=false;
    }
  });
  view.addEventListener('pagehide',()=>{leaving=true;armed=false;unwinding=false;});
  view.addEventListener('pageshow',()=>{leaving=false;});
}

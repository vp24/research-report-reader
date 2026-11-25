// All years is the default. Filtering the existing cells preserves their values,
// source links, revision variants and the output of copy/save.
let nextScope=0;
export function tagYear(cell,year){cell.dataset.fiscalYear=year==null?'':String(year);return cell;}
export function addYearFocus(root,insertBefore=null){
 const doc=root.ownerDocument;
 const tables=[...root.querySelectorAll('table')].filter(t=>t.querySelector('thead [data-fiscal-year]'));
 const years=[...new Set(tables.flatMap(t=>[...t.querySelectorAll('thead [data-fiscal-year]')].map(c=>c.dataset.fiscalYear).filter(Boolean)))].sort((a,b)=>Number(a)-Number(b));
 if(years.length<2)return;
 const control=doc.createElement('div');control.className='year-focus-control';
 const label=doc.createElement('label');label.append(doc.createTextNode('Fiscal year'));
 const select=doc.createElement('select');select.setAttribute('aria-label','Fiscal year shown in these tables');
 for(const value of ['',...years]){
   const option=doc.createElement('option');option.value=value;option.textContent=value?'FY '+value:'All years';select.append(option);
 }
 label.append(select);
 const status=doc.createElement('span');status.className='year-focus-note';status.setAttribute('role','status');
 const reset=doc.createElement('button');reset.className='year-focus-reset';reset.type='button';reset.textContent='Show all years';reset.hidden=true;
 control.append(label,status,reset);root.insertBefore(control,insertBefore || root.firstChild);
 const scope=++nextScope;
 const groups=tables.map((table,index)=>{
   const region=table.parentElement;region.id||='fiscal-scope-'+scope+'-'+index;
   const note=doc.createElement('p');note.className='year-focus-empty';note.hidden=true;region.after(note);
   return {table,region,note,cells:[...table.querySelectorAll('[data-fiscal-year]')]};
 });
 const ids=groups.map(g=>g.region.id).join(' ');select.setAttribute('aria-controls',ids);reset.setAttribute('aria-controls',ids);
 function apply(){
   const year=select.value;reset.hidden=!year;
   status.textContent=year?'Showing FY '+year+' wherever the report prints it.':'Actuals and forecasts as printed.';
   for(const {table,region,note,cells} of groups){
     const found=!year||cells.some(c=>c.dataset.fiscalYear===year);
     for(const c of cells)c.hidden=Boolean(year&&c.dataset.fiscalYear!==year);
     table.classList.toggle('year-is-focused',!!year);region.dataset.focusYear=year;
     region.hidden=!found;note.hidden=found;note.textContent=found?'':'No FY '+year+' column in this source table.';
     region.scrollLeft=0;region.dispatchEvent(new doc.defaultView.Event('reader:year-focus'));
   }
 }
 select.addEventListener('change',apply);reset.addEventListener('click',()=>{select.value='';apply();select.focus();});
 apply();
}

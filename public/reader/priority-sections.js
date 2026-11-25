// Keep original tables independently addressable even when the publisher repeats a heading.
import {columnIdentity} from './report-periods.js';
export function identifySourceTables(tables) {
  const totals=new Map(),seen=new Set();
  for(const t of tables){t.familyId??=t.id;totals.set(t.familyId,(totals.get(t.familyId)||0)+1);}
  for(const t of tables){
    const base=t.familyId, stem=base+'-p'+(t.sourcePage||'unknown');
    let id=seen.has(base)?stem:base,seq=2;while(seen.has(id))id=stem+'-'+seq++;
    seen.add(id);t.id=id;
    const counts=new Map();
    for(const c of t.columns||[]){
      const ident=columnIdentity(c),ordinal=counts.get(ident)||0;counts.set(ident,ordinal+1);
      if(ordinal)c.occurrence=ordinal+1;
    }
    if(totals.get(base)>1)t.instanceLabel=[t.title,t.sourcePage&&'p. '+t.sourcePage].filter(Boolean).join(' · ');
  }
}
const unique=a=>[...new Set(a.filter(v=>v!=null && v!==''))];
const context=m=>JSON.stringify([m.id,m.unit,m.sourceUnit||'',m.modelDate||'',m.priorModelDate||'',m.fiscalEnd||'',m.basis||'']);
const parts=m=>m.series||m.pairs;
const key=(m,v)=>m.series?columnIdentity(v):v.year;
const signature=(m,v)=>m.series?JSON.stringify([v.value,v.validation]):JSON.stringify([v.current,v.prior,m.validation]);
function overlapsDiffer(a,b){
  const indexed=new Map(parts(a).map(v=>[key(a,v),signature(a,v)]));
  return parts(b).some(v=>indexed.has(key(b,v))&&indexed.get(key(b,v))!==signature(b,v));
}
// Never interpolate or use the latest edition to fill a different edition. If
// the date is absent or printed figures disagree, keep the source rows apart.
export function collectMetric(partsFound,issues=[]) {
  const rows=[];
  for(const m of partsFound.filter(Boolean)){
    const related=rows.filter(r=>context(r)===context(m));
    const conflicts=related.filter(r=>overlapsDiffer(r,m));
    if(conflicts.length){
      const pages=unique([...conflicts.flatMap(r=>r.sources.map(s=>s.page)),m.sourcePage]);
      issues.push({section:'Key financials',metric:m.label,sourcePage:m.sourcePage,
        reason:'Conflicting figures for the same period were kept in separate rows'+(pages.length?' (PDF pages '+pages.join(', ')+').':'.')});
      m.conflicting=true;conflicts.forEach(r=>r.conflicting=true);
    }
    const merge=!conflicts.length && m.modelDate && related.length===1 && !related[0].conflicting ? related[0]:null;
    if(!merge){rows.push(m);continue;}
    const values=parts(merge),keys=new Set(values.map(v=>key(merge,v)));
    for(const value of parts(m))if(!keys.has(key(m,value))){
      keys.add(key(m,value));values.push(value);
      if(m.pairSources)merge.pairSources[value.year]=m.pairSources[value.year];
    }
    merge.sources.push(...m.sources);
  }
  for(const m of rows){
    m.sourcePages=unique(m.sources.map(s=>s.page));
    if(m.series && m.sources.length>1){
      const byYear=(a,b)=>Number(a.year)-Number(b.year);
      const actual=m.series.filter(c=>c.year&&c.period==='actual').sort(byYear),forecast=m.series.filter(c=>c.year&&c.period==='forecast').sort(byYear);
      m.values={actual:actual.at(-1)?.value??null,near:forecast[0]?.value??null,long:forecast.at(-1)?.value??null};
    }
    if(rows.length>1){
      m.contextNote=[m.modelDate&&'Model '+m.modelDate,m.priorModelDate&&'Prior '+m.priorModelDate,m.fiscalEnd&&'FY ends '+m.fiscalEnd,
        m.basis&&m.basis!=='not specified'&&m.basis,m.sourcePages.length&&'p. '+m.sourcePages.join(', '),m.conflicting&&'Conflicting source values'].filter(Boolean).join(' · ');
    }
  }
  return rows;
}

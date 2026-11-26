// PDF coordinates, in points at scale 1. Never invent a box from a period header.
export function printedBounds(items) {
  if(!items?.length || items.some(i=>![i.x,i.y,i.width,i.height].every(Number.isFinite)||i.width<=0||i.height<=0))return null;
  return {left:Math.min(...items.map(i=>i.x)),top:Math.min(...items.map(i=>i.y-i.height)),
    right:Math.max(...items.map(i=>i.x+i.width)),bottom:Math.max(...items.map(i=>i.y))};
}
export function cellEvidence(row,index) {
  const exact=row.values?.[index]!=null && row.validation!=='review-alignment' && row.cellValidation?.[index]!=='review-alignment' && row.cellBounds?.[index];
  if(exact)return {sourceBounds:exact,sourcePrecision:'value'};
  return row.bounds?{sourceBounds:row.bounds,sourcePrecision:'row'}:{sourceBounds:null,sourcePrecision:'page'};
}
// Work in the printed period bands. A gap remains a gap even when another band
// happens to carry two labels and the total number of tokens looks correct.
export function chartAssignments(tokens,bands) {
  const hits=bands.map(()=>[]),uncertain=new Set(),boundaryTokens=[];
  for(const item of tokens){
    const x=item.x+item.width/2;
    const boundary=bands.findIndex((b,i)=>i>0 && Math.abs(x-b.left)<=Math.min(.75,(b.right-b.left)*.025));
    if(boundary>0){uncertain.add(boundary-1);uncertain.add(boundary);boundaryTokens.push(item);continue;}
    const i=bands.findIndex(b=>x>=b.left&&x<b.right);if(i>=0)hits[i].push(item);
  }
  const cellValidation=hits.map((h,i)=>uncertain.has(i)||h.length>1?'review-alignment':h.length?'aligned':'not-captured');
  const located=hits.map((h,i)=>cellValidation[i]==='aligned'?h[0]:null);
  return {located,values:located.map(x=>x?.text??null),cellBounds:located.map(x=>x?printedBounds([x]):null),
    cellValidation,rawValues:[...boundaryTokens,...hits.flatMap((list,i)=>cellValidation[i]==='review-alignment'?list:[])].map(x=>x.text),validation:cellValidation.every(v=>v==='aligned')?'aligned':'incomplete'};
}

// Read each value under its own printed heading. A missing field must not shift
// a rating, currency or date into the neighboring column.
const normalize=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
const fields={lastprice:'currentPrice',fairvalueestimate:'fairValue',pricefve:'priceFairValue',marketcap:'marketCap',economicmoat:'economicMoat',moattrend:'moatTrend',equitystylebox:'equityStyleBox',uncertainty:'uncertainty',capitalallocation:'capitalAllocation'};
const number=String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const patterns={
 currentPrice:new RegExp(`^(?:[$£€¥]\\s*)?${number}(?:\\s+[A-Z]{3})?$`),
 priceFairValue:new RegExp(`^${number}$`),
 marketCap:new RegExp(`^(?:[$£€¥]\\s*)?${number}(?:\\s+[A-Z]{3})?\\s*(?:Mil|Bil|Tril|M|B|T)$`,'i'),
 economicMoat:/^(?:Wide|Narrow|None)$/i,moatTrend:/^(?:Positive|Stable|Negative)$/i,
 equityStyleBox:/^(?:[1-9]\s+)?(?:Large|Mid|Small)\s+(?:Value|Blend|Growth)$/i,
 uncertainty:/^(?:Very High|Extreme|Medium|High|Low)$/i,capitalAllocation:/^(?:Exemplary|Standard|Poor)$/i};
patterns.fairValue=patterns.currentPrice;
const missing=/^(?:[–—−-]|--|N\/?A)$/i;
const printedDate=/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:\s+\d{1,2}:\d{2}(?:,?\s*[A-Z]{2,5})?)?$/;
function anchors(items){
 const result=[];
 for(let i=0;i<items.length;i++){
   let key,length=1;
   for(let n=Math.min(4,items.length-i);n>=1;n--){
     const name=normalize(items.slice(i,i+n).map(item=>item.text).join(''));
     if(Object.hasOwn(fields,name)){key=fields[name];length=n;break;}
   }
   const last=items[i+length-1];result.push({key,x:items[i].x,end:last.x+last.width,
     label:items.slice(i,i+length).map(v=>v.text).join(' ')});i+=length-1;
 }
 return result;
}
export function morningstarHeadlines(doc) {
 for(const page of doc?.pages||[])for(const line of page.lines){
   const strip=anchors(line.items);
   if(strip.filter(a=>a.key).length<3 || !strip.some(a=>a.key==='fairValue') || !strip.some(a=>a.key==='currentPrice'||a.key==='priceFairValue'))continue;
   const output={},height=Math.max(...line.items.map(i=>i.height||8));
   for(let i=0;i<strip.length;i++){
     const a=strip[i];if(!a.key)continue;
     const left=a.x-1.5,right=(strip[i+1]?.x || page.width)-1.5;
     const nearby=page.lines.filter(l=>l.y>line.y+1 && l.y<=line.y+Math.max(26,height*4)).flatMap(l=>{
       const items=l.items.filter(v=>v.x>=left&&v.x<right);
       return items.length?[{items,text:items.map(v=>v.text.trim()).join(' ').trim(),y:l.y}]:[];
     });
     const first=nearby[0],raw=first?.text||null;
     const ok=raw!=null&&(missing.test(raw)||patterns[a.key]?.test(raw));
     const date=ok?nearby.find(v=>v.y>first.y&&printedDate.test(v.text))?.text:null;
     const bits=first?.items||[],box=bits.length?{left:Math.max(left,bits[0].x-1),right:Math.min(right,Math.max(...bits.map(v=>v.x+v.width))+1),top:Math.min(...bits.map(v=>v.y-v.height))-1,bottom:Math.max(...bits.map(v=>v.y))+2}:null;
     output[a.key]={metric:a.label,raw:ok?raw:null,value:ok?(a.key==='equityStyleBox'?raw.replace(/^[1-9]\s+/,''):raw):null,
       date:date||null,sourcePage:page.number,sourceBounds:ok?box:null,status:!ok?'check source':missing.test(raw)?'source-missing':'label-aligned'};
   }
   return output;
 }
 return {};
}

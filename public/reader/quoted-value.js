// Render a source link only when the extractor can name the exact PDF and page.
export function quotedValue(host,text,sourceType,proof,{reportDate=null}={}){
  host.replaceChildren();
  if(!proof?.sourcePage){host.textContent=String(text??'—');return;}
  const doc=host.ownerDocument,b=doc.createElement('button');b.type='button';b.className='quoted-value';
  b.textContent=String(text??'—');b.dataset.sourceType=sourceType;b.dataset.sourcePage=String(proof.sourcePage);
  const diagnostic=proof.status==='source-missing'||/^(?:N\/?A|[-–—−]{1,2})$/i.test(proof.raw||'')?'The report prints a missing-value marker':proof.status==='check source'?'The value could not be confidently read. Check the printed field.':'Value matched to the printed source label';
  b.dataset.evidence=JSON.stringify({metric:proof.metric,raw:proof.raw,figureDate:proof.date||null,reportDate,sourceBounds:proof.sourceBounds||null,status:diagnostic});
  b.setAttribute('aria-label',`${proof.metric}: ${b.textContent}. View original PDF, page ${proof.sourcePage}.`);host.append(b);
}

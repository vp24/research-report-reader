import { financialValue } from './financial-data.js';

// Source spelling is retained; display units must never turn NM/Nil/N/A into
// percentages or dollars, nor add a second symbol to an already-labelled value.
export function formatFinancialDisplay(value,unit,compact=false){
 if(value==null||value==='')return '—';
 const text=String(value).trim(),parsed=financialValue(text);
 if(!['number','range'].includes(parsed.status))return text;
 if(unit==='percent')return /%|[$€£¥]|\b[A-Z]{3}\b|(?:x|×)\s*$/i.test(text)?text:`${text}%`;
 if(unit==='multiple')return /%|[$€£¥]|\b[A-Z]{3}\b|(?:x|×)\s*$/i.test(text)?text:`${text}x`;
 if(unit==='usdMillions'||unit==='usdPerShare'){
  if(/[$€£¥%]|\b[A-Z]{3}\b|(?:x|×)\s*$/i.test(text)||parsed.scale)return text;
  const suffix=unit==='usdMillions'&&!compact?'m':'';
  return text.startsWith('(')&&text.endsWith(')')?`($${text.slice(1,-1)}${suffix})`:`$${text}${suffix}`;
 }
 if(unit==='year')return `Year ${text}`;
 return text;
}

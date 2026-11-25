// Invented data only. Generate a real PDF with measured positions and a cross-reference table.
// Nothing in this fixture is taken from a licensed report or tied to a real issuer.
export function pdfFromPages(pages){
 const txt=s=>String(s).replace(/[()\\]/g,c=>'\\'+c);
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids ['+pages.map((_,i)=>(4+i*2)+' 0 R').join(' ')+'] /Count '+pages.length+' >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 pages.forEach((rows,i)=>{
  const content=rows.map(([x,y,s])=>'BT /F1 9 Tf 1 0 0 1 '+x+' '+y+' Tm ('+txt(s)+') Tj ET\n').join('');
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(5+i*2)+' 0 R >>','<< /Length '+Buffer.byteLength(content)+' >>\nstream\n'+content+'endstream');
 });
 let file='%PDF-1.4\n';const offsets=[0];
 objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(file));file+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';});
 const xref=Buffer.byteLength(file);file+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return Buffer.from(file);
}
export const sampleYears=['2034','2035','2036','2037','2038','2039','2040'];
export const sampleRevenue=['11.20','12.30','0','(1.25)','N/A','15.60','17.80'];
const series=(label,values,y)=>[[32,y,label],...values.map((v,i)=>[234+50*i,y,v])];
export function sampleMorningstar(){return pdfFromPages([
 [[32,745,'Morningstar Equity Analyst Report'],[32,717,'Example Instruments (EXIQ)'],[32,690,'Report as of 8 May 2036'],[32,665,'Reporting Currency: EUR'],[32,638,'Business Description'],
 [32,615,'This imaginary company and all amounts exist only for these software tests.'],[32,590,'The next page contains an invented model for testing original document navigation.']],
 [[32,750,'Morningstar Valuation Model Summary'],[32,705,'Financials as of 6 May 2036'],[234,705,'Actual'],[384,705,'Forecast'],
 ...series('Fiscal Year, ends 30 Jun',sampleYears,686),...series('Revenue (EUR Bil)',sampleRevenue,665),...series('Net Income (EUR Bil)',['0.90','0.87','0.79','(0.25)','--','1.02','1.18'],645)]
]);}
export function sampleArgus(type) {
 const heads={analyst:'Argus Analyst Report',a6:'ARGUS A6 Report',options:'ARGUS Option Report'};
 const dates={analyst:'May 05, 2036',a6:'May 08, 2036',options:'May 12, 2036'};
 const rows=[[34,753,heads[type]],[34,727,'Example Instruments'],[310,727,'(NYSE: EXIQ)'],[34,700,'Report Created '+dates[type]],
 [34,670,'This is an invented document generated exclusively for verifying the reader.'],
 [34,650,'Its values serve as software test inputs and do not describe an actual security.']];
 if(type==='analyst')rows.push([34,610,'ARGUS RATING: HOLD'],[34,581,'Market Overview'],[34,555,'Price'],[350,555,'$1,125.50'],[34,531,'Target Price'],[350,531,'$1,200.00']);
 if(type==='a6')rows.push([34,610,'Argus Rating: BUY'],[34,581,'Current Price'],[350,581,'N/A'],[34,555,'Target Price'],[350,555,'$1,320.00']);
 if(type==='options')rows.push([34,610,'Option Strategy Summary'],[34,581,'Strategy Risk Ranking: 10 of 12'],[34,555,'Covered Call'],[34,530,'Sold Call Strike Price'],[350,530,'$1,280.00']);
 return pdfFromPages([rows]);
}

// A model continues on another page. The currency, fiscal cutoff and dates are
// explicit; optional third-page variations test conflicting editions/units.
export function continuedMorningstar({unit='EUR Bil',date='6 May 2036',overlap=false,heading='Financials'}={}){
 const face=[[32,745,'Morningstar Equity Analyst Report'],[32,713,'Invented Bearings (XQTT)'],[32,682,'Report as of 8 May 2036'],[32,655,'Reporting Currency: EUR']];
 const model=(title,asof,ys,nums,section,extra)=>[[32,750,'Morningstar Valuation Model Summary'],[32,705,title+' as of '+asof],[234,705,section],
  ...series('Fiscal Year, ends 30 Jun',ys,686),...series('Revenue ('+extra+')',nums,665),
  ...series('Net Income ('+extra+')',nums.map((_,i)=>String(i+1)),645)];
 return pdfFromPages([face,model('Financials','6 May 2036',['2034','2035'],['11.20','12.30'],'Actual','EUR Bil'),
 model(heading,date,overlap?['2035','2036']:['2036','2037'],['(0.40)','0'],overlap?'Actual':'Forecast',unit),
 [[32,727,'Forecast Revisions as of 6 May 2036'],[253,727,'2036'],[32,710,'Prior data as of 9 Feb 2036'],[231,710,'Current'],[289,710,'Prior'],[32,684,'Revenue (EUR Bil)'],[234,684,'17.30'],[291,684,'19.10']],
 [[32,727,'Forecast Revisions as of 6 May 2036'],[253,727,'2037'],[32,710,'Prior data as of 9 Feb 2036'],[231,710,'Current'],[289,710,'Prior'],[32,684,'Revenue (EUR Bil)'],[234,684,'20.80'],[291,684,'--']]]);
}

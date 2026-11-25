// One store per open tab. No storage, cookies, or network requests.
const metadataFields=['title','ticker','provider','reportDate','modelAsOf','currentPrice','fairValue','priceFairValue','economicMoat','starRating','analyst','rating','targetPrice','reportKinds','reportCount'];
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
const clone=value=>structuredClone(value);

function chooseFiles(provider){
 return new Promise((resolve,reject)=>{
  const input=document.createElement('input');input.type='file';input.accept='.pdf,application/pdf';input.multiple=provider==='argus';input.hidden=true;document.body.append(input);
  let settled=false;
  const finish=(value,error)=>{if(settled)return;settled=true;input.remove();error?reject(error):resolve(value);};
  input.addEventListener('cancel',()=>finish({documents:[]}));
  input.addEventListener('change',async()=>{
   try{
    const files=[...input.files];
    if(files.length>(provider==='argus'?3:1))throw new Error('Choose one Morningstar PDF or up to three Argus PDFs.');
    if(files.some(f=>f.size>60*1024*1024))throw new Error('Choose PDF files smaller than 60 MB each.');
    const documents=[];
    for(const f of files)documents.push({name:f.name,bytes:new Uint8Array(await f.arrayBuffer())});
    finish({documents});
   }catch(error){finish(null,error);}
  });
  input.click();
 });
}

export function createSessionApi({onChange=()=>{},confirmRemoval=message=>window.confirm(message)}={}){
 const records=new Map(),urls=new Map();let generation=0;
 const summary=({snapshot,signature,...record})=>clone({...record,documents:record.documents.map(({bytes,...d})=>d)});
 const read=id=>{const record=records.get(id);if(!record)throw new Error('This report is no longer in this session. Add its PDF again.');return record;};
 function revoke(url){clearTimeout(urls.get(url)?.timer);urls.delete(url);URL.revokeObjectURL(url);}
 async function upload(documents,provider,updateId){
  const started=generation;
  if(!Array.isArray(documents)||!documents.length||documents.length>(provider==='Argus'?3:1))throw new Error('Choose one Morningstar PDF or up to three Argus PDFs.');
  const files=[];
  for(const document of documents){
   // Retain independent originals before PDF.js can transfer parser buffers.
   const bytes=new Uint8Array(document.bytes).slice();
   if(bytes.byteLength<5||bytes.byteLength>60*1024*1024||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new Error('Choose valid PDF files smaller than 60 MB each.');
   const hash=await digest(bytes);files.push({id:hash,hash,name:String(document.name||'Research report.pdf'),sourceType:document.sourceType || (provider==='Morningstar'?'morningstar':null),size:bytes.byteLength,bytes});
  }
  if(new Set(files.map(f=>f.hash)).size!==files.length)throw new Error('The same PDF was selected twice.');
  const signature=provider+'|'+files.map(f=>f.hash).sort().join('|');
  if(started!==generation)throw new Error('The session was cleared. Add the PDF again.');
  const matching=[...records.values()].find(r=>r.signature===signature);
  if(!updateId && matching) return summary(matching);
  if(updateId && matching && matching.id!==updateId)throw new Error('This set of PDFs is already open in another report in this session.');
  const id=updateId || crypto.randomUUID(),old=records.get(id);
  if(updateId){if(!old||old.provider!=='Argus'||provider!=='Argus'||old.documents.some(d=>!files.some(f=>f.hash===d.hash)))throw new Error('Keep the current PDFs when adding Argus sources.');}

  const now=new Date().toISOString();
  const record={...old,id,signature,provider,kind:provider==='Argus'?'bundle':'single',documents:files,fileName:files.length===1?files[0].name:`Argus reports (${files.length} PDFs)`,fileSize:files.reduce((n,d)=>n+d.size,0),importedAt:old?.importedAt||now,lastOpenedAt:now,reportCount:String(files.length),revision:(old?.revision||0)+1};
  delete record.snapshot; // Changed source set requires a new comparison snapshot.
  records.set(id,record);onChange(records.size);return summary(record);
 }
 return{
  hasReports:()=>records.size>0,
  openReports:chooseFiles,
  importPdf:({name,bytes})=>upload([{name,bytes}],'Morningstar'),
  importBundle:({documents,updateId})=>upload(documents,'Argus',updateId),
  listReports:async()=>[...records.values()].sort((a,b)=>b.lastOpenedAt.localeCompare(a.lastOpenedAt)).map(summary),
  openSavedReport:async id=>{
   const saved=read(id);saved.lastOpenedAt=new Date().toISOString();
   const record=summary(saved),documents=saved.documents.map(d=>({name:d.name,bytes:d.bytes.slice()}));
   return record.kind==='bundle'?{record,documents}:{record,bytes:documents[0].bytes};
  },
  updateReport:async({id,metadata})=>{
   const record=read(id);
   for(const key of metadataFields)if(Object.hasOwn(metadata||{},key))record[key]=String(metadata[key]??'').replace(/\s+/g,' ').trim().slice(0,220);
   record.revision++;return summary(record);
  },
  saveSnapshot:async({id,snapshot})=>{read(id).snapshot=clone(snapshot);return{ok:true};},
  getSnapshot:async id=>clone(read(id).snapshot||null),
  removeReport:async({id,name})=>{
   read(id);if(!confirmRemoval(`Remove ${name} from this session? The original file on your device is unchanged.`))return{removed:false};
   records.delete(id);for(const[url,value]of urls)if(value.id===id)revoke(url);onChange(records.size);return{removed:true};
  },
  clearSession:()=>{generation++;records.clear();for(const url of urls.keys())revoke(url);onChange(0);return{cleared:true};},
  openOriginalPdf:async({id,index=0,sourceType,page=1})=>{
   const documents=read(id).documents;const file=sourceType?documents.find(d=>d.sourceType===sourceType):documents[index];if(!file)throw new Error('Choose a source PDF.');
   const tab=window.open('about:blank','_blank');if(!tab)throw new Error('Allow opening the original PDF in your browser.');tab.opener=null;
   const url=URL.createObjectURL(new Blob([file.bytes],{type:'application/pdf'}));urls.set(url,{id,timer:setTimeout(()=>revoke(url),60000)});
   try{tab.location.href=`${url}#page=${Math.max(1,Math.floor(Number(page)||1))}`;}catch(error){revoke(url);tab.close();throw error;}return{opened:true};
  },
  onAddReportFromMenu:()=>()=>{}
 };
}

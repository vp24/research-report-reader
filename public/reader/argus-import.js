// Stage files before opening so users can add the three report types in any order.
export function createArgusImporter({ pick, inspect, validate, commit }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'argus-import-dialog';
  dialog.className = 'argus-import-dialog';
  dialog.setAttribute('aria-labelledby', 'argus-import-title');
  dialog.innerHTML = `<header><div><h2 id="argus-import-title">Add Argus reports</h2><p>Add PDFs for <strong>one company</strong>, one at a time or together. One report is enough; adding the others is optional.</p></div><button type="button" data-close aria-label="Close Argus import">✕</button></header>
    <div class="argus-import-drop"><button type="button" id="argus-add-files">Choose PDFs</button><span>or drop PDFs here · up to three files</span><small>The app identifies each report automatically. No renaming or sorting needed.</small></div>
    <p id="argus-import-company" aria-live="polite">Start with the Analyst report for forecasts and analyst reasoning.</p><p id="argus-date-warning" class="import-date-warning" hidden></p>
    <div id="argus-import-slots"></div><p id="argus-import-error" role="alert" hidden></p>
    <footer><span id="argus-import-status" role="status">No files added</span><button type="button" data-close>Cancel</button><button type="button" id="argus-open-report" disabled>Open report</button></footer>`;
  document.body.append(dialog);
  let generation = 0;
  let documents = [], busy = false, updateId = null, savedTypes = new Set();
  const slots = dialog.querySelector('#argus-import-slots');
  const error = dialog.querySelector('#argus-import-error');
  const company = dialog.querySelector('#argus-import-company');
  const status = dialog.querySelector('#argus-import-status');
  const openButton = dialog.querySelector('#argus-open-report');
  const addButton = dialog.querySelector('#argus-add-files');
  const types = [
    ['argus-analyst','Analyst report','Forecasts, target price and analyst reasoning'],
    ['argus-a6','A6 quantitative report','Quantitative rating, target and financial history'],
    ['argus-options','Options report','Options strategies and their stated risks']
  ];
  function render(message) {
    slots.replaceChildren();
    for (const [type, label, description] of types) {
      const source = documents.find(d => d.type === type);
      const row = document.createElement('div');row.className = `argus-import-slot ${source ? 'added' : ''}`;
      const copy = document.createElement('div');
      const heading = document.createElement('strong');heading.textContent = label;
      const detail = document.createElement('small');detail.textContent = description;
      const file = document.createElement('span');file.textContent = source ? source.name : 'Not added · optional';
      copy.append(heading,detail,file);row.append(copy);
      if (source && savedTypes.has(type)) {
        const saved=document.createElement("span");saved.textContent="Already added";row.append(saved);
      } else if (source) {
        const remove = document.createElement('button');remove.type='button';remove.textContent='Remove';remove.disabled=busy;
        remove.setAttribute('aria-label',`Remove ${label}`);
        remove.onclick = () => { documents=documents.filter(d=>d!==source);error.hidden=true;render(); };
        row.append(remove);
      }
      slots.append(row);
    }
    const bundle = documents.length ? validate(documents) : null;
    company.textContent = bundle ? [bundle.title,bundle.ticker && `(${bundle.ticker})`].filter(Boolean).join(' ') : 'Start with the Analyst report for forecasts and analyst reasoning.';
    const dates=(bundle?.reports || []).filter(r=>r.reportDate);const warning=dialog.querySelector('#argus-date-warning');warning.hidden=new Set(dates.map(r=>r.reportDate)).size<2;warning.textContent='These sources have different report dates: '+dates.map(r=>`${r.label}: ${r.reportDate}`).join(' · ')+'. Each source keeps its own date and forecasts.';
    status.textContent = message || (documents.length ? `${documents.length} of 3 report types added · ready to open` : 'No files added');
    addButton.textContent = documents.length ? 'Add more PDFs' : 'Choose PDFs';
    addButton.disabled = busy || documents.length === 3;
    openButton.textContent = updateId ? 'Open updated report' : 'Open report';
    openButton.disabled = busy || !documents.length || (updateId && documents.length === savedTypes.size);
    dialog.querySelectorAll('[data-close]').forEach(b=>b.disabled=busy);
    dialog.setAttribute('aria-busy',String(busy));
  }
  async function add(files) {
    if (busy || !files?.length) return;
    const token=generation;
    error.hidden=true;busy=true;render('Reading and identifying PDFs…');
    try {
      if (documents.length+files.length>3) throw new Error('Keep one Analyst, one A6 and one Options report. Remove a file before adding another.');
      const incoming=await inspect(files);
      if(token!==generation)return;
      const candidate=[...documents,...incoming];
      const seen=new Set();
      for (const source of candidate) {
        if (seen.has(source.type)) throw new Error('That report type is already added. Remove its current file first if you want to replace it.');
        seen.add(source.type);
      }
      validate(candidate); // Reject mixed companies before changing the staged selection.
      documents=candidate;
    } catch(e) { if(token!==generation)return;error.textContent=e.message || 'The PDF could not be added.';error.hidden=false; }
    finally { if(token===generation){busy=false;render();} }
  }
  addButton.onclick=async()=>{
    if(busy)return;
    const token=generation;busy=true;render('Choose one or more PDFs…');
    let files;
    try { files=await pick(); } catch(e) { if(token===generation){error.textContent=e.message;error.hidden=false;} }
    finally { if(token===generation){busy=false;render();} }
    if(token===generation && files?.length)await add(files);
  };
  openButton.onclick=async()=>{
    if(busy||!documents.length)return;
    const token=generation;busy=true;error.hidden=true;render('Opening report…');
    try {
      const done=await commit(documents,updateId);if(token!==generation)return;
      if(done){dialog.close();documents=[];}
      else {error.textContent='The report could not be opened. Your files remain selected; check the message on the report page.';error.hidden=false;}
    } catch(e) {if(token===generation){error.textContent=e.message;error.hidden=false;}}
    finally {if(token===generation){busy=false;render();}}
  };
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('close',()=>{if(!dialog.open){generation++;busy=false;documents=[];savedTypes.clear();updateId=null;slots.replaceChildren();}});
  for(const name of ['dragenter','dragover','dragleave'])dialog.addEventListener(name,e=>{e.preventDefault();e.stopPropagation();});
  dialog.addEventListener('drop',async e=>{
    e.preventDefault();e.stopPropagation();if(busy)return;
    const token=generation;
    try {
      const files=[...(e.dataTransfer?.files || [])];
      if(files.length>3)throw new Error('Choose up to three Argus PDFs.');
      if(files.some(f=>f.size>60*1024*1024))throw new Error('Choose PDF files smaller than 60 MB each.');
      const incoming=await Promise.all(files.map(async f=>({name:f.name,bytes:new Uint8Array(await f.arrayBuffer())})));
      if(token===generation)await add(incoming);
    }catch(err){if(token===generation){error.textContent=err.message;error.hidden=false;}}
  });
  return {
    show: async (initial=[], recordId=null) => {
      if(busy)return;
      const token=++generation;documents=[];savedTypes=new Set();updateId=recordId;error.hidden=true;
      dialog.querySelector('#argus-import-title').textContent=recordId ? 'Add remaining Argus reports' : 'Add Argus reports';
      render();if(!dialog.open)dialog.showModal();
      if(initial.length)await add(initial);
      if(recordId&&token===generation){savedTypes=new Set(documents.map(d=>d.type));render();}
    },
    reset: () => { generation++;busy=false;documents=[];savedTypes.clear();updateId=null;if(dialog.open)dialog.close();slots.replaceChildren();company.textContent='';status.textContent='';error.textContent='';error.hidden=true;const warning=dialog.querySelector('#argus-date-warning');warning.textContent='';warning.hidden=true; },
    isOpen: () => dialog.open
  };
}

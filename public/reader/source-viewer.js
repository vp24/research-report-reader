// Local source verification. Rendering never changes the extracted report data.
export function createSourceViewer(pdfjs, dialog) {
  const doc = dialog.ownerDocument, view = doc.defaultView;
  const $ = id => dialog.querySelector(`#${id}`);
  const select = $('source-document'), pageInput = $('source-page');
  const previous = $('source-previous'), next = $('source-next'), zoom = $('source-zoom');
  const viewport = $('source-viewport'), canvas = $('source-canvas');
  const status = $('source-status'), text = $('source-page-text');
  const evidencePanel=doc.createElement('section');evidencePanel.className='source-evidence';evidencePanel.hidden=true;dialog.querySelector('header').after(evidencePanel);
  let sources = [], external = null, loading = null, pdf = null, renderTask = null;
  let documentToken = 0, paintToken = 0, pageNumber = 1;
  let lastWidth = 0;
  let evidenceBounds=null,evidencePage=null,evidenceIndex=null;
  const labels = {morningstar:'Morningstar', 'argus-analyst':'Argus Analyst', 'argus-a6':'Argus A6', 'argus-options':'Argus Options'};
  const quiet = promise => promise?.catch?.(() => {});
  const errorText = error => error?.message || 'The PDF page could not be displayed.';
  function release() {
    documentToken++; paintToken++;
    renderTask?.cancel(); renderTask = null;
    const task = loading, doc = pdf;
    loading = null; pdf = null;
    quiet(task ? task.destroy() : doc?.destroy());
    canvas.width = 1; canvas.height = 1;
    text.textContent = '';
  }
  function controls(busy = false) {
    previous.disabled = busy || !pdf || pageNumber <= 1;
    next.disabled = busy || !pdf || pageNumber >= pdf.numPages;
    pageInput.disabled = busy || !pdf;
    zoom.disabled = busy || !pdf;
    pageInput.value = String(pageNumber);
    pageInput.max = String(pdf?.numPages || 1);
    $('source-pages').textContent = pdf ? `of ${pdf.numPages}` : '';
    viewport.setAttribute('aria-busy', String(busy));
  }
  async function paint() {
    if (!pdf || !dialog.open) return;
    const token = ++paintToken, docToken = documentToken, doc = pdf;
    const old = renderTask; renderTask = null;
    old?.cancel(); await quiet(old?.promise);
    if (token !== paintToken || docToken !== documentToken) return;
    controls(true); canvas.hidden = true;
    status.hidden = false; status.className = ''; status.textContent = `Loading page ${pageNumber}…`;
    try {
      const page = await doc.getPage(pageNumber);
      if (token !== paintToken || docToken !== documentToken) return;
      const unscaled = page.getViewport({scale:1});
      const scale = zoom.value === 'fit' ? Math.max(.2, (viewport.clientWidth - 48) / unscaled.width) : Number(zoom.value);
      const size = page.getViewport({scale});
      const pixels = Math.min(view.devicePixelRatio || 1, 2, Math.sqrt(16000000 / (size.width * size.height)));
      canvas.width = Math.ceil(size.width * pixels); canvas.height = Math.ceil(size.height * pixels);
      canvas.style.width = `${size.width}px`; canvas.style.height = `${size.height}px`;
      canvas.setAttribute('aria-label', `${sources[select.selectedIndex]?.name || 'Source PDF'}, page ${pageNumber} of ${doc.numPages}`);
      const task = page.render({canvasContext:canvas.getContext('2d'), viewport:size, transform:pixels === 1 ? null : [pixels,0,0,pixels,0,0]});
      renderTask = task;
      await task.promise;
      if (token !== paintToken || docToken !== documentToken) return;
      renderTask = null; canvas.hidden = false;
      if(!evidencePanel.hidden&&evidenceBounds&&pageNumber===evidencePage&&select.selectedIndex===evidenceIndex){
        const b=evidenceBounds,ctx=canvas.getContext('2d'),factor=scale*pixels;
        if([b.left,b.top,b.right,b.bottom].every(Number.isFinite)&&b.right>b.left&&b.bottom>b.top){ctx.save();ctx.fillStyle='rgba(63,128,185,0.16)';ctx.fillRect(b.left*factor,b.top*factor,(b.right-b.left)*factor,(b.bottom-b.top)*factor);ctx.restore();}
      }
      status.hidden = true; viewport.scrollTo({top:0,left:0});
      dialog.dataset.renderedPage = String(pageNumber);
      text.textContent = 'Loading page text…';
      try {
        const content = await page.getTextContent();
        if (token === paintToken && docToken === documentToken) text.textContent = content.items.map(item => `${item.str}${item.hasEOL ? '\n' : ' '}`).join('');
      } catch { if (token === paintToken) text.textContent = 'Page text is unavailable. Use the PDF page view.'; }
    } catch (error) {
      if (token !== paintToken || docToken !== documentToken || error?.name === 'RenderingCancelledException') return;
      status.className = 'source-viewer-error'; status.hidden = false;
      status.textContent = `${errorText(error)} You can still open the original PDF in your usual viewer.`;
    } finally { if (token === paintToken && docToken === documentToken) controls(false); }
  }
  async function loadSource(index, requestedPage = 1) {
    const oldRender = renderTask;
    release();
    const token = documentToken;
    await quiet(oldRender?.promise);
    if (token !== documentToken || !dialog.open) return;
    const source = sources[index];
    if (!source) return;
    select.selectedIndex = index;
    dialog.dataset.sourceType = source.type;
    delete dialog.dataset.renderedPage;
    $('source-name').textContent = source.name || 'Original report PDF';
    canvas.hidden = true; pageNumber = 1; controls(true);
    status.hidden = false; status.className = ''; status.textContent = 'Opening PDF…';
    try {
      const task = pdfjs.getDocument({data:new Uint8Array(source.bytes), isEvalSupported:false});
      loading = task;
      const doc = await task.promise;
      if (token !== documentToken || !dialog.open) { quiet(task.destroy()); return; }
      pdf = doc;
      pageNumber = Math.max(1, Math.min(doc.numPages, Math.trunc(Number(requestedPage)) || 1));
      await paint();
    } catch (error) {
      if (token !== documentToken) return;
      status.hidden = false; status.className = 'source-viewer-error';
      status.textContent = `${errorText(error)} Use Open original PDF below to view the original file.`;
      controls(false);
    }
  }
  function go(value) {
    if (!pdf) return;
    const candidate = Number(value);
    if (!Number.isInteger(candidate) || candidate < 1 || candidate > pdf.numPages) { pageInput.value=String(pageNumber); return; }
    evidencePanel.hidden=true;pageNumber = candidate; paint();
  }
  previous.onclick = () => go(pageNumber - 1);
  next.onclick = () => go(pageNumber + 1);
  pageInput.onchange = () => go(pageInput.value);
  pageInput.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); go(pageInput.value); } };
  select.onchange = () => {evidencePanel.hidden=true;loadSource(select.selectedIndex);};
  zoom.onchange = () => paint();
  $('source-close').onclick = () => dialog.close();
  $('source-external').onclick = async () => {
    if (!external) return;
    try { await external(select.selectedIndex, pageNumber); }
    catch (error) { status.hidden=false; status.className='source-viewer-error'; status.textContent=errorText(error); }
  };
  dialog.addEventListener('close', () => { if (dialog.open) return; release(); sources=[]; external=null; });
  dialog.querySelectorAll('[data-source-view]').forEach(button => button.onclick = () => {
    const textView = button.dataset.sourceView === 'text';
    $('source-text-wrap').hidden = !textView;
    $('source-image-wrap').hidden = textView;
    dialog.querySelectorAll('[data-source-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  });
  const resize = view.ResizeObserver ? new view.ResizeObserver(() => {
    if (!dialog.open || !pdf || zoom.value !== 'fit' || Math.abs(viewport.clientWidth - lastWidth) < 2) return;
    lastWidth=viewport.clientWidth; paint();
  }) : null;
  resize?.observe(viewport);
  return {
    open(documents, index = 0, page = 1, onExternal = null, evidence = null) {
      if (dialog.open) dialog.close();
      sources = documents; external = onExternal;
      evidencePanel.replaceChildren();evidencePanel.hidden=!evidence;evidenceBounds=evidence?.sourceBounds || null;evidencePage=Number(page);evidenceIndex=index;
      if(evidence){const heading=doc.createElement('strong');heading.textContent=evidence.metric || 'Selected value';evidencePanel.append(heading);const list=doc.createElement('dl');for(const [key,label]of [['raw','As printed'],['figureDate','Figure date'],['period','Period'],['kind','Period type'],['unit','Units'],['basis','Accounting basis'],['estimateSource','Forecast source'],['variant','Revision variant'],['modelDate','Model date'],['reportDate','Report date'],['status','Extraction status']]){if(evidence[key]==null||evidence[key]==='')continue;const term=doc.createElement('dt'),value=doc.createElement('dd');term.textContent=label;value.textContent=String(evidence[key]);list.append(term,value);}evidencePanel.append(list);const note=doc.createElement('small');note.textContent='Check the row and column on the original page below. '+(evidenceBounds?'The source area is highlighted for reference. ':'')+'A source link is evidence, not a guarantee of correct extraction.';evidencePanel.append(note);}
      select.replaceChildren(...sources.map(source => {
        const option = doc.createElement('option'); option.textContent=labels[source.type] || source.name; return option;
      }));
      select.selectedIndex = index;
      $('source-external').hidden = !external;
      zoom.value = 'fit';
      $('source-image-wrap').hidden=false; $('source-text-wrap').hidden=true;
      dialog.querySelectorAll('[data-source-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sourceView === 'pdf')));
      dialog.showModal(); lastWidth = viewport.clientWidth;
      loadSource(index, page);
    },
    close() { if (dialog.open) dialog.close(); release();sources=[];external=null;select.replaceChildren();evidencePanel.replaceChildren();evidencePanel.hidden=true; }
  };
}

import { positionedLines } from './pdf-document.js';
import { compact, keyFor, VALUE_PATTERN, unitFor } from './financial-data.js';
import { printedBounds, chartAssignments } from './cell-evidence.js';

const center = item => item.x + item.width / 2;
const end = item => item.x + item.width;
const periodPattern = /^(?:\d{4}(?:[AEF]|\s+est\.?)?|\d+[ -]Year(?:\s+(?:Avg|CAGR))?)$/i;
const headerTitle = text => compact(text).replace(/\s+(?:GAAP Data|Growth Rates|Trend|Actual|Forecast|as of\b).*$/i, '');
const captionLike = text => text.length < 95 && !/^\(?[$€£¥]|^Fiscal Year|^Prior data|^\d|^ends |^FY ends|^Quarterly|^Annual/i.test(text)
  && !VALUE_PATTERN.test(text) && !/\b(?:Report|Copyright|Page|©)\b/i.test(text);

// Heading names identify provider table families, never permitted metric rows.
const tableFamilies = {
  'growth-analysis': 'growth', 'growth-rates-percent': 'growth-rates', 'growth-rates': 'growth-rates',
  'valuation-analysis': 'valuation-history', 'financial-strength': 'financial-strength',
  'ratios-percent': 'ratios', 'ratios': 'ratios', 'risk-analysis': 'risk-analysis',
  'financial-condition': 'financial-condition', 'ratio-analysis': 'ratios'
};

function sourcePeriod(raw,title) {
  const label=compact(raw), tag=label.match(/^(\d{4})(A|E|F|\s+est\.?)?$/i);
  if(!tag)return {label,year:null,period:'summary'};
  const period=tag[2] ? (/^A$/i.test(tag[2])?'actual':'forecast') :
    /\b(?:forecast|estimate|outlook|consensus|guidance)\b/i.test(title)?'not specified' :
    Object.hasOwn(tableFamilies,keyFor(headerTitle(title))) || /\bhistor(?:y|ical)\b/i.test(title)?'actual':'not specified';
  return {label,year:tag[1],period};
}

export function readAlignedRows(page, schema, options = {}) {
  const columns = schema.columns;
  const gaps = columns.slice(1).map((c, i) => c.x - columns[i].x).filter(n => n > 0).sort((a, b) => a - b);
  const spacing = gaps[Math.floor(gaps.length / 2)] || page.width / 4;
  const rows = [], issues = [];
  const lines = positionedLines(page.items, { left: schema.left, right: schema.right, top: schema.top, bottom: schema.bottom });
  let pendingLabel = '';
  for (const line of lines) {
    let numeric = line.items.filter(i => VALUE_PATTERN.test(compact(i.text)));
    const labels = line.items.filter(i => !VALUE_PATTERN.test(compact(i.text)));
    const first = numeric[0];
    let label = compact(labels.filter(i => !first || i.x < first.x).map(i => i.text).join(' '));
    if (!numeric.length) {
      if (line.text.length < 95 && line.items[0]?.x < columns[0].x - spacing / 2 && captionLike(line.text)) pendingLabel = line.text;
      else pendingLabel = '';
      continue;
    }
    if (!label && pendingLabel) label = pendingLabel;
    else if (label && pendingLabel && options.wrapLabels) label = `${pendingLabel} ${label}`;
    pendingLabel = '';
    if (!label || /^(?:Fiscal Year|Current$|Prior$|Page\b|©|Please see|Actual$|Forecast$|Source:)/i.test(label)) continue;
    if (numeric.length < Math.min(2, columns.length) && !options.allowSparse) continue;
    const values = columns.map(() => null), buckets = columns.map(() => []);
    let ambiguous = false;
    for (const item of numeric) {
      // Right-aligned financial columns retain their boundary even for wide
      // currency/range tokens. Period headings and values share a right edge.
      const distances = columns.map(c => Math.min(Math.abs(end(item) - c.end), Math.abs(center(item) - c.x)));
      const index = distances.indexOf(Math.min(...distances));
      const localGap = Math.min(columns[index + 1] ? columns[index + 1].x - columns[index].x : spacing,
        columns[index - 1] ? columns[index].x - columns[index - 1].x : spacing);
      if (distances[index] > localGap * .49) { ambiguous = true; continue; }
      buckets[index].push(item);
    }
    buckets.forEach((items, i) => {
      const raw = compact(items.map(i=>i.text).join(' '));
      if (raw && VALUE_PATTERN.test(raw)) values[i] = raw;
      else if (items.length) ambiguous = true;
    });
    // A shifted row must not attach its first number to an unrelated year.
    if (numeric.length === columns.length && values.some(v => v == null)) ambiguous = true;
    const row = { key: keyFor(label), label, values: ambiguous ? columns.map(() => null) : values,
      cellBounds:buckets.map((bucket,i)=>!ambiguous&&values[i]!=null?printedBounds(bucket):null),
      rawValues: numeric.map(i => i.text), sourcePage: page.number,
      validation: ambiguous ? 'review-alignment' : values.some(v => v == null) ? 'incomplete' : 'aligned',
      unit: unitFor(label, schema.unitContext), bounds: { left: schema.left, top: line.y - Math.max(...line.items.map(i => i.height || 8)), right: schema.right, bottom: line.y + 2 } };
    if (ambiguous || values.some(v => v == null)) issues.push({ section: schema.title, metric: label, sourcePage: page.number,
      reason: ambiguous ? 'The row does not align with the printed columns. Raw values are preserved for source review.' : 'A printed column has no captured value; later values have not been shifted.', rawValues: row.rawValues });
    rows.push(row);
  }
  return { rows, issues };
}

export function discoverTables(document, type) {
  const tables = [], issues = [];
  for (const page of document.pages || []) {
    const schemas = [];
    for (const line of page.lines) {
      const headerItems = line.items.filter(item => periodPattern.test(compact(item.text)));
      if (headerItems.filter(i => /^\d{4}/.test(i.text)).length < 2) continue;
      // A label between year groups is the start of the adjacent table.
      const groups = []; let group = [];
      for (const item of headerItems) {
        if (group.length && line.items.some(i => i.x > end(group.at(-1)) && i.x < item.x && !periodPattern.test(compact(i.text)))) {
          if (group.length >= 2) groups.push(group); group = [];
        }
        group.push(item);
      }
      if (group.length >= 2) groups.push(group);
      for (const periods of groups) {
        const first = periods[0], last = periods.at(-1);
        const prior = page.lines.filter(l => l.y <= line.y && l.y >= line.y - Math.max(38, first.height * 6));
        const candidates = prior.flatMap(l => l.items.filter(i => i.x < first.x && captionLike(i.text))
          .map(i => ({ ...i, distance: line.y - i.y })));
        // Prefer a nearby caption to a broad umbrella heading farther above.
        const caption = candidates.sort((a, b) => a.distance - b.distance || b.x - a.x)[0];
        if (!caption) continue;
        let title = headerTitle(caption.text);
        if (/^(?:GAAP Data|Growth Rates|Trend)$/.test(title) && caption.x > first.x / 2) continue;
        if (!title || /Price\b.*\d|\b(?:BUY|SELL|HOLD)\b/.test(title)) continue;
        const nextCaption = line.items.find(i => i.x > end(last) && captionLike(i.text));
        const spacing = periods.length > 1 ? center(last) - center(periods.at(-2)) : page.width / 6;
        const right = Math.min(nextCaption?.x ?? page.width, end(last) + spacing * .75);
        const left = Math.max(0, Math.min(caption.x, ...page.items.filter(i => Math.abs(i.x - caption.x) < first.height * 2 && i.y > line.y && i.y < line.y + first.height * 5).map(i => i.x)) - 2);
        const unitContext = prior.filter(l => l.y >= caption.y).flatMap(l => l.items.filter(i => i.x >= left && i.x < first.x)).map(i => i.text).join(' ');
        const columns = periods.map(i => ({ ...sourcePeriod(i.text,caption.text), x:center(i), end:end(i), estimateSource:null }));
        schemas.push({ title, columns, left, right, headingTop: caption.y, top: line.y + 2, bottom: page.height, unitContext,
          basis: /\bGAAP Data\b/i.test(prior.flatMap(l=>l.items.filter(i=>i.x>=left && i.x<right).map(i=>i.text)).join(' ')) ? 'GAAP' : 'not specified' });
      }
    }
    for (const schema of schemas) {
      schema.right = Math.max(schema.right, ...schemas.filter(s => Math.abs(s.left - schema.left) < 12).map(s => s.right));
      schema.bottom = Math.min(page.height, ...schemas.filter(s => s.headingTop > schema.top && s.left < schema.columns[0].x && s.right > schema.columns[0].x).map(s => s.headingTop - 2));
      // End at the footer or next non-tabular heading, not a fixed PDF page.
      const footer = page.lines.find(l => l.y > schema.top && /^(?:©|Please see important)/.test(l.text));
      if (footer) schema.bottom = Math.min(schema.bottom, footer.y - 2);
      const parsed = readAlignedRows(page, schema);
      if (!parsed.rows.length) continue;
      const prefix = type === 'argus-a6' ? 'a6' : 'analyst';
      const family = tableFamilies[keyFor(schema.title)] || keyFor(schema.title);
      const id = `${prefix}-${prefix === 'a6' && family === 'valuation-history' ? 'valuation' : family}`;
      tables.push({ id: tables.some(t => t.id === id) ? `${id}-p${page.number}-${tables.length}` : id, title: schema.title,
        columns: schema.columns.map(c => c.label), columnMeta: schema.columns, sourcePage: page.number, found: true,
        unitContext: schema.unitContext, basis: schema.basis, rows: parsed.rows });
      issues.push(...parsed.issues);
    }
  }
  return { tables, issues };
}

export function discoverMarketData(document) {
  for (const page of document.pages || []) {
    const quarterLine = page.lines.find(l => l.items.filter(i => /^Q\d+$/.test(i.text)).length >= 2);
    if (!quarterLine) continue;
    const qItems = quarterLine.items.filter(i => /^Q\d+$/.test(i.text));
    const yearLine = page.lines.find(l => l.y > quarterLine.y && l.y < quarterLine.y + 24 && l.items.filter(i => /^\d{4}$/.test(i.text)).length >= 2);
    if (!yearLine) continue;
    const years = yearLine.items.filter(i => /^\d{4}$/.test(i.text));
    const qgroups = []; let group = [];
    for (const q of qItems) { if (group.length && Number(q.text.slice(1)) <= Number(group.at(-1).text.slice(1))) { qgroups.push(group); group = []; } group.push(q); }
    if (group.length) qgroups.push(group);
    if (qgroups.length !== years.length) return { tables: [], issues: [{ sourcePage: page.number, reason: 'Quarter groups could not be aligned to fiscal year headings.' }] };
    const labelX = Math.min(...quarterLine.items.map(i => i.x));
    const bounds = qgroups.map((g, i) => ({ left: i ? (end(qgroups[i - 1].at(-1)) + g[0].x) / 2 : g[0].x - (center(qItems[1]) - center(qItems[0])) / 2,
      right: i < qgroups.length - 1 ? (end(g.at(-1)) + qgroups[i + 1][0].x) / 2 : end(g.at(-1)) + (center(qItems.at(-1)) - center(qItems.at(-2))) / 2 }));
    const right = bounds.at(-1).right;
    const local = positionedLines(page.items, { left: labelX - 2, right, bottom: quarterLine.y });
    const annualRows = [], quarterRows = [], issues=[];
    const quarterBands=qItems.map((q,i)=>({left:i?(center(qItems[i-1])+center(q))/2:bounds[0].left,
      right:i+1<qItems.length?(center(q)+center(qItems[i+1]))/2:right}));
    function chartRow(label,kind,assignment,columnMeta){
      const {located, ...series}=assignment;
      const missing=columnMeta.filter((c,i)=>series.cellValidation[i]==='not-captured').map(c=>c.label);
      const ambiguous=columnMeta.filter((c,i)=>series.cellValidation[i]==='review-alignment').map(c=>c.label);
      if(missing.length||ambiguous.length)issues.push({sourcePage:page.number,section:kind,metric:label,
        reason:[missing.length&&'No value captured for '+missing.join(', '),ambiguous.length&&'Ambiguous label placement for '+ambiguous.join(', ')].filter(Boolean).join('; ')+'. Check the original chart.',
        rawValues:ambiguous.length?series.rawValues:[]});
      return {key:keyFor(label),label,...series,columnMeta,sourcePage:page.number};
    }
    let fiscalEnd = yearLine.items.filter(i => i.x < qItems[0].x && !/^\d{4}$/.test(i.text)).map(i => i.text).join(' ');
    for (const annualLine of local.filter(l => l.items.some(i => /^Annual$/i.test(i.text)))) {
      const annualNumbers = annualLine.items.filter(i => VALUE_PATTERN.test(compact(i.text)));
      const metricLabel = [...local].reverse().find(l => l.y < annualLine.y && l.items[0]?.x < qItems[0].x
        && l.items.length <= 3 && !/^\(.*\)$/.test(l.text) && captionLike(l.text) && !/^(?:Rating|Annual|Quarterly)/i.test(l.text));
      if (!metricLabel) continue;
      const unitsLine = local.find(l => l.y > metricLabel.y && l.y < annualLine.y && l.items.every(item=>end(item)<qItems[0].x) && /^\([^)]+\)$/.test(l.text) && !VALUE_PATTERN.test(l.text));
      const label = compact(metricLabel.text + (unitsLine ? ` ${unitsLine.text}` : ''));
      const estimates = annualLine.items.filter(i => /Estimate/i.test(i.text));
      const actualMarks=annualLine.items.filter(i=>/\bActual\b/i.test(i.text));
      const estimateColors = new Set();
      for (const mark of estimates) {
        const swatch = (page.rectangles || []).filter(r => r.right <= mark.x + mark.width && r.left >= mark.x - 12 && r.top < mark.y && r.bottom > mark.y - mark.height && r.right - r.left < 12).sort((a, b) => b.left - a.left)[0];
        if (swatch) estimateColors.add(swatch.color);
      }
      const yearMarks=estimates.filter(m=>bounds.some(b=>m.x>=b.left && m.x<b.right));
      const annualMeta = years.map((year, i) => ({ label: year.text, year: year.text,
        period: yearMarks.some(m => m.x >= bounds[i].left && m.x < bounds[i].right) ? 'forecast' :
          (yearMarks.length||actualMarks.some(m=>m.x>=bounds[i].left&&m.x<bounds[i].right))?'actual':'not specified' }));
      const qnumbers = page.items.filter(i => i.y > (unitsLine?.y || metricLabel.y) && i.y < annualLine.y - 2 && center(i)>=bounds[0].left && center(i)<right && VALUE_PATTERN.test(compact(i.text))).sort((a, b) => a.x - b.x);
      const annual=chartAssignments(annualNumbers,bounds),quarterly=chartAssignments(qnumbers,quarterBands);
      if(!annualNumbers.length&&!qnumbers.length)continue;
      const quarterKeys=qgroups.flatMap((g,i)=>g.map(q=>({q,yearIndex:i})));
      const barColors=quarterKeys.map(({q},k)=>{
        const x=center(quarterly.located[k] || q);
        const bar=(page.rectangles || []).filter(r=>r.alpha!==0&&r.left<=x&&r.right>=x&&r.top>=metricLabel.y-metricLabel.items[0].height&&r.bottom<annualLine.y&&r.right-r.left<(right-bounds[0].left)/qItems.length*1.2&&r.bottom-r.top>0)
          .sort((a,b)=>(b.bottom-b.top)-(a.bottom-a.top))[0];
        return bar?.color;
      });
      const actualColors=new Set(barColors.filter((c,k)=>c&&!estimateColors.has(c)&&annualMeta[quarterKeys[k].yearIndex].period==='actual'));
      const quarterlyMeta=quarterKeys.map(({q,yearIndex:i},k)=>{
        const color=barColors[k],period=estimateColors.has(color)?'forecast'
          :annualMeta[i].period==='actual'||actualColors.has(color)?'actual':'not specified';
        return {label:`${years[i].text} ${q.text}`,year:years[i].text,quarter:q.text,period};
      });
      annualRows.push(chartRow(label,'Annual chart',annual,annualMeta));
      quarterRows.push(chartRow(label,'Quarterly chart',quarterly,quarterlyMeta));
    }
    if (!annualRows.length) continue;
    const make = (id, title, rows) => ({ id, title: `${title}${fiscalEnd ? ` · FY ends ${fiscalEnd}` : ''}`, columns: rows[0].columnMeta.map(c => c.label), columnMeta: rows[0].columnMeta,
      rows, found: true, sourcePage: page.number, fiscalYearEnd: fiscalEnd || null, basis: 'not specified', note: 'Chart labels and fiscal periods are reproduced as printed; chart earnings may differ from historical GAAP data.' });
    return { tables: [make('analyst-annual-market-data', 'Annual forecasts', annualRows), make('analyst-quarterly-market-data', 'Quarterly forecasts', quarterRows)], issues };
  }
  return { tables: [], issues: [] };
}

// Text-only imports have no spatial evidence. Parse an explicitly headed table
// only when all cells match its schema; preserve ambiguous rows for review.
export function discoverTextTables(text, type) {
  const tables = [], issues = []; let table = null, page = null, caption = '';
  for (const raw of String(text).split('\n')) {
    const line = compact(raw), pageMatch = line.match(/^\[\[PAGE (\d+) OF/);
    if (pageMatch) { page = Number(pageMatch[1]); table = null; continue; }
    const header=line.match(/^(.*?)(\b\d{4}(?:[AEF]|\s+est\.?)?(?:\s+\d{4}(?:[AEF]|\s+est\.?)?)+(?:\s+\d+[ -]Year(?:\s+(?:Avg|CAGR))?)*)$/i);
    if (header) {
      const columns = header[2].match(/\d{4}(?:[AEF]|\s+est\.?)?|\d+[ -]Year(?:\s+(?:Avg|CAGR))?/gi);
      const title = compact(header[1]) || caption || 'Source table';
      const prefix = type === 'argus-a6' ? 'a6' : 'analyst', family = tableFamilies[keyFor(title)] || keyFor(title);
      table = { id: `${prefix}-${family}`, title, columns, columnMeta: columns.map(label=>sourcePeriod(label,title)), rows: [], sourcePage: page, found: true };
      tables.push(table); continue;
    }
    if (table) {
      const parts = line.split(' '); let first = -1;
      for (let i = 1; i < parts.length; i++) if (VALUE_PATTERN.test(parts[i]) && parts.slice(i).every(p => VALUE_PATTERN.test(p))) { first = i; break; }
      if (first > 0) {
        const label = parts.slice(0, first).join(' '), rawValues = parts.slice(first);
        const values = rawValues.length === table.columns.length ? rawValues : table.columns.map(() => null);
        table.rows.push({ key: keyFor(label), label, values, rawValues, validation: values[0] == null ? 'review-alignment' : 'text-schema' });
        if (values[0] == null) issues.push({ section: table.title, metric: label, sourcePage: page, reason: 'Text-only row does not match its explicit period headers.', rawValues });
        continue;
      }
    }
    if (captionLike(line) && /^[A-Z\s&()%/-]+$/.test(line)) { caption = line; table = null; }
  }
  return { tables: tables.filter(t => t.rows.length), issues };
}

import { positionedLines } from './pdf-document.js';
import { readAlignedRows } from './layout-tables.js';
import { compact, keyFor } from './financial-data.js';

const family = { financials: 'financials', 'margins-returns': 'margins', 'growth-ratios': 'growth', valuation: 'valuation',
  'operating-performance-profitability': 'profitability', 'financial-leverage': 'leverage', 'forecast-revisions': 'forecastRevisions' };
const rowKey = text => compact(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const center = i => i.x + i.width / 2;
const dateIn = text => text.match(/\bas of\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)?.[1] || null;
const familyKey=name=>keyFor(compact(name).replace(/\s*(?:[-–—:]\s*)?\(?continued\)?\s*$/i,''));
function splitHeaders(items) {
  const yearWidth = items.find(i => /^\d{4}$/.test(i.text))?.width;
  return items.flatMap(item => {
    const joined = item.text.match(/^(\d{4})\s+(\d+ Year (?:Avg|CAGR))$/);
    if (!joined || !yearWidth) return [item];
    const secondX = item.x + yearWidth + item.height * .25;
    return [{ ...item, text: joined[1], width: yearWidth }, { ...item, text: joined[2], x: secondX, width: item.x + item.width - secondX }];
  });
}

export function morningstarTables(document) {
  const tables = [], supplemental = [], issues = [];
  for (const page of document.pages || []) {
    const headings = page.lines.filter(l => {
      if (/^Forecast Revisions\b/.test(l.text)) return true;
      const groups=l.items.filter(i=>/^(Actual|Forecast)$/.test(i.text));
      const name=familyKey(l.text.split(/as of|\(Reporting Currency\)|\b(?:Actual|Forecast)\b/)[0]);
      if(!groups.length)return Object.hasOwn(family,name) && /continued|as of/i.test(l.text) && page.lines.some(h=>h.y>l.y && h.y<l.y+30 && h.items.some(c=>/^\d{4}[AEF]$/i.test(c.text)));
      return groups.length>1 || Object.hasOwn(family,name);
    });
    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i], revision = /^Forecast Revisions/.test(heading.text);
      const title = revision ? 'Forecast Revisions' : compact(heading.text.split(/as of|\(Reporting Currency\)|\b(?:Actual|Forecast)\b/)[0]);
      const header = revision ? page.lines.find(l => l.y > heading.y && l.y < heading.y + 25 && l.items.some(i => /^Current$/.test(i.text)))
        : page.lines.find(l => l.y > heading.y && l.y < heading.y + 30 && splitHeaders(l.items).some(i => /^\d{4}(?:[AEF])?$/i.test(i.text)));
      if (!header) { issues.push({ section: title, sourcePage: page.number, reason: 'The period header could not be read; no year assignments were invented.' }); continue; }
      const years = (revision ? heading : header).items.filter(i => /^\d{4}$/.test(i.text));
      const periods = splitHeaders(header.items).filter(i => revision ? /^(?:Current|Prior)$/.test(i.text) : /^(?:\d{4}[AEF]?|\d+[ -]Year (?:Avg|CAGR))$/i.test(i.text));
      if (!periods.length || (revision && !years.length)) {
        issues.push({section:title,sourcePage:page.number,reason:'The source period could not be assigned. Check the original table.'}); continue;
      }
      const forecast = heading.items.find(i => i.text === 'Forecast'), actual = heading.items.find(i => i.text === 'Actual');
      // A publisher can center a fiscal year above its two values; its left edge
      // need not precede the first value. Match complete printed pairs in order.
      const paired=revision && periods.length===years.length*2 && years.every((_,j)=>
        new Set(periods.slice(j*2,j*2+2).map(v=>v.text.toLowerCase())).size===2);
      const columns = periods.map((item,index) => {
        const tagged=item.text.match(/^(\d{4})([AEF])?$/i);
        const year = revision ? (paired ? years[Math.floor(index/2)].text : null) : tagged?.[1] || null;
        const variant = revision ? item.text.toLowerCase() : null;
        const label = revision ? `${year || 'Unresolved period'} ${item.text}` : item.text;
        return { key: revision ? `${year}-${variant}` : year || keyFor(label), label, year, variant,
          x: center(item), end: item.x + item.width,
          period: revision ? 'forecast' : !year ? 'summary' : tagged?.[2] ? (tagged[2].toUpperCase()==='A'?'actual':'forecast') : forecast && (!actual || item.x >= forecast.x) ? 'forecast' : actual && (!forecast || item.x >= actual.x) ? 'actual' : 'not specified' };
      });
      if(revision && !paired)issues.push({section:title,sourcePage:page.number,reason:'Current/prior headings could not be paired unambiguously with the printed years. Verify the original PDF.'});
      const nextScalar = page.lines.find(l => l.y > header.y && /^Key Valuation Drivers|^Discounted Cash Flow Valuation/.test(l.text));
      const footer = page.lines.find(l => l.y > header.y && /^©/.test(l.text));
      const schema = { title, columns, left: heading.items[0].x - 1, right: page.width, top: header.y + 2,
        bottom: Math.min(headings[i + 1]?.y || page.height, nextScalar?.y || page.height, footer?.y || page.height) - 2 };
      const parsed = readAlignedRows(page, schema, { allowSparse: true });
      const id = family[familyKey(title)] || familyKey(title);
      const result = { id, title, description: title, columns, rows: parsed.rows.map(r => ({ ...r, key: rowKey(r.label) })), sourcePage: page.number,
        totalPages: document.pageCount, asOf: dateIn(heading.text), priorAsOf: revision ? dateIn(header.text) : null,
        fiscalYearEnd: header.text.match(/ends\s+(\d{1,2}\s+\w+)/)?.[1] || null };
      if (['leverage', 'forecastRevisions'].includes(id)) supplemental.push(result); else tables.push(result);
      issues.push(...parsed.issues);
    }
    const scalarHeading = page.lines.find(l => /^Key Valuation Drivers\b/.test(l.text));
    if (scalarHeading) {
      const dcfStart = scalarHeading.items.find(i => /^Discounted/.test(i.text));
      const parts = [{ id: 'valuationDrivers', title: 'Key valuation drivers', left: scalarHeading.items[0].x, right: dcfStart?.x || page.width },
        ...(dcfStart ? [{ id: 'dcf', title: 'Discounted cash flow valuation', left: dcfStart.x, right: page.width }] : [])];
      for (const part of parts) {
        const footer = page.lines.find(l => l.y > scalarHeading.y && /^©/.test(l.text));
        const region = positionedLines(page.items, { left: part.left, right: part.right, top: scalarHeading.y + 2, bottom: footer?.y || page.height });
        const values = region.flatMap(l => l.items).filter(i => /^[−-]?(?:\d[\d,]*(?:\.\d+)?|—)$/.test(i.text));
        const rightmost = Math.max(...values.map(i => i.x + i.width));
        if (!Number.isFinite(rightmost)) continue;
        const column = { key: 'value', label: 'Model input', period: 'summary', x: rightmost - 5, end: rightmost };
        const parsed = readAlignedRows(page, { ...part, title: part.title, columns: [column], top: scalarHeading.y + 2, bottom: footer?.y || page.height }, { allowSparse: true });
        const currency = region.find(l => /^[A-Z]{3}\s+(?:Mil|Bil)$/.test(l.text))?.text;
        supplemental.push({ ...part, asOf: dateIn(scalarHeading.items.filter(i => i.x >= part.left && i.x < part.right).map(i => i.text).join(' ')),
          columns: [column], rows: parsed.rows.map(r => ({ ...r, key: rowKey(r.label), unit: r.unit || (/shares/i.test(r.label) ? currency?.replace(/^[A-Z]{3}/, 'shares') : currency) || null })), sourcePage: page.number, totalPages: document.pageCount });
        issues.push(...parsed.issues);
      }
    }
    const peersHeading = page.lines.find(l => l.text === 'Competitors');
    if (peersHeading) {
      const header = page.lines.find(l => l.y > peersHeading.y && l.y < peersHeading.y + 25 && l.items.length >= 4);
      if (header) {
        const groups = [];
        for (const item of header.items) {
          if (!groups.length || item.x - (groups.at(-1).at(-1).x + groups.at(-1).at(-1).width) > item.height * 2) groups.push([]);
          groups.at(-1).push(item);
        }
        const columns = groups.map((group, i) => ({ key: `peer-${i}`, label: compact(group.map(i => i.text).join(' ')), period: 'peer', x: group[0].x }));
        const rows = [];
        for (const line of page.lines.filter(l => l.y > header.y)) {
          const first = line.items[0];
          if (!first || Math.abs(first.x - peersHeading.items[0].x) > 3 || line.items.length <= 1) continue;
          if (/^©|^Morningstar Equity Analyst|^Page|^The |^This |^Business Strategy/.test(first.text)) break;
          const values = columns.map((c, i) => compact(line.items.filter(v => v.x >= c.x - 3 && v.x < (columns[i + 1]?.x - 3 || page.width)).map(v => v.text).join(' ')) || null);
          if (values.every(v => v == null)) continue;
          rows.push({ key: rowKey(first.text), label: first.text, values, sourcePage: page.number, validation: 'source-text' });
        }
        if (rows.length) supplemental.push({ id: 'competitors', title: 'Competitor comparison', columns, rows, sourcePage: page.number, totalPages: document.pageCount });
      }
    }
  }
  return { tables, supplemental, issues };
}

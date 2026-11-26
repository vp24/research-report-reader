import {printedBounds} from './cell-evidence.js';
import { compact, keyFor, financialValue, VALUE_PATTERN, PARSER_VERSION } from './financial-data.js';
import { positionedLines } from './pdf-document.js';

export function sourceFacts(document) {
  const facts = [];
  for (const page of document.pages || []) for (const line of page.lines) {
    for (let i = 0; i < line.items.length - 1; i++) {
      const label = line.items[i], value = line.items[i + 1];
      if (label.text.length > 100 || !/[A-Za-z]/.test(label.text) || /\b(?:Report|Rating Since)\b/i.test(label.text)) continue;
      if (VALUE_PATTERN.test(label.text) || value.x - label.x - label.width < 2 || value.x <= label.x) continue;
      const categorical=i===line.items.length-2&&label.x>=page.width*.5&&label.width<page.width*.35&&value.x>=page.width*.55&&value.x+value.width>=page.width*.85&&value.x-label.x-label.width>label.height*2&&/^[A-Za-z][A-Za-z /&.-]{1,65}$/.test(value.text);
      if (!VALUE_PATTERN.test(value.text) && !/^(?:[$€£¥][\d,.−-]+\s+(?:[BMKT]|billion|million|trillion)|[\d,.]+\s+(?:thousand|million|billion|trillion)|BUY|SELL|HOLD|HIGH|MEDIUM|LOW|OVER\s+WEIGHT|MARKET\s+WEIGHT|UNDER\s+WEIGHT)$/i.test(value.text)&&!categorical) continue;
      const box=printedBounds([value]);
      facts.push({ metric: compact(label.text).replace(/:$/, ''), raw: value.text, value: financialValue(value.text).value,
        sourcePage: page.number, sourceBounds: box, sourcePrecision: box?'value':'page',
        // A number followed by more numeric columns belongs to a series. A
        // scalar summary must not grab its first historical year as a headline.
        layout: line.items[i+2] && VALUE_PATTERN.test(line.items[i+2].text) ? 'series' : 'pair',
        validation: 'label-aligned' });
    }
  }
  return facts;
}

export function sourceIdentity(document) {
  for (const page of document.pages || []) {
    const ticker = page.items.find(i => /^(?:\(?)(?:NASDAQ|NYSE|NAS|NYS|NGS|NMS|ASE|AMEX|OTC|LSE|TSX)\s*:\s*[A-Z][A-Z0-9.-]*\)?$/.test(compact(i.text)));
    if (!ticker) continue;
    const candidates = page.items.filter(i => Math.abs(i.y - ticker.y) < Math.max(ticker.height * 6, page.height * .07)
      && i.x + i.width > ticker.x - page.width * .5 && /[A-Za-z]{3}/.test(i.text)
      && !/Report|Argus|Morningstar|\b(?:NASDAQ|NYSE|NAS|NYS|NGS|NMS|AMEX):/.test(i.text));
    const title = candidates.sort((a, b) => b.height - a.height)[0];
    if (title) return { title: title.text, ticker: compact(ticker.text).match(/:\s*([A-Z][A-Z0-9.-]*)/)[1], sourcePage: page.number };
  }
  return {};
}

export function readScores(document, fallback) {
  const labels = ['Industry', 'Management', 'Safety', 'Financial Strength', 'Growth', 'Value'];
  for (const page of document.pages || []) {
    const heading = page.items.find(i => /Argus A6 Sub.component Scores/i.test(i.text));
    if (!heading) continue;
    return labels.map(label => {
      const anchor = page.items.find(i => i.y > heading.y && i.x >= heading.x && i.text.replace(/\s/g, '').toLowerCase() === label.replace(/\s/g, '').toLowerCase());
      const score = anchor && page.items.filter(i => /^[HML]$/.test(i.text) && i.x < anchor.x && i.x > heading.x - 3 && Math.abs(i.y - anchor.y) < Math.max(8, anchor.height)).sort((a, b) => Math.abs(a.y - anchor.y) - Math.abs(b.y - anchor.y))[0];
      return { label, score: score?.text || null, sourcePage: page.number, validation: score ? 'label-aligned' : 'not-captured' };
    });
  }
  return fallback;
}

export function statementsFromSections(report, document = {}) {
  const sections = (report.sections || report.sectorSections || []).filter(s => s.found);
  const observations = [], updates = [];
  for (const section of sections) {
    const flattened = compact(section.body.replace(/([a-z])-\s*\n\s*([a-z])/g, '$1$2'));
    const sentences = flattened.split(/(?<=[.!?])\s+(?=[A-Z•])/);
    let previousPeriod = null;
    for (const sentence of sentences) {
      if (!/\d/.test(sentence) || sentence.length < 25) continue;
      const words = sentence.split(/\s+/);
      // Chart labels and numeric table streams are not analyst reasoning.
      // They are retained in structured tables rather than promoted as prose.
      if (words.filter(w => /[a-z]{2}/.test(w)).length / words.length < .45) continue;
      const periods = [...sentence.matchAll(/\b(?:FY\s*\d{2,4}|[1-4]\s*Q\s*\d{2,4}|Q[1-4]\s*\d{2,4}|\d{4})\b/g)].map(m => compact(m[0]));
      const origins = [];
      if (/\b(?:management|guidance|company expects|company is estimating|is guiding)\b/i.test(sentence)) origins.push('management guidance');
      if (/\b(?:our|we)\b[^.]{0,100}\b(?:estimate|forecast|expect|project|look for)\b/i.test(sentence)) origins.push('Argus estimate');
      if (/\bconsensus\b/i.test(sentence)) origins.push('consensus');
      const forward = /\b(?:guidance|estimate|forecast|expect|project|look for|guiding)\b/i.test(sentence);
      const quantities = [...sentence.matchAll(/(?:[$€£¥]\s*)?[−-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?:\s*[–−-]\s*[$€£¥]?[−-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+))?(?:\s*(?:%|billion|million|trillion|basis points|per share))?/gi)]
        .filter(m => /[$€£¥%.]|billion|million|trillion|basis points|per share/.test(m[0]))
        .map(m => {
          const prior = sentence.slice(Math.max(0, m.index - 50), m.index);
          const raw = compact(m[0]);
          const suffix = raw.match(/\s*(billion|million|trillion|basis points|per share)$/i)?.[1];
          const numericText = raw.replace(/\s*(billion|million|trillion|basis points|per share)$/i, '')
            .replace(/(\d)\s*([–−-])\s*([$€£¥]?\d)/g, '$1 $2 $3');
          const value = { ...financialValue(numericText), raw,
            ...(suffix ? (/billion|million|trillion/i.test(suffix) ? { scale: suffix.toLowerCase() } : { unit: suffix.toLowerCase() }) : {}) };
          if (/loss(?:es)?(?:\s+of)?\s*$/i.test(prior) && value.value !== null) value.value = -Math.abs(value.value);
          return { ...value, context: sentence.slice(Math.max(0, m.index - 60), m.index + m[0].length + 65),
            // Ambiguous multi-value sentences remain source excerpts. We do not
            // label every amount with the sentence's first year or first origin.
            period: periods.length === 1 ? periods[0] : null, origins: [...origins], validation: 'source-excerpt' };
        });
      const metric = sentence.match(/\b(?:our|new)\s+(?:(?:FY)?\d{2,4}\s+)?(.{2,65}?)\s+(?:guidance|estimate|forecast)\b/i)?.[1];
      const evidence = { metric: metric || section.title, raw: sentence, quantities, periods, contextPeriod: previousPeriod,
        sourcePage: section.page || null, sourcePages: section.sourcePages || [section.page].filter(Boolean), section: section.title,
        provider: 'Argus', reportType: report.type, reportDate: report.reportDate, sourceFile: report.fileName,
        periodType: forward ? 'forward-looking statement' : 'reported statement', basis: /non[ -]?GAAP|adjusted/i.test(sentence) && /\bGAAP\b/i.test(sentence.replace(/\bnon[ -]?GAAP\b/gi,'')) ? 'mixed (GAAP and adjusted)' : /non[ -]?GAAP|adjusted/i.test(sentence) ? 'adjusted' : /\bGAAP\b/.test(sentence) ? 'GAAP' : /\bcore\b/i.test(sentence) ? 'core' : 'not specified',
        origins, parserVersion: PARSER_VERSION, validation: 'source-excerpt' };
      const beginning = sentence.split(' ').slice(0, 9).join(' ');
      const foundPage = document.pages?.find(p => compact(p.items.map(i => i.text).join(' ')).includes(beginning));
      if (foundPage) { evidence.sourcePage = foundPage.number; evidence.sourcePages = [foundPage.number]; }
      observations.push(evidence);
      const tableStream = /Market Overview|Key Statistics|Sector Overview|Forecasted Growth|Report Created|Argus Analyst Report|Shares Outstanding.*(?:Price|Dividend|Yield)/i.test(sentence);
      if (forward && quantities.length && !tableStream) updates.push({ label: [origins.length === 1 ? origins[0] : 'Source outlook', periods.length === 1 ? periods[0] : null].filter(Boolean).join(' · '),
        value: sentence, comparison: null, sourcePage: evidence.sourcePage, evidence });
      if (periods.length === 1) previousPeriod = periods[0];
    }
  }
  const seen = new Set();
  return { observations, updates: updates.filter(u => { const k = u.value.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }) };
}

export function discoverOptionTables(document) {
  const tables = [];
  for (const page of document.pages || []) {
    const headings = page.items.filter(i => /^(?:Covered Call|Diagonal Spread) Strategy$/i.test(i.text)).sort((a, b) => a.x - b.x);
    if (headings.length < 2) continue;
    const groups = headings.map((h, index) => {
      const sampleLabels = page.items.filter(i => i.y > h.y && i.y < h.y + page.height * .2 && i.x < h.x + h.width / 2 && i.x > (index ? headings[index - 1].x + headings[index - 1].width : h.x - h.width) && i.text.length < 90 && /[a-z]/.test(i.text) && !VALUE_PATTERN.test(i.text));
      const left = Math.min(h.x, ...sampleLabels.map(i => i.x));
      return { heading: h, left };
    });
    for (let index = 0; index < groups.length; index++) {
      const { heading, left } = groups[index], right = groups[index + 1]?.left || page.width;
      const stop = page.items.find(i => i.y > heading.y && i.x >= left - 2 && /^(?:Option Strategy Comparison|Comparison of)/i.test(i.text));
      const local = positionedLines(page.items, { left: left - 1, right, top: heading.y + 3, bottom: stop?.y || page.height });
      const rows = []; let pending = '';
      for (let i = 0; i < local.length; i++) {
        const line = local[i];
        if (/^(?:Buy Side|Sell Side|Key Metrics)$/i.test(line.text)) { pending = ''; continue; }
        if (/^©|Argus Opinion|More Than|Less Than/.test(line.text)) break;
        const last = line.items.at(-1);
        const valid = VALUE_PATTERN.test(last.text) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(last.text) || /^[A-Z][A-Z0-9.-]{0,12}$/.test(last.text);
        if ((line.items.length >= 2 || pending) && valid) {
          const label = compact([pending, ...line.items.slice(0, -1).map(i => i.text)].filter(Boolean).join(' '));
          const next = local[i + 1];
          const wrap = pending && next && next.items.length === 1 && next.items[0].x < last.x && next.y - line.y < 12 && !VALUE_PATTERN.test(next.text);
          rows.push({ key: keyFor(label + (wrap ? ` ${next.text}` : '')), label: label + (wrap ? ` ${next.text}` : ''), values: [last.text], cellBounds: [printedBounds([last])], sourcePage: page.number });
          if (wrap) i++;
          pending = '';
        } else if (line.items.length === 1 && line.text.length < 75) pending = line.text;
      }
      tables.push({ id: `options-${keyFor(heading.text)}`, title: heading.text, columns: ['Source value'], columnMeta: [{ label: 'Source value', period: 'option scenario' }], rows, sourcePage: page.number, found: rows.length > 0 });
    }
  }
  return tables;
}

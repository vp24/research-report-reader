// Source values are lossless. A display dash, Nil, NM and a numeric zero are
// different states; ranges must never be reduced to their first endpoint.
export const PARSER_VERSION = '4.6.0';
export const compact = value => String(value ?? '').replace(/\s+/g, ' ').trim();
export const keyFor = value => compact(value).toLowerCase().replace(/\$/g, ' dollar ').replace(/%/g, ' percent ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const atom = '(?:[+−-]?(?:[$€£¥])?(?:\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)(?:[BMKT]|%|x)?|\\((?:[$€£¥])?(?:\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)(?:[BMKT]|%)?\\))';
const rangeAtom = `(?:${atom}|Nil|NM|NMF|N/M|N/A|--|[—–])`;
export const VALUE_PATTERN = new RegExp(`^(?:${rangeAtom}(?:\\s+(?:to|[–—-])\\s+${rangeAtom})?|${atom}|NA|-|−|Higher|Lower|Unchanged|Flat)$`, 'i');
export function financialValue(raw, meta = {}) {
  const text = compact(raw);
  const result = { raw: raw == null ? null : text, value: null, status: 'unresolved', ...meta };
  if (raw == null || !text) return { ...result, status: 'not-captured' };
  if (/^(?:--?|[—–−]|N\/?A)$/i.test(text)) return { ...result, status: 'source-missing' };
  if (/^Nil$/i.test(text)) return { ...result, status: 'nil' };
  if (/^N\/?M[F]?$/i.test(text)) return { ...result, status: 'not-meaningful' };
  if (/^(?:Higher|Lower|Unchanged|Flat)$/i.test(text)) return { ...result, status: 'text' };
  if (!VALUE_PATTERN.test(text)) return result;
  const range = text.match(new RegExp(`^(${rangeAtom})\\s+(?:to|[–—-])\\s+(${rangeAtom})$`, 'i'));
  if (range) {const endpoints=range.slice(1).map(v=>financialValue(v,meta));return { ...result, status: endpoints.some(v=>v.status==='unresolved')?'unresolved':'range', range: endpoints.map(v=>v.value), endpoints };}
  const numeric=text.replace(/[$€£¥()%xBMKT]/gi,'').replace(/^[+−-]/,'');
  if(numeric.includes(',')&&!/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(numeric))return result;
  const number = Number(text.replace(/[,$€£¥()%xBMKT]/gi, '').replace(/−/g, '-'));
  const suffix = text.match(/([BMKT])\)?$/i)?.[1]?.toUpperCase();
  return { ...result, value: Number.isFinite(number) ? (text.startsWith('(') ? -number : number) : null,
    status: Number.isFinite(number) ? 'number' : 'unresolved',
    ...(suffix ? { scale: { B: 'billion', M: 'million', K: 'thousand', T: 'trillion' }[suffix] } : {}),
    unit: /%/.test(text) ? '%' : /[$€£¥]/.test(text) ? text.match(/[$€£¥]/)[0] : meta.unit ?? null };
}
export function unitFor(label, context = '') {
  const explicit = compact(label).match(/\(([^)]+)\)\s*$/)?.[1];
  if (explicit && /(?:USD|EUR|GBP|CAD|JPY|AUD|[$€£¥%]|Mil|Bil|^B$|^M$|days|ratio)/i.test(explicit)) return explicit;
  if (/%/.test(label)) return '%';
  if (/\b(?:EPS|per share|Dividend)\b/i.test(label) && /except per share/i.test(context)) return 'per share';
  return explicit || compact(context).match(/\(([^)]+)\)/)?.[1] || null;
}
export function accountingBasis(label, context = '') {
  if (/adjusted|non[ -]?GAAP|normaliz|core\b/i.test(label)) return /core/i.test(label) ? 'core' : 'adjusted';
  if(/\bGAAP\b/i.test(label))return 'GAAP';
  if (/\bGAAP\b/.test(context) && !/non[ -]?GAAP/i.test(context)) return 'GAAP';
  return 'not specified';
}
export function attachProvenance(report, tables = report.tables || []) {
  report.observations ||= [];
  for (const table of tables) {
    table.rows.forEach(row => {
      const meta = { provider: report.provider || 'Argus', reportType: report.type, reportDate: report.reportDate,
        sourceFile: report.fileName || null, sourcePage: row.sourcePage || table.sourcePage, section: table.title,
        metric: row.label, unit: row.unit || unitFor(row.label, table.unitContext),
        basis: row.basis || accountingBasis(row.label, table.basis || table.unitContext), parserVersion: PARSER_VERSION };
      row.cells = row.values.map((raw, i) => {
        const column = row.columnMeta?.[i] || table.columnMeta?.[i] || { label: table.columns[i] };
        return financialValue(raw, { ...meta, period: column.label, periodType: column.period || 'not specified',
          fiscalYear: column.year || (/^\d{4}$/.test(column.label) ? column.label : null), quarter: column.quarter || null,
          estimateSource: column.estimateSource || (column.period === 'forecast' ? report.provider || 'Argus' : null),
          variant: column.variant || null, modelDate: column.variant === 'prior' ? table.priorAsOf : table.asOf || null,
          validation: row.validation || 'aligned', sourceBounds: row.bounds || null });
      });
      report.observations.push(...row.cells);
    });
  }
  report.parserVersion = PARSER_VERSION;
  return report;
}

// Share the exact same source columns between the on-screen tables and text export.
export const periodLabel = period => ({actual:'Actual',forecast:'Forecast',summary:'Summary',peer:'Peer'}[period] || 'Period not specified');
export const columnIdentity = c => JSON.stringify([c.key ?? c.label, c.label ?? '', c.period ?? '', c.variant ?? '', c.occurrence || 1]);
export function groupColumns(group) {
  const all = new Map();
  for (const m of group.metrics) for (const c of m.series || []) if (!all.has(columnIdentity(c))) all.set(columnIdentity(c),c);
  return [...all.values()];
}
export function unitLabel(metric) {
  const raw = metric.sourceUnit || ({usdMillions:'USD Mil',usdPerShare:'USD per share',percent:'%',multiple:'×'}[metric.unit]);
  return raw ? String(raw).replace(/\bMil\b/g,'millions').replace(/\bBil\b/g,'billions').replace(/\bTril\b/g,'trillions') : '';
}
export function sourceTextValue(raw,validation) {
  if(validation==='review-alignment')return 'Check source alignment';
  return raw == null || raw === '' ? 'Not captured' : String(raw);
}

// A chart can mark one measure as forecast before another. Only give a whole
// column one status when every row agrees, including its forecast source.
export function rowPeriod(table,row,i) {
  const m=row?.columnMeta?.[i] || table.columnMeta?.[i] || {};
  return {period:m.period || '',estimateSource:m.estimateSource || ''};
}
export function tablePeriods(table) {
  return table.columns.map((_,i)=>{
    const rows=table.rows?.length ? table.rows : [null];
    const types=new Map(rows.map(row=>{const m=rowPeriod(table,row,i);return [JSON.stringify(m),m];}));
    return types.size>1 ? {mixed:true} : types.values().next().value;
  });
}

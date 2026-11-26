import {quotedValue} from './quoted-value.js';
import {addYearFocus,tagYear} from './year-focus.js';
import {groupColumns,columnIdentity,periodLabel,unitLabel} from './report-periods.js';
import { createSourceViewer } from "./source-viewer.js";
import { createReportFinder, installSectionNavigation } from "./report-navigation.js";
import { installTableNavigation } from "./reading-tools.js";
import { createArgusImporter } from "./argus-import.js";
import { extractPdfDocument, missingPageNote, pdfOpenMessage } from "./pdf-document.js";
import { financialValue } from './financial-data.js';
import {formatFinancialDisplay} from './display-values.js';
import * as pdfjsLib from "./vendor/pdf.min.mjs";
import {
  FACT_DEFINITIONS,
  SECTION_DEFINITIONS,
  analyzeReport,
  buildPlainTextSummary,
  mergePreferences
} from "./parser.js";
import { parseArgusDocument, combineParsedArgusReports, buildArgusPlainTextSummary, detectResearchDocument } from "./argus-parser.js";
import { renderArgusReport } from "./argus-results.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).toString();

const refs = {
  openPdf: document.querySelector("#open-pdf"),
  sidebarOpenMorningstar: document.querySelector("#sidebar-open-morningstar"),
  sidebarOpenArgus: document.querySelector("#sidebar-open-argus"),
  emptyOpenMorningstar: document.querySelector("#empty-open-morningstar"),
  emptyOpenArgus: document.querySelector("#empty-open-argus"),
  fileInput: document.querySelector("#pdf-file"),
  providerDialog: document.querySelector("#provider-dialog"),
  chooseMorningstar: document.querySelector("#choose-morningstar"),
  chooseArgus: document.querySelector("#choose-argus"),
  dropZone: document.querySelector("#drop-zone"),
  dropOverlay: document.querySelector("#drop-overlay"),
  librarySearch: document.querySelector("#library-search"),
  libraryProviderFilter: document.querySelector("#library-provider-filter"),
  reportLibrary: document.querySelector("#report-library"),
  libraryEmpty: document.querySelector("#library-empty"),
  reportCount: document.querySelector("#report-count"),
  workspace: document.querySelector("#workspace"),
  workspaceContext: document.querySelector("#workspace-context"),
  workspaceTitle: document.querySelector("#workspace-title"),
  statusPill: document.querySelector("#status-pill"),
  reportMenu: document.querySelector("#report-menu"),
  copySummary: document.querySelector("#copy-summary"),
  saveSummary: document.querySelector("#save-summary"),
  removeCurrentReport: document.querySelector("#remove-current-report"),
  emptyState: document.querySelector("#empty-state"),
  reportView: document.querySelector("#report-view"),
  argusReportView: document.querySelector("#argus-report-view"),
  providerBadge: document.querySelector("#provider-badge"),
  tickerMark: document.querySelector("#ticker-mark"),
  reportTitle: document.querySelector("#report-title"),
  reportMeta: document.querySelector("#report-meta"),
  starRating: document.querySelector("#star-rating"),
  heroPrice: document.querySelector("#hero-price"),
  heroFairValue: document.querySelector("#hero-fair-value"),
  heroPriceFve: document.querySelector("#hero-price-fve"),
  heroMoat: document.querySelector("#hero-moat"),
  heroMoatTrend: document.querySelector("#hero-moat-trend"),
  forecastDescription: document.querySelector("#forecast-description"),
  priorityCoverage: document.querySelector("#priority-coverage"),
  priorityGrid: document.querySelector("#priority-grid"),
  factsGrid: document.querySelector("#facts-grid"),
  sectionsList: document.querySelector("#sections-list"),
  sourceSection: document.querySelector("#source-section"),
  historyToggle: document.querySelector("#history-toggle"),
  tableTabs: document.querySelector("#table-tabs"),
  sourceTableHost: document.querySelector("#source-table-host"),
  qualityScore: document.querySelector("#quality-score"),
  qualityDetail: document.querySelector("#quality-detail"),
  toast: document.querySelector("#toast")
};

const sourceViewer = createSourceViewer(pdfjsLib, document.getElementById('source-viewer'));
const reportFinder = createReportFinder(refs.workspace, () => currentMode === 'argus' ? refs.argusReportView : refs.reportView);
installSectionNavigation(refs.workspace);

const preferences = mergePreferences({ showHistorical: true, showMissing: true });
const factOrder = ["uncertainty", "capitalAllocation", "financialHealth", "marketCap", "equityStyleBox", "analyst"];
const sectionOrder = [
  "analystNote",
  "valuation",
  "risk",
  "bulls",
  "bears",
  "businessStrategy",
  "economicMoat",
  "capitalAllocation",
  "companyProfile"
];
const sourceTableLabels = {
  financials: "Financials",
  margins: "Margins",
  growth: "Growth",
  valuation: "Valuation",
  profitability: "Profitability",
  leverage: "Leverage",
  forecastRevisions: "Revisions"
};

let currentReport = null;
let currentArgusBundle = null;
let currentMode = null;
let pendingProvider = null;
let currentRecord = null;
let sourceDocuments = [];
let currentFileName = "";
let savedReports = [];
let activeLibraryProvider = "all";
let activeTableId = "";
let showHistorical = true;
let toastTimer = null;
let dragDepth = 0;
let operationBusy = false;
let sessionVersion = 0;

function clear(node) {
  node.replaceChildren();
}

function make(tag, className = "", text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showToast(message) {
  clearTimeout(toastTimer);
  refs.toast.textContent = message;
  refs.toast.hidden = false;
  toastTimer = setTimeout(() => {
    refs.toast.hidden = true;
  }, 2600);
}

function showError(message) {
  const box = document.getElementById('operation-error');
  box.querySelector('span').textContent = message;
  box.hidden = false;
}

async function runReportOperation(task) {
  if (operationBusy) return false;
  operationBusy = true;
  document.getElementById('operation-error').hidden = true;
  setLoadingDisabled(true);
  try { return await task(); } catch (error) { showError(error.message || 'The operation could not be completed.'); return false; } finally { operationBusy = false; setLoadingDisabled(false); }
}

function renderOriginalPdfActions(documents) {
  sourceDocuments = documents;
  const host = document.getElementById('original-pdf-actions');
  clear(host);
  if (!currentRecord || !window.desktopApi?.openOriginalPdf) return;
  const recordId = currentRecord.id;
  const names = { 'morningstar': 'Morningstar', 'argus-analyst': 'Argus Analyst', 'argus-a6': 'Argus A6', 'argus-options': 'Argus Options' };
  if (documents.length < 3 && documents.every(d => String(d.type).startsWith('argus-'))) {
    const launch = () => { if (operationBusy) return; refs.reportMenu.open=false; argusImporter.show(documents, recordId); };
    const button = make('button', 'add-argus-sources', 'Add another source');
    button.type='button';button.id='add-argus-sources';button.onclick=launch;
    const heading=refs.argusReportView.querySelector('.argus-source-set-heading');
    if (heading) heading.append(button);
    refs.argusReportView.querySelectorAll("[data-add-argus-type]").forEach(card => { card.onclick=launch; });
    const menuButton=make('button', '', 'Add remaining Argus reports…');
    menuButton.type='button';menuButton.onclick=launch;host.append(menuButton);
  }
  documents.forEach((source, index) => {
    const button = make('button', '', `Open ${names[source.type] || source.name} PDF`);
    button.type = 'button';
    button.title = source.name;
    button.dataset.sourceType = source.type;
    button.dataset.sourcePage = "1";

    host.append(button);
  });
}

function sourcePdfButton(page = null) {
  const button = make('button', 'source-pdf-button', page ? `Source PDF · p. ${page}` : 'Source PDF');
  button.type = 'button';
  button.dataset.sourceType = 'morningstar';
  if (page) button.dataset.sourcePage = String(page);
  button.title = page ? `View original PDF at page ${page}` : 'Open original PDF';
  return button;
}

refs.workspace.addEventListener('click', async event => {
  const button = event.target.closest('[data-source-type]');
  if (!button) return;
  event.preventDefault(); // A source button inside a summary must not collapse the section.
  if (operationBusy || !currentRecord || !window.desktopApi?.openOriginalPdf) return;
  const index = sourceDocuments.findIndex(source => source.type === button.dataset.sourceType);
  if (index < 0) { showError('The matching source PDF is unavailable. Reopen this session report.'); return; }
  refs.reportMenu.open = false;
  const recordId = currentRecord.id;
  const evidence=button.dataset.evidence ? JSON.parse(button.dataset.evidence) : null;
  sourceViewer.open(sourceDocuments, index, Number(button.dataset.sourcePage) || 1, (selectedIndex, page) => window.desktopApi.openOriginalPdf({id:recordId,index:selectedIndex,sourceType:sourceDocuments[selectedIndex]?.type,page}), evidence);
});
refs.workspace.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('td[data-source-type]')){event.preventDefault();event.target.click();}});
installTableNavigation(refs.workspace);

function setStatus(message, tone = "ready") {
  refs.statusPill.textContent = message;
  refs.statusPill.className = `status-pill ${tone}`;
  refs.statusPill.hidden = message === "Ready";
}

function titleWithTicker(report) {
  return report.ticker ? `${report.title} (${report.ticker})` : report.title;
}

function cleanFileTitle(name = "Research report") {
  return String(name).replace(/\.pdf$/i, "").trim() || "Research report";
}

function safeFileBase(value = "Morningstar-summary") {
  return String(value)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "Morningstar-summary";
}

function byteView(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (Array.isArray(bytes)) return new Uint8Array(bytes);
  if (bytes?.data && Array.isArray(bytes.data)) return new Uint8Array(bytes.data);
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return new Uint8Array(bytes || []);
}

function isolatedArrayBuffer(bytes) {
  const view = byteView(bytes);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

function reportMetadata(report) {
  return {
    title: report.title,
    ticker: report.ticker,
    provider: report.provider,
    reportDate: report.facts.reportDate,
    modelAsOf: report.forecastModel?.asOf,
    currentPrice: report.facts.currentPrice,
    fairValue: report.facts.fairValue,
    priceFairValue: report.facts.priceFairValue,
    economicMoat: report.facts.economicMoat,
    starRating: report.facts.starRating,
    analyst: report.facts.analyst
  };
}

function argusMetadata(bundle) {
  const analyst = bundle.analyst || bundle.options || null;
  const latestDate = bundle.reports
    .map((report) => report.reportDate)
    .filter(Boolean)
    .sort((a, b) => (Date.parse(b) || 0) - (Date.parse(a) || 0))[0] || "";
  return {
    title: bundle.title,
    ticker: bundle.ticker,
    provider: "Argus",
    reportDate: latestDate,
    currentPrice: bundle.latestPrice || "",
    rating: analyst?.rating || bundle.a6?.rating || "",
    targetPrice: bundle.targetComparison?.analystTarget || bundle.targetComparison?.a6Target || "",
    analyst: bundle.analyst?.analyst || "",
    reportKinds: bundle.reports.map((report) => report.label).join(", "),
    reportCount: String(bundle.reports.length)
  };
}

function displayRecordName(record) {
  if (record.title && record.ticker) return `${record.title} (${record.ticker})`;
  return record.title || cleanFileTitle(record.fileName);
}

function libraryAvatar(record) {
  if (record.ticker) return record.ticker.slice(0, 4).toUpperCase();
  const words = displayRecordName(record).split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "PDF";
}

function libraryMeta(record) {
  if (record.unavailable) return "PDF unavailable—add the original again";
  const parts = [];
  const provider = String(record.provider || "").toLowerCase();
  if (provider === "argus") {
    if (record.rating) parts.push(record.rating);
    if (record.targetPrice) parts.push(`Target ${record.targetPrice}`);
    if (record.reportCount) parts.push(`${record.reportCount} source${record.reportCount === "1" ? "" : "s"}`);
    if (record.reportDate) parts.push(record.reportDate);
  } else {
    if (record.reportDate) parts.push(record.reportDate);
    if (record.fairValue) parts.push(`FVE ${record.fairValue}`);
  }
  if (!parts.length && record.importedAt) {
    const date = new Date(record.importedAt);
    if (!Number.isNaN(date.getTime())) parts.push(`Added ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`);
  }
  return parts.join(" · ") || "Session PDF";
}

function renderLibrary() {
  clear(refs.reportLibrary);
  refs.reportCount.textContent = String(savedReports.length);
  const query = refs.librarySearch.value.trim().toLowerCase();
  const visible = savedReports.filter((record) => {
    const provider = String(record.provider || "Morningstar").toLowerCase();
    if (activeLibraryProvider !== "all" && provider !== activeLibraryProvider) return false;
    const haystack = [record.title, record.ticker, record.fileName, record.reportDate, record.provider].filter(Boolean).join(" ").toLowerCase();
    return !query || haystack.includes(query);
  });

  const emptyTitle = refs.libraryEmpty.querySelector("strong");
  const emptyCopy = refs.libraryEmpty.querySelector("span");
  refs.libraryEmpty.hidden = visible.length > 0;
  if (!visible.length && savedReports.length) {
    emptyTitle.textContent = "No matching reports";
    emptyCopy.textContent = activeLibraryProvider === "all"
      ? "Try a company name, ticker, or clear the search."
      : `No ${activeLibraryProvider === "argus" ? "Argus" : "Morningstar"} reports match this view.`;
  } else {
    emptyTitle.textContent = "No reports open";
    emptyCopy.textContent = "Add a Morningstar or Argus PDF to start reading.";
  }

  visible.forEach((record) => {
    const item = make("article", `library-item ${currentRecord?.id === record.id ? "active" : ""}`);
    item.dataset.reportId = record.id;
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-label", `Open ${displayRecordName(record)}`);

    const avatar = make("span", "library-avatar", libraryAvatar(record));
    const copy = make("span", "library-item-copy");
    const titleRow = make("span", "library-item-title-row");
    titleRow.append(make("span", "library-item-title", displayRecordName(record)));
    if (record.provider) titleRow.append(make("span", `library-provider-tag ${String(record.provider).toLowerCase() === "argus" ? "is-argus" : "is-morningstar"}`, record.provider));
    copy.append(titleRow, make("span", "library-item-meta", libraryMeta(record)));
    const remove = make("button", "library-remove");
    remove.type = "button";
    remove.dataset.removeReportId = record.id;
    remove.setAttribute("aria-label", `Remove ${displayRecordName(record)}`);
    remove.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 7v8M10 7v8M13.5 7v8M4 4.5h12M8 4.5V3h4v1.5M5 4.5l.7 12h8.6l.7-12"></path></svg>';
    item.append(avatar, copy, remove);
    refs.reportLibrary.append(item);
  });
}

async function refreshLibrary() {
  if (!window.desktopApi?.listReports) return;
  savedReports = await window.desktopApi.listReports();
  if (currentRecord) {
    currentRecord = savedReports.find((record) => record.id === currentRecord.id) || currentRecord;
  }
  renderLibrary();
}

function showEmptyState() {
  sourceViewer.close(); reportFinder.reset();
  sourceDocuments = [];
  document.getElementById("find-report").hidden = true;
  currentReport = null;
  currentArgusBundle = null;
  currentMode = null;
  currentRecord = null;
  currentFileName = "";
  refs.emptyState.hidden = false;
  refs.reportView.hidden = true;
  refs.argusReportView.hidden = true;
  refs.reportMenu.hidden = true;
  refs.reportMenu.open = false;
  refs.workspaceContext.textContent = "Report reader";
  refs.workspaceTitle.textContent = "Research Report Reader";
  setStatus("Ready");
  renderLibrary();
  document.dispatchEvent(new CustomEvent("reader:reset"));
  refs.workspace.scrollTo({ top: 0, left: 0 });
}

function renderStars(value) {
  clear(refs.starRating);
  const count = Number(String(value || "").match(/[1-5]/)?.[0]) || 0;
  for (let index = 1; index <= 5; index += 1) {
    refs.starRating.append(make("span", index <= count ? "filled" : "", "★"));
  }
  refs.starRating.setAttribute("aria-label", count ? `${count} out of 5 stars` : "Rating unavailable");
}

function displayFactValue(report, definition) {
  const value = report.facts[definition.id];
  if (definition.id === "economicMoat" && value === "None") return "None (no moat)";
  if (value) return value;
  const notProvided = report.completeness.notProvidedFacts?.some((item) => item.id === definition.id);
  if (notProvided) return "Not provided in source";
  return "Not captured—check source";
}

function formatModelValue(value, unit, compact = false) {
  return formatFinancialDisplay(value,unit,compact);
}

function importantMetricsList(important) {
  return [
    ...(important?.groups || []).flatMap((group) => group.metrics || []),
    ...(important?.revisions?.metrics || [])
  ];
}

function highlightedSourceRows(important) {
  const rowsByTable = new Map();
  importantMetricsList(important).forEach((metric) => {
    for(const part of metric.sources || [{tableId:metric.sourceTableId,rowKey:metric.sourceRowKey}]){
      if(!part.tableId||!part.rowKey)continue;
      if(!rowsByTable.has(part.tableId))rowsByTable.set(part.tableId,new Set());
      rowsByTable.get(part.tableId).add(part.rowKey);
    }
  });
  return rowsByTable;
}

function sourceTables(report) {
  const model = report.forecastModel || {};
  return [...(model.tables || []), ...(model.supplementalTables || [])];
}

function defaultSourceTableId(report) {
  const tables = sourceTables(report);
  const markedRows = highlightedSourceRows(report.forecastModel?.importantMetrics);
  return tables.reduce((best, table) => {
    const keyRowCount = markedRows.get(table.id)?.size || 0;
    if (!best || keyRowCount > best.keyRowCount) return { id: table.id, keyRowCount };
    return best;
  }, null)?.id || tables[0]?.id || "";
}

function orderedImportantGroups(important) {
  const order = ["earnings", "performance", "margins", "growth", "valuation", "leverage"];
  return [...(important?.groups || [])].sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
}

function appendSourceJump(target, tableIds) {
  const uniqueTableIds = [...new Set(tableIds.filter(Boolean))];
  if (!uniqueTableIds.length) return;

  const footer = make("footer", "source-jump-row");
  footer.append(make("span", "", "Source table"));
  uniqueTableIds.forEach((tableId) => {
    const part=sourceTables(currentReport || {}).find(t=>t.id===tableId);
    const button = make("button", "tiny-link-button", part?.instanceLabel || sourceTableLabels[tableId] || part?.title || tableId);
    button.type = "button";
    button.dataset.openTable = tableId;
    footer.append(button);
  });
  target.append(footer);
}

function columnClasses(column, index, columns) {
  const classes = ["metric-data-column", `${column.period || "summary"}-column`];
  if (column.period === "forecast" && columns[index - 1]?.period !== "forecast") classes.push("forecast-start");
  return classes.join(" ");
}

function periodHeader(column, index, columns) {
  const header = make("th", `metric-period-header ${columnClasses(column, index, columns)}`);
  header.scope = "col";tagYear(header,column.year);
  header.append(
    make("span", "metric-period", column.label || "—"),
    make("small", "metric-period-label", periodLabel(column.period))
  );
  return header;
}

function appendMetricUnit(label, metric) {
  const unit=unitLabel(metric);
  if(unit)label.append(make('small','metric-unit',unit));
  if(metric.contextNote)label.append(make('small','metric-context',metric.contextNote));
}

function attachEvidence(cell,evidence){
  if(!evidence.sourcePage)return cell;
  const parsed=financialValue(evidence.raw),states={'source-missing':'The report prints a dash or N/A','not-captured':'No value extracted; verify the original','not-meaningful':'Not meaningful (as reported)','nil':'Nil (as reported)','unresolved':'Unresolved format; preserved as printed','number':'Numeric format recognized; check the original','range':'Range preserved; check the original'};
  const status=evidence.validation==='review-alignment'?'Ambiguous row alignment; do not rely on a year assignment':states[parsed.status] || parsed.status;
  cell.tabIndex=0;cell.setAttribute('role','button');cell.setAttribute('aria-label',`${evidence.metric}, ${evidence.period}: ${cell.textContent}. View source.`);
  cell.dataset.sourceType='morningstar';cell.dataset.sourcePage=evidence.sourcePage;cell.dataset.evidence=JSON.stringify({...evidence,status});
  return cell;
}

function renderMetricGroup(group) {
  const section = make("section", `key-metric-group key-group-${group.id}`);
  const columns = groupColumns(group);
  const heading = make("div", "key-group-heading");
  const copy = make("span", "key-group-copy");
  copy.append(
    make("strong", "", group.title),
    make("small", "", group.description || "Selected report fields")
  );
  heading.append(copy, make("span", "key-group-count", `${group.metrics.length} ${group.metrics.length === 1 ? "field" : "fields"}`));
  const pages = [...new Set(group.metrics.flatMap(m=>m.sourcePages || [m.sourcePage]).filter(Boolean))];
  for(const page of pages)heading.append(sourcePdfButton(page));
  section.append(heading);

  const scroll = make("div", "key-metrics-table-scroll");
  scroll.tabIndex = 0;
  scroll.setAttribute("role", "region");
  scroll.setAttribute("aria-label", `${group.title}: scroll horizontally for all years`);
  const table = make("table", "compact-model-table key-metrics-table");
  table.style.setProperty("--period-count", String(columns.length));
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const metricHeader = make("th", "metric-name-header", "Metric");
  metricHeader.scope = "col";
  headerRow.append(metricHeader);
  columns.forEach((column, index) => headerRow.append(periodHeader(column, index, columns)));
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  group.metrics.forEach((metric) => {
    const row = make("tr", "key-metric-row");
    const label = make("th", "metric-name-cell", metric.label);
    appendMetricUnit(label, metric);
    label.scope = "row";
    row.append(label);
    const points = new Map((metric.series || []).map(point => [columnIdentity(point), point]));
    columns.forEach((column, index) => {
      const point = points.get(columnIdentity(column));
      const value = !point ? '·' : point.validation==='review-alignment' ? 'Review' : point.value==null ? 'Not captured' : formatModelValue(point.value, metric.unit, true);
      const cell=make("td", `${columnClasses(column, index, columns)}${value === "—" ? " missing-value" : ""}`, value);
      tagYear(cell,column.year);
      if (!point) cell.setAttribute("aria-label","This period is not in the source row");
      if(point)attachEvidence(cell,{metric:point.sourceLabel || metric.label,period:column.label,kind:column.period,raw:point.value,sourcePage:point.sourcePage,sourceBounds:point.sourceBounds,sourcePrecision:point.sourcePrecision,validation:point.validation,basis:point.basis,unit:metric.sourceUnit || {usdMillions:'USD millions',usdPerShare:'USD per share',percent:'%',multiple:'×'}[metric.unit] || metric.unit,modelDate:point.modelDate});
      row.append(cell);
    });
    tbody.append(row);
  });
  table.append(tbody);
  scroll.append(table);
  section.append(scroll);
  return section;
}

function renderRevisionTable(revisions) {
  const table = make("table", "compact-model-table revision-table");
  const years = [...new Set(revisions.metrics.flatMap((metric) => metric.pairs.map((pair) => pair.year)))];
  table.style.setProperty("--revision-year-count", String(years.length));
  const thead = document.createElement("thead");
  const yearRow = document.createElement("tr");
  const metricHeader = make("th", "revision-metric-column", "Metric");
  metricHeader.scope = "col";
  metricHeader.rowSpan = 2;
  yearRow.append(metricHeader);
  years.forEach((year, index) => {
    const header = make("th", `revision-year-group${index ? "" : " revision-first-year"}`, year);
    header.colSpan = 2;tagYear(header,year);
    header.scope = "colgroup";
    yearRow.append(header);
  });
  const variantRow = document.createElement("tr");
  years.forEach((year, index) => {
    variantRow.append(
      tagYear(make("th", `revision-current-column${index ? "" : " revision-first-year"}`, "Current"),year),
      tagYear(make("th", "revision-prior-column", "Previous"),year)
    );
  });
  thead.append(yearRow, variantRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  revisions.metrics.forEach((metric) => {
    const row = document.createElement("tr");
    const label = make("th", "revision-metric-column", metric.label);
    appendMetricUnit(label, metric);
    label.scope = "row";
    row.append(label);
    const pairs = new Map(metric.pairs.map((pair) => [pair.year, pair]));
    years.forEach((year, index) => {
      const pair=pairs.get(year),proof=metric.pairSources?.[year] || {};
      for(const variant of ['current','prior']){
        const validation=proof.validation || metric.validation;
        const value=!pair?'·':validation==='review-alignment'?'Review':pair[variant]==null?'Not captured':formatModelValue(pair[variant],metric.unit,true);
        const cell=tagYear(make('td',variant==='current'?`revision-current-column${index?'':' revision-first-year'}`:'revision-prior-column muted-cell',value),year);
        if(pair)attachEvidence(cell,{metric:metric.sourceLabel || metric.label,period:`${year} ${variant}`,variant,kind:'forecast revision',raw:pair[variant],sourcePage:proof.page || metric.sourcePage,sourceBounds:proof[variant]?.sourceBounds || proof.bounds || metric.sourceBounds,sourcePrecision:proof[variant]?.sourcePrecision || 'row',validation,basis:metric.basis,unit:metric.sourceUnit || metric.unit,modelDate:variant==='prior'?(proof.priorModelDate || metric.priorModelDate):(proof.modelDate || metric.modelDate)});
        else cell.setAttribute('aria-label','This period is not in the source row');
        row.append(cell);
      }
    });
    tbody.append(row);
  });
  table.append(tbody);
  return table;
}

function renderPriorityMetrics(report) {
  const model = report.forecastModel || {};
  const important = model.importantMetrics;
  clear(refs.priorityGrid);

  const range=(years,label)=>years?.length ? (years.length===1?years[0]:years[0]+'–'+years.at(-1))+' '+label : null;
  const actualRange=range(model.actualYears,'actual');
  const forecastRange=range(model.forecastYears,'forecast');
  const asOf=model.asOf?'Model as of '+model.asOf:model.modelDates?.length>1?'Multiple printed model dates':null;
  refs.forecastDescription.textContent = [actualRange, forecastRange, asOf].filter(Boolean).join(" · ");

  if (!important?.found) {
    refs.priorityCoverage.hidden = false;
    refs.priorityCoverage.textContent = "Model unavailable";
    refs.priorityCoverage.className = "coverage-pill warning";
    const card = make("article", "priority-card empty-priority");
    card.append(
      make("h3", "", "Morningstar valuation model was not found"),
      make("p", "", "Use the complete downloaded report PDF so the app can capture forecasts, valuation multiples, leverage, and revisions.")
    );
    refs.priorityGrid.append(card);
    return;
  }

  const coverage = important.coverage || { found: 0, expected: 16, sectionsFound: 0, sectionsExpected: 6 };
  const complete = coverage.found === coverage.expected && coverage.sectionsFound === coverage.sectionsExpected;
  refs.priorityCoverage.hidden = complete;
  refs.priorityCoverage.textContent = `${coverage.found} of ${coverage.expected} fields found`;
  refs.priorityCoverage.className = "coverage-pill warning";

  const sourceTableIds = [];
  const groups = orderedImportantGroups(important);
  groups.forEach((group) => {
    sourceTableIds.push(...group.metrics.flatMap(m=>(m.sources||[]).map(v=>v.tableId)));
  });
  const groupsHost = make("div", "key-metric-groups");
  groups.forEach((group) => groupsHost.append(renderMetricGroup(group)));
  refs.priorityGrid.append(groupsHost);

  if (important.revisions?.metrics?.length) {
    const panel = make("section", "forecast-revisions-panel");
    const heading = make("div", "forecast-revisions-heading");
    const description = [
      important.revisions.asOf && `Current model: ${important.revisions.asOf}`,
      important.revisions.priorAsOf && `Previous model: ${important.revisions.priorAsOf}`
    ].filter(Boolean).join(" · ");
    const headingCopy = make("div", "");
    headingCopy.append(
      make("h3", "", "Forecast revisions"),
      make("p", "", description || "Current model compared with the previous model")
    );
    heading.append(headingCopy);
    for(const page of new Set(important.revisions.metrics.flatMap(m=>m.sourcePages || [m.sourcePage]).filter(Boolean)))heading.append(sourcePdfButton(page));
    const tableScroll = make("div", "revision-table-scroll");
    tableScroll.append(renderRevisionTable(important.revisions));
    panel.append(heading, tableScroll);
    sourceTableIds.push(...important.revisions.metrics.flatMap(m=>(m.sources||[]).map(v=>v.tableId)));
    refs.priorityGrid.append(panel);
  }

  addYearFocus(refs.priorityGrid);
  appendSourceJump(refs.priorityGrid, sourceTableIds);
}

function renderFacts(report) {
  clear(refs.factsGrid);
  const definitions = new Map(FACT_DEFINITIONS.map((definition) => [definition.id, definition]));
  let missingCount = 0;
  factOrder.forEach((id) => {
    const definition = definitions.get(id);
    if (!definition) return;
    const missing = !report.facts[definition.id];
    if (missing) { missingCount++; return; }
    const value = displayFactValue(report, definition);
    const card = make("article", `fact-card ${missing ? "missing" : ""}`);
    const fact=make('strong','fact-value');quotedValue(fact,value,'morningstar',report.factEvidence?.[id],{reportDate:report.facts.reportDate});
    card.append(make("span", "fact-label", definition.label),fact);
    refs.factsGrid.append(card);
  });
  refs.factsGrid.style.setProperty('--fact-count', String(Math.max(1, refs.factsGrid.children.length)));
  const review = document.getElementById('summary-source-review');
  review.hidden = missingCount === 0;
  review.textContent = `${missingCount} summary ${missingCount === 1 ? 'field needs' : 'fields need'} source review`;
}

function renderSections(report) {
  clear(refs.sectionsList);
  const orderIndex = (id) => {
    const index = sectionOrder.indexOf(id);
    return index === -1 ? sectionOrder.length : index;
  };
  const ordered = [...report.sections].sort((left, right) => orderIndex(left.id) - orderIndex(right.id));
  ordered.forEach((section) => {
    if (!section.found && !preferences.showMissing) return;

    const card = make("details", `summary-card ${section.found ? "" : "missing"}`);
    card.open = ["analystNote", "valuation", "risk"].includes(section.id);
    const summary = make("summary");
    const title = make("div");
    title.append(make("h3", "", section.title));
    title.append(section.found ? sourcePdfButton(section.sourcePage) : make("span", "summary-source", "Not captured · check source PDF"));
    summary.append(title, make("b", "", "+"));
    card.append(summary);

    const content = make("div", "summary-content");
    if (section.found) {
      const list = document.createElement("ul");
      section.bullets.forEach((bullet) => list.append(make("li", "", bullet)));
      content.append(list);
    } else {
      content.textContent = "This section was not captured. Check the original PDF to see whether it is provided.";
    }
    card.append(content);
    refs.sectionsList.append(card);
  });
}

function renderSourceTables(report) {
  clear(refs.tableTabs);
  clear(refs.sourceTableHost);

  const tables = sourceTables(report);
  refs.sourceSection.hidden = tables.length === 0;
  if (!tables.length) return;

  const markedRows = highlightedSourceRows(report.forecastModel?.importantMetrics);
  if (!tables.some((table) => table.id === activeTableId)) activeTableId = defaultSourceTableId(report);

  refs.historyToggle.textContent = showHistorical ? "Actual + forecast" : "Forecast only";
  refs.historyToggle.setAttribute("aria-pressed", String(showHistorical));

  tables.forEach((table) => {
    const markedCount = markedRows.get(table.id)?.size || 0;
    const button = make("button", table.id === activeTableId ? "tab-button active" : "tab-button");
    button.type = "button";
    button.dataset.tableId = table.id;
    button.append(
      make("strong", "", table.instanceLabel || table.title),
      make("span", "", markedCount ? `${markedCount} key fields` : `${table.rows.length} rows`)
    );
    refs.tableTabs.append(button);
  });

  const active = tables.find((table) => table.id === activeTableId) || tables[0];
  const selectedColumns = active.columns
    .map((column, index) => ({ ...column, sourceIndex: index }))
    .filter((column) => showHistorical || column.period !== "actual");

  const shell = make("div", "source-table-card");
  const top = make("div", "source-table-top");
  top.append(
    make("h3", "", active.instanceLabel || active.title),
    make("p", "", [active.description, active.asOf && `As of ${active.asOf}`].filter(Boolean).join(" · "))
  );
  top.append(sourcePdfButton(active.sourcePage));
  shell.append(top);

  const wrap = make("div", "source-table-wrap");
  const table = make("table", "source-table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headerRow.append(make("th", "sticky-metric", "Metric"));
  selectedColumns.forEach((column) => {
    const th = make("th", column.period === "forecast" ? "forecast-col" : "");
    const period = periodLabel(column.period);
    th.append(make("span", "period-chip", period), document.createTextNode(column.label));
    headerRow.append(th);
  });
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  active.rows.forEach((rowData) => {
    const row = document.createElement("tr");
    const isMarked = markedRows.get(active.id)?.has(rowData.key);
    if (isMarked) row.className = "priority-source-row";
    const rowHeader = make("th", "sticky-metric");
    rowHeader.append(document.createTextNode(rowData.label));
    row.append(rowHeader);
    selectedColumns.forEach((column) => {
      const raw=rowData.values[column.sourceIndex],proof=rowData.cells?.[column.sourceIndex] || {};
      const cell=make('td',column.period==='forecast'?'forecast-col':'',rowData.validation==='review-alignment'?'Review':raw ?? 'Not captured');
      attachEvidence(cell,{metric:rowData.label,raw,period:column.label,kind:column.period,variant:column.variant,basis:proof.basis,unit:proof.unit,modelDate:proof.modelDate,validation:proof.validation || rowData.validation,sourceBounds:proof.sourceBounds || rowData.bounds,sourcePrecision:proof.sourcePrecision,sourcePage:rowData.sourcePage || active.sourcePage});row.append(cell);
    });
    tbody.append(row);
  });
  table.append(tbody);
  wrap.append(table);
  shell.append(wrap);
  refs.sourceTableHost.append(shell);
}

function renderQualityList(title, items, emptyText) {
  const card = make("article", "quality-card");
  card.append(make("h3", "", title));
  const list = document.createElement("ul");
  if (items.length) items.forEach((item) => list.append(make("li", "", item)));
  else list.append(make("li", "muted-cell", emptyText));
  card.append(list);
  return card;
}

function renderQuality(report) {
  const quality = report.completeness;
  clear(refs.qualityDetail);

  const explainer = make("p", "quality-explainer");
  explainer.textContent = `${quality.captured} of ${quality.possible} expected source items were recognized. This is an extraction check, not an accuracy score. An unrecognized item may be absent from the PDF or may not have been extracted; check the original source.`;
  refs.qualityDetail.append(explainer);

  const columns = make("div", "quality-columns");
  const missingItems = [
    ...(report.captureIssues || []).map(item => `Page ${item.sourcePage}: ${item.metric || item.section || "Table"} — ${item.reason}${item.rawValues?.length ? " Raw values: " + item.rawValues.join(" · ") : ""}`),
    ...(quality.missingFacts || []).map((item) => `Fact: ${item.label}`),
    ...(quality.missingForecastTables || []).map((item) => `Forecast table: ${item.label}`),
    ...(quality.missingSections || []).map((item) => `Section: ${item.label}`)
  ];
  const notProvidedItems = [
    ...(quality.notProvidedFacts || []).map((item) => `Fact: ${item.label}`),
    ...(quality.notProvidedSections || []).map((item) => `Section: ${item.label}`)
  ];
  const reviewCount = missingItems.length;
  refs.qualityScore.textContent = reviewCount ? `${reviewCount} ${reviewCount === 1 ? "item needs" : "items need"} review` : "No capture issues flagged";
  refs.qualityScore.className = `coverage-pill ${reviewCount ? (quality.score >= 60 ? "warning" : "danger") : "complete"}`;
  columns.append(
    renderQualityList("Not captured or needs review", missingItems, "No capture issues were flagged. This does not independently verify every figure.")
  );
  if (notProvidedItems.length) columns.append(renderQualityList("Not provided in source", notProvidedItems, ""));
  refs.qualityDetail.append(columns);

  if (report.dataIntegrity?.checks?.length) {
    const checks = make("div", "integrity-list");
    checks.append(make("h3", "", "Consistency checks"));
    report.dataIntegrity.checks.forEach((check) => {
      const item = make("article", `integrity-item ${check.status}`);
      item.append(make("strong", "", check.label), make("p", "", check.detail));
      checks.append(item);
    });
    refs.qualityDetail.append(checks);
  }
}

function renderReport(report) {
  reportFinder.reset();
  document.getElementById("find-report").hidden = false;
  currentMode = "morningstar";
  currentArgusBundle = null;
  refs.emptyState.hidden = true;
  refs.argusReportView.hidden = true;
  refs.reportView.hidden = false;
  refs.reportMenu.hidden = false;
  refs.workspaceContext.textContent = "Morningstar equity analyst report";
  refs.workspaceTitle.textContent = titleWithTicker(report);
  refs.providerBadge.textContent = `${report.provider} equity analyst report`;
  refs.tickerMark.textContent = report.ticker || libraryAvatar({ title: report.title });
  refs.reportTitle.textContent = titleWithTicker(report);
  refs.reportMeta.textContent = [
    report.facts.reportDate && `Report date ${report.facts.reportDate}`,
    report.forecastModel?.asOf && `Model as of ${report.forecastModel.asOf}`,
    report.facts.analyst && `Analyst ${report.facts.analyst}`
  ].filter(Boolean).join(" · ");
  renderStars(report.facts.starRating);
  const gap=missingPageNote(report.textCoverage);
  if(gap){const notice=make('span','source-page-gap',gap);notice.append(sourcePdfButton(report.textCoverage.missingPages[0]));refs.reportMeta.append(notice);}
  const proofs=report.factEvidence || {};
  for(const [id,node] of [['currentPrice',refs.heroPrice],['fairValue',refs.heroFairValue],['priceFairValue',refs.heroPriceFve],['economicMoat',refs.heroMoat]]){
    const value=id==='economicMoat'?displayFactValue(report,{id}):report.facts[id] ?? '—';
    quotedValue(node,value,'morningstar',proofs[id],{reportDate:report.facts.reportDate});
  }
  document.getElementById('price-date').textContent=proofs.currentPrice?.date || 'As printed in the PDF';
  document.getElementById('fair-value-date').textContent=proofs.fairValue?.date || 'Morningstar estimate';
  refs.heroMoatTrend.textContent = report.facts.moatTrend ? `Moat trend: ${report.facts.moatTrend}` : proofs.economicMoat ? 'Trend not shown in rating strip' : 'Moat trend not captured';

  renderFacts(report);
  renderPriorityMetrics(report);
  renderSections(report);
  renderSourceTables(report);
  renderQuality(report);
  renderLibrary();
  refs.workspace.scrollTo({ top: 0, left: 0 });
}


function setLoadingDisabled(disabled) {
  if (disabled) { sourceViewer.close(); reportFinder.close(); }
  document.getElementById("find-report").disabled = disabled;
  refs.reportLibrary.inert = disabled;
  refs.reportLibrary.setAttribute('aria-busy', String(disabled));
  refs.reportMenu.querySelectorAll('button').forEach(button => { button.disabled = disabled; });
  refs.openPdf.disabled = disabled;
  document.getElementById("clear-session").disabled = disabled || !window.desktopApi.hasReports();
  document.getElementById("toolbar-add-report").disabled = disabled;
  refs.sidebarOpenMorningstar.disabled = disabled;
  refs.sidebarOpenArgus.disabled = disabled;
  refs.emptyOpenMorningstar.disabled = disabled;
  refs.emptyOpenArgus.disabled = disabled;
  refs.chooseMorningstar.disabled = disabled;
  refs.chooseArgus.disabled = disabled;
}

function normalizeDocumentBytes(document) {
  return {
    name: document.name || "Research report.pdf",
    bytes: byteView(document.bytes)
  };
}

// Only reuse objects actually produced by this tab's PDF extractor. Weak keys
// release layouts when a staged import or the active report is discarded.
const inspectedDocuments=new WeakSet(),argusParts=new WeakMap();
function bundleFromDocuments(docs){
  return combineParsedArgusReports(docs.map(doc=>{
    if(!argusParts.has(doc))argusParts.set(doc,parseArgusDocument({...doc,fileName:doc.name,sourceType:'pdf'}));
    return argusParts.get(doc);
  }));
}
async function extractDocuments(documents, providerHint = null, progress = setStatus) {
  const extracted = [];
  for (let index = 0; index < documents.length; index += 1) {
    if(inspectedDocuments.has(documents[index])){extracted.push(documents[index]);continue;}
    const document = normalizeDocumentBytes(documents[index]);
    if (document.bytes.byteLength > 60 * 1024 * 1024) throw new Error("Choose PDF files smaller than 60 MB each.");
    const arrayBuffer = isolatedArrayBuffer(document.bytes);
    const prefix = documents.length > 1 ? `File ${index + 1}/${documents.length} · ` : "";
    let layout;
    try {layout=await extractPdfDocument(pdfjsLib,arrayBuffer,(page,total)=>{
      progress(prefix+'Reading '+page+'/'+total,'busy');
    });} catch(error){const message=pdfOpenMessage(error,document.name);if(message)throw new Error(message);throw error;}
    const trimmed = layout.text.trim();
    if (trimmed.length > 2_500_000) throw new Error("This PDF is too large to process without truncating data.");
    if (!layout.textCoverage.readablePages) throw new Error('No selectable text was found in '+document.name+'. If this is a scan, choose the original downloadable report.');
    const detected = detectResearchDocument(trimmed);
    if(detected.type==='unknown')throw new Error(document.name+' is not recognized as a Morningstar equity report or an Argus Analyst, A6, or Options report. Choose the provider’s original PDF.');
    const inspected={ ...document, ...layout, rawText: trimmed, type: detected.type };
    inspectedDocuments.add(inspected);extracted.push(inspected);
  }

  const kinds = extracted.map((document) => document.type);
  const hasMorningstar = kinds.includes("morningstar");
  const hasArgus = kinds.some((kind) => String(kind).startsWith("argus-"));
  if (hasMorningstar && hasArgus) throw new Error("Morningstar and Argus reports cannot be combined in the same import.");
  if (kinds.includes("unknown")) throw new Error("One selected PDF was not recognized as a supported Morningstar or Argus report.");
  if (providerHint === "morningstar" && !hasMorningstar) throw new Error("That PDF does not appear to be a Morningstar Equity Analyst report.");
  if (providerHint === "argus" && !hasArgus) throw new Error("Those PDFs do not appear to be supported Argus reports.");
  if (hasMorningstar && extracted.length !== 1) throw new Error("Morningstar uses one complete PDF. Select only one Morningstar report.");
  if (hasArgus) {
    if (extracted.length > 3) throw new Error("Choose up to three Argus PDFs: Analyst, A6, and Options.");
    const duplicates = kinds.filter((kind, index) => kinds.indexOf(kind) !== index);
    if (duplicates.length) throw new Error("Select only one copy of each Argus report type (Analyst, A6, Options).");
  }
  return { extracted, mode: hasArgus ? "argus" : "morningstar" };
}

function renderArgusBundle(bundle) {
  reportFinder.reset();
  document.getElementById("find-report").hidden = false;
  currentMode = "argus";
  currentReport = null;
  currentArgusBundle = bundle;
  refs.emptyState.hidden = true;
  refs.reportView.hidden = true;
  refs.argusReportView.hidden = false;
  refs.reportMenu.hidden = false;
  refs.workspaceContext.textContent = "Argus research bundle";
  refs.workspaceTitle.textContent = bundle.ticker ? `${bundle.title} (${bundle.ticker})` : bundle.title;
  renderArgusReport(refs.argusReportView, bundle, { onToast: showToast });
  renderLibrary();
  refs.workspace.scrollTo({ top: 0, left: 0 });
}

async function persistMorningstar(document, existingRecord = null) {
  if (existingRecord) return existingRecord;
  if (!window.desktopApi?.importPdf) return null;
  setStatus("Opening Morningstar PDF", "busy");
  return window.desktopApi.importPdf({ name: document.name, bytes: document.bytes });
}

async function persistArgus(documents, existingRecord = null, updateId = null) {
  if (existingRecord) return existingRecord;
  if (!window.desktopApi?.importBundle) return null;
  setStatus("Opening Argus reports", "busy");
  return window.desktopApi.importBundle({ updateId, documents: documents.map((document) => ({ name: document.name, bytes: document.bytes, sourceType: document.type })) });
}

async function processDocuments(documents, providerHint = null, existingRecord = null, updateId = null) {
  if (!documents?.length) return false;
  const version = sessionVersion;
  setLoadingDisabled(true);
  setStatus(documents.length > 1 ? `Reading ${documents.length} PDFs` : "Reading PDF", "busy");

  try {
    const { extracted, mode } = await extractDocuments(documents, providerHint);
    if (version !== sessionVersion) return false;

    if (mode === "morningstar") {
      const document = extracted[0];
      const parsedReport = analyzeReport(document.rawText, preferences, {
        title: cleanFileTitle(document.name),
        fileName: document.name, document,
        sourceType: "pdf",
        capturedAt: new Date().toISOString()
      });
      const savedRecord = await persistMorningstar(document, existingRecord);
      if (version !== sessionVersion) return false;
      currentFileName = document.name;
      currentRecord = savedRecord;
      currentReport = parsedReport;
      activeTableId = defaultSourceTableId(currentReport);
      renderReport(currentReport);
      renderOriginalPdfActions(extracted);
      if (currentRecord?.id && window.desktopApi?.updateReport) {
        currentRecord = await window.desktopApi.updateReport({ id: currentRecord.id, metadata: reportMetadata(currentReport) });
      }
    } else {
      const bundle = bundleFromDocuments(extracted);
      const savedRecord = await persistArgus(extracted, existingRecord, updateId);
      if (version !== sessionVersion) return false;
      currentFileName = extracted.map((item) => item.name).join(", ");
      currentRecord = savedRecord;
      renderArgusBundle(bundle);
      renderOriginalPdfActions(extracted);
      if (currentRecord?.id && window.desktopApi?.updateReport) {
        currentRecord = await window.desktopApi.updateReport({ id: currentRecord.id, metadata: argusMetadata(bundle) });
      }
    }

    if (version !== sessionVersion) return false;
    await refreshLibrary();
    if (version !== sessionVersion) return false;
    setStatus(currentRecord ? "In this session" : "Session unavailable", currentRecord ? "ready" : "warning");
    document.dispatchEvent(new CustomEvent('reader:report',{detail:{record:currentRecord,report:mode==='morningstar'?currentReport:currentArgusBundle,mode}}));
    return true;
  } catch (error) {
    if (version !== sessionVersion) return false;
    setStatus("Could not read report", "error");
    showError(error.message || "The report could not be read.");
    return false;
  } finally {
    refs.fileInput.value = "";
  }
}

function showProviderDialog() {
  if (operationBusy) return;
  if (refs.providerDialog?.showModal) refs.providerDialog.showModal();
  else openWithDesktopPicker("morningstar");
}

const argusImporter = createArgusImporter({
  pick: async () => {
    if (!window.desktopApi?.openReports) throw new Error('Choose PDF files or drag them into the reader.');
    return (await window.desktopApi.openReports('argus'))?.documents || [];
  },
  inspect: async files => (await extractDocuments(files, 'argus', () => {})).extracted,
  validate: bundleFromDocuments,
  commit: (docs, updateId) => runReportOperation(() => processDocuments(docs, 'argus', null, updateId))
});

function openWithDesktopPicker(provider) {
  if (operationBusy) return;
  if (provider === 'argus') {
    if (refs.providerDialog?.open) refs.providerDialog.close();
    return argusImporter.show();
  }
  return runReportOperation(() => pickAndProcess(provider));
}

async function pickAndProcess(provider) {
  const normalizedProvider = provider === "argus" ? "argus" : "morningstar";
  if (refs.providerDialog?.open) refs.providerDialog.close();

  if (!window.desktopApi?.openReports) {
    pendingProvider = normalizedProvider;
    refs.fileInput.multiple = normalizedProvider === "argus";
    refs.fileInput.click();
    return;
  }

  try {
    const result = await window.desktopApi.openReports(normalizedProvider);
    if (!result?.documents?.length) return;
    await processDocuments(result.documents, normalizedProvider);
  } catch (error) {
    setStatus("Could not add report", "error");
    showError(error.message || "The file could not be opened.");
  }
}

function loadBrowserFiles(fileList) { return runReportOperation(() => readBrowserFiles(fileList)); }

async function readBrowserFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  if (files.some((file) => file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))) {
    showToast("Choose PDF reports only.");
    return;
  }
  if (files.length > 3) {
    showToast("Choose one Morningstar PDF or up to three Argus PDFs.");
    return;
  }
  const documents = [];
  for (const file of files) documents.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  await processDocuments(documents, pendingProvider);
  pendingProvider = null;
}

function openSavedReport(id) { return runReportOperation(() => readSavedReport(id)); }

async function readSavedReport(id) {
  if (!id || currentRecord?.id === id || !window.desktopApi?.openSavedReport) return;
  const record = savedReports.find((item) => item.id === id);
  try {
    setStatus("Opening report", "busy");
    const result = await window.desktopApi.openSavedReport(id);
    if (result.documents?.length) {
      await processDocuments(result.documents, "argus", result.record);
    } else {
      await processDocuments([{ name: result.record.fileName, bytes: result.bytes }], "morningstar", result.record);
    }
  } catch (error) {
    setStatus("Could not open report", "error");
    showError(error.message || "The report could not be opened.");
    if (record) await refreshLibrary();
  }
}

function removeSavedReport(id) { return runReportOperation(() => deleteSavedReport(id)); }

async function deleteSavedReport(id) {
  const record = savedReports.find((item) => item.id === id);
  if (!record || !window.desktopApi?.removeReport) return;
  const result = await window.desktopApi.removeReport({ id, name: displayRecordName(record) });
  if (!result?.removed) return;

  const removedCurrent = currentRecord?.id === id;
  await refreshLibrary();
  showToast("Report removed from this session.");
  if (removedCurrent) {
    if (savedReports.length) await readSavedReport(savedReports[0].id);
    else showEmptyState();
  }
}

function currentSummaryText() {
  if (currentMode === "argus" && currentArgusBundle) return buildArgusPlainTextSummary(currentArgusBundle);
  if (currentMode === "morningstar" && currentReport) return buildPlainTextSummary(currentReport, preferences);
  return "";
}

async function copyCurrentSummary() {
  const summary = currentSummaryText();
  if (!summary) return;
  await navigator.clipboard.writeText(summary);
  refs.reportMenu.open = false;
  showToast("Text summary copied.");
}

async function saveCurrentSummary() {
  const summary = currentSummaryText();
  if (!summary) return;
  const base = currentMode === "argus" ? (currentArgusBundle?.ticker || currentArgusBundle?.title) : (currentReport?.ticker || currentReport?.title);
  const provider = currentMode === "argus" ? "Argus" : "Morningstar";
  const defaultName = `${safeFileBase(base)}-${provider}-summary.txt`;
  refs.reportMenu.open = false;

  if (window.desktopApi?.saveSummary) {
    const result = await window.desktopApi.saveSummary({ defaultName, text: summary });
    if (!result?.canceled) showToast("Text summary saved.");
    return;
  }

  const url = URL.createObjectURL(new Blob([summary], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = defaultName;
  link.click();
  URL.revokeObjectURL(url);
}

async function initialize() {
  try {
    await refreshLibrary();
    if (savedReports.length) await openSavedReport(savedReports[0].id);
    else showEmptyState();
  } catch (error) {
    showEmptyState();
    showError(error.message || "Session reports could not be loaded.");
  }
}

refs.openPdf.addEventListener("click", showProviderDialog);
refs.emptyOpenMorningstar.addEventListener("click", (event) => {
  event.stopPropagation();
  openWithDesktopPicker("morningstar");
});
refs.emptyOpenArgus.addEventListener("click", (event) => {
  event.stopPropagation();
  openWithDesktopPicker("argus");
});
refs.chooseMorningstar.addEventListener("click", () => openWithDesktopPicker("morningstar"));
refs.chooseArgus.addEventListener("click", () => openWithDesktopPicker("argus"));
document.getElementById("toolbar-add-report").addEventListener("click", showProviderDialog);
refs.sidebarOpenMorningstar.addEventListener("click", () => openWithDesktopPicker("morningstar"));
refs.sidebarOpenArgus.addEventListener("click", () => openWithDesktopPicker("argus"));

refs.dropZone.addEventListener("click", (event) => {
  if (!event.target.closest("button")) showProviderDialog();
});
refs.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    showProviderDialog();
  }
});
refs.fileInput.addEventListener("change", () => loadBrowserFiles(refs.fileInput.files));
refs.librarySearch.addEventListener("input", renderLibrary);
refs.libraryProviderFilter?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-library-provider]");
  if (!button) return;
  activeLibraryProvider = button.dataset.libraryProvider || "all";
  refs.libraryProviderFilter.querySelectorAll("[data-library-provider]").forEach((item) => item.classList.toggle("active", item === button));
  renderLibrary();
});
document.getElementById('dismiss-error').addEventListener('click', () => { document.getElementById('operation-error').hidden = true; });
refs.copySummary.addEventListener("click", copyCurrentSummary);
refs.saveSummary.addEventListener("click", saveCurrentSummary);
refs.removeCurrentReport.addEventListener("click", () => currentRecord && removeSavedReport(currentRecord.id));

refs.reportLibrary.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove-report-id]");
  if (remove) {
    event.stopPropagation();
    removeSavedReport(remove.dataset.removeReportId);
    return;
  }
  const item = event.target.closest("[data-report-id]");
  if (item) openSavedReport(item.dataset.reportId);
});
refs.reportLibrary.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (event.target.closest("button")) return;
  const item = event.target.closest("[data-report-id]");
  if (item) {
    event.preventDefault();
    openSavedReport(item.dataset.reportId);
  }
});

refs.historyToggle.addEventListener("click", () => {
  showHistorical = !showHistorical;
  if (currentReport) renderSourceTables(currentReport);
});

refs.tableTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-table-id]");
  if (!button || !currentReport) return;
  activeTableId = button.dataset.tableId;
  renderSourceTables(currentReport);
});

document.addEventListener("click", (event) => {
  const sourceButton = event.target.closest("[data-open-table]");
  if (sourceButton && currentReport) {
    activeTableId = sourceButton.dataset.openTable;
    renderSourceTables(currentReport);
    refs.sourceSection.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const navButton = event.target.closest("[data-scroll-target]");
  // Section navigation handles scrolling and expands source checks when needed.

  if (refs.reportMenu.open && !event.target.closest("#report-menu")) refs.reportMenu.open = false;
});

document.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  refs.dropOverlay.hidden = false;
});
document.addEventListener("dragover", (event) => event.preventDefault());
document.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) refs.dropOverlay.hidden = true;
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  refs.dropOverlay.hidden = true;
  pendingProvider = null;
  loadBrowserFiles(event.dataTransfer?.files);
});

window.desktopApi?.onAddReportFromMenu?.(showProviderDialog);
initialize();

// Library preferences affect layout only, never report contents.
const sidebarToggle = document.getElementById('toggle-sidebar');
const sidebar = document.getElementById('library-sidebar');
const shell = document.querySelector('.app-shell');
const mobileQuery = window.matchMedia('(max-width: 760px)');
const backdrop = document.getElementById('library-backdrop');
function setSidebarCollapsed(collapsed) {
  shell.classList.toggle('sidebar-collapsed', collapsed);
  sidebar.hidden = collapsed;
  document.querySelector('.top-bar').prepend(sidebarToggle);
  sidebarToggle.querySelector('.sidebar-toggle-label').textContent = mobileQuery.matches ? 'Reports' : collapsed ? 'Show reports' : 'Hide reports';
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle.setAttribute('aria-label', collapsed ? 'Show reports' : 'Hide reports');
  backdrop.hidden = collapsed || !mobileQuery.matches;
  refs.workspace.inert = !collapsed && mobileQuery.matches;
  if (!collapsed && mobileQuery.matches) document.getElementById('library-search').focus();
}
let desktopSidebarCollapsed = false;
function preferredSidebar() { return desktopSidebarCollapsed; }
setSidebarCollapsed(mobileQuery.matches || preferredSidebar());
sidebarToggle.addEventListener('click', () => {
  const collapsed = !sidebar.hidden;
  setSidebarCollapsed(collapsed);
  if (!mobileQuery.matches) desktopSidebarCollapsed = collapsed;
});
backdrop.onclick=()=>{setSidebarCollapsed(true);sidebarToggle.focus();};
document.getElementById('close-library').onclick=backdrop.onclick;
sidebar.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&mobileQuery.matches){setSidebarCollapsed(true);sidebarToggle.focus();}
 if(e.key==='Tab'&&mobileQuery.matches&&!sidebar.hidden){const items=[...sidebar.querySelectorAll('button:not([hidden]):not(:disabled),input,a,[tabindex=\"0\"]')].filter(n=>n.offsetParent!==null);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
sidebar.addEventListener('click',e=>{if(mobileQuery.matches && e.target.closest('[data-report-id], #open-pdf, #sidebar-open-morningstar, #sidebar-open-argus'))setSidebarCollapsed(true);});
mobileQuery.addEventListener('change',()=>setSidebarCollapsed(mobileQuery.matches || preferredSidebar()));
function resetSessionView() {
  sessionVersion++;
  savedReports = [];
  showEmptyState();
  for (const key of ['priorityGrid','factsGrid','sectionsList','sourceTableHost','tableTabs','argusReportView']) clear(refs[key]);
  for(const id of ['price-date','fair-value-date'])document.getElementById(id).textContent='';
  for (const key of ['reportTitle','reportMeta','heroPrice','heroFairValue','heroPriceFve','heroMoat','heroMoatTrend','forecastDescription','priorityCoverage','qualityScore','qualityDetail']) refs[key].textContent = '';
  clear(document.getElementById('original-pdf-actions'));
  clear(refs.starRating);
  refs.fileInput.value = '';
  refs.librarySearch.value = '';
  activeLibraryProvider = 'all';
  refs.libraryProviderFilter.querySelectorAll('[data-library-provider]').forEach(b => b.classList.toggle('active', b.dataset.libraryProvider === 'all'));
  argusImporter.reset();
  for(const id of ['price-date','fair-value-date'])document.getElementById(id).textContent='';
  const errorBox=document.getElementById('operation-error');errorBox.querySelector('span').textContent='';errorBox.hidden=true;
  clearTimeout(toastTimer);refs.toast.textContent='';refs.toast.hidden=true;
  renderLibrary();
}
document.addEventListener('reader:session-cleared', resetSessionView);
document.getElementById('clear-session').onclick = () => runReportOperation(async () => {
  if (!window.confirm('Clear all reports in this tab? Your original files are unchanged.')) return;
  window.desktopApi.clearSession();
  resetSessionView();
  if (mobileQuery.matches) setSidebarCollapsed(true);
  showToast('Session cleared.');
});

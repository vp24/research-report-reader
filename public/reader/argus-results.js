import {quotedValue} from './quoted-value.js';
import {missingPageNote} from './pdf-document.js';
import {addYearFocus,tagYear} from './year-focus.js';
import { buildArgusPlainTextSummary } from "./argus-parser.js";

import {tablePeriods,rowPeriod,periodLabel} from './report-periods.js';
function make(tag, className = "", text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function clear(node) {
  node.replaceChildren();
}

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function reportStamp(report) {
  if (!report) return "Not loaded";
  return [report.label, report.reportDate].filter(Boolean).join(" · ");
}

function sourcePill(report, page = null) {
  const pill = make("button", "argus-source-pill source-pdf-button", [report?.label || "Argus source", page ? `p. ${page}` : null].filter(Boolean).join(" · "));
  const detail = [report?.reportDate, page ? `p. ${page}` : null].filter(Boolean).join(" · ");
  pill.type = "button";
  pill.dataset.sourceType = report?.type || "";
  if (page) pill.dataset.sourcePage = String(page);
  pill.title = `View original PDF${page ? ` at page ${page}` : ""}${detail ? ` · ${detail}` : ""}`;
  pill.setAttribute("aria-label", `${pill.textContent}: ${pill.title}`);
  return pill;
}

function formatUpside(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function addKeyValueGrid(parent, items, className = "argus-kv-grid") {
  const grid = make("div", className);
  items.filter((item) => item && (item.value !== null && item.value !== undefined && item.value !== "")).forEach((item) => {
    const card = make("div", "argus-kv");
    card.append(make("small", "", item.label), make("strong", item.emphasis ? "argus-kv-emphasis" : "", valueOrDash(item.value)));
    if (item.note) card.append(make("span", "", item.note));
    grid.append(card);
  });
  parent.append(grid);
  return grid;
}

function sectionHeading(kicker, title, description, report = null, page = null) {
  const wrapper = make("div", "argus-section-heading");
  const copy = make("div");
  copy.append(...(kicker ? [make("span", "section-kicker", kicker)] : []), make("h2", "", title));
  if (description) copy.append(make("p", "section-description", description));
  wrapper.append(copy);
  if (report) wrapper.append(sourcePill(report, page));
  return wrapper;
}

function appendHighlights(parent, items = []) {
  if (!items.length) return;
  const list = make("ul", "argus-highlight-list");
  items.forEach((item) => list.append(make("li", "", item)));
  parent.append(list);
}

function renderTable(table) {
  const wrap = make("div", "argus-table-wrap");
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", `${table.title || "Financial table"}: scroll horizontally for all periods`);
  const tableNode = make("table", "argus-data-table");
  tableNode.dataset.seriesGroup=table.title || "Financial table";
  const thead = make("thead");
  const headRow = make("tr");
  headRow.append(make("th", "", "Metric"));
  const periods=tablePeriods(table);
  table.columns.forEach((column, index) => {
    const {period,mixed}=periods[index];
    const suffix=mixed?' · By row':period==='forecast'?' · Est.':period==='actual'?' · Actual':period==='not specified'?' · Type unclear':'';
    const head=tagYear(make('th',period==='forecast'?'forecast-col':'',column+suffix),table.columnMeta?.[index]?.year);
    if(!mixed&&period==='not specified')head.title='The PDF does not establish whether this period is actual or estimated.';
    headRow.append(head);
  });
  thead.append(headRow);
  const tbody = make("tbody");
  table.rows.forEach((row) => {
    const tr = make("tr");tr.dataset.seriesLabel=row.label;
    tr.append(make("th", "", row.label));
    row.values.forEach((value, index) => {
      const cell=row.cells?.[index], validity=cell?.validation || row.cellValidation?.[index] || row.validation;
      const displayed=validity==='review-alignment'?'Review':value==null?'Not captured':valueOrDash(value);
      const td=make('td', cell?.periodType==='forecast'?'forecast-col':'', displayed);
      tagYear(td,table.columnMeta?.[index]?.year);
      if(periods[index].mixed){const m=rowPeriod(table,row,index);
        td.append(make('small','row-period',[periodLabel(m.period),m.estimateSource].filter(Boolean).join(' · ')));}
      if (cell) td.title = [cell.raw, cell.unit, cell.basis !== 'not specified' && cell.basis, cell.periodType, cell.modelDate && `Model ${cell.modelDate}`, cell.sourcePage && `Page ${cell.sourcePage}`, cell.validation].filter(Boolean).join(' · ');
      if(cell?.sourcePage&&cell?.reportType){td.tabIndex=0;td.setAttribute('role','button');td.setAttribute('aria-label',`${row.label}, ${table.columns[index]}: ${displayed}. View source.`);td.dataset.sourceType=cell.reportType;td.dataset.sourcePage=cell.sourcePage;td.dataset.evidence=JSON.stringify({metric:row.label,period:table.columns[index],raw:cell.raw,unit:cell.unit,basis:cell.basis,kind:cell.periodType,estimateSource:cell.estimateSource,variant:cell.variant,modelDate:cell.modelDate,sourceBounds:cell.sourceBounds,sourcePrecision:cell.sourcePrecision,status:cell.validation==='review-alignment'?'Ambiguous alignment; verify the original':cell.status==='source-missing'?'The report prints a dash or N/A':cell.status==='nil'?'Nil (as reported)':cell.status==='not-meaningful'?'Not meaningful (as reported)':cell.status==='not-captured'?'No value extracted':cell.status==='unresolved'?'Unresolved format; preserved as printed':`${cell.status}; ${cell.validation}`});}
      tr.append(td);
    });
    tbody.append(tr);
  });
  tableNode.append(thead, tbody);
  wrap.append(tableNode);
  return wrap;
}

function sourceTableDetails(table, report) {
  const details = make("details", "argus-table-details");
  details.open = /growth$/.test(table.id);
  const summary = make("summary");
  const left = make("div");
  left.append(make("strong", "", table.title), make("span", "", `${table.rows.length} extracted rows`));
  summary.append(left, sourcePill(report, table.sourcePage));
  details.append(summary, renderTable(table));
  return details;
}

function reportCard(title, report, target, price, upside, extra = []) {
  const card = make("article", "argus-target-card");
  const top = make("div", "argus-target-card-top");
  top.append(make("span", "argus-target-type", title), sourcePill(report,report?.factEvidence?.targetPrice?.sourcePage));
  card.append(top);
  const main = make("div", "argus-target-main");
  const rating = make("div");
  rating.append(make("small", "", "Rating"), make("strong", `argus-rating argus-rating-${String(report?.rating || "").toLowerCase()}`, valueOrDash(report?.rating)));
  const targetBlock = make("div");
  const targetValue=make("strong");quotedValue(targetValue,valueOrDash(target),report.type,report.factEvidence?.targetPrice,{reportDate:report.reportDate});
  targetBlock.append(make("small","","Target"),targetValue);
  const upsideBlock = make("div");
  upsideBlock.append(make("small", "", "Target vs source price · calculated"), make("strong", "", formatUpside(upside)));
  main.append(rating, targetBlock, upsideBlock);
  card.append(main);
  const sub = make("div", "argus-target-sub");
  sub.append(make("span", "", `Source price ${valueOrDash(price)}`));
  if (report?.reportDate) sub.append(make("span", "", `Report ${report.reportDate}`));
  extra.filter(Boolean).forEach((item) => sub.append(make("span", "", item)));
  card.append(sub);
  return card;
}

function renderForecasts(bundle) {
  const report = bundle.analyst;
  const section = make("section", "argus-section argus-priority-section");
  section.id = "argus-forecasts";
  section.append(sectionHeading("Forecasts & revisions", "Financial forecasts & revisions", "All printed periods. Guidance, Argus estimates, and consensus remain separately attributed in their source statements.", report));
  if (!report) return null;
  for (const [kind, table] of Object.entries(report.marketData || {})) {
    if (!table?.rows?.length) continue;
    const block = make(kind === 'quarterly' ? 'details' : 'div', 'argus-forecast-trend');
    if (kind === 'quarterly') { block.open = true; block.append(make('summary', '', table.title)); }
    else block.append(make('h3', '', table.title));
    block.append(sourcePill(report, table.sourcePage), renderTable(table));
    if (table.note) block.append(make('p', 'section-description', table.note));
    section.append(block);
  }
  if(section.querySelector('.argus-forecast-trend'))addYearFocus(section,section.querySelector('.argus-forecast-trend'));
  if (!report?.forecastUpdates?.length) {
    section.append(make("p", "argus-empty-note", "No explicit forecast-revision statements were reliably extracted from the Analyst report."));
    return section;
  }
  const revisionTitle = make("div", "argus-subsection-title");
  revisionTitle.append(make("h3", "", "Guidance & revisions"), make("p", "", "As reported, with the original comparison and source page."));
  section.append(revisionTitle);
  const grid = make("div", "argus-forecast-grid");
  const more = make('details', 'argus-source-text');
  more.append(make('summary', '', `More source outlook statements (${Math.max(0, report.forecastUpdates.length - 4)})`));
  report.forecastUpdates.forEach((item, index) => {
    const card = make("article", "argus-forecast-card");
    card.append(make("span", "argus-card-label", item.label), make("p", "argus-forecast-statement", item.value));
    if (item.comparison) card.append(make("p", "", item.comparison));
    card.append(sourcePill(report, item.sourcePage));
    if (index < 4) grid.append(card); else more.append(card);
  });
  section.append(grid);
  if (report.forecastUpdates.length > 4) section.append(more);
  return section;
}

function renderAnalyst(bundle) {
  const report = bundle.analyst;
  if (!report) return null;
  const section = make("section", "argus-section");
  section.id = "argus-analyst";
  section.append(sectionHeading("Fundamental research", "Analyst report", "Argus' written investment case, earnings view, balance-sheet discussion, risks, company description, and valuation rationale.", report));

  if (report.notes?.length) {
    const notes = make("article", "argus-notes-card");
    const titleRow = make("div", "argus-card-title-row");
    titleRow.append(make("div", "", "Analyst's notes"), sourcePill(report, report.sourcePage));
    notes.append(titleRow);
    appendHighlights(notes, report.notes);
    section.append(notes);
  }

  const sectionGrid = make("div", "argus-narrative-grid");
  report.sections.filter((item) => item.found).forEach((item) => {
    const details = make("details", "argus-narrative-card");
    if (["investmentThesis", "valuation", "managementRisks"].includes(item.id)) details.open = item.id === "investmentThesis";
    const summary = make("summary");
    const summaryCopy = make("div");
    summaryCopy.append(make("strong", "", item.title));
    if (item.highlights.length) summaryCopy.append(make("span", "", `${item.highlights.length} extracted highlights`));
    summary.append(summaryCopy, sourcePill(report, item.page));
    const body = make("div", "argus-narrative-body");
    appendHighlights(body, item.highlights);
    const sourceDetails = make("details", "argus-source-text");
    sourceDetails.append(make("summary", "", "Read captured source text"), make("p", "", item.body));
    body.append(sourceDetails);
    details.append(summary, body);
    sectionGrid.append(details);
  });
  section.append(sectionGrid);
  return section;
}

function renderA6(bundle) {
  const report = bundle.a6;
  if (!report) return null;
  const section = make("section", "argus-section");
  section.id = "argus-a6";
  section.append(sectionHeading("Quantitative view", "A6 six-factor analysis", "The A6 model is shown as a separate quantitative source. Its target and factor scores are not merged with the Analyst target.", report));

  const scores = make("div", "argus-score-grid");
  report.scores.forEach((item) => {
    const card = make("article", "argus-score-card");
    const score = item.score || "—";
    card.append(make("span", `argus-score argus-score-${score.toLowerCase()}`, score), make("strong", "", item.label));
    const definitions = {
      Industry: "Earnings revisions, conviction, performance, and industry weighting.",
      Management: "Consistency of growth and financial strength.",
      Safety: "Liquidity, yield, market cap, leverage, and beta.",
      "Financial Strength": "Balance-sheet debt and liquidity ratios.",
      Growth: "Normalized earnings estimates and sales trends.",
      Value: "P/E, P/S, trend lines, and DCF valuation."
    };
    card.append(make("p", "", definitions[item.label] || "Argus A6 factor."));
    scores.append(card);
  });
  section.append(scores);
  addKeyValueGrid(section, [
    { label: "Current price", value: report.currentPrice },
    { label: "A6 target", value: report.targetPrice, emphasis: true },
    { label: "Target upside", value: report.targetUpside },
    { label: "Market cap", value: report.marketCap },
    { label: "Dividend", value: report.dividend },
    { label: "Yield", value: report.yield },
    { label: "Beta", value: report.beta },
    { label: "Sector", value: report.sector },
    { label: "Industry", value: report.industry },
    { label: "13F total", value: report.ownership?.total13F },
    { label: "Shares outstanding", value: report.ownership?.outstanding }
  ], "argus-kv-grid argus-a6-kv-grid");

  if (report.peerRows.length) {
    const peerBlock = make("div", "argus-subsection");
    peerBlock.append(make("h3", "", "Peer comparison"), make("p", "section-description", "The peer table stays tied to the A6 report date and its own dataset."));
    const table = { columns: ["Company", "Price", "Market cap", "5Y EPS growth", "Current FY P/E", "Net margin", "1Y EPS growth", "Rating"], rows: report.peerRows.map((row) => ({ label: row.ticker, values: [row.company, row.price, row.marketCap, row.growth5y, row.pe, row.netMargin, row.growth1y, row.rating] })) };
    peerBlock.append(renderTable(table));
    section.append(peerBlock);
  }

  const sectorItems = report.sectorSections.filter((item) => item.found);
  if (sectorItems.length) {
    const sectorDetails = make("details", "argus-sector-details");
    const summary = make("summary");
    summary.append(make("div", "", "Sector & industry context"), sourcePill(report, sectorItems[0]?.page));
    const content = make("div", "argus-sector-grid");
    sectorItems.forEach((item) => {
      const card = make("article", "argus-sector-card");
      card.append(make("h3", "", item.title));
      appendHighlights(card, item.highlights);
      content.append(card);
    });
    sectorDetails.append(summary, content);
    section.append(sectorDetails);
  }
  return section;
}

function metricRows(strategy) {
  return [
    ["Stock / underlying price", strategy.stockPrice],
    ["Sold call expiration", strategy.soldCallExpiration],
    ["Sold call strike", strategy.soldCallStrike],
    ["Sold call bid", strategy.soldCallBid],
    ["Net debit", strategy.netDebit],
    ["Break-even", strategy.breakEven],
    ["Downside protection", strategy.downsideProtection],
    ["Downside protection %", strategy.downsideProtectionPercent ? `${strategy.downsideProtectionPercent}%` : null],
    ["Assigned return", strategy.assignedReturnPercent ? `${strategy.assignedReturnPercent}%` : null],
    ["Annualized assigned return", strategy.annualizedAssignedReturnPercent ? `${strategy.annualizedAssignedReturnPercent}%` : null],
    ["Duration", strategy.durationDays ? `${strategy.durationDays} days` : null],
    ["Risk ranking", strategy.riskRanking],
    ["Risk label", strategy.riskLabel]
  ];
}

function strategyCard(strategy, report, diagonal = false) {
  const card = make("article", "argus-option-card");
  const head = make("div", "argus-option-head");
  const title = make("div");
  title.append(make("span", "argus-card-label", diagonal ? "Higher-complexity strategy" : "Income strategy"), make("h3", "", strategy.name));
  head.append(title, sourcePill(report, report.sourcePage));
  card.append(head);
  if (diagonal) {
    addKeyValueGrid(card, [
      { label: "Bought call ask", value: strategy.boughtCallAsk },
      { label: "Long call expiry", value: strategy.boughtCallExpiration },
      { label: "Long call strike", value: strategy.boughtCallStrike }
    ], "argus-option-leg-grid");
  }
  const table = make("div", "argus-option-metrics");
  const metricStrategy = diagonal ? { ...strategy, stockPrice: report.currentPrice } : strategy;
  metricRows(metricStrategy).filter(([, value]) => value).forEach(([label, value]) => {
    const row = make("div");
    row.append(make("span", "", label), make("strong", "", value));
    table.append(row);
  });
  card.append(table);
  if (strategy.riskDiscussion) {
    const risk = make("details", "argus-option-risk");
    risk.append(make("summary", "", "Risk discussion"), make("p", "", strategy.riskDiscussion));
    card.append(risk);
  }
  return card;
}

function renderOptions(bundle) {
  const report = bundle.options;
  if (!report) return null;
  const section = make("section", "argus-section argus-options-section");
  section.id = "argus-options";
  section.append(sectionHeading("Options", "Strategy report", "Options are intentionally isolated from the fundamental and A6 research so trade-specific return assumptions do not look like company forecasts.", report));
  if (report.summaryHighlights.length) {
    const summary = make("article", "argus-options-summary");
    summary.append(make("h3", "", "Strategy summary"));
    appendHighlights(summary, report.summaryHighlights);
    section.append(summary);
  }
  const grid = make("div", "argus-option-grid");
  grid.append(strategyCard(report.coveredCall, report, false), strategyCard(report.diagonalSpread, report, true));
  section.append(grid);
  if (report.strategyComparison) {
    const compare = make("details", "argus-strategy-compare");
    compare.open = true;
    compare.append(make("summary", "", "Argus strategy comparison by expiration price"), make("p", "argus-source-block", report.strategyComparison));
    section.append(compare);
  }
  if (report.opinion) {
    const opinion = make("details", "argus-strategy-compare");
    opinion.append(make("summary", "", "Argus opinion from the options report"), make("p", "argus-source-block", report.opinion));
    section.append(opinion);
  }
  return section;
}

function renderSourceTables(bundle) {
  const tables = [
    ...(bundle.analyst?.tables || []).filter(table => !Object.values(bundle.analyst?.marketData || {}).some(shown => shown?.id === table.id)).map((table) => ({ table, report: bundle.analyst })),
    ...(bundle.a6?.tables || []).map((table) => ({ table, report: bundle.a6 }))
  ];
  if (!tables.length) return null;
  const section = make("section", "argus-section");
  section.id = "argus-source-data";
  section.append(sectionHeading("Complete extracted data", "Source tables", "Historical years are retained rather than shortened to fit the summary. Nil and unavailable values remain visible when extracted."));
  const list = make("div", "argus-source-table-list");
  tables.forEach(({ table, report }) => list.append(sourceTableDetails(table, report)));
  section.append(list);
  return section;
}

function renderCoverage(bundle) {
  const section = make("section", "argus-quality-panel");
  section.id = "argus-capture";
  const copy = make("div");
  copy.append(make("span", "section-kicker", "PDF source capture"), make("h2", "", `${bundle.completeness.found} of ${bundle.completeness.expected} Argus checks captured`), make("p", "", "Checks apply to the reports you opened. Other Argus reports are optional."));
  const score = make("div", "argus-quality-score");
  score.append(make("strong", "", String((bundle.captureIssues?.length || 0) + bundle.completeness.expected - bundle.completeness.found)), make("span", "", "items to review"));
  section.append(copy, score);
  const checks = make("div", "argus-check-grid");
  bundle.completeness.checks.forEach((item) => checks.append(make("span", item.found ? "argus-check-pass" : "argus-check-missing", `${item.found ? "✓" : "!"} ${item.label}`)));
  section.append(checks);
  for (const item of bundle.captureIssues || []) section.append(make('p', 'argus-capture-note', `${item.reportType} · Page ${item.sourcePage} · ${item.metric || item.section || 'Table'}: ${item.reason}${item.rawValues?.length ? ' Source values: ' + item.rawValues.join(' · ') : ''}`));
  return section;
}

function renderTools(bundle, onToast) {
  const details = make("details", "report-tools argus-tools");
  const summary = make("summary");
  const left = make("div");
  left.append(make("span", "section-kicker", "Optional actions"), make("strong", "", "Report tools"));
  summary.append(left, make("span", "report-tools-summary", "Print, save or copy"));
  const actions = make("div", "report-tools-actions");
  const print = make("button", "quiet-button", "Print");
  print.type = "button";
  print.addEventListener("click", () => window.print());
  const save = make("button", "quiet-button", "Save text");
  save.type = "button";
  save.addEventListener("click", () => {
    const blob = new Blob([buildArgusPlainTextSummary(bundle)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const name = (bundle.ticker || bundle.title || "argus-report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    anchor.href = url;
    anchor.download = `${name || "argus-report"}-argus-summary.txt`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    onToast?.("Argus summary saved");
  });
  const copy = make("button", "primary-button", "Copy summary");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(buildArgusPlainTextSummary(bundle));
      onToast?.("Argus summary copied");
    } catch {
      onToast?.("Could not copy the summary");
    }
  });
  actions.append(print, save, copy);
  details.append(summary, actions);
  return details;
}

export function renderArgusReport(root, bundle, { onToast } = {}) {
  clear(root);
  root.classList.add("argus-report");

  const sourceSet = make("section", "argus-source-set");
  const sourceSetHeading = make("div", "argus-source-set-heading");
  sourceSetHeading.append(make("div", "", "Argus source reports"), make("p", "", "Open a source PDF to check its figures, or add another report for this company."));
  sourceSet.append(sourceSetHeading);
  if(Object.values(bundle.analyst?.marketData || {}).some(t=>t?.rows?.length) || bundle.analyst?.forecastUpdates?.length){
    const jump=make("button","phone-jump","View forecasts & revisions ↓");jump.type="button";jump.dataset.scrollTarget="argus-forecasts";sourceSet.append(jump);
  }
  const sourceSetGrid = make("div", "argus-source-set-grid");
  [
    { key: "analyst", label: "Analyst", description: "Thesis, estimates, valuation, risks" },
    { key: "a6", label: "A6 Quant", description: "Six-factor scores, history, peers" },
    { key: "options", label: "Options", description: "Covered call and diagonal spread" }
  ].forEach((item) => {
    const report = bundle[item.key];
    const card = make("button", `argus-source-set-card ${report ? "is-loaded" : "is-missing"}`);
    card.type = "button";
    if (!report) { card.dataset.addArgusType = item.key; card.setAttribute("aria-label", `Add ${item.label} report`); }
    if (report) { card.dataset.sourceType = report.type; card.setAttribute("aria-label", `Open ${report.label} PDF${report.reportDate ? ` · ${report.reportDate}` : ""}`); }
    const status = make("span", "argus-source-set-status", report ? "Open PDF" : "＋ Add PDF");
    const copy = make("div");
    copy.append(make("strong", "", item.label));
    card.title = item.description;
    if (report?.reportDate) copy.append(make("em", "", report.reportDate));
    card.append(status, copy);
    sourceSetGrid.append(card);
  });
  sourceSet.append(sourceSetGrid);
  for(const r of bundle.reports||[]){const gap=missingPageNote(r.textCoverage);if(gap){const note=make('p','source-page-gap',r.label+': '+gap);note.append(sourcePill(r,r.textCoverage.missingPages[0]));sourceSet.append(note);}}
  if (bundle.latestPrice != null) sourceSet.append(make("p", "argus-source-price", `Reported price: ${bundle.latestPrice} · ${bundle.latestPriceSource}${bundle.latestPriceReportDate ? ` · Report dated ${bundle.latestPriceReportDate}` : " · Report date not captured"}`));
  root.append(sourceSet);

  const targetSection = make("section", "argus-target-section");
  const targetHeading = make("div", "argus-target-heading");
  targetHeading.append(make("div", "", "Argus targets"), make("p", "", "Separate targets from each report; prices are not live quotes."));
  targetSection.append(targetHeading);
  const targetGrid = make("div", "argus-target-grid");
  if (bundle.analyst) {
    const analyst = bundle.analyst;
    const extras = [bundle.analyst?.priorTarget ? `Previous target ${bundle.analyst.priorTarget}` : null, bundle.analyst?.analyst ? `Analyst: ${bundle.analyst.analyst}` : null];
    targetGrid.append(reportCard("Analyst target", analyst, bundle.targetComparison.analystTarget, bundle.targetComparison.analystPrice, bundle.targetComparison.analystUpside, extras));
  }
  if (!bundle.analyst && bundle.options) targetGrid.append(reportCard('Target quoted in Options report', bundle.options, bundle.options.targetPrice, bundle.options.currentPrice, null));
  if (bundle.a6) {
    targetGrid.append(reportCard("A6 quantitative target", bundle.a6, bundle.targetComparison.a6Target, bundle.targetComparison.a6Price, bundle.targetComparison.a6Upside, [bundle.a6.ratingSince ? `Rating since ${bundle.a6.ratingSince}` : null]));
  }
  targetSection.append(targetGrid);
  root.append(targetSection);

  const nav = make("nav", "argus-nav");
  nav.setAttribute("aria-label", "Argus report sections");
  const links = [
    ["#argus-overview", "Key facts", Boolean(bundle.analyst)],
    ["#argus-forecasts", "Forecasts & revisions", Boolean(bundle.analyst)],
    ["#argus-source-data", "Financial history", Boolean(bundle.analyst?.tables.length || bundle.a6?.tables.length)],
    ["#argus-analyst", "Analyst", Boolean(bundle.analyst)],
    ["#argus-a6", "A6 Quant", Boolean(bundle.a6)],
    ["#argus-options", "Options", Boolean(bundle.options)],
    ["#argus-capture", "Source checks", true]
  ];
  links.filter(([, , visible]) => visible).forEach(([href, label], index) => {
    const link = make("a", "", label);
    link.href = href;
    nav.append(link);
  });
  root.append(nav);

  if (bundle.analyst) {
    const snapshot = make("section", "argus-section argus-overview-section");
    snapshot.id = "argus-overview";
    snapshot.append(sectionHeading("", "Key facts", "Figures from the Analyst report. Full financial history and forecasts follow below.", bundle.analyst));
    const snapshotFields = [
      { label: "Financial strength", key:'financialStrengthRating', value: bundle.analyst.financialStrengthRating, emphasis: true },
      { label: "Sector rating", key:'sectorRating', value: bundle.analyst.sectorRating },
      { label: "Market cap", key:'marketCap', value: bundle.analyst.marketCap },
      { label: "Revenue", key:'revenueTtm', value: bundle.analyst.revenueTtm },
      { label: "After-tax income", key:'afterTaxIncome', value: bundle.analyst.afterTaxIncome },
      { label: "Current FY P/E", key:'currentFyPe', value: bundle.analyst.currentFyPe },
      { label: "Prior FY P/E", key:'priorFyPe', value: bundle.analyst.priorFyPe },
      { label: "Price / sales", key:'priceSales', value: bundle.analyst.priceSales },
      { label: "Price / book", key:'priceBook', value: bundle.analyst.priceBook },
      { label: "Book value / share", key:'bookValuePerShare', value: bundle.analyst.bookValuePerShare },
      { label: "Debt / capital", key:'debtCapital', value: bundle.analyst.debtCapital },
      { label: "Current ratio", key:'currentRatio', value: bundle.analyst.currentRatio },
      { label: "ROE", key:'roe', value: bundle.analyst.roe },
      { label: "Net margin", key:'netMargin', value: bundle.analyst.netMargin },
      { label: "1Y EPS growth forecast", key:'epsGrowth1y', value: bundle.analyst.epsGrowth1y },
      { label: "5Y EPS growth forecast", key:'epsGrowth5y', value: bundle.analyst.epsGrowth5y },
      { label: "1Y dividend growth forecast", key:'dividendGrowth1y', value: bundle.analyst.dividendGrowth1y },
      { label: "Dividend", key:'dividend', value: bundle.analyst.dividend },
      { label: "Dividend yield", key:'yield', value: bundle.analyst.yield },
      { label: "Beta", key:'beta', value: bundle.analyst.beta },
      { label: "Institutional ownership", key:'institutionalOwnership', value: bundle.analyst.institutionalOwnership }
    ];
    const factGroups = make('div', 'research-fact-groups');
    const groups = [
      ['Earnings & growth', item => /Revenue|income|margin|EPS|ROE/i.test(item.label)],
      ['Valuation & dividends', item => /P\/E|Price \/|Book value|dividend|Market cap/i.test(item.label)],
      ['Financial position & risk', () => true]
    ];
    const assigned = new Set();
    for (const [title, matches] of groups) {
      const group = make('section', 'research-fact-group');
      group.append(make('h3', '', title));
      const list = make('dl', 'research-fact-list');
      snapshotFields.forEach((item, index) => {
        if (assigned.has(index) || !matches(item)) return;
        assigned.add(index);
        if (item.value === null || item.value === undefined || item.value === '') return;
        const row = make('div', 'research-fact-row');
        const field=make('dd');quotedValue(field,item.value,bundle.analyst.type,bundle.analyst.factEvidence?.[item.key],{reportDate:bundle.analyst.reportDate});
        row.append(make('dt','',item.label),field);
        list.append(row);
      });
      if (list.children.length) { group.append(list); factGroups.append(group); }
    }
    snapshot.append(factGroups);
    root.append(snapshot);
  }

  const forecasts = renderForecasts(bundle);
  if (forecasts) root.append(forecasts);
  const sources = renderSourceTables(bundle);
  if (sources) root.append(sources);
  const analyst = renderAnalyst(bundle);
  if (analyst) root.append(analyst);
  const a6 = renderA6(bundle);
  if (a6) root.append(a6);
  const options = renderOptions(bundle);
  if (options) root.append(options);
  root.append(renderCoverage(bundle), renderTools(bundle, onToast));

  const disclaimer = make("aside", "disclaimer argus-disclaimer");
  disclaimer.append(make("strong", "", "Source summary—not independent stock analysis. "));
  disclaimer.append(document.createTextNode("This page organizes the selected Argus PDFs. Analyst, A6 quantitative, and options values remain tied to their original report type and date; the app does not create a new buy/sell recommendation."));
  root.append(disclaimer);
}

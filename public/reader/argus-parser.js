import {tablePeriods,rowPeriod} from './report-periods.js';
import { cleanCapturedText } from "./parser.js";
import { discoverTables, discoverTextTables, discoverMarketData } from './layout-tables.js';
import { attachProvenance, compact, financialValue } from './financial-data.js';
import { sourceFacts, sourceIdentity, readScores, statementsFromSections, discoverOptionTables } from './argus-source.js';

const REPORT_TYPES = Object.freeze({
  analyst: "argus-analyst",
  a6: "argus-a6",
  options: "argus-options",
  morningstar: "morningstar",
  unknown: "unknown"
});

function normalizeSpace(value = "") {
  return String(value).replace(/[\u00a0\u2007\u202f]/g, " ").replace(/[ \t]+/g, " ").trim();
}

function stripPageMarkers(value = "") {
  return String(value).replace(/^\[\[PAGE \d+ OF \d+\]\]\s*$/gim, "").trim();
}

function pageForIndex(text, index) {
  const prefix = String(text).slice(0, Math.max(0, index));
  const matches = [...prefix.matchAll(/\[\[PAGE\s+(\d+)\s+OF\s+(\d+)\]\]/gi)];
  const last = matches.at(-1);
  return last ? { page: Number(last[1]), totalPages: Number(last[2]) } : { page: null, totalPages: null };
}

function firstMatch(text, patterns, group = 1) {
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match?.[group] !== undefined) return normalizeSpace(match[group]);
  }
  return null;
}

function numberValue(value) {
  if (value === null || value === undefined) return null;
  const match = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function money(value) {
  if (!value) return null;
  const match = String(value).match(/\$\s*-?\d[\d,]*(?:\.\d+)?/);
  return match ? match[0].replace(/\s+/g, "") : null;
}

function percent(value) {
  if (!value) return null;
  const match = String(value).match(/-?\d+(?:\.\d+)?\s*%/);
  return match ? match[0].replace(/\s+/g, "") : null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findValueAfterLabel(text, label, valuePattern = /[^\n]{0,80}/) {
  const pattern = new RegExp(`${escapeRegExp(label)}\\s*:?\\s*(${valuePattern.source})`, "i");
  const match = String(text).match(pattern);
  return match ? normalizeSpace(match[1]) : null;
}

function findAllMatches(text, pattern, group = 1) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  const output = [];
  for (const match of String(text).matchAll(globalPattern)) {
    if (match[group] !== undefined) output.push(normalizeSpace(match[group]));
  }
  return output;
}

function extractTitle(text) {
  const patterns = [
    /(?:^|\n)\s*®?\s*([A-Z][A-Z0-9&.,'’\- ]{3,})\s*\n\s*\((?:NASDAQ|NYSE|NAS|NYS|NGS|NMS|ASE|AMEX|OTC|LSE|TSX)\s*:?\s*[A-Z.\-]+\)/im,
    /(?:^|\n)\s*([A-Z][A-Z0-9&.,'’\- ]{3,})\s*\n\s*(?:NASDAQ|NYSE|NAS|NYS|NGS|NMS|ASE|AMEX|OTC|LSE|TSX)\s*:\s*[A-Z.\-]+/im,
    /(?:NASDAQ|NYSE|NAS|NYS|NGS|NMS|ASE|AMEX|OTC|LSE|TSX)\s*:\s*[A-Z.\-]+\s*\n+\s*([A-Z][A-Z0-9&.,'’\- ]{3,})\s*\n\s*Report\s+(?:Created|Date)/im,
    /(?:^|\n)\s*®?\s*([^\n]{3,80}?)\s*\n\s*\((?:NASDAQ|NYSE|NAS|NYS|NGS|NMS|ASE|AMEX|OTC|LSE|TSX)\s*:?\s*[A-Z.\-]+\)/im
  ];
  const title = firstMatch(text, patterns);
  if (!title) return "Argus research report";
  return title.replace(/\s+/g, " ").replace(/\s+INCORPORATED$/i, " INC").trim();
}

function extractTicker(text) {
  return firstMatch(text, [
    /\((?:NASDAQ|NYSE|NAS|NYS|NGS|NMS|ASE|AMEX|OTC|LSE|TSX)\s*:?\s*([A-Z.\-]{1,8})\)/i,
    /(?:NASDAQ|NYSE|NAS|NYS|NGS|NMS|ASE|AMEX|OTC|LSE|TSX)\s*:\s*([A-Z.\-]{1,8})\b/i
  ]);
}

function reportDate(text) {
  return firstMatch(text, [
    /Report\s+Created\s+([A-Z][a-z]{2}\s+\d{1,2},\s+20\d{2})/i,
    /Report\s+Date\s*:\s*([A-Z][a-z]+\s+\d{1,2},\s+20\d{2})/i
  ]);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function sectionBetween(text, startAliases, endAliases = []) {
  const source = String(text);
  const starts = Array.isArray(startAliases) ? startAliases : [startAliases];
  const ends = Array.isArray(endAliases) ? endAliases : [endAliases];
  let start = null;
  let matched = "";
  for (const alias of starts) {
    const regex = alias instanceof RegExp ? alias : new RegExp(`(?:^|\\n)\\s*${escapeRegExp(alias)}\\s*(?:\\n|$)`, "im");
    const match = regex.exec(source);
    if (match && (start === null || match.index < start)) {
      start = match.index + match[0].length;
      matched = match[0];
    }
  }
  if (start === null) return null;
  let end = source.length;
  for (const alias of ends) {
    const regex = alias instanceof RegExp ? alias : new RegExp(`(?:^|\\n)\\s*${escapeRegExp(alias)}\\s*(?:\\n|$)`, "im");
    regex.lastIndex = start;
    const tailMatch = regex.exec(source.slice(start));
    if (tailMatch) end = Math.min(end, start + tailMatch.index);
  }
  const body = stripPageMarkers(source.slice(start, end)).trim();
  if (!body) return null;
  const sourceLoc = pageForIndex(source, start - matched.length);
  return { body, ...sourceLoc };
}


function sectionBetweenLast(text, startAlias, endAliases = []) {
  const source = String(text);
  const startRegex = startAlias instanceof RegExp
    ? new RegExp(startAlias.source, startAlias.flags.includes("g") ? startAlias.flags : `${startAlias.flags}g`)
    : new RegExp(`(?:^|\\n)\\s*${escapeRegExp(startAlias)}\\s*(?:\\n|$)`, "gim");
  const matches = [...source.matchAll(startRegex)];
  const match = matches.at(-1);
  if (!match) return null;
  const start = match.index + match[0].length;
  let end = source.length;
  const ends = Array.isArray(endAliases) ? endAliases : [endAliases];
  for (const alias of ends) {
    const regex = alias instanceof RegExp
      ? new RegExp(alias.source, alias.flags.replace(/g/g, ""))
      : new RegExp(`(?:^|\\n)\\s*${escapeRegExp(alias)}\\s*(?:\\n|$)`, "im");
    const tailMatch = regex.exec(source.slice(start));
    if (tailMatch) end = Math.min(end, start + tailMatch.index);
  }
  const body = stripPageMarkers(source.slice(start, end)).trim();
  if (!body) return null;
  return { body, ...pageForIndex(source, match.index) };
}

function extractBullets(body, max = 8) {
  const lines = String(body || "").split("\n");
  const bullets = [];
  let current = "";
  const flush = () => {
    const value = normalizeSpace(current)
      .replace(/^[•●▪◦\u2022-]+\s*/, "")
      .replace(/\.{2,}$/, ".");
    if (value) bullets.push(value);
    current = "";
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^[•●▪◦\u2022-]+\s*(.+)$/);
    if (bullet) {
      flush();
      current = bullet[1];
    } else if (current) {
      current += ` ${line}`;
    }
  }
  flush();
  return bullets.slice(0, max);
}

function paragraphHighlights(body, max = 4) {
  if (!body) return [];
  const decimalMarker = "\uE000";
  const flattened = String(body)
    .replace(/(\d)\.(\d)/g, `$1${decimalMarker}$2`)
    .replace(/\n[•●▪◦-]\s*/g, ". ")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  const sentences = (flattened.match(/[^.!?]+(?:[.!?]+|$)/g) || [])
    .map((sentence) => sentence.replace(new RegExp(decimalMarker, "g"), "."));
  const scored = sentences
    .map((sentence, index) => ({
      sentence: sentence.trim(),
      index,
      score: (/(?:\$|%|EPS|revenue|margin|growth|target|guidance|risk|competition|buyback|cash|debt|volume)/i.test(sentence) ? 2 : 0)
        + (/(?:expect|believe|raise|lower|maintain|improv|declin|risk|catalyst)/i.test(sentence) ? 2 : 0)
        + Math.max(0, 2 - index * 0.15)
    }))
    .filter((item) => item.sentence.length >= 28 && item.sentence.length <= 600)
    .filter((item) => !/Argus assigns a 12-month|BUY-rated stocks are expected|HOLD-rated stocks are expected|SELL-rated stocks are expected|distribution of ratings across Argus/i.test(item.sentence));
  if (!scored.length) return [];
  const picked = [];
  if (scored[0]) picked.push(scored[0]);
  for (const item of [...scored].sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (picked.some((existing) => existing.index === item.index)) continue;
    picked.push(item);
    if (picked.length >= max) break;
  }
  return picked.sort((a, b) => a.index - b.index).map((item) => item.sentence);
}

function labeledMoney(text, label) {
  const pattern = new RegExp(`${escapeRegExp(label)}\\s*:?\\s*(\\$\\s*-?\\d[\\d,]*(?:\\.\\d+)?)`, "i");
  return firstMatch(text, [pattern]);
}

function labeledPercent(text, label) {
  const pattern = new RegExp(`${escapeRegExp(label)}\\s*:?\\s*(-?\\d+(?:\\.\\d+)?\\s*%)`, "i");
  return firstMatch(text, [pattern]);
}

function labeledNumber(text, label) {
  const pattern = new RegExp(`${escapeRegExp(label)}\\s*:?\\s*(-?\\d[\\d,]*(?:\\.\\d+)?)`, "i");
  return firstMatch(text, [pattern]);
}

export function detectResearchDocument(rawText = "") {
  const text = String(rawText);
  if (/ARGUS\s+Option\s+Report|Option\s+Strategy\s+Summary|Option\s+Strategies\s+Risk\s+Assessment/i.test(text)) {
    return { provider: "Argus", type: REPORT_TYPES.options, label: "Options" };
  }
  if (/ARGUS\s+A6\s+Report|Argus\s+A6\s+Sub-?component\s+Scores|Argus\s+A6\s+Quantitative\s+Universe/i.test(text)) {
    return { provider: "Argus", type: REPORT_TYPES.a6, label: "A6 Quant" };
  }
  if (/Argus\s+Analyst\s+Report|ARGUS\s+RATING\s*:\s*(?:BUY|HOLD|SELL)/i.test(text)) {
    return { provider: "Argus", type: REPORT_TYPES.analyst, label: "Analyst" };
  }
  if (/\bMorningstar\s+(?:Equity\s+(?:Analyst|Research)\s+Report|Valuation\s+Model\s+Summary)\b/i.test(text) ||
      (/\bMorningstar\b/i.test(text)&&/\bFair\s+Value\s+Estimate\b/i.test(text)&&/\b(?:Economic\s+Moat|Price\s*\/\s*FVE)\b/i.test(text))) return { provider: "Morningstar", type: REPORT_TYPES.morningstar, label: "Morningstar" };
  return { provider: "Unknown", type: REPORT_TYPES.unknown, label: "Unknown" };
}

function parseAnalyst(text, document = {}) {
  const cleaned = cleanCapturedText(text);
  const historical = document.pages?.length ? discoverTables(document, REPORT_TYPES.analyst) : discoverTextTables(cleaned, REPORT_TYPES.analyst);
  const market = discoverMarketData(document);
  const tables = [...market.tables, ...historical.tables];
  const marketData = Object.fromEntries(market.tables.map(table => [table.id.includes('quarterly') ? 'quarterly' : 'annual', table]));
  const target = labeledMoney(cleaned, "Target Price") || firstMatch(cleaned, [/target price\s+to\s+(\$\d[\d,]*(?:\.\d+)?)/i]);
  const currentPrice = firstMatch(cleaned, [
    /Market\s+Overview[\s\S]{0,180}?\bPrice\s+(\$\d[\d,]*(?:\.\d+)?)/i,
    /On\s+[A-Z][a-z]+\s+\d{1,2},\s+(?:BUY|HOLD|SELL)-rated\s+\S+\s+closed\s+at\s+(\$\d[\d,]*(?:\.\d+)?)/i,
    /Closed\s+at\s+(\$\d[\d,]*(?:\.\d+)?)/i
  ]);
  const targetRevision = firstMatch(cleaned, [
    /target\s+price\s+to\s+(\$\d[\d,]*(?:\.\d+)?)\s*\(from\s*(\$\d[\d,]*(?:\.\d+)?)\)/i
  ]);
  const priorTarget = firstMatch(cleaned, [/target\s+price\s+to\s+\$\d[\d,]*(?:\.\d+)?\s*\(from\s*(\$\d[\d,]*(?:\.\d+)?)\)/i]);
  const analystInfo = cleaned.match(/Analysis\s+by\s+([^,\n]+),\s*([^\n]+)/i);

  const sections = [
    ["investmentThesis", "Investment thesis", ["INVESTMENT THESIS"], ["Growth & Valuation Analysis", "RECENT DEVELOPMENTS", "EARNINGS & GROWTH ANALYSIS"]],
    ["recentDevelopments", "Recent developments", ["RECENT DEVELOPMENTS"], ["EARNINGS & GROWTH ANALYSIS", "FINANCIAL STRENGTH & DIVIDEND"]],
    ["earningsGrowth", "Earnings & growth analysis", ["EARNINGS & GROWTH ANALYSIS"], ["FINANCIAL STRENGTH & DIVIDEND"]],
    ["financialStrengthDividend", "Financial strength & dividend", ["FINANCIAL STRENGTH & DIVIDEND"], ["MANAGEMENT & RISKS"]],
    ["managementRisks", "Management & risks", ["MANAGEMENT & RISKS"], ["COMPANY DESCRIPTION"]],
    ["companyDescription", "Company description", ["COMPANY DESCRIPTION"], ["VALUATION"]],
    ["valuation", "Valuation", ["VALUATION"], ["METHODOLOGY & DISCLAIMERS", "About Argus"]]
  ].map(([id, title, starts, ends]) => {
    const section = id === "valuation"
      ? sectionBetweenLast(cleaned, "VALUATION", ends)
      : sectionBetween(cleaned, starts, ends);
    return { id, title, found: Boolean(section), ...(section || {}), highlights: paragraphHighlights(section?.body, id === "investmentThesis" ? 5 : 3) };
  });

  const notesSection = sectionBetween(cleaned, [/ARGUS\s+RATING\s*:\s*(?:BUY|HOLD|SELL)[^\n]*(?:\n|$)/i], ["INVESTMENT THESIS"]);
  const notes = notesSection ? (extractBullets(notesSection.body, 8).length ? extractBullets(notesSection.body, 8) : paragraphHighlights(notesSection.body, 6)) : [];


  return {
    type: REPORT_TYPES.analyst,
    label: "Analyst Report",
    title: extractTitle(cleaned),
    ticker: extractTicker(cleaned),
    reportDate: reportDate(cleaned),
    analyst: analystInfo ? normalizeSpace(analystInfo[1]) : null,
    analysisDate: analystInfo ? normalizeSpace(analystInfo[2]) : null,
    rating: firstMatch(cleaned, [/ARGUS\s+RATING\s*:\s*(BUY|HOLD|SELL)/i]),
    targetPrice: target,
    priorTarget,
    targetRevision,
    currentPrice,
    range52Week: firstMatch(cleaned, [/52\s*Week\s+Price\s+Range\s+(\$[\d.]+\s+to\s+\$[\d.]+)/i, /52\s*Week\s+High:\s*(\$[\d.]+)\s+52\s*Week\s+Low:\s*(\$[\d.]+)/i]),
    sharesOutstanding: firstMatch(cleaned, [/Shares\s+Outstanding\s+([\d,.]+\s+(?:Thousand|Million|Billion|Trillion))/i]),
    dividend: labeledMoney(cleaned, "Dividend"),
    sector: firstMatch(cleaned, [/Sector\s+Overview\s+Sector\s+([A-Za-z][A-Za-z &-]+?)\s+Sector\s+Rating/i]),
    sectorRating: firstMatch(cleaned, [/Sector\s+Overview[\s\S]{0,220}?Sector\s+Rating\s+(OVER\s+WEIGHT|MARKET\s+WEIGHT|UNDER\s+WEIGHT)/i]),
    financialStrengthRating: firstMatch(cleaned, [/Financial\s+Strength\s+Rating\s+(HIGH|MEDIUM|LOW)/i]),
    debtCapital: labeledPercent(cleaned, "Debt/Capital Ratio"),
    roe: labeledPercent(cleaned, "Return on Equity"),
    netMargin: labeledPercent(cleaned, "Net Margin"),
    payoutRatio: firstMatch(cleaned, [/Payout\s+Ratio\s+([\d.]+)/i]),
    currentRatio: firstMatch(cleaned, [/Current\s+Ratio\s+([\d.]+)/i]),
    revenueTtm: firstMatch(cleaned, [/\bRevenue\s+(\$[\d.]+\s+Billion)/i]),
    afterTaxIncome: firstMatch(cleaned, [/After-Tax\s+Income\s+(\$[\d.]+\s+Billion)/i]),
    currentFyPe: firstMatch(cleaned, [/Current\s+FY\s+P\/E\s+([\d.]+)/i]),
    priorFyPe: firstMatch(cleaned, [/Prior\s+FY\s+P\/E\s+([\d.]+)/i]),
    priceSales: firstMatch(cleaned, [/Price\/Sales\s+([\d.]+)/i]),
    priceBook: firstMatch(cleaned, [/Price\/Book\s+([\d.]+)/i]),
    bookValuePerShare: labeledMoney(cleaned, "Book Value/Share"),
    marketCap: firstMatch(cleaned, [/Market\s+Capitalization\s+(\$[\d.]+\s+Billion)/i, /Market\s*Cap\s+(\$[\d.]+\s+billion)/i]),
    epsGrowth1y: firstMatch(cleaned, [/1\s+Year\s+EPS\s+Growth\s+Forecast\s+([\d.]+%)/i]),
    epsGrowth5y: firstMatch(cleaned, [/5\s+Year\s+EPS\s+Growth\s+Forecast\s+([\d.]+%)/i]),
    dividendGrowth1y: firstMatch(cleaned, [/1\s+Year\s+Dividend\s+Growth\s+Forecast\s+([\d.]+%)/i]),
    beta: firstMatch(cleaned, [/\bBeta\s+([\d.]+)/i]),
    institutionalOwnership: firstMatch(cleaned, [/Institutional\s+Ownership\s+([\d.]+%)/i]),
    marketData,
    notes,
    sections,
    forecastUpdates: [],
    captureIssues: [...historical.issues, ...market.issues],
    tables,
    text: cleaned
  };
}

function extractA6Scores(text) {
  const beforeRating = String(text).slice(0, Math.max(0, String(text).search(/Argus\s+Rating\s*:/i)));
  const tokens = [...beforeRating.matchAll(/(?:^|\n)\s*([HML])\s*(?=\n|$)/gim)].map((match) => match[1].toUpperCase());
  const fallback = String(text).match(/(?:^|\n)\s*([HML])\s*\n\s*([HML])\s*\n\s*([HML])\s*\n\s*([HML])\s*\n\s*([HML])\s*\n\s*([HML])\s*(?:\n|$)/im);
  const values = tokens.length >= 6 ? tokens.slice(-6) : fallback ? fallback.slice(1, 7) : [];
  const labels = ["Industry", "Management", "Safety", "Financial Strength", "Growth", "Value"];
  return labels.map((label, index) => ({ label, score: values[index] || null }));
}

function parseA6(text, document = {}) {
  const raw = String(text || "");
  const cleaned = cleanCapturedText(raw);
  const discovered = document.pages?.length ? discoverTables(document, REPORT_TYPES.a6) : discoverTextTables(cleaned, REPORT_TYPES.a6);
  const tables = discovered.tables;

  const sectorRating = firstMatch(cleaned, [/Our\s+rating\s+on\s+the\s+([^\n.]+?)\s+sector\s+is\s+([A-Za-z-]+)/i], 2);
  const sectorName = firstMatch(cleaned, [/Our\s+rating\s+on\s+the\s+([^\n.]+?)\s+sector\s+is\s+[A-Za-z-]+/i]);
  const peerRows = [];
  for (const line of cleaned.split("\n")) {
    const match = line.match(/^\s*([A-Z][A-Z0-9.-]{1,5})\s+(.+?)\s+(-?\d+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(Nil|-?\d+%)\s+([\d.]+)\s+(-?\d+%)\s+(Nil|-?\d+%)\s+(BUY|HOLD|SELL)\s*$/i);
    if (match) {
      peerRows.push({ ticker: match[1], company: normalizeSpace(match[2]), price: match[3], marketCap: match[4], growth5y: match[5], pe: match[6], netMargin: match[7], growth1y: match[8], rating: match[9].toUpperCase() });
    }
  }

  const sectorSections = [
    ["ratingComposition", "Rating & composition", ["RATING & COMPOSITION"], ["PERFORMANCE & FINANCIAL METRICS"]],
    ["performanceMetrics", "Performance & financial metrics", ["PERFORMANCE & FINANCIAL METRICS"], ["INVESTING IN THE SECTOR"]],
    ["investingSector", "Investing in the sector", ["INVESTING IN THE SECTOR"], [/Argus\s+Research[^\n]*sector\s+Analysts/i, "Argus A6 Quantitative Universe"]]
  ].map(([id, title, starts, ends]) => {
    const section = sectionBetween(cleaned, starts, ends);
    return { id, title, found: Boolean(section), ...(section || {}), highlights: paragraphHighlights(section?.body, 3) };
  });

  return {
    type: REPORT_TYPES.a6,
    label: "A6 Quantitative Report",
    title: extractTitle(cleaned),
    ticker: extractTicker(cleaned),
    reportDate: reportDate(cleaned),
    rating: firstMatch(cleaned, [/Argus\s+Rating\s*:[\s\S]{0,80}?\b(BUY|HOLD|SELL)\b/i]),
    ratingSince: firstMatch(cleaned, [/Rating\s+Since\s*:\s*([0-9/]+)/i]),
    currentPrice: labeledMoney(cleaned, "Current Price"),
    targetPrice: labeledMoney(cleaned, "Target Price"),
    marketCap: firstMatch(cleaned, [/Market\s+Cap\s*:\s*(\$[\d.]+\s+billion)/i]),
    dividend: firstMatch(cleaned, [/Dividend\s*:?\s*(Nil|NM|--|\$[−-]?(?:\d[\d,]*|\d*\.\d+)(?:\.\d+)?)/i]),
    yield: firstMatch(cleaned, [/Yield\s*:?\s*(Nil|NM|--|[−-]?(?:\d+(?:\.\d+)?|\.\d+)%)/i]),
    beta: firstMatch(cleaned, [/\bBeta\s*:\s*([\d.]+)/i]),
    sector: firstMatch(cleaned, [/\bSector\s*:\s*([^\n]+)/i]),
    industry: firstMatch(cleaned, [/\bIndustry\s*:\s*([^\n]+)/i]),
    range52Week: firstMatch(cleaned, [/52\s+week\s+trading\s+range\s+is\s+(\$[\d.]+\s+to\s+\$[\d.]+)/i]),
    targetUpside: firstMatch(cleaned, [/target\s+price\s+is\s+\$[\d.]+\s+representing\s+a\s+([\d.]+%)\s+gain/i]),
    scores: readScores(document, extractA6Scores(raw)),
    captureIssues: discovered.issues,
    ownership: {
      total13F: firstMatch(cleaned, [/13F\s+Total\s*:\s*([\d.]+m)/i]),
      outstanding: firstMatch(cleaned, [/Outstanding\s*:\s*([\d.]+m)/i])
    },
    sectorRating,
    sectorName,
    peerRows,
    sectorSections,
    tables,
    text: cleaned
  };
}

function allLabeledValues(text, label, pattern = /\$?-?\d[\d,]*(?:\.\d+)?%?/) {
  const regex = new RegExp(`${escapeRegExp(label)}\\s*:?\\s*(${pattern.source})`, "gi");
  return findAllMatches(text, regex);
}

function parseOptions(text, document = {}) {
  const cleaned = cleanCapturedText(text);
  const summary = sectionBetween(cleaned, ["Option Strategy Summary"], ["Buy Side", "Sell Side", "Key Metrics"]);
  const opinion = sectionBetween(cleaned, ["Argus Opinion"], ["Glossary", "Disclosures"]);
  const expirations = allLabeledValues(cleaned, "Sold Call Expiration", /\d{2}\/\d{2}\/\d{2}/);
  const strikes = allLabeledValues(cleaned, "Sold Call Strike Price", /\$\d[\d,]*(?:\.\d+)?/);
  const bids = allLabeledValues(cleaned, "Current Sold Call Bid Price", /\$\d[\d,]*(?:\.\d+)?/);
  const netDebits = allLabeledValues(cleaned, "Net Debit", /\$\d[\d,]*(?:\.\d+)?/);
  const downsideDollar = allLabeledValues(cleaned, "Downside Protection ($)", /\$\d[\d,]*(?:\.\d+)?/);
  const downsidePercent = allLabeledValues(cleaned, "Downside Protection (%)", /-?\d+(?:\.\d+)?/);
  const itm = allLabeledValues(cleaned, "In-the-Money (%)", /-?\d+(?:\.\d+)?/);
  const breaks = allLabeledValues(cleaned, "Break Even", /\$?\d+(?:\.\d+)?/);
  const assignedDollar = allLabeledValues(cleaned, "Assigned Return ($)", /\$?\d+(?:\.\d+)?/);
  const assignedPercent = allLabeledValues(cleaned, "Assigned Return (%)", /\d+(?:\.\d+)?/);
  const annualized = allLabeledValues(cleaned, "Ann. Assigned Return (%)", /\d+(?:\.\d+)?/);
  const durations = allLabeledValues(cleaned, "Trade Duration (Days)", /\d+/);
  const riskRanks = allLabeledValues(cleaned, "Strategy Risk Ranking", /\d+(?:\.\d+)?(?:\s*(?:\/|of)\s*\d+)?/);
  const equivalent = allLabeledValues(cleaned, "Appreciation", /\$?\d+(?:\.\d+)?/);

  const coveredRisk = sectionBetween(cleaned, [/Our\s+\d+\s+Key\s*\([^)]+\)[^\n]*(?:\n|$)/i], [/The\s+Diagonal\s+Spread\s+Strategy/i]);
  const diagonalRisk = sectionBetween(cleaned, [/The\s+Diagonal\s+Spread\s+Strategy[^\n]*(?:\n|$)/i], [/(?:^|\n)\s*[^\n]{2,80}\n\s*\((?:NASDAQ|NYSE|NAS|NYS|NGS|NMS|ASE|AMEX|OTC|LSE|TSX)\s*:/i, /Report\s+Date\s*:/i, /Option\s+Strategy\s+Summary/i]);

  return {
    type: REPORT_TYPES.options,
    label: "Options Report",
    title: extractTitle(cleaned),
    ticker: extractTicker(cleaned),
    reportDate: reportDate(cleaned),
    rating: firstMatch(cleaned, [/Argus\s+Rating\s*:[\s\S]{0,100}?\b(BUY|HOLD|SELL)\b/i]),
    ratingSince: firstMatch(cleaned, [/Rating\s+since\s*:\s*([0-9/]+)/i]),
    currentPrice: firstMatch(cleaned, [/Current\s*Price\s*:?\s*(\$\d[\d,]*(?:\.\d+)?)/i]),
    targetPrice: firstMatch(cleaned, [/Target\s*Price\s*:?\s*(\$\d[\d,]*(?:\.\d+)?)/i]),
    marketCap: firstMatch(cleaned, [/Market\s*Cap\s*:?\s*(\$[\d.]+\s+billion)/i]),
    dividend: labeledMoney(cleaned, "Dividend"),
    yield: labeledPercent(cleaned, "Yield"),
    summary: summary?.body || null,
    summaryHighlights: paragraphHighlights(summary?.body, 4),
    opinion: opinion?.body || null,
    coveredCall: {
      name: "Covered call",
      stockSymbol: firstMatch(cleaned, [/Stock\s+Symbol\s+([A-Z.\-]+)/i]),
      stockPrice: firstMatch(cleaned, [/Stock\s+Price\s+(\$\d[\d,]*(?:\.\d+)?)/i]),
      soldCallExpiration: expirations[0] || null,
      soldCallStrike: strikes[0] || null,
      soldCallBid: bids[0] || null,
      netDebit: netDebits[0] || null,
      downsideProtection: downsideDollar[0] || null,
      downsideProtectionPercent: downsidePercent[0] || null,
      inTheMoneyPercent: itm[0] || null,
      breakEven: breaks[0] || null,
      assignedReturn: assignedDollar[0] || null,
      assignedReturnPercent: assignedPercent[0] || null,
      annualizedAssignedReturnPercent: annualized[0] || null,
      durationDays: durations[0] || null,
      riskRanking: riskRanks[0] || null,
      riskLabel: firstMatch(cleaned, [/Covered\s+Call\s+Risk\s+Ranking\s+([A-Za-z]+)/i]),
      equivalentStockAppreciation: equivalent[0] || null,
      riskDiscussion: coveredRisk?.body || null
    },
    diagonalSpread: {
      name: "Diagonal spread",
      boughtCallAsk: firstMatch(cleaned, [/Bought\s+Call\s+Ask\s+Price\s+(\$\d[\d,]*(?:\.\d+)?)/i]),
      boughtCallExpiration: firstMatch(cleaned, [/Bought\s+Call\s+Month\s+(\d{2}\/\d{2}\/\d{2})/i]),
      boughtCallStrike: firstMatch(cleaned, [/Bought\s+Call\s+Strike\s+Price\s+(\$\d[\d,]*(?:\.\d+)?)/i]),
      soldCallExpiration: expirations[1] || null,
      soldCallStrike: strikes[1] || null,
      soldCallBid: bids[1] || null,
      netDebit: netDebits[1] || null,
      downsideProtection: downsideDollar[1] || null,
      downsideProtectionPercent: downsidePercent[1] || null,
      inTheMoneyPercent: itm[1] || null,
      breakEven: breaks[1] || null,
      assignedReturn: assignedDollar[1] || null,
      assignedReturnPercent: assignedPercent[1] || null,
      annualizedAssignedReturnPercent: annualized[1] || null,
      durationDays: durations[1] || null,
      riskRanking: riskRanks[1] || null,
      riskLabel: firstMatch(cleaned, [/Diagonal\s+Spread\s+Risk\s+Ranking\s+([A-Za-z]+)/i]),
      equivalentStockAppreciation: equivalent[1] || null,
      riskDiscussion: diagonalRisk?.body || null
    },
    tables: discoverOptionTables(document),
    captureIssues: [],
    strategyComparison: sectionBetween(cleaned, ["Option Strategy Comparison"], ["Argus Opinion"])?.body || null,
    text: cleaned
  };
}

export function parseArgusDocument(document) {
  const type = document.type || detectResearchDocument(document.rawText).type;
  let report;
  if (type === REPORT_TYPES.analyst) report = parseAnalyst(document.rawText, document);
  if (type === REPORT_TYPES.a6) report = parseA6(document.rawText, document);
  if (type === REPORT_TYPES.options) report = parseOptions(document.rawText, document);
  if (!report) return null;
  Object.assign(report, sourceIdentity(document));
  report.provider = 'Argus';
  report.textCoverage=document.textCoverage;
  report.fileName = document.fileName || document.title || null;
  report.sourceFacts = sourceFacts(document);
  // Public summary aliases are view mappings. Every discovered source label is
  // retained above, including labels the concise view does not yet recognize.
  const aliases = { currentPrice: report.type === REPORT_TYPES.analyst ? 'Price' : 'Current Price', targetPrice: 'Target Price', dividend: 'Dividend', yield: 'Yield',
    currentFyPe: 'Current FY P/E', priorFyPe: 'Prior FY P/E', priceSales: 'Price/Sales', priceBook: 'Price/Book',
    currentRatio: 'Current Ratio', debtCapital: 'Debt/Capital Ratio', roe: 'Return on Equity', netMargin: 'Net Margin',
    sectorRating:'Sector Rating',sector:'Sector',financialStrengthRating:'Financial Strength Rating',sharesOutstanding:'Shares Outstanding',
    revenueTtm:'Revenue',afterTaxIncome:'After-Tax Income',payoutRatio:'Payout Ratio',marketCap:'Market Capitalization',
    epsGrowth1y:'1 Year EPS Growth Forecast',epsGrowth5y:'5 Year EPS Growth Forecast',dividendGrowth1y:'1 Year Dividend Growth Forecast',beta:'Beta',institutionalOwnership:'Institutional Ownership' };
  report.factEvidence={};
  const keyText=v=>String(v).toLowerCase().replace(/\s/g,'');
  const textFacts=new Set(['sectorRating','sector','financialStrengthRating']);
  for (const [key, label] of Object.entries(aliases)) {
    const matches=report.sourceFacts.filter(f=>keyText(f.metric)===keyText(label)&&f.layout==='pair'&&
      (textFacts.has(key)||/[\d$€£¥%]/.test(f.raw)||financialValue(f.raw).status!=='unresolved'));
    if(!matches.length)continue;
    if(new Set(matches.map(f=>keyText(f.raw))).size>1){
      // The same label can describe a peer, an older forecast, or another
      // strategy. Do not promote an arbitrary occurrence to a headline.
      report[key]=null;
      (report.captureIssues??=[]).push({metric:label,section:'Report facts',sourcePage:matches[0].sourcePage,
        reason:'Different printed values use this label. Check the original PDF (p. '+[...new Set(matches.map(f=>f.sourcePage))].join(', ')+').'});
      continue;
    }
    report[key]=matches[0].raw;report.factEvidence[key]=matches[0];
  }
  if (report.type === REPORT_TYPES.analyst) {
    report.priorTarget ||= firstMatch(report.text, [/target\s+price\s+to\s+\$[\d,.]+\s+(?:\()?from\s+(\$[\d,.]+)/i]);
  }
  const statements = statementsFromSections(report, document);
  report.observations = statements.observations;
  if (type === REPORT_TYPES.analyst) report.forecastUpdates = statements.updates;
  for (const fact of report.sourceFacts) Object.assign(fact, { provider: 'Argus', reportType: type, reportDate: report.reportDate, sourceFile: report.fileName });
  report.observations.push(...report.sourceFacts);
  return attachProvenance(report);
}

function impliedUpside(target, price) {
  const targetNumber = numberValue(target);
  const priceNumber = numberValue(price);
  if (!targetNumber || !priceNumber) return null;
  return ((targetNumber - priceNumber) / priceNumber) * 100;
}

// A price is inseparable from the report that actually printed it.
export function priceSource(reports) {
  const candidates=reports.filter(r=>financialValue(r.currentPrice).status==='number');
  const dated=candidates.map(r=>({r,date:parseDate(r.reportDate)})).filter(x=>x.date).sort((a,b)=>b.date-a.date);
  return dated[0]?.r || candidates[0] || null;
}
function completeness(bundle) {
  const checks=[];
  const add=(id,label,value)=>checks.push({id,label,found:Boolean(value)});
  if(bundle.analyst){
    add('analyst-rating','Analyst rating',bundle.analyst.rating);
    add('analyst-target','Analyst target',bundle.analyst.targetPrice);
    add('analyst-data','Analyst financial tables',bundle.analyst.tables?.length || bundle.analyst.marketData?.annual?.rows?.length);
  }
  if(bundle.a6){
    add('a6-rating','A6 rating',bundle.a6.rating);
    add('a6-target','A6 target',bundle.a6.targetPrice);
    add('a6-data','A6 financial tables',bundle.a6.tables?.length);
  }
  if(bundle.options){
    add('options-strategies','Options strategy details',bundle.options.tables?.some(t=>t.rows?.length) || bundle.options.coveredCall?.soldCallStrike || bundle.options.diagonalSpread?.boughtCallStrike);
  }
  const found=checks.filter(c=>c.found).length;
  return {checks,found,expected:checks.length,score:checks.length ? Math.round(found/checks.length*100) : null};
}

export function analyzeArgusBundle(documents = []) {
  return combineParsedArgusReports(documents.map(parseArgusDocument).filter(Boolean));
}
export function combineParsedArgusReports(parsed) {
  const tickers = new Set(parsed.map(r => r.ticker?.toUpperCase()).filter(Boolean));
  if (tickers.size > 1) throw new Error('These PDFs describe different companies. Choose reports for one ticker.');
  if (new Set(parsed.map(r => r.type)).size !== parsed.length) throw new Error('Choose one report per Argus type. Different report dates are kept separate.');
  if (parsed.length > 1 && parsed.some(r => !r.ticker)) throw new Error('A ticker could not be verified in one PDF, so these reports cannot safely be combined.');
  const analyst = parsed.find((item) => item.type === REPORT_TYPES.analyst) || null;
  const a6 = parsed.find((item) => item.type === REPORT_TYPES.a6) || null;
  const options = parsed.find((item) => item.type === REPORT_TYPES.options) || null;
  const identity = analyst || a6 || options || {};
  const identityWithTitle = parsed.find((item) => item.title && item.title !== "Argus research report" && /[a-z]/.test(item.title))
    || parsed.find((item) => item.title && item.title !== "Argus research report")
    || identity;
  const identityWithTicker = parsed.find((item) => item.ticker) || identity;
  const dates = parsed.map((item) => ({ type: item.type, label: item.label, date: item.reportDate, parsed: parseDate(item.reportDate) })).filter((item) => item.date);
  dates.sort((a, b) => (b.parsed?.valueOf() || 0) - (a.parsed?.valueOf() || 0));
  const latestReport = dates[0] || null;
  const latestSource = priceSource(parsed);
  const bundle = {
    provider: "Argus",
    title: identityWithTitle.title || "Argus research report",
    ticker: identityWithTicker.ticker || null,
    analyst,
    a6,
    options,
    reports: parsed,
    latestReport,
    latestPrice: latestSource?.currentPrice ?? null,
    latestPriceReportDate: latestSource?.reportDate || null,
    latestPriceSource: latestSource?.label || null,
    targetComparison: {
      analystTarget: analyst?.targetPrice || null,
      analystPrice: analyst?.currentPrice || null,
      analystUpside: impliedUpside(analyst?.targetPrice, analyst?.currentPrice),
      a6Target: a6?.targetPrice || null,
      a6Price: a6?.currentPrice || null,
      a6Upside: impliedUpside(a6?.targetPrice, a6?.currentPrice)
    }
  };
  bundle.captureIssues = parsed.flatMap(r => (r.captureIssues || []).map(i => ({ ...i, reportType: r.label, sourceFile: r.fileName })));
  bundle.completeness = completeness(bundle);
  return bundle;
}

function lineIf(lines, label, value) {
  if (value) lines.push(`${label}: ${value}`);
}

function appendTable(lines, table, report) {
  lines.push("");
  lines.push(table.title.toUpperCase());
  const meta=tablePeriods(table);
  if(report?.label)lines.push([report.label,report.reportDate].filter(Boolean).join(' · '));
  if(table.sourcePage)lines.push(`PDF page ${table.sourcePage}`);
  lines.push(["Metric", ...table.columns.map((c,i)=>[c,meta[i].mixed?'By row':meta[i].period,meta[i].estimateSource].filter(Boolean).join(' · '))].join("\t"));
  table.rows.forEach(row=>lines.push([row.label,...row.values.map((v,i)=>{const raw=row.validation==='review-alignment'?'Check source alignment':v ?? 'Not captured';const m=rowPeriod(table,row,i);return meta[i].mixed ? [raw,m.period || 'Period not specified',m.estimateSource].filter(Boolean).join(' · '):raw;})].join("\t")));
}

export function buildArgusPlainTextSummary(bundle) {
  const lines = [];
  lines.push(bundle.ticker ? `${bundle.title} (${bundle.ticker})` : bundle.title);
  lines.push("Argus research summary");
  lines.push(`Reports loaded: ${bundle.reports.map((report) => `${report.label}${report.reportDate ? ` (${report.reportDate})` : ""}`).join(", ")}`);
  lines.push("");
  lines.push("ARGUS OVERVIEW");
  if (bundle.analyst) {
    lineIf(lines, "Analyst rating", bundle.analyst.rating);
    lineIf(lines, "Analyst target", bundle.analyst.targetPrice);
    lineIf(lines, "Previous analyst target", bundle.analyst.priorTarget);
    lineIf(lines, "Analyst report price", bundle.analyst.currentPrice);
  }
  if (bundle.a6) {
    lineIf(lines, "A6 rating", bundle.a6.rating);
    lineIf(lines, "A6 target", bundle.a6.targetPrice);
    lineIf(lines, "A6 report price", bundle.a6.currentPrice);
  }
  if (bundle.analyst?.forecastUpdates?.length) {
    lines.push("");
    lines.push("FORECASTS & REVISIONS");
    bundle.analyst.forecastUpdates.forEach((item) => lines.push(`${item.label}: ${item.value}${item.comparison ? ` (${item.comparison})` : ""}${item.sourcePage ? ` · Analyst PDF p. ${item.sourcePage}` : ''}`));
  }
  if (bundle.analyst?.notes?.length) {
    lines.push("");
    lines.push("ANALYST NOTES");
    bundle.analyst.notes.forEach((item) => lines.push(`• ${item}`));
  }
  bundle.analyst?.sections?.filter((section) => section.found).forEach((section) => {
    lines.push("");
    lines.push(section.title.toUpperCase());
    section.highlights.forEach((item) => lines.push(`• ${item}`));
  });
  bundle.analyst?.tables?.forEach((table) => appendTable(lines,table,bundle.analyst));
  if (bundle.a6) {
    lines.push("");
    lines.push("A6 SIX-FACTOR SCORES");
    bundle.a6.scores.forEach((item) => lines.push(`${item.label}: ${item.score || "Not found"}`));
    bundle.a6.tables.forEach((table) => appendTable(lines,table,bundle.a6));
    if (bundle.a6.peerRows.length) {
      lines.push("");
      lines.push("A6 PEER COMPARISON");
      lines.push("Ticker\tCompany\tPrice\tMarket Cap\t5Y EPS Growth\tP/E\tNet Margin\t1Y EPS Growth\tArgus Rating");
      bundle.a6.peerRows.forEach((row) => lines.push([row.ticker, row.company, row.price, row.marketCap, row.growth5y, row.pe, row.netMargin, row.growth1y, row.rating].join("\t")));
    }
  }
  if (bundle.options) {
    lines.push("");
    lines.push("OPTIONS REPORT");
    bundle.options.tables?.forEach(table=>appendTable(lines,table,bundle.options));
    [bundle.options.coveredCall, bundle.options.diagonalSpread].filter(Boolean).forEach((strategy) => {
      lines.push("");
      lines.push(strategy.name.toUpperCase());
      lineIf(lines, "Break-even", strategy.breakEven);
      lineIf(lines, "Assigned return", strategy.assignedReturnPercent ? `${strategy.assignedReturnPercent}%` : null);
      lineIf(lines, "Annualized assigned return", strategy.annualizedAssignedReturnPercent ? `${strategy.annualizedAssignedReturnPercent}%` : null);
      lineIf(lines, "Downside protection", strategy.downsideProtection);
      lineIf(lines, "Risk rank", strategy.riskRanking);
      lineIf(lines, "Risk label", strategy.riskLabel);
      lineIf(lines, "Expiration", strategy.soldCallExpiration);
    });
    if (bundle.options.strategyComparison) {
      lines.push("");
      lines.push("OPTION STRATEGY COMPARISON");
      lines.push(bundle.options.strategyComparison.replace(/\n{3,}/g, "\n\n"));
    }
  }
  lines.push("");
  lines.push(`PDF SOURCE CAPTURE: ${bundle.completeness.found}/${bundle.completeness.expected} checks in the reports opened`);
  bundle.completeness.checks.filter((item) => !item.found).forEach((item) => lines.push(`Not captured in open source: ${item.label}`));
  lines.push("");
  lines.push("Source summary generated only from the selected Argus PDFs. Analyst, A6 quantitative, and options values remain separately labeled and are not averaged or reconciled into a new recommendation.");
  return lines.join("\n");
}

export { REPORT_TYPES };

import {morningstarHeadlines} from './headline-evidence.js';
import {identifySourceTables,collectMetric} from './priority-sections.js';
import { morningstarTables } from './morningstar-layout.js';
import {groupColumns, columnIdentity, periodLabel, unitLabel, sourceTextValue} from './report-periods.js';
import { attachProvenance, accountingBasis, unitFor, VALUE_PATTERN, financialValue } from './financial-data.js';
export const DEFAULT_PREFERENCES = Object.freeze({
  detail: "concise",
  showMissing: false,
  showHistorical: true,
  keywords: "",
  facts: {
    starRating: true,
    fairValue: true,
    currentPrice: true,
    priceFairValue: true,
    marketCap: true,
    economicMoat: true,
    equityStyleBox: true,
    moatTrend: true,
    uncertainty: true,
    capitalAllocation: true,
    financialHealth: true,
    analyst: true,
    reportDate: true
  },
  forecastTables: {
    financials: true,
    margins: true,
    growth: true,
    valuation: true,
    profitability: true
  },
  sections: {
    analystNote: true,
    businessStrategy: true,
    economicMoat: true,
    valuation: true,
    risk: true,
    capitalAllocation: true,
    bulls: true,
    bears: true,
    companyProfile: true
  }
});



export const FACT_DEFINITIONS = Object.freeze([
  { id: "starRating", label: "Star rating" },
  { id: "fairValue", label: "Fair value estimate" },
  { id: "currentPrice", label: "Current price / last close" },
  { id: "priceFairValue", label: "Price / fair value" },
  { id: "marketCap", label: "Market capitalization" },
  { id: "economicMoat", label: "Economic moat" },
  { id: "equityStyleBox", label: "Equity style" },
  { id: "moatTrend", label: "Moat trend" },
  { id: "uncertainty", label: "Uncertainty" },
  { id: "capitalAllocation", label: "Capital allocation" },
  { id: "financialHealth", label: "Financial health" },
  { id: "analyst", label: "Analyst" },
  { id: "reportDate", label: "Report date" }
]);

export const FORECAST_TABLE_DEFINITIONS = Object.freeze([
  {
    id: "financials",
    title: "Financials",
    description: "Revenue, earnings, cash flow, share count, and per-share forecasts"
  },
  {
    id: "margins",
    title: "Margins & returns",
    description: "Operating, EBITDA, net-income, and free-cash-flow margins"
  },
  {
    id: "growth",
    title: "Growth & ratios",
    description: "Annual growth forecasts and Morningstar's reported long-run CAGR"
  },
  {
    id: "valuation",
    title: "Valuation multiples",
    description: "Price and enterprise-value multiples by year"
  },
  {
    id: "profitability",
    title: "Operating performance / profitability",
    description: "Return on assets, equity, and invested capital"
  }
]);

export const SECTION_DEFINITIONS = Object.freeze([
  {
    id: "analystNote",
    title: "Analyst note",
    aliases: ["analyst note", "morningstar analyst note", "latest analyst note", "investment thesis"],
    keywords: ["fair value", "estimate", "rating", "outlook", "expect", "raised", "lowered", "maintain", "results"]
  },
  {
    id: "businessStrategy",
    title: "Business strategy and outlook",
    aliases: ["business strategy and outlook", "business strategy & outlook", "business strategy", "strategy and outlook"],
    keywords: ["strategy", "growth", "revenue", "customer", "market", "business", "demand", "competitive"]
  },
  {
    id: "economicMoat",
    title: "Economic moat",
    aliases: ["economic moat", "economic moat rating", "moat sources", "competitive advantage"],
    keywords: ["advantage", "moat", "switching", "network", "intangible", "cost advantage", "efficient scale", "returns"]
  },
  {
    id: "valuation",
    title: "Fair value and profit drivers",
    aliases: ["fair value and profit drivers", "fair value & profit drivers", "profit drivers"],
    keywords: ["fair value", "revenue", "margin", "growth", "cash flow", "discount", "premium", "estimate", "assume"]
  },
  {
    id: "risk",
    title: "Risk and uncertainty",
    aliases: ["risk and uncertainty", "risk & uncertainty", "risks", "risk", "uncertainty rating"],
    keywords: ["risk", "uncertainty", "competition", "decline", "pressure", "regulatory", "cyclical", "debt", "could"]
  },
  {
    id: "capitalAllocation",
    title: "Capital allocation",
    aliases: ["capital allocation", "capital allocation rating", "management and stewardship", "stewardship"],
    keywords: ["capital", "balance sheet", "dividend", "buyback", "repurchase", "debt", "acquisition", "investment"]
  },
  {
    id: "bulls",
    title: "Bulls say",
    aliases: ["bulls say", "bull case", "bulls", "bull scenario"],
    keywords: ["could", "growth", "opportunity", "advantage", "upside", "strong"]
  },
  {
    id: "bears",
    title: "Bears say",
    aliases: ["bears say", "bear case", "bears", "bear scenario"],
    keywords: ["risk", "could", "competition", "decline", "downside", "weak"]
  },
  {
    id: "companyProfile",
    title: "Company profile",
    aliases: ["company profile", "business description", "company description"],
    keywords: ["company", "operates", "provides", "generates", "segment", "revenue"]
  }
]);

const EXTRA_BOUNDARY_HEADINGS = [
  "financial statements",
  "financials",
  "key statistics",
  "valuation drivers",
  "historical financials",
  "forecast",
  "forecast assumptions",
  "competitors",
  "peers",
  "ownership",
  "executive summary",
  "analyst notes archive",
  "quantitative ratings",
  "esg risk",
  "sustainability",
  "important disclosures",
  "disclosures",
  "general disclosure",
  "methodology"
];

const DISCLOSURE_MARKERS = [
  "important disclosures",
  "important disclosure",
  "general disclosure",
  "quantitative equity report overview",
  "morningstar rating for stocks methodology",
  "morningstar's equity research methodology",
  "morningstar equity research methodology"
];

const MONEY_PATTERN = /(?:USD|CAD|AUD|GBP|EUR|JPY|INR|CHF|GBX|US\$|C\$|A\$|\$|£|€|¥)?\s*\d{1,6}(?:,\d{3})*(?:\.\d{1,4})?\s*(?:USD|CAD|AUD|GBP|EUR|JPY|INR|CHF|GBX)?/i;

// Positional text is preferred. In the text-only fallback assign a row only when
// the entire trailing series matches the printed header; never shift a short row.
function textRow(line, columns) {
  const tokens=[...line.matchAll(/\(\s*[-−+]?\d[\d,.]*\s*\)|\S+/g)];
  let start=tokens.length;
  while(start && VALUE_PATTERN.test(tokens[start-1][0].replace(/\(\s+|\s+\)/g,t=>t.trim())))start--;
  if(start===0 || tokens.length-start!==columns.length)return null;
  const label=line.slice(0,tokens[start].index).trim();
  if(!label || /^(?:Fiscal Year|Actual|Forecast|Page\b)/i.test(label))return null;
  const values=tokens.slice(start).map(t=>t[0].trim());
  return {key:normalizeHeading(label),label,values};
}

export function mergePreferences(saved = {}) {
  return {
    ...DEFAULT_PREFERENCES,
    ...saved,
    facts: { ...DEFAULT_PREFERENCES.facts, ...(saved.facts || {}) },
    forecastTables: { ...DEFAULT_PREFERENCES.forecastTables, ...(saved.forecastTables || {}) },
    sections: { ...DEFAULT_PREFERENCES.sections, ...(saved.sections || {}) }
  };
}

export function cleanCapturedText(input = "") {
  const normalized = String(input)
    .replace(/\u0000/g, "")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\u00ad/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/([A-Za-z])-\n([a-z])/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{3,}/g, "  ")
    .replace(/\n{4,}/g, "\n\n");

  const lines = normalized.split("\n");
  const deduplicated = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line && deduplicated.at(-1) === "") continue;
    if (line && line === deduplicated.at(-1) && line.length < 180) continue;
    deduplicated.push(line);
  }
  return deduplicated.join("\n").trim();
}

function normalizeHeading(value = "") {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contentBeforeDisclosures(text) {
  const lines = text.split("\n");
  let offset = 0;
  let cut = text.length;
  const earliestDisclosureSection = Math.max(1_200, Math.floor(text.length * 0.7));
  for (const line of lines) {
    const normalized = normalizeHeading(line);
    if (offset > earliestDisclosureSection && DISCLOSURE_MARKERS.some((marker) => normalized === normalizeHeading(marker))) {
      cut = offset;
      break;
    }
    offset += line.length + 1;
  }
  return text.slice(0, Math.min(cut, 300_000));
}

function valueAfterLabel(text, aliases, parser, maxDistance = 180) {
  const candidates = [];
  const searchText = text.slice(0, 80_000);
  for (const alias of aliases) {
    const regex = new RegExp(`(?:^|\\n|[|•])\\s*${escapeRegExp(alias)}\\s*(?:[:|–—-]\\s*)?`, "gim");
    let match;
    while ((match = regex.exec(searchText)) && candidates.length < 40) {
      const tail = searchText.slice(regex.lastIndex, regex.lastIndex + maxDistance);
      const value = parser(tail, { alias, index: match.index });
      if (value) candidates.push({ value, index: match.index, alias });
    }
  }
  candidates.sort((a, b) => a.index - b.index || b.alias.length - a.alias.length);
  return candidates[0]?.value || null;
}

function parseStars(tail) {
  const nearby = tail.slice(0, 100);
  const numeric = nearby.match(/\b([1-5])\s*(?:-|\s)?stars?\b/i);
  if (numeric) return `${numeric[1]} stars`;
  const symbol = nearby.match(/[★]{1,5}/);
  if (symbol) return `${symbol[0].length} stars`;
  const qRating = nearby.match(/(?:^|\s)(Q{1,5})(?:\s|$)/);
  if (qRating) return `${qRating[1].length} stars`;
  return null;
}

function parseMoney(tail) {
  const firstTwoLines = tail.split("\n").slice(0, 3).join(" ").slice(0, 140);
  const match = firstTwoLines.match(MONEY_PATTERN);
  if (!match) return null;
  const value = match[0].replace(/\s+/g, " ").trim();
  const number = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(number) || number <= 0) return null;
  return value;
}

function parseRatio(tail) {
  const nearby = tail.split("\n").slice(0, 3).join(" ").slice(0, 120);
  const percent = nearby.match(/\b\d{1,3}(?:\.\d+)?\s*%/);
  if (percent) return percent[0].replace(/\s+/g, "");
  const decimal = nearby.match(/\b(?:0?\.\d{1,3}|[0-3](?:\.\d{1,3})?)\b/);
  return decimal?.[0] || null;
}

function parseMarketCap(tail) {
  const nearby = tail.split("\n").slice(0, 3).join(" ").slice(0, 120);
  const match = nearby.match(/\b\d[\d,]*(?:\.\d+)?\s*(?:USD|CAD|AUD|GBP|EUR|JPY|INR|CHF|GBX)?\s*(?:Tril|Bil|Mil|T|B|M)\b/i);
  return match?.[0].replace(/\s+/g, " ") || null;
}

function parseEquityStyle(tail) {
  const nearby = tail.split("\n").slice(0, 3).join(" ").slice(0, 100);
  const match = nearby.match(/(?:\b[1-9]\s+)?\b(Large|Mid|Small)\s+(Value|Blend|Growth)\b/i);
  if (!match) return null;
  return `${match[1]} ${match[2]}`.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseEnum(values) {
  const ordered = [...values].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(${ordered.map(escapeRegExp).join("|")})\\b`, "i");
  return (tail) => {
    const match = tail.slice(0, 130).match(pattern);
    if (!match) return null;
    return match[1]
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  };
}

function parseAnalyst(tail) {
  const line = tail.split("\n").find((item) => item.trim())?.trim() || "";
  const cleaned = line.replace(/^by\s+/i, "").replace(/\s{2,}.*$/, "").trim();
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ.' -]{3,70}$/.test(cleaned)) return null;
  if (/^(?:analyst\s+)?(?:note(?:s)?(?:\s+archive)?|archive|report|coverage|rating|research)$/i.test(cleaned)) return null;
  return cleaned;
}

function parseDate(tail) {
  const nearby = tail.split("\n").slice(0, 3).join(" ").slice(0, 140);
  const patterns = [
    /\b\d{1,2}\s+[A-Z][a-z]{2,8}\s+20\d{2}\b/,
    /\b[A-Z][a-z]{2,8}\s+\d{1,2},\s+20\d{2}\b/,
    /\b20\d{2}-\d{2}-\d{2}\b/,
    /\b\d{1,2}\/\d{1,2}\/20\d{2}\b/
  ];
  for (const pattern of patterns) {
    const match = nearby.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function extractMorningstarHeaderFacts(text) {
  const lines = text.slice(0, 30_000).split("\n");
  const headingIndex = lines.findIndex((line) => (
    /\bLast Price\b/i.test(line)
    && /\bFair Value Estimate\b/i.test(line)
    && /\bPrice\/FVE\b/i.test(line)
    && /\bMarket Cap\b/i.test(line)
    && /\bEconomic Moat/i.test(line)
    && /\bEquity Style Box\b/i.test(line)
    && /\bUncertainty\b/i.test(line)
    && /\bCapital Allocation\b/i.test(line)
  ));
  if (headingIndex < 0) return {};

  const valueLine = lines.slice(headingIndex + 1, headingIndex + 4).find((line) => line.trim()) || "";
  const currency = "(?:USD|CAD|AUD|GBP|EUR|JPY|INR|CHF|GBX)";
  const money = `\\d[\\d,]*(?:\\.\\d+)?(?:\\s*${currency})?`;
  const marketCap = `\\d[\\d,]*(?:\\.\\d+)?\\s*(?:${currency}\\s*)?(?:Tril|Bil|Mil|T|B|M)`;
  const match = valueLine.match(new RegExp(
    `^\\s*(${money})\\s+(${money})\\s+(\\d+(?:\\.\\d+)?)\\s+(${marketCap})\\s+`
    + `(Wide|Narrow|None)\\s+(?:[1-9]\\s+)?(Large|Mid|Small)\\s+(Value|Blend|Growth)\\s+`
    + `(Very High|Extreme|Medium|High|Low)\\s+(Exemplary|Standard|Poor)(?:\\s|$)`,
    "i"
  ));
  if (!match) return {};

  return {
    currentPrice: match[1].replace(/\s+/g, " ").trim(),
    fairValue: match[2].replace(/\s+/g, " ").trim(),
    priceFairValue: match[3],
    marketCap: match[4].replace(/\s+/g, " ").trim(),
    economicMoat: match[5].replace(/\b\w/g, (letter) => letter.toUpperCase()),
    equityStyleBox: `${match[6]} ${match[7]}`.replace(/\b\w/g, (letter) => letter.toUpperCase()),
    uncertainty: match[8].replace(/\b\w/g, (letter) => letter.toUpperCase()),
    capitalAllocation: match[9].replace(/\b\w/g, (letter) => letter.toUpperCase())
  };
}

function extractMorningstarAnalyst(text) {
  const early = text.slice(0, 45_000);
  const headingByline = early.match(
    /(?:Analyst Note|Business Strategy\s*(?:&|and)\s*Outlook)\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'-]+){1,4}),\s*(?:CFA,?\s*)?(?:Senior\s+)?Equity Analyst\b/
  );
  if (headingByline) return headingByline[1].trim();
  const comparisonRow = early.match(/^Analyst\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'-]+){1,4}),\s*(?:Senior\s+)?Equity Analyst\b/m);
  return comparisonRow?.[1]?.trim() || null;
}

function extractFacts(text) {
  const facts = {};
  facts.starRating = valueAfterLabel(
    text,
    ["Morningstar Rating for Stocks", "Quantitative Star Rating", "Morningstar Rating", "Star Rating"],
    parseStars
  );
  facts.fairValue = valueAfterLabel(
    text,
    ["Quantitative Fair Value Estimate", "Fair Value Estimate", "Fair Value"],
    parseMoney
  );
  facts.currentPrice = valueAfterLabel(
    text,
    ["Current Market Price", "Current Price", "Last Close", "Market Price", "Last Price"],
    parseMoney
  );
  facts.priceFairValue = valueAfterLabel(
    text,
    ["Price/Fair Value", "Price / Fair Value", "Price to Fair Value", "Price-to-Fair-Value"],
    parseRatio
  );
  facts.marketCap = valueAfterLabel(text, ["Market Capitalization", "Market Cap"], parseMarketCap);
  facts.economicMoat = valueAfterLabel(
    text,
    ["Quantitative Economic Moat", "Economic Moat Rating", "Economic Moat"],
    parseEnum(["Wide", "Narrow", "None"])
  );
  facts.equityStyleBox = valueAfterLabel(text, ["Equity Style Box", "Stock Style"], parseEquityStyle);
  facts.moatTrend = valueAfterLabel(
    text,
    ["Economic Moat Trend", "Moat Trend"],
    parseEnum(["Positive", "Stable", "Negative"])
  );
  facts.uncertainty = valueAfterLabel(
    text,
    ["Quantitative Uncertainty", "Uncertainty Rating", "Uncertainty"],
    parseEnum(["Very High", "Extreme", "Medium", "High", "Low"])
  );
  facts.capitalAllocation = valueAfterLabel(
    text,
    ["Capital Allocation Rating", "Capital Allocation"],
    parseEnum(["Exemplary", "Standard", "Poor"])
  );
  facts.financialHealth = valueAfterLabel(
    text,
    ["Quantitative Financial Health", "Financial Health"],
    parseEnum(["Strong", "Moderate", "Weak"])
  );
  facts.analyst = valueAfterLabel(
    text,
    ["Equity Analyst", "Analyst"],
    parseAnalyst,
    120
  );
  facts.reportDate = valueAfterLabel(
    text,
    ["Publication Date", "Report Date", "Release", "As of"],
    parseDate,
    160
  );

  const reportIdentity = text.slice(0, 30_000).match(
    /^(.+?)\s+([A-Z][A-Z0-9.-]{0,7})\s+(Q{1,5}|[★]{1,5})\s+(\d{1,2}\s+[A-Z][a-z]{2,8}\s+20\d{2})/m
  );
  if (!facts.starRating && reportIdentity) facts.starRating = `${reportIdentity[3].length} stars`;
  if (!facts.reportDate && reportIdentity) facts.reportDate = reportIdentity[4];
  const reportAsOf = text.slice(0, 8_000).match(/\bReport as of\s+(\d{1,2}\s+[A-Z][a-z]{2,8}\s+20\d{2})\b/i);
  if (reportAsOf) facts.reportDate = reportAsOf[1];
  Object.assign(facts, extractMorningstarHeaderFacts(text));
  facts.analyst ||= extractMorningstarAnalyst(text);
  return facts;
}

function identifyProvider(text) {
  if (/morningstar/i.test(text)) return "Morningstar";
  if (/\bCFRA\b/i.test(text)) return "CFRA";
  if (/market\s*edge/i.test(text)) return "Market Edge";
  if (/\bargus\b/i.test(text)) return "Argus";
  return "Research report";
}

function extractTitle(text, metadata = {}) {
  const reportIdentity = text.slice(0, 30_000).match(
    /^(.+?)\s+([A-Z][A-Z0-9.-]{0,7})\s+(?:Q{1,5}|[★]{1,5})\s+\d{1,2}\s+[A-Z][a-z]{2,8}\s+20\d{2}/m
  );
  if (reportIdentity?.[1]) return reportIdentity[1].trim();

  const pageTitle = String(metadata.title || "")
    .replace(/\s*[|–—-]\s*(?:Charles Schwab|Schwab|Morningstar).*$/i, "")
    .trim();
  if (
    pageTitle
    && !/research|analyst reports?|schwab/i.test(pageTitle)
    && !/^[a-f0-9-]{20,}$/i.test(pageTitle)
    && !/^blob\b/i.test(pageTitle)
    && !/^[A-Z0-9.-]{1,8}$/.test(pageTitle)
    && pageTitle.length < 100
  ) {
    return pageTitle;
  }

  const lines = text.split("\n").slice(0, 80).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length < 3 || line.length > 100) continue;
    if (/morningstar|equity research|analyst report|quantitative equity|release|currency|disclosure/i.test(line)) continue;
    if (/^[A-Za-z0-9][A-Za-z0-9 .,&'()/:-]{2,90}$/.test(line) && /[A-Za-z]{3}/.test(line)) return line;
  }
  return "Research report summary";
}

function extractTicker(text, title) {
  const early = text.slice(0, 8_000);
  const reportIdentity = early.match(
    /^.+?\s+([A-Z][A-Z0-9.-]{0,7})\s+(?:Q{1,5}|[★]{1,5})\s+\d{1,2}\s+[A-Z][a-z]{2,8}\s+20\d{2}/m
  );
  if (reportIdentity) return reportIdentity[1];
  const labeled = early.match(/(?:Ticker|Symbol)\s*[:|]?\s*([A-Z][A-Z0-9.-]{0,7})\b/);
  if (labeled) return labeled[1];
  const exchange = early.match(/(?:NASDAQ|NYSE|AMEX|LSE|XNAS|XNYS)\s*[:|]\s*([A-Z][A-Z0-9.-]{0,7})\b/i);
  if (exchange) return exchange[1].toUpperCase();
  const titleTicker = String(title).match(/\(([A-Z][A-Z0-9.-]{0,7})\)/);
  if (titleTicker) return titleTicker[1];
  const trailingTicker = String(title).match(/(?:^|\s)([A-Z][A-Z0-9.-]{0,7})$/);
  return trailingTicker?.[1] || null;
}

function headingMatch(line) {
  const normalized = normalizeHeading(line);
  if (!normalized || normalized.length > 150) return null;
  for (const definition of SECTION_DEFINITIONS) {
    for (const alias of definition.aliases) {
      const normalizedAlias = normalizeHeading(alias);
      if (normalized === normalizedAlias) return { type: "section", id: definition.id };
      if (normalized.startsWith(`${normalizedAlias} `)) {
        const remainder = line.trim().slice(alias.length).trim();
        const looksLikeByline = /\b(?:CFA|equity analyst|senior analyst|analyst)\b/i.test(remainder)
          && /\b20\d{2}\b/.test(remainder);
        if (looksLikeByline) return { type: "section", id: definition.id };
      }
    }
  }
  for (const heading of EXTRA_BOUNDARY_HEADINGS) {
    if (normalized === normalizeHeading(heading)) return { type: "boundary", id: null };
  }
  return null;
}

function stripPageFurniture(text) {
  if (!/\[\[PAGE\s+\d+\s+OF\s+\d+\]\]/i.test(text)) return text;
  const chunks = text.split(/(?=\[\[PAGE\s+\d+\s+OF\s+\d+\]\])/i);
  return chunks.map((chunk) => {
    const lines = chunk.split("\n");
    const markerIndex = lines.findIndex((line) => /^\[\[PAGE\s+\d+\s+OF\s+\d+\]\]$/i.test(line.trim()));
    const footerIndex = lines.findIndex((line) => /^©\s*Morningstar/i.test(line.trim()));
    const kept = lines.slice(0, footerIndex >= 0 ? footerIndex : lines.length);

    const reportHeader = kept.findIndex((line) => /^Morningstar Equity Analyst Report\s*\|/i.test(line.trim()));
    if (reportHeader >= 0) kept.splice(reportHeader, 1);
    const questionMark = kept.findIndex((line) => line.trim() === "?");
    if (questionMark >= 0) kept.splice(questionMark, 1);

    const identityIndex = kept.findIndex((line) => /^.+?\s+[A-Z][A-Z0-9.-]{0,7}\s+(?:Q{1,5}|[★]{1,5})\s+\d{1,2}\s+[A-Z][a-z]{2,8}\s+20\d{2}/.test(line.trim()));
    if (identityIndex >= 0) {
      const allocationIndex = kept.findIndex((line, index) => index > identityIndex && /^Capital Allocation$/i.test(line.trim()));
      if (allocationIndex >= 0) {
        const allocationValueIndex = Math.min(allocationIndex + 1, kept.length - 1);
        kept.splice(identityIndex, allocationValueIndex - identityIndex + 1);
      }
    }
    if (markerIndex < 0 && kept.length === 0) return "";
    return kept.join("\n").trim();
  }).filter(Boolean).join("\n\n");
}

function collectHeadingPositions(text) {
  const lines = text.split("\n");
  const entries = [];
  let offset = 0;
  lines.forEach((line, index) => {
    const match = headingMatch(line);
    if (match) entries.push({ ...match, lineIndex: index, offset, line });
    offset += line.length + 1;
  });
  return { lines, entries };
}

function pageReferenceAt(text, offset) {
  const prefix = text.slice(0, offset);
  const markers = [...prefix.matchAll(/\[\[PAGE\s+(\d+)\s+OF\s+(\d+)\]\]/gi)];
  const printedPages = [...prefix.matchAll(/\bPage\s+(\d+)\s+of\s+(\d+)\b/gi)];
  const match = markers.at(-1) || printedPages.at(-1);
  return match ? { page: Number(match[1]), totalPages: Number(match[2]) } : null;
}

function looksLikeDefinition(body) {
  return /(?:is intended to|is calculated|rating is expressed|methodology|the rating represents|the ratings consist)/i.test(body.slice(0, 400));
}

function extractSectionBodies(text) {
  const { lines, entries } = collectHeadingPositions(text);
  const bodies = {};
  for (let position = 0; position < entries.length; position += 1) {
    const entry = entries[position];
    if (entry.type !== "section") continue;
    const next = entries[position + 1];
    const endLine = next?.lineIndex ?? Math.min(lines.length, entry.lineIndex + 80);
    const body = lines
      .slice(entry.lineIndex + 1, endLine)
      .join("\n")
      .replace(/^\[\[PAGE\s+\d+\s+OF\s+\d+\]\]\s*$/gim, "")
      .replace(/^[^\n]{0,140}\b(?:Equity Analyst|Senior Analyst)\b[^\n]*\b20\d{2}\b\s*\n/i, "")
      .replace(/^[-–—•|\s]+/, "")
      .trim();
    if (body.length < 55 || looksLikeDefinition(body)) continue;
    const capped = body.slice(0, 12_000);
    const score = Math.min(capped.length, 2_400)
      + (/[.!?]/.test(capped) ? 180 : 0)
      - (entry.lineIndex < 12 && capped.length < 180 ? 400 : 0);
    if (!bodies[entry.id] || score > bodies[entry.id].score) {
      bodies[entry.id] = {
        body: capped,
        score,
        source: pageReferenceAt(text, entry.offset)
      };
    }
  }
  return bodies;
}

const FORECAST_SECTION_MATCHERS = Object.freeze([
  { id: "financials", pattern: /^Financials\s+as of\b/i },
  { id: "margins", pattern: /^Margins\s*(?:&|and)\s*Returns\s+as of\b/i },
  { id: "growth", pattern: /^Growth\s*(?:&|and)\s*Ratios\s+as of\b/i },
  { id: "valuation", pattern: /^Valuation\s+as of\b/i },
  { id: "profitability", pattern: /^Operating Performance\s*\/\s*Profitability\s+as of\b/i }
]);

function forecastSectionForLine(line) {
  return FORECAST_SECTION_MATCHERS.find((item) => item.pattern.test(line)) || null;
}

function extractForecastRows(lines, startIndex, endIndex, definition) {
  let headerEnd=startIndex,headerText='';
  for(let i=startIndex+1;i<Math.min(endIndex,startIndex+6);i++){
    const line=lines[i];
    if(!/^(?:Fiscal Year\b|\d+[ -]Year\b|\d{4}[AEF]?\b|Actual\b|Forecast\b)/i.test(line))break;
    headerText+=' '+line;headerEnd=i;
  }
  if(!/\b\d{4}[AEF]?\b/i.test(headerText))return null;

  // Plain text without positioned headings cannot establish the boundary.
  // Only explicit period suffixes are sufficient evidence on this fallback path.
  const columns=[];
  for(const match of headerText.matchAll(/\b(?:(\d+)[ -]Year\s+(Avg|CAGR)|(\d{4})([AEF])?)\b/gi)){
    const year=match[3],suffix=match[4]?.toUpperCase();
    const label=year || match[0],period=!year ? 'summary' : suffix==='A' ? 'actual' : suffix ? 'forecast' : 'not specified';
    columns.push({key:year || normalizeHeading(label),label,year:year || null,period});
  }

  const rows = [];
  for (let index = headerEnd + 1; index < endIndex; index += 1) {
    const line = lines[index];
    if (!line || /^©\s*Morningstar/i.test(line)) break;
    const row=textRow(line,columns);
    if(row)rows.push(row);
  }

  if (!rows.length) return null;
  const heading = lines[startIndex];
  const asOf = heading.match(/\bas of\s+(.+?)(?=\s+(?:Actual|Forecast)\b|$)/i)?.[1]?.trim() || null;
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    asOf,
    columns,
    rows
  };
}

function findForecastRow(model, tableId, aliases) {
  const table = model.tables.find((item) => item.id === tableId);
  if (!table) return null;
  const normalizedAliases = aliases.map(normalizeHeading);
  return table.rows.find((row) => normalizedAliases.includes(row.key)) || null;
}

function forecastCell(table, row, columnKey) {
  if (!table || !row) return null;
  const index = table.columns.findIndex((column) => column.key === columnKey);
  const value = index >= 0 ? row.values[index] : null;
  return value && value !== "—" ? value : null;
}

const SUPPLEMENTAL_FORECAST_DEFINITIONS = Object.freeze({
  leverage: {
    id: "leverage",
    title: "Financial leverage",
    description: "Debt, leverage, and interest-coverage measures by year"
  },
  revisions: {
    id: "forecastRevisions",
    title: "Forecast revisions",
    description: "Current Morningstar estimates compared with the prior model"
  },
  drivers: {
    id: "valuationDrivers",
    title: "Key valuation drivers",
    description: "Discount-rate and long-run assumptions used in the valuation model"
  }
});

function parseForecastRevisions(lines, startIndex, endIndex) {
  if (startIndex < 0) return null;
  const heading = lines[startIndex];
  const priorLine = lines.slice(startIndex + 1, Math.min(endIndex, startIndex + 4))
    .find((line) => /^Prior data as of\b/i.test(line)) || "";
  // Publication/model dates are not fiscal columns. Use the actual variant order.
  const removeDate=value=>value.replace(/\bas of\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/gi,'');
  const years=[...removeDate(heading).matchAll(/\b(\d{4})\b/g)].map(m=>m[1]);
  const variants=[...removeDate(priorLine).replace(/^Prior data\b/i,'').matchAll(/\b(Current|Prior)\b/gi)].map(m=>m[1].toLowerCase());
  if(!years.length || variants.length!==years.length*2) return null;
  const columns=[];
  for(let i=0;i<years.length;i++){
    const pair=variants.slice(i*2,i*2+2),year=years[i];
    if(new Set(pair).size!==2)return null;
    for(const variant of pair)columns.push({key:`${year}-${variant}`,label:`${year} ${variant==='current'?'Current':'Prior'}`,period:'forecast',year,variant});
  }
  const rows = [];
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const line = lines[index];
    if (!line || /^Prior data as of\b/i.test(line)) continue;
    const row=textRow(line,columns);
    if(row)rows.push(row);
  }
  if (!rows.length) return null;

  return {
    ...SUPPLEMENTAL_FORECAST_DEFINITIONS.revisions,
    asOf: heading.match(/\bas of\s+(\d{1,2}\s+[A-Z][a-z]{2,8}\s+20\d{2})/i)?.[1]?.trim() || null,
    priorAsOf: priorLine.match(/\bas of\s+(\d{1,2}\s+[A-Z][a-z]{2,8}\s+20\d{2})/i)?.[1]?.trim() || null,
    columns,
    rows
  };
}

function parseValuationDrivers(lines, startIndex, endIndex) {
  if (startIndex < 0) return null;
  const heading = lines[startIndex];
  const rows = [];
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const match = lines[index].match(/^(.+?)\s+(—|–|\(\s*\d[\d,]*(?:\.\d+)?\s*\)|[−-]?\d[\d,]*(?:\.\d+)?)$/);
    if (!match || /additional estimates/i.test(match[1])) continue;
    rows.push({ key: normalizeHeading(match[1]), label: match[1].trim(), values: [match[2].trim()] });
  }
  if (!rows.length) return null;
  return {
    ...SUPPLEMENTAL_FORECAST_DEFINITIONS.drivers,
    asOf: heading.match(/\bas of\s+(.+)$/i)?.[1]?.trim() || null,
    columns: [{ key: "value", label: "Model input", period: "summary" }],
    rows
  };
}

function extractSupplementalForecastData(text, reportYear) {
  const marker = /Financial Leverage\s*\(Reporting Currency\)/i.exec(text);
  if (!marker) {
    return { found: false, sourcePage: null, totalPages: null, leverage: null, revisions: null, drivers: null, tables: [] };
  }

  const source = pageReferenceAt(text, marker.index);
  const afterMarker = text.slice(marker.index);
  const pageEnd = afterMarker.search(/^©\s*Morningstar/im);
  const pageText = afterMarker.slice(0, pageEnd > 0 ? pageEnd : 35_000);
  const lines = pageText.split("\n").map((line) => line.trim()).filter(Boolean);
  const leverageStart = lines.findIndex((line) => /^Financial Leverage\s*\(Reporting Currency\)/i.test(line));
  const revisionsStart = lines.findIndex((line) => /^Forecast Revisions\s+as of\b/i.test(line));
  const driversStart = lines.findIndex((line) => /^Key Valuation Drivers\s+as of\b/i.test(line));
  const dcfStart = lines.findIndex((line) => /^Discounted Cash Flow Valuation\s+as of\b/i.test(line));

  const leverage = leverageStart >= 0
    ? extractForecastRows(
      lines,
      leverageStart,
      revisionsStart > leverageStart ? revisionsStart : lines.length,
      SUPPLEMENTAL_FORECAST_DEFINITIONS.leverage,
      reportYear
    )
    : null;
  const revisions = parseForecastRevisions(
    lines,
    revisionsStart,
    driversStart > revisionsStart ? driversStart : lines.length
  );
  const drivers = parseValuationDrivers(
    lines,
    driversStart,
    dcfStart > driversStart ? dcfStart : lines.length
  );
  const tables = [leverage, revisions, drivers].filter(Boolean).map((table) => ({
    ...table,
    sourcePage: source?.page || null,
    totalPages: source?.totalPages || null
  }));
  return {
    found: tables.length > 0,
    sourcePage: source?.page || null,
    totalPages: source?.totalPages || null,
    leverage,
    revisions,
    drivers,
    tables
  };
}

// Match the identity of a monetary row separately from its printed currency and scale.
function metricKey(label) {
  return normalizeHeading(String(label).replace(/\(([A-Z]{3})(?:\s+(Mil(?:lion)?s?|Bil(?:lion)?s?|Tril(?:lion)?s?|Thou(?:sand)?s?))?\)/g, (_,currency,scale) => scale ? '(currency amount)' : '(currency)'));
}
function metricRows(table,aliases){const keys=aliases.map(metricKey);return table.rows.filter(row=>keys.includes(metricKey(row.label || row.key)));}
function displayUnit(row,fallback){
 const unit=row.unit || unitFor(row.label);
 if (fallback==='usdMillions' && !/^USD\s+(?:Mil|Millions?)$/i.test(unit || '')) return 'source';
 if (fallback==='usdPerShare' && !/^USD$/i.test(unit || '')) return 'source';
 return fallback;
}
function metricFromTable({model,table:selectedTable,row,id,label,unit,sourcePage}) {
  const actualYear = model.actualYears.at(-1);
  const nearYear = model.forecastYears[0];
  const longYear = model.forecastYears.at(-1);
  return {
    id,
    label,
    unit: displayUnit(row,unit),
    sourceUnit: row.unit || unitFor(row.label) || null,
    modelDate:selectedTable.asOf || null,fiscalEnd:selectedTable.fiscalYearEnd || null,
    basis:row.basis || accountingBasis(row.label,selectedTable.basis || selectedTable.unitContext),
    sources:[{tableId:selectedTable.id,rowKey:row.key,page:row.sourcePage || selectedTable.sourcePage || sourcePage}],
    sourcePage:row.sourcePage || selectedTable.sourcePage || sourcePage || model.sourcePage || null,
    sourceTableId: selectedTable.id,
    sourceRowKey: row.key,
    series: selectedTable.columns.map((column, index) => ({
      ...column,
      value: row.values[index] ?? null,
      sourcePage: row.sourcePage || selectedTable.sourcePage || sourcePage || null,
      sourceLabel: row.label,
      sourceBounds: row.bounds || null,
      basis: row.basis || accountingBasis(row.label,selectedTable.basis || selectedTable.unitContext),
      validation: row.validation || 'not independently validated',
      modelDate: selectedTable.asOf || null
    })),
    values: {
      actual: forecastCell(selectedTable, row, actualYear),
      near: forecastCell(selectedTable, row, nearYear),
      long: forecastCell(selectedTable, row, longYear)
    }
  };
}

function revisionMetric(table,row,id,label,unit,sourcePage=null){
  const pairs = [];
  const years = table.columns.map((column) => column.year)
    .filter((year, index, values) => year && values.indexOf(year) === index);
  years.forEach((year) => {
    const raw = variant => row.values[table.columns.findIndex(c => c.year===year && c.variant===variant)] ?? null;
    const current = raw("current"), prior = raw("prior");
    pairs.push({ year, current, prior });
  });
  return {
    id,
    label,
    unit: displayUnit(row,unit),
    sourceUnit: row.unit || unitFor(row.label) || null,
    modelDate:table.asOf || null,priorModelDate:table.priorAsOf || null,fiscalEnd:table.fiscalYearEnd || null,
    sources:[{tableId:table.id,rowKey:row.key,page:row.sourcePage || table.sourcePage || sourcePage}],
    pairSources:Object.fromEntries(pairs.map(({year})=>[year,{page:row.sourcePage || table.sourcePage || sourcePage,bounds:row.bounds || null,validation:row.validation,modelDate:table.asOf || null,priorModelDate:table.priorAsOf || null}])),
    sourcePage: row.sourcePage || table.sourcePage || sourcePage || null,
    sourceLabel: row.label,
    sourceBounds: row.bounds || null,
    validation: row.validation || 'not independently validated',
    basis: row.basis || accountingBasis(row.label,table.basis || table.unitContext),
    sourceTableId: table.id,
    sourceRowKey: row.key,
    pairs
  };
}

function buildImportantMetrics(model, supplemental) {
  if (!model.found) {
    return {
      found: false,
      periods: null,
      groups: [],
      revisions: null,
      drivers: [],
      coverage: { found: 0, expected: 16, sectionsFound: 0, sectionsExpected: 5 }
    };
  }
  const all=[...model.tables,...(supplemental.tables || [])];
  const family=id=>all.filter(t=>(t.familyId || t.id)===id);
  const metric=(tableId,id,label,aliases,unit)=>collectMetric(family(tableId).flatMap(table=>
    metricRows(table,aliases).map(row=>metricFromTable({model,table,row,id,label,unit,sourcePage:table.sourcePage || (tableId==='leverage'?supplemental.sourcePage:model.sourcePage)}))),model.captureIssues);
  const groups = [
    {
      id: "earnings",
      title: "Financials",
      description: "Financials in the source currency and units",
      metrics: [
        metric("financials", "revenue", "Revenue", ["Revenue (USD Mil)"], "usdMillions"),
        metric("financials", "operatingIncome", "Operating income", ["Operating Income (USD Mil)"], "usdMillions"),
        metric("financials", "netIncome", "Net income", ["Net Income (USD Mil)"], "usdMillions"),
        metric("financials", "adjustedNetIncome", "Adjusted net income", ["Adjusted Net Income (USD Mil)"], "usdMillions"),
        metric("financials", "dilutedEps", "Diluted EPS", ["Earnings Per Share (Diluted) (USD)"], "usdPerShare")
      ].flat().filter(Boolean)
    },
    {
      id: "performance",
      title: "Margins & growth",
      description: "Operating performance and top-line momentum",
      metrics: [
        metric("margins", "operatingMargin", "Operating margin", ["Operating Margin %"], "percent"),
        metric("margins", "netMargin", "Net margin", ["Net Margin %"], "percent"),
        metric("growth", "revenueGrowth", "Revenue growth", ["Revenue Growth %"], "percent")
      ].flat().filter(Boolean)
    },
    {
      id: "valuation",
      title: "Valuation",
      description: "Multiples and dividend assumptions",
      metrics: [
        metric("valuation", "priceEarnings", "Price / earnings (P/E)", ["Price/Earning", "Price/Earnings"], "multiple"),
        metric("valuation", "priceSales", "Price / sales (P/S)", ["Price/Sales"], "multiple"),
        metric("valuation", "priceBook", "Price / book (P/B)", ["Price/Book"], "multiple"),
        metric("valuation", "dividendYield", "Dividend yield", ["Dividend Yield %"], "percent"),
        metric("valuation", "dividendPayout", "Dividend payout", ["Dividend Payout %"], "percent")
      ].flat().filter(Boolean)
    },
    {
      id: "leverage",
      title: "Financial leverage",
      description: "Net debt relative to EBITDA",
      metrics: [
        metric("leverage","netDebtEbitda","Net debt / EBITDA",["Net Debt/EBITDA"],"multiple")
      ].flat().filter(Boolean)
    }
  ].filter((group) => group.metrics.length);

  const revisionMetrics=[['revenue','Revenue','Revenue (USD Mil)'],['netIncome','Net income','Net Income (USD Mil)']].flatMap(([id,label,alias])=>
    collectMetric(family('forecastRevisions').flatMap(table=>metricRows(table,[alias]).map(row=>
      revisionMetric(table,row,id,label,'usdMillions',table.sourcePage || supplemental.sourcePage))),model.captureIssues));
  const sameDate=key=>{const dates=new Set(revisionMetrics.map(m=>m[key]));return dates.size===1?[...dates][0]:null;};
  const revisions=revisionMetrics.length?{asOf:sameDate('modelDate'),priorAsOf:sameDate('priorModelDate'),
    sourcePage:revisionMetrics[0].sourcePage,metrics:revisionMetrics}:null;

  const driverDefinitions = [
    ["costOfEquity", "Cost of equity", ["Cost of Equity %"], "percent"],
    ["preTaxCostOfDebt", "Pre-tax cost of debt", ["Pre-Tax Cost of Debt %"], "percent"],
    ["wacc", "Weighted average cost of capital", ["Weighted Average Cost of Capital %"], "percent"],
    ["longRunTaxRate", "Long-run tax rate", ["Long-Run Tax Rate %"], "percent"],
    ["stageTwoGrowth", "Stage II EBI growth", ["Stage II EBI Growth Rate %"], "percent"],
    ["stageTwoInvestment", "Stage II investment rate", ["Stage II Investment Rate %"], "percent"],
    ["perpetuityYear", "Perpetuity year", ["Perpetuity Year"], "year"]
  ];
  const drivers = driverDefinitions.map(([id, label, aliases, unit]) => {
    const table = supplemental.drivers;
    if (!table) return null;
    const normalizedAliases = aliases.map(normalizeHeading);
    const row = table.rows.find((item) => normalizedAliases.includes(item.key));
    return row ? { id, label, unit, value: row.values[0], sourcePage: row.sourcePage || table.sourcePage || supplemental.sourcePage } : null;
  }).filter(Boolean);
  const highlightedMetricCount = groups.reduce((total, group) => total + new Set(group.metrics.map(m=>m.id)).size, 0);
  const highlightedRevisionCount = new Set(revisionMetrics.map(m=>m.id)).size;

  return {
    found: groups.length > 0 || revisionMetrics.length>0,
    periods: {
      actual: model.actualYears.at(-1) || null,
      near: model.forecastYears[0] || null,
      long: model.forecastYears.at(-1) || null
    },
    groups,
    revisions,
    drivers,
    driversAsOf: supplemental.drivers?.asOf || null,
    coverage: {
      found: highlightedMetricCount + highlightedRevisionCount,
      expected: 16,
      sectionsFound: groups.length + (revisionMetrics.length ? 1 : 0),
      sectionsExpected: 5
    }
  };
}

function buildDataIntegrity(facts, forecastModel) {
  const important = forecastModel.importantMetrics || {};
  const coverage = important.coverage || {
    found: 0,
    expected: 16,
    sectionsFound: 0,
    sectionsExpected: 5
  };
  const checks = [];
  const addCheck = (id, label, passed, detail) => {
    checks.push({ id, label, status: passed ? "pass" : "warning", detail });
  };

  const coverageComplete = coverage.found === coverage.expected
    && coverage.sectionsFound === coverage.sectionsExpected;
  addCheck(
    "highlight-coverage",
    "Priority-field coverage",
    coverageComplete,
    coverageComplete
      ? `${coverage.found}/${coverage.expected} priority rows found across all ${coverage.sectionsExpected} sections.`
      : `${coverage.found}/${coverage.expected} priority rows found across ${coverage.sectionsFound}/${coverage.sectionsExpected} sections.`
  );

  const printedRatio = numericMoney(facts.priceFairValue);
  const currentPrice = numericMoney(facts.currentPrice);
  const fairValue = numericMoney(facts.fairValue);
  const computedRatio = currentPrice !== null && fairValue ? currentPrice / fairValue : null;
  const ratioConsistent = printedRatio !== null
    && computedRatio !== null
    && Math.abs(printedRatio - computedRatio) <= 0.02;
  addCheck(
    "valuation-arithmetic",
    "Valuation arithmetic",
    ratioConsistent,
    printedRatio === null || computedRatio === null
      ? "Last Price, Fair Value Estimate, or Price/FVE was unavailable for comparison."
      : ratioConsistent
        ? `Computed Price/FVE is ${computedRatio.toFixed(2)}; the report prints ${printedRatio.toFixed(2)}.`
        : `Computed Price/FVE is ${computedRatio.toFixed(2)}, but the report prints ${printedRatio.toFixed(2)}.`
  );

  const actualYear = Number(forecastModel.actualYears?.at(-1));
  const nearYear = Number(forecastModel.forecastYears?.[0]);
  const longYear = Number(forecastModel.forecastYears?.at(-1));
  const timelineComplete = [actualYear, nearYear, longYear].every(Number.isFinite)
    && actualYear < nearYear
    && nearYear <= longYear;
  addCheck(
    "forecast-timeline",
    "Forecast timeline",
    timelineComplete,
    timelineComplete
      ? `${actualYear} actual → ${nearYear} first estimate → ${longYear} long range.`
      : "A complete chronological actual-to-forecast timeline was not found."
  );

  const revisionMetrics = important.revisions?.metrics || [];
  const requiredRevisionIds = ["revenue", "netIncome"];
  const revisionsComplete = requiredRevisionIds.every((id) => {
    const rows=revisionMetrics.filter(m=>m.id===id);
    return rows.length>0 && rows.every(m=>!m.conflicting && m.pairs.length && m.pairs.every(p=>
      (m.pairSources?.[p.year]?.validation || m.validation)!=='review-alignment' &&
      [p.current,p.prior].every(v=>financialValue(v).status==='number')));
  });
  addCheck(
    "forecast-revisions",
    "Forecast revision pairs",
    revisionsComplete,
    revisionsComplete
      ? "Revenue and net-income estimates include current and prior values for every reported revision year."
      : "A current/prior pair is missing from the priority revenue or net-income revisions."
  );

  const priorityMetrics = [
    ...(important.groups || []).flatMap((group) => group.metrics || []),
    ...revisionMetrics
  ];
  const traceableCount = priorityMetrics.filter((metric) => (
    metric.sourcePage && metric.sourceTableId && metric.sourceRowKey
  )).length;
  const traceabilityComplete = priorityMetrics.length > 0 && traceableCount === priorityMetrics.length;
  const sourcePages = [...new Set(priorityMetrics.map((metric) => metric.sourcePage).filter(Boolean))]
    .sort((left, right) => left - right);
  addCheck(
    "source-traceability",
    "Source traceability",
    traceabilityComplete,
    `${traceableCount}/${priorityMetrics.length || coverage.found} recognized priorities link to an exact table row${sourcePages.length ? ` on report page${sourcePages.length === 1 ? "" : "s"} ${sourcePages.join("–")}` : ""}.`
  );

  const passed = checks.filter((check) => check.status === "pass").length;
  return {
    status: passed === checks.length ? "pass" : passed >= 3 ? "review" : "warning",
    passed,
    total: checks.length,
    checks,
    note: "These checks test extraction consistency and source traceability. They do not verify the analyst's assumptions or guarantee an investment outcome."
  };
}

function extractForecastModel(text, document = null) {
  if (document?.pages?.length) {
    const data = morningstarTables(document);
    identifySourceTables([...data.tables,...data.supplemental]);
    const primaryDates=[...new Set(data.tables.map(t=>t.asOf).filter(Boolean))];
    const yearColumns = [...data.tables,...data.supplemental.filter(t=>t.familyId==='leverage')].flatMap(t => t.columns).filter(c => c.year);
    const model = { found:[...data.tables,...data.supplemental].some(t=>t.rows.length>0 && (data.tables.includes(t) || ['leverage','forecastRevisions'].includes(t.familyId))), asOf: primaryDates.length===1?primaryDates[0]:null, modelDates:primaryDates,
      sourcePage: data.tables[0]?.sourcePage || data.supplemental[0]?.sourcePage || null, totalPages: document.pageCount,
      actualYears: [...new Set(yearColumns.filter(c => c.period === 'actual').map(c => c.year))].sort(),
      forecastYears: [...new Set(yearColumns.filter(c => c.period === 'forecast').map(c => c.year))].sort(),
      tables: data.tables, supplementalTables: data.supplemental, captureIssues: data.issues };
    const supplemental = { tables: data.supplemental, leverage: data.supplemental.find(t => t.id === 'leverage'),
      revisions: data.supplemental.find(t => t.id === 'forecastRevisions'), drivers: data.supplemental.find(t => t.id === 'valuationDrivers'),
      sourcePage: data.supplemental.find(t => t.id === 'forecastRevisions')?.sourcePage || data.supplemental[0]?.sourcePage };
    model.supplementalSourcePage = supplemental.sourcePage;
    model.importantMetrics = buildImportantMetrics(model, supplemental);
    return model;
  }
  const marker = /Morningstar Valuation Model Summary/i.exec(text);
  if (!marker) {
    return {
      found: false,
      asOf: null,
      sourcePage: null,
      totalPages: null,
      actualYears: [],
      forecastYears: [],
      tables: [],
      supplementalTables: [],
      importantMetrics: {
        found: false,
        periods: null,
        groups: [],
        revisions: null,
        drivers: [],
        coverage: { found: 0, expected: 16, sectionsFound: 0, sectionsExpected: 5 }
      }
    };
  }

  const prefix = text.slice(Math.max(0, marker.index - 1_500), marker.index);
  const pageMarkers = [...prefix.matchAll(/\[\[PAGE\s+(\d+)\s+OF\s+(\d+)\]\]/gi)];
  const printedPages = [...prefix.matchAll(/Page\s+(\d+)\s+of\s+(\d+)/gi)];
  const pageMatch = pageMarkers.at(-1) || printedPages.at(-1);
  const afterMarker = text.slice(marker.index);
  const pageEnd = afterMarker.search(/^©\s*Morningstar/im);
  const modelText = afterMarker.slice(0, pageEnd > 0 ? pageEnd : 45_000);
  const lines = modelText.split("\n").map((line) => line.trim()).filter(Boolean);
  const starts = [];
  lines.forEach((line, index) => {
    const matcher = forecastSectionForLine(line);
    if (matcher) starts.push({ ...matcher, lineIndex: index });
  });

  const tables = [];
  starts.forEach((start, index) => {
    const endIndex = starts[index + 1]?.lineIndex ?? lines.length;
    const definition = FORECAST_TABLE_DEFINITIONS.find((item) => item.id === start.id);
    const table = extractForecastRows(lines, start.lineIndex, endIndex, definition);
    if (table) tables.push(table);
  });

  const yearColumns = tables.flatMap((table) => table.columns).filter((column) => column.year);
  const actualYears = yearColumns.filter((column) => column.period === "actual").map((column) => column.key)
    .filter((year, index, values) => values.indexOf(year) === index);
  const forecastYears = yearColumns.filter((column) => column.period === "forecast").map((column) => column.key)
    .filter((year, index, values) => values.indexOf(year) === index);
  const asOf = tables.find((table) => table.asOf)?.asOf || null;
  const model = {
    found: tables.length > 0,
    asOf,
    sourcePage: pageMatch ? Number(pageMatch[1]) : null,
    totalPages: pageMatch ? Number(pageMatch[2]) : null,
    actualYears,
    forecastYears,
    tables,
    supplementalTables: []
  };
  const supplemental = extractSupplementalForecastData(text);
  identifySourceTables([...tables,...supplemental.tables]);
  model.captureIssues=[];
  model.supplementalTables = supplemental.tables;
  model.supplementalSourcePage = supplemental.sourcePage;
  model.importantMetrics = buildImportantMetrics(model, supplemental);
  return model;
}

function splitSentences(value) {
  const decimalMarker = "\uE000";
  const flattened = value
    .replace(/(\d)\.(\d)/g, `$1${decimalMarker}$2`)
    .replace(/\n[•·▪◦u-]\s*/g, ". ")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!flattened) return [];
  const matches = flattened.match(/[^.!?]+(?:[.!?]+|$)/g) || [flattened];
  return matches
    .map((sentence) => sentence.trim().replace(new RegExp(decimalMarker, "g"), ".").replace(/^[•·▪◦u-]\s*/, "").replace(/\.{2,}$/g, "."))
    .filter((sentence) => sentence.length >= 24)
    .filter((sentence) => !/\bSector Industry\b|Morningstar Equity Analyst Report|\bPrice\/FVE\b/i.test(sentence))
    .map((sentence) => sentence.length > 520 ? `${sentence.slice(0, 517).trim()}…` : sentence);
}

function summarizeSection(body, definition, detail) {
  const sentences = splitSentences(body).slice(0, 60);
  if (!sentences.length) return [];
  const count = detail === "detailed" ? 4 : 2;
  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    const keywordHits = definition.keywords.reduce(
      (total, keyword) => total + (lower.includes(keyword) ? 1 : 0),
      0
    );
    const numberBonus = /(?:\$|£|€|\b\d+(?:\.\d+)?%)/.test(sentence) ? 1.4 : 0;
    const actionBonus = /\b(?:expect|estimate|believe|forecast|maintain|raise|lower|risk|could|should)\b/i.test(sentence) ? 1.2 : 0;
    const positionBonus = Math.max(0, 2.4 - index * 0.28);
    const lengthPenalty = sentence.length > 420 ? 1.2 : 0;
    return { sentence, index, score: keywordHits * 1.7 + numberBonus + actionBonus + positionBonus - lengthPenalty };
  });

  const selected = [];
  selected.push(scored[0]);
  for (const candidate of [...scored].sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (selected.some((item) => item.index === candidate.index)) continue;
    const fingerprint = candidate.sentence.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
    if (selected.some((item) => item.sentence.toLowerCase().replace(/[^a-z0-9]/g, "").includes(fingerprint))) continue;
    selected.push(candidate);
    if (selected.length >= count) break;
  }
  return selected.sort((a, b) => a.index - b.index).map((item) => item.sentence);
}

function extractCustomFindings(text, keywords, detail) {
  const terms = String(keywords || "")
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter((term, index, items) => term.length >= 2 && items.indexOf(term) === index)
    .slice(0, 12);
  if (!terms.length) return { terms: [], findings: [] };

  const findings = splitSentences(text)
    .map((sentence, index) => {
      const lower = sentence.toLowerCase();
      const matches = terms.filter((term) => lower.includes(term));
      return { sentence, index, matches, score: matches.length * 4 - index / 10_000 };
    })
    .filter((item) => item.matches.length)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter((item, index, items) => {
      const fingerprint = item.sentence.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 100);
      return items.findIndex((other) => other.sentence.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith(fingerprint)) === index;
    })
    .slice(0, detail === "detailed" ? 8 : 4)
    .sort((a, b) => a.index - b.index);
  return { terms, findings };
}

function numericMoney(value) {
  if (!value) return null;
  const source = String(value).replace(/,/g, "").replace(/−/g, "-").trim();
  const match = source.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  const number = /^\s*\(/.test(source) ? -Math.abs(parsed) : parsed;
  return Number.isFinite(number) ? number : null;
}

export function analyzeReport(rawText, savedPreferences = {}, metadata = {}) {
  const preferences = mergePreferences(savedPreferences);
  const cleaned = cleanCapturedText(rawText);
  const workingText = contentBeforeDisclosures(cleaned);
  const analysisText = contentBeforeDisclosures(stripPageFurniture(cleaned));
  const provider = identifyProvider(workingText);
  let title = extractTitle(workingText, metadata);
  const ticker = extractTicker(workingText, title);
  if (ticker) {
    const withoutTicker = title
      .replace(new RegExp(`\\s*\\(${escapeRegExp(ticker)}\\)\\s*$`, "i"), "")
      .replace(new RegExp(`\\s+${escapeRegExp(ticker)}\\s*$`, "i"), "")
      .trim();
    if (withoutTicker) title = withoutTicker;
  }
  const facts = extractFacts(workingText);
  const factEvidence=morningstarHeadlines(metadata.document);
  for(const [id,e] of Object.entries(factEvidence))facts[id]=e.value;
  const forecastModel = extractForecastModel(cleaned, metadata.document);
  const dataIntegrity = buildDataIntegrity(facts, forecastModel);
  const bodies = extractSectionBodies(analysisText);

  const sections = SECTION_DEFINITIONS.map((definition) => ({
    id: definition.id,
    title: definition.title,
    found: Boolean(bodies[definition.id]),
    sourcePage: bodies[definition.id]?.source?.page || null,
    totalPages: bodies[definition.id]?.source?.totalPages || null,
    sourceText: bodies[definition.id]?.body || null,
    bullets: bodies[definition.id]
      ? summarizeSection(bodies[definition.id].body, definition, preferences.detail)
      : []
  }));

  const custom = extractCustomFindings(analysisText, preferences.keywords, preferences.detail);
  const enabledFactIds = FACT_DEFINITIONS.filter((item) => preferences.facts[item.id]).map((item) => item.id);
  const enabledForecastIds = FORECAST_TABLE_DEFINITIONS.filter((item) => preferences.forecastTables[item.id]).map((item) => item.id);
  const enabledSectionIds = SECTION_DEFINITIONS.filter((item) => preferences.sections[item.id]).map((item) => item.id);
  const foundFacts = enabledFactIds.filter((id) => facts[id]).length;
  const foundForecastTables = forecastModel.tables.filter((item) => enabledForecastIds.includes(item.id)).length;
  const foundSections = sections.filter((item) => enabledSectionIds.includes(item.id) && item.found).length;
  const missingFacts = FACT_DEFINITIONS
    .filter((item) => enabledFactIds.includes(item.id) && !facts[item.id])
    .map((item) => ({ id: item.id, label: item.label }));
  const missingForecastTables = FORECAST_TABLE_DEFINITIONS
    .filter((item) => enabledForecastIds.includes(item.id) && !forecastModel.tables.some((table) => table.id === item.id))
    .map((item) => ({ id: item.id, label: item.title }));
  const missingSections = SECTION_DEFINITIONS
    .filter((item) => enabledSectionIds.includes(item.id) && !sections.some((section) => section.id === item.id && section.found))
    .map((item) => ({ id: item.id, label: item.title }));
  const possible = Math.max(1, enabledFactIds.length + enabledForecastIds.length + enabledSectionIds.length);
  const captured = foundFacts + foundForecastTables + foundSections;
  const score = Math.round((captured / possible) * 100);
  const completeness = score === 100
    ? "Complete source capture"
    : score >= 85
      ? "High source capture"
      : score >= 60
        ? "Partial source capture"
        : "Limited source capture";

  const metadataValues = {
    sourceType: metadata.sourceType || "pdf",
    capturedAt: metadata.capturedAt || null,
    pageTitle: metadata.title || ""
  };

  const report = {
    provider,
    title,
    ticker,
    facts,
    forecastModel,
    dataIntegrity,
    sections,
    custom,
    completeness: {
      score,
      label: completeness,
      foundFacts,
      enabledFacts: enabledFactIds.length,
      foundForecastTables,
      enabledForecastTables: enabledForecastIds.length,
      foundSections,
      enabledSections: enabledSectionIds.length,
      captured,
      possible,
      missingFacts,
      missingForecastTables,
      missingSections
    },
    factEvidence,
    textCoverage:metadata.document?.textCoverage,
    metadata: metadataValues,
    textLength: workingText.length,
    captureIssues:[...(forecastModel.captureIssues||[]),...Object.values(factEvidence).filter(e=>e.status==='check source').map(e=>({sourcePage:e.sourcePage,metric:e.metric,reason:'The rating-strip value could not be confirmed beneath its heading.'}))]
  };
  const tables = [...forecastModel.tables, ...forecastModel.supplementalTables];
  tables.forEach(table => { table.columnMeta = table.columns; });
  attachProvenance(Object.assign(report, { type: 'morningstar', reportDate: facts.reportDate, fileName: metadata.fileName || metadata.title || null }), tables.map(table => ({ ...table, columns: table.columns.map(c => c.label) })));
  return report;
}

export function buildPlainTextSummary(report, savedPreferences = {}) {
  const preferences = mergePreferences(savedPreferences);
  const lines = [];
  lines.push(report.ticker ? `${report.title} (${report.ticker})` : report.title);
  lines.push(`${report.provider} research summary`);
  if (report.facts.reportDate) lines.push(`Report date: ${report.facts.reportDate}`);
  lines.push("");
  lines.push("KEY FACTS");
  for (const definition of FACT_DEFINITIONS) {
    if (!preferences.facts[definition.id]) continue;
    const value = report.facts[definition.id];
    if (value) {
      const e=report.factEvidence?.[definition.id];
      lines.push(`${definition.label}: ${value}${e?.date ? ' · '+e.date : ''}${e?.sourcePage ? ' · p. '+e.sourcePage : ''}`);
    }
    else if (preferences.showMissing) lines.push(`${definition.label}: ${report.completeness?.notProvidedFacts?.some(f=>f.id===definition.id) ? "Not provided in source" : "Not captured; check PDF"}`);
  }
  if (report.forecastModel?.found) {
    lines.push("");
    lines.push("VALUATION & FORECASTS");
    const pageText = report.forecastModel.sourcePage
      ? `Source: page ${report.forecastModel.sourcePage}${report.forecastModel.totalPages ? ` of ${report.forecastModel.totalPages}` : ""}`
      : null;
    if (pageText) lines.push(pageText);
    if (report.forecastModel.asOf) lines.push(`Model data as of ${report.forecastModel.asOf}`);

    const important = report.forecastModel.importantMetrics;
    if (important?.found) {
      lines.push("", "IMPORTANT METRICS");
      for (const group of important.groups) {
        const columns=groupColumns(group);
        lines.push(`[${group.title}]`);
        lines.push(['Metric','Units',...columns.map(c=>`${c.label} · ${periodLabel(c.period)}`),'PDF page'].join('\t'));
        for (const metric of group.metrics) {
          const points=new Map(metric.series.map(point=>[columnIdentity(point),point]));
          lines.push([metric.contextNote ? metric.label+' ('+metric.contextNote+')' : metric.label,unitLabel(metric),...columns.map(column=>{
            const point=points.get(columnIdentity(column));
            return point ? sourceTextValue(point.value,point.validation) : 'Not in this row';
          }),metric.sourcePages?.join(', ') || metric.sourcePage || ''].join('\t'));
        }
      }

      if (important.revisions?.metrics?.length) {
        lines.push("");
        lines.push("FORECAST REVISIONS");
        if (important.revisions.asOf || important.revisions.priorAsOf) {
          lines.push([
            important.revisions.asOf && `Current: ${important.revisions.asOf}`,
            important.revisions.priorAsOf && `Prior: ${important.revisions.priorAsOf}`
          ].filter(Boolean).join(" • "));
        }
        important.revisions.metrics.forEach((metric) => {
          metric.pairs.forEach((pair) => {
            const proof=metric.pairSources?.[pair.year] || {};
            lines.push(`${metric.label} ${pair.year}: current ${sourceTextValue(pair.current,proof.validation || metric.validation)}; prior ${sourceTextValue(pair.prior,proof.validation || metric.validation)}${unitLabel(metric) ? ` (${unitLabel(metric)})` : ""}${proof.page || metric.sourcePage ? ` · p. ${proof.page || metric.sourcePage}` : ""}${metric.contextNote ? ` · ${metric.contextNote}` : ""}`);
          });
        });
      }

    }

  }
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
  const orderedSections = [...report.sections].sort((left, right) => (
    sectionOrder.indexOf(left.id) - sectionOrder.indexOf(right.id)
  ));
  for (const section of orderedSections) {
    if (!preferences.sections[section.id]) continue;
    if (!section.found && !preferences.showMissing) continue;
    lines.push("");
    lines.push(section.title.toUpperCase());
    if (section.found) {
      if (section.sourcePage) lines.push(`Source: report page ${section.sourcePage}`);
      section.bullets.forEach((bullet) => lines.push(`• ${bullet}`));
    }
    else lines.push("Not found in the captured text.");
  }
  if (report.custom.findings.length) {
    lines.push("");
    lines.push(`CUSTOM MATCHES (${report.custom.terms.join(", ")})`);
    report.custom.findings.forEach((item) => lines.push(`• ${item.sentence}`));
  }
  if (report.forecastModel?.found) {
    lines.push("");
    lines.push("COMPLETE SOURCE TABLES");
    for (const table of [...report.forecastModel.tables, ...(report.forecastModel.supplementalTables || [])]) {
      if (FORECAST_TABLE_DEFINITIONS.some((definition) => definition.id === table.id) && !preferences.forecastTables[table.id]) continue;
      const selectedColumns = table.columns
        .map((column, index) => ({ ...column, sourceIndex: index }))
        .filter((column) => preferences.showHistorical || column.period !== "actual");
      lines.push("");
      lines.push(table.title.toUpperCase());
      lines.push(["Metric", ...selectedColumns.map((column) => column.label)].join("\t"));
      table.rows.forEach((row) => {
        lines.push([row.label, ...selectedColumns.map((column) => row.values[column.sourceIndex])].join("\t"));
      });
    }
  }
  if (report.completeness) {
    const quality = report.completeness;
    lines.push("");
    lines.push(`PDF SOURCE CAPTURE (${quality.score}%)`);
    lines.push(`${quality.captured ?? quality.foundFacts + quality.foundForecastTables + quality.foundSections} of ${quality.possible ?? quality.enabledFacts + quality.enabledForecastTables + quality.enabledSections} selected items captured.`);
    const missingGroups = [
      ["Facts", quality.missingFacts || []],
      ["Model tables", quality.missingForecastTables || []],
      ["Report sections", quality.missingSections || []]
    ].filter(([, items]) => items.length);
    missingGroups.forEach(([label, items]) => lines.push(`${label} not reliably found: ${items.map((item) => item.label || item).join(", ")}`));
    lines.push("This percentage measures extraction coverage, not report accuracy or investment confidence.");
  }
  if (report.dataIntegrity?.checks?.length) {
    lines.push("");
    lines.push(`EXTRACTION CHECKS (${report.dataIntegrity.passed}/${report.dataIntegrity.total} passed)`);
    report.dataIntegrity.checks.forEach((item) => lines.push(`• ${item.label}: ${item.detail}`));
    lines.push(report.dataIntegrity.note);
  }
  lines.push("");
  lines.push("Source summary generated from the selected Morningstar PDF. It organizes report data and does not add an independent buy/sell recommendation or personal portfolio analysis.");
  return lines.join("\n");
}

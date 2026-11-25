# Read first for the next change

Current release: 4.6.0, session-only static website. This supersedes v4.3's
Node/SQLite account-and-library architecture at the user's explicit request.
The user wants a simple public link, free/cheap hosting, phone and desktop use,
and no programmer setup for readers. Long-term report saving is no longer needed.

Project source: [vp24/research-report-reader](https://github.com/vp24/research-report-reader), branch **main**. Start future changes from the current repository. The packaged 4.6 handoff is an offline snapshot.

## Architecture

- public/index.html: shell; public/reader/boot.js: startup and session lifecycle.
- session-api.js: in-memory Map of PDF originals, metadata and comparison
  snapshots; public desktopApi shape retained for the renderer. No network or
  storage APIs. Stable entry IDs survive bundle updates; exact unordered sets of file-content hashes deduplicate imports.
- renderer.js: source-based reading UI and multi-report session.
- priority-sections.js: merge compatible Morningstar continuations without mixing currencies, model dates, accounting bases, fiscal year ends, or conflicting values. Keep each cell’s page.
- headline-evidence.js and quoted-value.js: match printed labels to values and dates; link only when a page is known.
- year-focus.js: filter the rendered cells without mutating the underlying model or export.
- pdf-document.js: distinguish actual text from generated page markers; flag unreadable pages and keep the original available.
- argus-import.js: stage 1–3 sources, validate, then open; add other types later.
- report-comparison.js: source/basis/period-aware comparisons within this tab.
- source-viewer.js: PDF.js canvas and exact original page/row evidence.
- parser.js, argus-parser.js, argus-source.js, morningstar-layout.js,
  layout-tables.js, financial-data.js, display-values.js: existing accuracy logic.
- public/_headers, _redirects: Cloudflare Pages static deployment configuration.
- sw.js: generic offline page only, no cached reports.
- dev-server.mjs: localhost static preview with matching security headers;
  never deploy it as a required server.

## Product invariants

Keep highlighted financial fields together near the top, with all source years.
Keep actual/forecast, GAAP/adjusted, estimate/guidance/consensus, Analyst/A6/Options
separate, including their own report and model dates, units, original labels and
analyst reasoning. Do not add investment recommendations or invented numbers.
Use format-based parsing; regression companies are examples, not special cases.
Professional minimal UI, no duplicate summary panels or marketing copy.

## Session lifecycle

Refresh, closing, navigation away or Clear session clears reports. pagehide clears
state even for Back/Forward caching. beforeunload warns when the browser permits.
Async imports carry a generation token so clearing cannot revive pending data.
Source viewer and comparison state reset with the session. Every opened PDF copy
is separate from the stored original to survive worker buffer transfers.
Only explicit Save text summary downloads are retained by the visitor.

## Verify efficiently

Read VALIDATION.md. Run npm test for state/value/comparison changes; use the
reading/browser suites when changing the UI or import flow. Source changes need
source regressions and the private corpus. Do not include paid PDFs or QA images
in public assets. A generated public-domain test fixture exercises PDF extraction and the actual browser. PDF.js is bundled; the parser changes are documented in CHANGELOG.md.
No live deployment has been performed. START-HERE.txt is the publisher workflow.

## Next highest value
Test an actual iPhone/Safari and Android browser on the published HTTPS link. Exercise the OS picker, wide table, original PDF and tab lifecycle. Then prioritize one unfamiliar layout with a reported discrepancy. Add a synthetic test publicly and comparison data to the private manifest; change the parser only with evidence. Maintain source fidelity before adding features.

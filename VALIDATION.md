# Release checks — 4.8.0

Tested November 26, 2026. The website ZIP runs locally before deployment. Physical devices and the new build on the production host are separate checks.

## What was verified

| Check | Result | What it establishes |
|---|---:|---|
| Unit and packaging tests | 51 passed | Source units, actual/forecast boundaries, current/prior, missing and ambiguous values, session identity, grouping, vendor file hashes and release contents. Generated PDFs challenge split tables, conflicting units/editions, repeated or reordered headings, missing fields, and summary versus series values. |
| Generated PDFs, real Chromium | 13 passed | A 320px viewport can reach every period, open its original evidence, download matching text, add three same-named Argus files without confusing them, choose one fiscal year and restore all years, inspect a split revision, identify a scan versus an unsupported file, and clear on refresh. No licensed PDFs needed. |
| Original handoff regressions | 88 passed | The original suite was run against the current parser and bundled engine using the 24 reference PDFs: Morningstar plus Argus Analyst, A6 and Options for six issuers. |
| Independent source checks | 10 passed | Six Argus categorical comparisons with independent Poppler text, non-USD layout, and cross-page revisions, a real chart with one label removed or an unfamiliar color, and independent printed-location checks. |
| Real-report reading flows | 17 passed | All priority fields together, all eight years in the PayPal example, individual source cells, correct original PDF page, separate per-figure dates, annual/quarterly year focus, staged Argus updates and session switching. |
| Real-report Chromium flows | 21 passed | 320/390/1440px layouts, import and completion, report switching, offline screen, no report uploads, cookies or storage entries. |

Across the six suites above, 200 checks passed. The additional mobile suite opens generated Morningstar and Argus files via the native input, follows seven years and split revisions through a vertical metric view, uses browser Back through the original PDF, adds sources later, rejects mixed uploads, and checks narrow/landscape layouts and session cleanup. It also checks that sharing includes only the site URL. An independent Poppler position check located **952 printed figures in 12 original PDFs**, covering Morningstar priority metrics, current/prior revisions, and Argus Analyst annual/quarterly chart values. At 320px wide and 200% zoom, a browser test verifies that the selected figure actually scrolls into view. A separate local comparison matched **1,375 cells across 241 independently checked rows in 132 tables from 24 PDFs**. Their row labels, printed period columns and PDF page numbers matched the private reference data. This check overlaps some handoff regressions; it is not a percentage accuracy score. No report PDFs, customer information or private goldens are in the release or in Git history.

## Repeat it

- After installing development dependencies, run `npm test` and `npm run test:public`. The latter requires Playwright Chromium (`npx playwright install chromium` or `CHROMIUM_EXECUTABLE_PATH` pointing at a Chromium executable). GitHub runs these on pushes and pull requests to main once the repository is published and Actions enabled. It also builds the website ZIP.
- For private source validation, set `READER_HANDOFF` to the directory with `corpus-manifest.json`, `table-goldens.json` and its reports directory. Run `npm run test:corpus`. Add an unfamiliar issuer by adding files to the private manifest and independently reading its expected table headers, page numbers and row values. No code changes are needed to add a regression case.
- Set `READER_CORPUS` to the private **PDF directory** for `npm run test:source`, `npm run test:reading` and `npm run test:browser`. These focused tests exercise the existing handoff cases. The source accuracy check also needs Poppler's pdftotext. Real PDF inputs are not necessary to build or publish the site.

## Practical limits

Unseen layouts are not guaranteed. A page containing only printed headers may still require visual inspection: the missing-text notice detects pages with no selectable text at all. Continuations are combined only when the repeated sections give compatible model context; conflicting source figures remain separate. Scans without selectable text need the original text-based PDF; there is no OCR. A printed dash, N/A, or “None” is not a numerical zero. Review an ambiguous value against the original; the reader does not validate the analyst's forecast or fetch live prices. Each visitor’s tab processes its own PDFs and clears them on refresh/close. A phone may discard a background tab.

Run npm run test:mobile with Chromium and WebKit installed to exercise both the Pixel and iPhone touch profiles. Browser emulation tests the reader and the file-input API; it does not operate the real OS Files/Downloads or share sheet. A quick check on an actual iPhone and Android with a downloaded PDF is still useful before forwarding the link. See the repository’s Actions page for the status of each public build. The licensed regression PDFs are tested locally and are never uploaded to GitHub.

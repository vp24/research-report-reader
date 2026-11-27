# Research Report Reader 4.8

A public, static Morningstar and Argus PDF reader for phones and computers.
It surfaces source financials, forecasts, targets and analyst reasoning, retaining
historical years, units, actual/forecast labels and distinctions between sources.
It does not generate an independent investment recommendation. Tap **Choose PDF files**. One Morningstar file or one to three Argus files for one company open directly. If you start with one Argus file, **Add another source** attaches the rest to the same report.

All years open by default. On a phone, **View financials & forecasts → Read one metric** lists the printed periods vertically. A figure opens its original PDF evidence when available. Back or Close returns to the same metric, then to the table. You can also choose a fiscal year across metrics. Neither view changes the text export. **Share reader link** shares the website only; **Add to Home Screen** is optional.

If a chart misses a number, the other quarters and annual totals stay visible. “Not captured” means the reader found no value at that position; “Review” flags conflicting placement. A printed zero, dash or N/A keeps its original meaning. When you tap a value, the PDF viewer highlights the printed figure if its position is known.

[Build checks and website download](https://github.com/vp24/research-report-reader/actions/workflows/verify.yml) · [Report an extraction error](https://github.com/vp24/research-report-reader/issues/new?template=reading-discrepancy.yml)

## Publish

For a website ZIP from GitHub, follow [GITHUB-SETUP.md](GITHUB-SETUP.md). If you already have **WEBSITE-UPLOAD.zip**, go straight to [START-HERE.txt](START-HERE.txt) for Cloudflare Pages Direct Upload. Its root contains index.html, _headers, _redirects and all
runtime assets. No backend, credentials, database, or build step is required.
The `public/` directory in this repository contains the same deployable website.

## Session-only reports

PDF bytes, parsed report data and comparison snapshots are kept in JavaScript
memory only. Nothing is written to IndexedDB, localStorage, sessionStorage or
cookies. Reports are not sent to a server. A different tab starts empty.
Refresh, navigation or closing the tab ends the session. Clear session resets
reports and releases source-viewer data and temporary original-PDF URLs.
The browser can warn before leaving, but mobile browsers may discard a tab
without warning. Original downloaded files are never changed by the app.

A browser may cache the website's code; the service worker stores only a generic
offline screen. No reports are cached. Cold-start offline use is not supported.
Already displayed tables remain readable when connectivity drops.

## Development only

Node 24+ is used for the local preview and automated tests. Website visitors and
publishers do not need Node or npm.

- npm ci
- npm start — preview at http://127.0.0.1:8080
- npm test — session, financial accuracy, comparison and packaging tests
- npx playwright install --with-deps chromium webkit, then npm run test:public and npm run test:mobile — generated PDFs, Android Chromium and iPhone WebKit profiles
- READER_HANDOFF=/path/to/private/handoff npm run test:corpus — compare PDF cells to independently checked source rows
- READER_CORPUS=/path/to/private/reports npm run test:reading
- READER_CORPUS=/path/to/private/reports npm run test:source
- READER_CORPUS=/path/to/private/reports npm run test:browser

Set CHROMIUM_EXECUTABLE_PATH to use a local Chromium binary; the phone suite defaults to both engines. READER_ENGINES=chromium or webkit runs one explicitly. Browser emulation does not verify an actual operating system’s file picker.
Regression PDF files are intentionally excluded from the website and release.

See HANDOFF.md for architecture, VALIDATION.md for test results and limitations, and GITHUB-SETUP.md for the maintenance workflow. To build the deployable site run `python3 package-release.py --site-only artifacts/WEBSITE-UPLOAD.zip`. The public website itself does not use Python or Node.

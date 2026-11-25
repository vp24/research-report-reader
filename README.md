# Research Report Reader 4.6

A public, static Morningstar and Argus PDF reader for phones and computers.
It surfaces source financials, forecasts, targets and analyst reasoning, retaining
historical years, units, actual/forecast labels and distinctions between sources.
It does not generate an independent investment recommendation. Opening a report shows all years. On a phone, choose a fiscal year to see it across metrics, then tap a figure to verify the printed value, page and date when available. Saving a text summary includes all periods, even while a single year is selected.

## Publish

Follow START-HERE.txt. The release's WEBSITE-UPLOAD.zip is prebuilt for Cloudflare
Pages Direct Upload. Its root contains index.html, _headers, _redirects and all
runtime assets. No backend, credentials, database, or build step is required.
The source/public directory is the identical deployable website.

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
- npx playwright install chromium, then npm run test:public — mobile browser flow with a generated PDF
- READER_HANDOFF=/path/to/private/handoff npm run test:corpus — compare PDF cells to independently checked source rows
- READER_CORPUS=/path/to/private/reports npm run test:reading
- READER_CORPUS=/path/to/private/reports npm run test:source
- READER_CORPUS=/path/to/private/reports npm run test:browser

Browser testing uses Playwright Chromium; set CHROMIUM_EXECUTABLE_PATH if needed.
Regression PDF files are intentionally excluded from the website and release.

See HANDOFF.md for architecture, VALIDATION.md for test results and limitations, and GITHUB-SETUP.md for the maintenance workflow. To build the deployable site run `python3 package-release.py --site-only artifacts/WEBSITE-UPLOAD.zip`. The public website itself does not use Python or Node.

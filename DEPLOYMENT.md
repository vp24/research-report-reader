# Deploy the static site

Use Cloudflare Pages Free and the drag-and-drop option described in START-HERE.txt.
Upload WEBSITE-UPLOAD.zip, not the outer release ZIP and not the source folder.
You do not need Render, a paid database, a domain purchase, an API key, or a
ChatGPT account. Anyone with the deployed link can open the reader.

The prebuilt site is far below the dashboard's 1,000-file limit and 25 MiB limit
per individual asset. The 60 MB PDF import limit is separate: imported reports
stay in the visitor's tab and are not uploaded to Cloudflare.

Cloudflare interprets public/_headers and public/_redirects. Security headers
allow the bundled PDF worker and local PDF rendering. All JS, styles, fonts and
icons are bundled; the reader makes no third-party application requests.
Legacy /login, /register and /setup paths redirect to the public reader.

## Check the actual published link

1. Open the HTTPS .pages.dev URL on a phone and a computer.
2. Add a Morningstar PDF, read the last forecast column and open its source page.
3. Add one Argus PDF, then add another source to that report.
4. Refresh, confirming the browser warning if shown. The session should be empty.
5. Open the link in a second tab or private window. It should start empty without
   a login screen. Share the public URL with the intended reader.

These live-host and physical-device checks remain to be completed after upload.
The local preview already passed the automated checks in VALIDATION.md.

Direct Upload projects can receive future manual deployments under the same URL.
Cloudflare currently requires a new project if you later want Git-based automatic
deployments. You can still use GitHub for tests and source history, and manually upload the verified build to your existing Pages project without changing its URL. See GITHUB-SETUP.md.

Changing hosts does not erase files stored by an older release. This version
never reads previous cloud accounts or IndexedDB libraries. Existing deployments
and their subscriptions are not changed automatically by extracting this ZIP.

Official references checked November 7, 2026:
- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/pages/configuration/headers/

# Bundled PDF engine

PDF.js / pdfjs-dist **6.4.299**, Mozilla legacy build, from the npm release archive.
Both library and worker are from the same release; license is PDFJS-LICENSE.txt.

Release: https://github.com/mozilla/pdf.js/releases/tag/v6.4.299
Security reference: https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j

The reader only extracts text/positions and renders pages. It does not include the full PDF.js viewer, PDF scripting manager or sandbox. Dynamic evaluation is disabled in both extraction and source rendering; the server applies a same-origin script policy.

SHA-256:
- `pdf.min.mjs`: `bccc24ea711db8e44503629519904a5292d73b9daaa214bbe7cdcc282b0f4259`
- `pdf.worker.min.mjs`: `145d2dd3ab0c86151011dba95acfa2d5336e2accd59388ea43dbee0efddaaec6`

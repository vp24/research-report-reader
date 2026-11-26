# 4.8.0 — November 26, 2026

- Open a downloaded report from the phone’s file picker in one tap, including a single Argus file or several for one company. Guided import and attaching additional Argus sources remain available.
- Read a single Morningstar or Argus forecast metric vertically, including every source period regardless of the table’s year filter. Current and prior revisions, units, missing and ambiguous values and printed sources stay separate.
- Jump to forecasts; go from a figure to the original PDF and back without leaving the session. The welcome screen now offers an optional home-screen shortcut and can share just the public website link.
- Add touch-browser checks with iPhone/WebKit and Android/Chromium profiles. No change to extraction rules, storage or hosting.

# 4.7.0 — November 25, 2026

- An unreadable Argus chart label no longer removes valid annual totals or the other quarters. A duplicate in one period cannot fill a gap in another. Conflicts and missing captures remain distinct from a printed zero or N/A in the reader and text export.
- Quarters with no reliable actual/estimate indication retain their numbers but are left unclassified. A previously unseen bar color in a mixed year is not enough to call the value actual.
- Tapping a measured Morningstar or Argus figure brings its printed value into view, including on a zoomed phone. Current and previous revisions retain separate positions. The viewer identifies row or page evidence explicitly when it cannot locate a precise value.

# 4.6.0 — November 25, 2026

- Morningstar priority tables retain later years when sections repeat on another page. Current and previous revisions keep their original dates, pages and values. Incompatible scales, editions and conflicting rows remain separate.
- Each Morningstar price and fair-value estimate can show its own printed date. Confirmed figures link to their source; an explicit moat of None, an unreadable value and a printed missing marker remain distinct.
- Argus summary values use paired labels instead of picking the first amount in a historical series. Conflicting scalar values are flagged; the original A6 and Analyst targets are individually verifiable.
- All years still open by default. The optional fiscal-year selector keeps the annual and quarterly periods, both halves of revisions and the full text export intact.
- Imports distinguish a scan from an unrelated file or an unreadable download. A report with a page containing no selectable text includes a link to inspect that page.

# 4.5.0 — November 24, 2026

- **Morningstar:** The priority section of copied and downloaded summaries now includes every source period, the source unit and page, and current/prior revisions. Zero, a printed dash, N/A, an unaligned value, and an absent value have different meanings. Monetary priority rows keep the source currency/scale. Read centered current/prior year headings and explicitly printed or single-period headers without using the report date as a forecast year.
- **Argus:** Tie a quoted price to the PDF and report date that supplied it. Unopened optional sources are no longer counted as failed checks. Preserve explicit estimate suffixes and differences in actual/forecast status between metrics within one period. Keep Analyst and A6 targets separate. Preserve comma-grouped prices and full printed Options risk ranks. Export source/table details for Options, too.
- **Reading:** A First forecast control appears on wide tables with both historical and forecast columns. Every year is still available. Opening the original PDF from a cited cell keeps the page. Adding a missing Argus source preserves the session entry; reimporting a different source set or identically named files no longer opens the wrong bundle. Already inspected files are reused during staged import.
- **Maintenance:** Git history starts from the verified 4.4 release. Automated checks use a generated PDF on mobile-width Chromium and refuse extra files in the website bundle. A separate local command compares licensed PDFs to independently checked values. No reports, account setup, or hosted database are required for GitHub checks.

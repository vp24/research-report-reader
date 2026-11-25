# Keep improving the reader with GitHub

Readers need only the public website link. GitHub is for the person maintaining the code. The site can be public whether the source repository is private or public.

[vp24/research-report-reader](https://github.com/vp24/research-report-reader) is the project repository.

**Get a tested website ZIP without installing anything:**

1. Open [Verify reader](https://github.com/vp24/research-report-reader/actions/workflows/verify.yml) and select a successful run for the version you want. To start one manually, choose **Run workflow** on **main**.
2. In **Artifacts**, download **verified-website**. Unzip that download once to find **WEBSITE-UPLOAD.zip** inside.
3. Upload **WEBSITE-UPLOAD.zip** to Cloudflare Pages using [the publishing instructions](START-HERE.txt). Give the person reading reports the resulting website link. They do not need a GitHub or ChatGPT account.

To edit the existing project in GitHub Desktop, choose **File → Clone repository**, then select **vp24/research-report-reader**. The default branch is **main**.

## Future fixes

- Record one discrepancy using **Issues → New issue → A report number or label looks wrong**. Give the source, printed period, expected value, and what the reader displayed. An invented row with the same layout is enough. Keep licensed PDFs and account details out of GitHub.
- Add a test that fails on the old code, then fix the layout or reading flow. For parser changes, also run the private source comparison in VALIDATION.md. Make each change on a branch; review its pull request. GitHub checks changes to main with invented data and produces a website ZIP only after success. Use repository settings to require the check before merging if desired.
- Monthly Dependabot proposals cover the test tools and GitHub Actions. They are not automatically merged or published. The bundled PDF engine is maintained separately; review Mozilla releases, update the library and worker together, verify their digests, then rerun the private PDF checks.
- There is no automatic production deployment. Publish the tested WEBSITE-UPLOAD.zip to the existing Pages project when ready; keep the previous ZIP for rollback. GitHub is optional for hosting.

GitHub Desktop instructions: https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop

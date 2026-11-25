# Keep improving the reader with GitHub

Readers need only the public website link. GitHub is for the person maintaining the code. The site can be public whether the source repository is private or public.

**Publish the enclosed project once (no commands):**

1. Extract the entire release ZIP. In GitHub Desktop, sign in to the account that should own the project.
2. Choose **File → Add local repository** and select the extracted **source** folder. The release handoff includes its Git history; you do not need to create or initialize a new project.
3. Click **Publish repository**, name it **research-report-reader**, choose the visibility you want, and publish.
4. On GitHub, open **Actions → Verify reader**. The first push to main should run it. If repository settings require enabling Actions, enable them and choose **Run workflow**. A green run includes a **verified-website** artifact with WEBSITE-UPLOAD.zip inside.

## Future fixes

- Record one discrepancy using **Issues → New issue → A report number or label looks wrong**. Give the source, printed period, expected value, and what the reader displayed. An invented row with the same layout is enough. Keep licensed PDFs and account details out of GitHub.
- Add a test that fails on the old code, then fix the layout or reading flow. For parser changes, also run the private source comparison in VALIDATION.md. Make each change on a branch; review its pull request. GitHub checks changes to main with invented data and produces a website ZIP only after success. Use repository settings to require the check before merging if desired.
- Monthly Dependabot proposals cover the test tools and GitHub Actions. They are not automatically merged or published. The bundled PDF engine is maintained separately; review Mozilla releases, update the library and worker together, verify their digests, then rerun the private PDF checks.
- There is no automatic production deployment. Publish the tested WEBSITE-UPLOAD.zip to the existing Pages project when ready; keep the previous ZIP for rollback. GitHub is optional for hosting.

GitHub Desktop instructions: https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop

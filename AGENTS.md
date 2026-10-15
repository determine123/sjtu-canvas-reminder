# Project delivery rules

- The owner authorized publishing this project and future completed updates to
  `https://github.com/determine123/sjtu-canvas-reminder`.
- After a requested code update, run relevant tests, inspect the diff, commit
  only reviewed project files, and push to the configured GitHub origin.
- Do not force-push, overwrite unrelated remote work, publish secrets, or claim
  a push succeeded without checking the remote commit.
- Prefer editing this source checkout and overwriting the existing installed
  extension directories. Do not create local ZIPs unless requested.
- `.publish-local.json` is ignored local configuration for runtime paths and
  installed directories. Never commit it, browser profiles, real attendance
  QR codes, cookies, credentials, logs, or user screenshots.
- `tools/publish.ps1` validates, copies runtime files to configured installations,
  commits tracked changes, and pushes. New files must be reviewed and explicitly
  staged or passed via `-IncludePaths`.
- Preserve courses, saved preferences, and the owner's auto-sign setting during
  updates. Keep manual screen-sharing consent and conservative result handling.
- School APIs and classroom behavior are not proven by mocked tests. Clearly
  distinguish regression tests, browser tests, and actual classroom validation.
- Keep third-party licenses and corresponding source archives in distributions.

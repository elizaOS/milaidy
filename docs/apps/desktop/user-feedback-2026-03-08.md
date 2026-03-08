# Desktop Feedback 2026-03-08

Source: internal development chat during Electrobun prerelease testing on Sunday, March 8, 2026.

## Experience modes

- Users want a clearer first-run choice of experience mode instead of implicitly landing in one UI.
- Modes suggested in discussion: `dev`, `companion`, `co-work`, `streaming`, and `trading`.
- Companion appears to have been the default for some testers, but at least one switched away immediately because of UI issues.
- A toggle between companion and a more developer-oriented layout still seems desirable even if companion remains the default.

## Provider and onboarding issues

- `Login with Anthropic` under OAuth does not clearly lead users to a place where they can complete auth or paste codes.
- Users are confused about the difference between Claude console API keys, Claude Pro, and the terminal-based `claude setup-token` flow.
- Multiple providers were described as feeling "borked" during setup.
- Users connecting Eliza Cloud still reported `cloud disconnected` or a lack of responses afterward.

## Runtime issues seen by testers

- Report: "no buttons work".
- Report: after connecting Eliza Cloud, Milady still does not respond.
- Reported on macOS by more than one tester.
- Team discussion also called out validating that plugins, settings, and configurables both work and persist.

## Packaging and release feedback

- Windows was at least able to install and start for one tester, but the public release page shape is confusing.
- macOS Apple Silicon and Intel coverage is still under active fix.
- GitHub download speed and reliability are becoming a recurring tester complaint.

## Follow-up buckets

- Fix provider onboarding and auth UX.
- Fix post-cloud-connect response path on macOS.
- Verify button wiring and disabled-state handling across the shell.
- Verify plugin/settings/config persistence.
- Decide and implement first-run experience-mode selection.

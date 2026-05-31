US Email Automation - Local Testing

This project includes a US-only email automation that is disabled by default to prevent accidental sends.

Dry-run (default, safe):
- Ensure SENDGRID_API_KEY is unset or ENABLE_EMAIL_US=false.
- Run tests locally which execute the send flow in dry-run mode:

  npm test

Actual sends (use carefully):
- Set the SendGrid API key and enable sends:

  export SENDGRID_API_KEY="<your_key>"
  export ENABLE_EMAIL_US=true
  export EMAIL_FROM="Your Name <you@example.com>"

- Run the specific script or test that performs a live send.

Notes:
- Never commit real API keys to the repository.
- For CI or production, set these env vars securely in your environment or secrets store.

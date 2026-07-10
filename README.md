# SteepleFlow

A multi-church roster management system built for GitHub Pages, Google Apps Script, and Google Sheets.

## Frontend

Set `API_URL` at the top of `app.js` to the deployed Google Apps Script `/exec` URL, then serve the repository with a static web server. A new installation starts with no churches, cycles, participants, or assignments.

## Google Apps Script setup

1. Create a Google Sheet to use as the database.
2. Open **Extensions > Apps Script** from the Sheet.
3. Add `gas/Code.gs` and replace the generated manifest with `gas/appsscript.json`.
4. Run `setupDatabase()` once from the Apps Script editor and approve the requested Sheet permissions.
5. In **Project Settings > Script Properties**, add `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL`, and `INITIAL_ADMIN_PASSWORD`. Use a unique password of at least 10 characters.
6. Run `configureSuperAdmin()` once. It creates or replaces the super-admin and removes `INITIAL_ADMIN_PASSWORD`.
7. Choose **Deploy > New deployment > Web app**. Execute as yourself and allow access to anyone. Participant links require anonymous API access; authorization is enforced in the application layer.
8. Copy the `/exec` deployment URL into `API_URL` at the top of `app.js`.
9. Commit `index.html`, `styles.css`, and `app.js`, then enable GitHub Pages for the repository branch.

Each Apps Script code update requires creating a new deployment version. Keep the same deployment URL when editing the existing deployment.

## Security model

- Admin passwords are stored as salted SHA-256 hashes, never plaintext.
- Successful logins receive random 12-hour session tokens stored in a dedicated Sheet.
- Every private API action validates the session, role, and church ownership.
- Participant and published roster URLs use long random tokens and expose only cycle-scoped public data.
- API writes use a script lock to avoid concurrent Sheet row corruption.
- The public roster response excludes participant email addresses and availability notes.

For a higher-risk or larger deployment, move identity to Google Identity Services or Firebase Auth and keep Sheets only as an operational export. Apps Script and Sheets are appropriate for modest church networks, but they are not a general-purpose high-concurrency database.


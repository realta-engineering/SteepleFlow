# SteepleFlow

A multi-church roster management system built for GitHub Pages, Google Apps Script, and Google Sheets.

## Demo

Open `index.html` directly or serve the directory with any static server. Demo mode is enabled while `API_URL` in `app.js` is blank.

- Church admin: `grace@demo.com` / `grace123`
- Super-admin: `super@demo.com` / `admin123`
- Participant form: `#join/join-GR8AUG26`
- Published roster: `#published/roster-GR8AUG26`

Demo data is stored in browser `localStorage`. Use the browser console command below to restore the original demo state:

```js
localStorage.removeItem("steepleflow_state"); location.reload();
```

## Google Apps Script setup

1. Create a Google Sheet to use as the database.
2. Open **Extensions > Apps Script** from the Sheet.
3. Add `gas/Code.gs` and replace the generated manifest with `gas/appsscript.json`.
4. Run `setupDatabase()` once from the Apps Script editor and approve the requested Sheet permissions.
5. Change the seeded super-admin password by running `setAdminPassword("super@demo.com", "a-long-unique-password")` from the editor.
6. Choose **Deploy > New deployment > Web app**. Execute as yourself and allow access to anyone. Participant links require anonymous API access; authorization is enforced in the application layer.
7. Copy the `/exec` deployment URL into `API_URL` at the top of `app.js`.
8. Commit `index.html`, `styles.css`, and `app.js`, then enable GitHub Pages for the repository branch.

Each Apps Script code update requires creating a new deployment version. Keep the same deployment URL when editing the existing deployment.

## Security model

- Admin passwords are stored as salted SHA-256 hashes, never plaintext.
- Successful logins receive random 12-hour session tokens stored in a dedicated Sheet.
- Every private API action validates the session, role, and church ownership.
- Participant and published roster URLs use long random tokens and expose only cycle-scoped public data.
- API writes use a script lock to avoid concurrent Sheet row corruption.
- The public roster response excludes participant email addresses and availability notes.

For a higher-risk or larger deployment, move identity to Google Identity Services or Firebase Auth and keep Sheets only as an operational export. Apps Script and Sheets are appropriate for modest church networks, but they are not a general-purpose high-concurrency database.


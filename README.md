# ACS TONMOY STUDIO

## Included
- `index.html` — public video studio
- `admin.html` — authenticated admin console
- `Server.js` — Express API and server
- `package.json` — runtime dependencies

## Run locally
1. Install Node.js 18 or newer.
2. In this folder run `npm install`.
3. Set environment variables before starting:
   - `ADMIN_USERNAME` — choose a unique admin username
   - `ADMIN_PASSWORD` — use a long, unique password
   - `SESSION_SECRET` — a long random secret (at least 32 characters)
   - `PORT` — optional; defaults to 3000
4. Run `npm start`.
5. Open `http://localhost:3000` and `http://localhost:3000/admin.html`.

Example (Linux/macOS shell; replace all sample values):
```sh
export ADMIN_USERNAME='your-admin'
export ADMIN_PASSWORD='replace-with-a-long-unique-password'
export SESSION_SECRET='replace-with-a-long-random-secret-value'
npm install
npm start
```

## Google Drive videos
Upload a video to Drive, set General access to "Anyone with the link", copy the share link, then publish it from Admin. Drive's preview player is used; some file types or account settings may prevent embedding. This site does not upload videos to Drive.

## Important limitations
- The app uses a local JSON file (`studio-data.json`) for data. Free hosting instances may restart or use ephemeral storage, so records/views may not persist. Use a persistent disk or database for production.
- View count increments after a correct password is submitted. It counts successful unlocks, not unique people or verified watch duration.
- Password rotation happens every 10 minutes on the running server. The admin panel displays the current password; share the new password with intended viewers after rotation. The old password stops working.
- This starter has username/password admin login, not Google/Gmail OAuth. Never place your Gmail password in `Server.js`. If you specifically need Google sign-in, configure a proper OAuth flow separately.
- This is a starter project, not a hardened production service. Add login rate limiting, persistent session storage, backups, and HTTPS before public production use.
- The app only embeds Drive content. Google Drive sharing permissions still apply.

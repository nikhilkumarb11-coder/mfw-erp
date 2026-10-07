# Madeena Grand Fireworks ERP

Static web app (GitHub Pages) + Google Apps Script API + Google Sheets database.
No build step: edit files, commit, push.

```
index.html            app shell (sidebar, bottom nav, login)
config.js             company name, logo, API URL  ← edit this
css/vendor/           Sneat CSS, re-coloured by tools/retheme.ps1
css/app.css           app styles
js/                   util, db (IndexedDB), store, api (+ auth, sync), ui, app
js/views/             one file per screen
apps-script/Code.gs   backend (copy of what runs inside the Sheet)
```

## One-time setup (about 15 minutes)

### 1. Google Sheet + Apps Script
1. Create a new Google Sheet (start with a **test** Sheet, e.g. "MFW ERP – Test").
2. **Extensions → Apps Script**. Delete the sample code, paste all of `apps-script/Code.gs`, save.
3. **Project Settings** (gear icon) → Time zone → **(GMT+05:30) India Standard Time**.
4. Back in the editor, choose the function **`setup`** in the toolbar and click **Run**. Approve the permissions prompt
   (Advanced → Go to project → Allow). This creates all tabs and headers.
5. Reload the Sheet. A new **MFW ERP** menu appears → **Set app password**.
6. **Deploy → New deployment** → type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy, then copy the **Web app URL** (ends in `/exec`).
7. Paste that URL into `config.js` → `apiUrl`.

When `Code.gs` changes later: paste the new code, save, then **Deploy → Manage deployments → Edit (pencil) →
Version: New version → Deploy**. The URL stays the same.

### 2. GitHub Pages
1. Create a repository on GitHub (public, unless you have a paid plan).
2. From this folder:
   ```
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. Repository → **Settings → Pages** → Source: **Deploy from a branch** → Branch **main**, folder **/ (root)** → Save.
4. After a minute the app is live at `https://<you>.github.io/<repo>/`.

### Releasing a change
Bump every `?v=N` in `index.html` and `VERSION` in `sw.js` to the same new number, then commit and push.
The app keeps its files on each device (service worker), so without the bump phones keep the old version;
with it, open apps show "A new version of the app is ready — Reload".

The service worker is off on `localhost` so local edits show immediately; set `localStorage.mfw_sw = 1` to test it.

## Changing the accent colour
```
powershell -ExecutionPolicy Bypass -File tools\retheme.ps1 -Primary "#c2185b"
```
Then update `--mfw-primary` in `css/app.css` and `theme-color` in `index.html`.

## How data flows
- On login the app downloads everything once (except Aadhar numbers) into IndexedDB; every screen reads from there.
- Saves show instantly and go into an outbox that syncs in the background ("Saving… / Saved / Offline" pill).
- Every 45 s (while the tab is visible) the app pulls only rows changed since the last sync.
- The server serialises writes with a lock, assigns all document numbers (O-0001, R-0001, Q-0001, AG-0001, MM/YYYY/001)
  and rejects an edit if someone else changed the same record first.
- Rows are never deleted, only marked `is_deleted = TRUE`.
- Edit data through the app. If you edit the Sheet by hand, use Settings → **Reload all data** on each device.

## Security notes
- The password and signing secret live in Apps Script **Script Properties**, never in this repo.
- **MFW ERP → Log out all devices** invalidates every session immediately.
- Keep the Sheet private; don't share it beyond the owner.

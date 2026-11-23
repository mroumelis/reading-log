# READ.LOG

A tiny reading timer + log for your iPhone Home Screen, dressed as a vintage 1-bit Mac
with a pixel mouse for company. Pick what you're reading, hit START, hit STOP when you're
done, and log it. It works toward a daily goal (1 hour by default), works offline, and
keeps all data on your phone.

No frameworks, no build step: just `index.html`, `manifest.webmanifest`, `sw.js`,
`icons/`, and `fonts/` (Silkscreen + VT323, bundled locally — see `fonts/README.md`).

---

## Put it online with GitHub Pages (free)

You need a free GitHub account.

1. **Create an empty repository on GitHub.**
   Go to <https://github.com/new>, name it `reading-log` (any name works), leave
   "Add a README" **unchecked**, and click **Create repository**.

2. **Push this folder to it.** In Terminal (replace `YOUR-USERNAME`):

   ```bash
   cd ~/reading-log
   ```

   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/reading-log.git
   ```

   ```bash
   git push -u origin main
   ```

   (If you already pushed an earlier version, just run `git push`.)

3. **Turn on Pages.** On the repository page: **Settings → Pages**. Under
   "Build and deployment", set **Source: Deploy from a branch**, **Branch: `main`**,
   folder **`/ (root)`**, and click **Save**.

4. **Wait a minute or two**, then refresh that Settings → Pages screen. It shows your URL:
   `https://YOUR-USERNAME.github.io/reading-log/`

All paths in the app are relative, so it works under the `/reading-log/` subpath (or
whatever you named the repo).

## Install it on your iPhone

1. Open the URL above in **Safari** (it has to be Safari for "Add to Home Screen" to
   make a proper app).
2. Tap the **Share** button (square with an arrow).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open **Read.Log** from your Home Screen. It runs full-screen and works offline.

### ⚠️ Where your data lives

- The Home Screen app has **its own storage, separate from Safari**. Anything you log
  in a Safari tab won't show up in the installed app (and vice versa). **Do all your
  logging in the installed app.**
- Data lives **only on your phone**. Deleting the app from your Home Screen deletes its
  data too.
- **Back up now and then:** BOOKS tab → PREFS.CFG → **EXPORT** → *Save to Files*
  (iCloud Drive is a good spot). To restore: **IMPORT** and pick that file.

## Updating an installed copy (e.g. this restyle)

The app updates itself in the background, but the **Home Screen icon and name only
change when you re-add it**, and re-adding wipes the app's data. So:

1. In the **installed** app: **EXPORT** a backup (BOOKS → PREFS.CFG) and save it to Files.
   Do this *before* pushing the update if you can; it works either way, because your
   data format hasn't changed.
2. Push the new version (`git push`) and wait a minute or two for GitHub Pages.
3. Long-press the old Home Screen icon → **Remove App** → **Delete from Home Screen**.
4. In Safari, open your URL, pull down to refresh, then Share → **Add to Home Screen**.
5. Open the new app → BOOKS → PREFS.CFG → **IMPORT** → pick your backup.

If you don't care about the new icon, you can skip all that: just open the installed app
twice (once to download the update in the background, once to see it).

Developer note: whenever you change files, bump the cache name in `sw.js`
(`reading-log-v2` → `reading-log-v3`) so old files are cleared out.

## How it works

- **Home (READING.EXE).** Choose BOOK / ARTICLE / POEM, type or tap a title (saved
  books and recent articles/poems show as chips; **+ NEW** clears the field). For a book
  you've logged before it says **PICK UP AT p.NN**. Tap **START**.
- **Running.** The mouse reads; the CRT counts up from 00:00 with no cap. The timer is
  based on timestamps, so it keeps counting if your phone locks or you close the app.
  **STOP** ends the chunk (there's no pause — each chunk is one start/stop).
- **SAVE_SESSION.** Shows the time read. For books: start page (prefilled with your last
  end page for that book) → end page, and "= N PAGES THIS SESSION". Optional note.
  **SAVE** logs it; **DISCARD** throws the time away. If you close the app on this screen,
  it's still there (with what you typed) when you come back.
- **TODAY'S LOG.** Today's sessions, with today's total vs. goal in the title bar
  (e.g. `38/60 MIN`, counting the running chunk). When you cross the goal the mouse
  cheers once — right away if the app is open, otherwise the next time you open Home.
- **Midnight.** If a chunk runs past midnight, the minutes before midnight count toward
  yesterday and the rest toward today.
- **HISTORY.** The last 7 days (rose = goal hit, checkerboard = partial, empty = missed),
  streak and week total, and LOG.TXT grouped by day. Tap any row to edit or delete it.
- **BOOKS.** Total time, last page and session count per book; add or archive books.
  PREFS.CFG has the daily goal and export/import.

## For tinkering

- **Run it locally:** `python3 -m http.server 8765` in this folder, then open
  <http://localhost:8765>.
- **Tests:** `npm test` (needs Node 18+). Covers the timer (reload while running,
  STOP-without-saving, discard, crossing the goal, crossing midnight and a DST night),
  page prefill, streaks, the mouse grid and its moods, and loading damaged or imported
  data. The tested logic lives in `index.html` between `/*CORE-START*/` and `/*CORE-END*/`.
- **Icons:** `npm run icons` redraws the PNGs from the mouse grid in `index.html`
  (nearest-neighbour, whole pixels per cell).
- **Storage:** `localStorage` keys `readinglog.data` (schema-versioned, unchanged from
  v1), `readinglog.timer`, plus small UI keys (`readinglog.draft`, `.saveform`,
  `.cheered`). If saved data is ever unreadable, the raw copy is kept under
  `readinglog.data.corrupt.<time>` and the app starts fresh instead of crashing.

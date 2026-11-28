# READ.LOG

A tiny reading timer + log for your iPhone Home Screen, dressed as a vintage 1-bit Mac
with a pixel mouse for company (and an accent color you pick: Game Boy green by default). Pick what you're reading, hit START, hit STOP when you're
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
- **Back up now and then:** SETTINGS tab → **EXPORT DATA [ JSON ]** → *Save to Files*
  (iCloud Drive is a good spot). To restore: **RESTORE BACKUP [ IMPORT ]** and pick that file.

## Updating an installed copy (e.g. this restyle)

The app updates itself in the background, but the **Home Screen icon and name only
change when you re-add it**, and re-adding wipes the app's data. So:

1. In the **installed** app: **EXPORT** a backup (SETTINGS → EXPORT DATA) and save it to Files.
   Old backups still import fine: the app upgrades them automatically.
2. Push the new version (`git push`) and wait a minute or two for GitHub Pages.
3. Long-press the old Home Screen icon → **Remove App** → **Delete from Home Screen**.
4. In Safari, open your URL, pull down to refresh, then Share → **Add to Home Screen**.
5. Open the new app → SETTINGS → **RESTORE BACKUP** → pick your backup.

If you don't care about the new icon, you can skip all that: just open the installed app
twice (once to download the update in the background, once to see it).

Developer note: whenever you change files, bump the cache name in `sw.js`
(`reading-log-v4` → `reading-log-v5`) so old files are cleared out.

## How it works

- **Home (READING.EXE).** Choose BOOK / ARTICLE / POEM, type or tap a title (saved
  books and recent articles/poems show as chips; **+ NEW** clears the field). For a book
  you've logged before it says **PICK UP AT p.NN**. Tap **START**.
- **Running.** The mouse reads; the CRT counts up from 00:00 with no cap. The timer is
  based on timestamps, so it keeps counting if your phone locks or you close the app.
  **PAUSE** freezes it for a break (the mouse holds still); **RESUME** carries on in the
  same session, and break time doesn't count. **STOP** ends the session and opens the
  save screen. A paused session survives closing the app, and counts for the day it
  started.
- **SAVE_SESSION.** Shows the time read. For books, a PAGES field prefilled with where you
  left off (e.g. `80-`); finish it as `80-95`. It also takes several ranges and roman
  numerals (`xi-xxxi, 3-32`) and shows "= N PAGES THIS SESSION" (each range counts
  end − start + 1). An optional PAGES READ number overrides the count. Optional note.
  **SAVE** logs it; **DISCARD** throws the time away. If you close the app on this screen,
  it's still there (with what you typed) when you come back.
- **TODAY'S LOG.** Today's sessions, with today's total vs. goal in the title bar
  (e.g. `38/60 MIN`, counting the running chunk). When you cross the goal the mouse
  cheers once — right away if the app is open, otherwise the next time you open Home.
- **The day starts at 3:00 AM** (SETTINGS → DAY STARTS AT, adjustable by the hour).
  Reading at 12:37 AM still counts for the day before, and the header shows that date.
  A timed session counts entirely for the day it *started*, even if it runs past 3 AM.
  Manual entries keep the date you gave them, even if you change the setting later.
- **Pick up at p.NN** comes from the last arabic page of the most recent entry for that
  book, by date (not by when you typed it in), so backdating an old entry never moves it.
  Roman-numeral front matter never counts as the pickup page.
- **HISTORY.** **+ ADD ENTRY** logs reading you didn't time (date, kind, title, minutes
  with − / + and 15/30/45/60 shortcuts, pages, note; **SAVE + ADD ANOTHER** keeps the date
  and book). Each day bar in LOG.TXT has a **+** for adding to that day. Manual entries
  show a MANUAL tag and sit below that day's timed sessions. Then the last 7 days
  (rose = goal hit, checkerboard = partial, empty = missed), streak and week total. Tap
  any row to edit or delete it.
- **BOOKS.** Total time, last page and session count per book; add or archive books.
- **SETTINGS.** ACCENT_COLOR picks the accent (yellow, green, blue, red, or mono for
  all-gray); it colors the book the mouse reads, buttons, the timer and streaks, and is
  saved on the phone (`readlog.accent`). PREFERENCES has the daily goal, day start, **EXPORT**, **IMPORT** (replaces everything
  with a backup), **IMPORT ENTRIES** (merges a file in: only adds entries whose ids
  aren't already there, so it's safe to run twice) and **LOAD BACKFILL.JSON** (merges the
  `backfill.json` shipped with the app: Nov 15–22, 2026).

## For tinkering

- **The mouse** is a 14×16 grid in `index.html` with sleep / read / cool moods (cool =
  sunglasses once today's goal is hit). The home scene has a pixel bookshelf.
- **Run it locally:** `python3 -m http.server 8765` in this folder, then open
  <http://localhost:8765>.
- **Tests:** `npm test` (needs Node 18+, runs in America/Chicago time). Covers the 3 AM
  day boundary (12:37 AM, 2:59 vs 3:00, both DST nights), roman numerals and page ranges,
  pickup-page ordering with backdated entries, idempotent import, the backfill totals and
  streak, the timer (reload while running, STOP-without-saving, discard), v1 → v2 data
  migration, and the mouse grid. The tested logic lives in `index.html` between `/*CORE-START*/` and `/*CORE-END*/`.
- **Icons:** `npm run icons` redraws the PNGs from the mouse grid in `index.html`
  (nearest-neighbour, whole pixels per cell). The shipped icons still show the older
  mouse; regenerating them means re-adding the Home Screen app to see the change.
- **Storage:** `localStorage` keys `readinglog.data` (schema 2; v1 data and backups are
  upgraded on load), `readinglog.timer`, plus small UI keys (`readinglog.draft`, `.saveform`,
  `.cheered`). If saved data is ever unreadable, the raw copy is kept under
  `readinglog.data.corrupt.<time>` and the app starts fresh instead of crashing.

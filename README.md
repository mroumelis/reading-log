# Reading Log 📖

A small, cozy reading timer + log for your iPhone Home Screen. Time your reading in
start/stop chunks through the day, log what you read, and work toward a daily goal
(1 hour by default). It works offline and keeps all data on your phone.

No frameworks, no build step: just `index.html`, `manifest.webmanifest`, `sw.js`, and `icons/`.

---

## Put it online with GitHub Pages (free)

You need a free GitHub account. Everything below happens in your web browser plus a few
Terminal commands.

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

   (The folder is already a git repo with everything committed.)

3. **Turn on Pages.** On the repository page: **Settings → Pages**. Under
   "Build and deployment", set **Source: Deploy from a branch**, **Branch: `main`**,
   folder **`/ (root)`**, and click **Save**.

4. **Wait a minute or two**, then refresh that Settings → Pages screen. It shows your URL:
   `https://YOUR-USERNAME.github.io/reading-log/`

All paths in the app are relative, so it works fine under the `/reading-log/` subpath
(or whatever you named the repo).

## Install it on your iPhone

1. Open the URL above in **Safari** (it has to be Safari for "Add to Home Screen" to
   make a proper app).
2. Tap the **Share** button (square with an arrow).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open **Reading Log** from your Home Screen. It runs full-screen, like a normal app,
   and works offline.

### ⚠️ Important: where your data lives

- The Home Screen app has **its own storage, separate from Safari**. Anything you log
  in the Safari tab won't show up in the installed app (and vice versa). **Do all your
  logging in the installed app.**
- Data lives **only on your phone**. If you delete the app from your Home Screen, its
  data goes with it.
- **Back up now and then:** gear icon → **Export** → *Save to Files* (iCloud Drive is a
  good spot). To restore, gear → **Import** and pick that file. The Settings screen tells
  you how long ago your last backup was.

## How it works

- **Timer.** Counts up. Start → Pause / Resume → **Finish** opens the log sheet.
  It's based on timestamps, not ticking, so it stays accurate if your phone locks or you
  close the app. You can even quit the app mid-chunk and it'll still be running when you
  come back.
- **Ring.** Shows today's total (saved sessions + the running chunk) toward your goal.
  Past the goal, a second "bonus lap" ring starts and the label reads e.g.
  *"1h 12m — bonus time!"*. You get confetti once a day when you cross the goal.
- **Logging.** Book / Article / Poem. Books are remembered in your library: tap a chip
  instead of retyping, and the start page fills in from the last end page you logged
  for that book. Articles and poems show your recent titles as chips too. You can adjust
  the time before saving, or discard the chunk.
- **Midnight.** If a chunk runs past midnight, the minutes before midnight count toward
  yesterday and the rest toward today.
- **History.** Days grouped with totals, a 7-day strip (✓ = goal hit, a partial ring
  otherwise), and your current streak (today not being finished yet doesn't break it).
  Tap any entry to edit or delete it.
- **Books.** Total time, last page, and session count per book. Add books ahead of time
  or archive finished ones (archived books keep their history and can be restored).

## Updating the app later

After you change any file, open `sw.js` and bump the cache name
(`reading-log-v1` → `reading-log-v2`), then commit and push. The installed app picks up
the new version the next time it's opened (sometimes the time after, since the offline
copy loads first and updates in the background).

## For tinkering

- **Run it locally:** `python3 -m http.server 8765` in this folder, then open
  <http://localhost:8765>.
- **Tests:** `npm test` (needs Node 18+). Covers the timer (pause/resume, reload while
  running, crossing 60 minutes, crossing midnight and a DST night), the page prefill,
  streaks, and loading damaged or imported data. The tested logic lives in
  `index.html` between `/*CORE-START*/` and `/*CORE-END*/`.
- **Icons:** `npm run icons` regenerates the PNGs from `tools/make-icons.mjs`.
- **Storage:** `localStorage` keys `readinglog.data` (schema-versioned) and
  `readinglog.timer`. If saved data is ever unreadable, the app keeps the raw copy under
  `readinglog.data.corrupt.<time>` and starts fresh instead of crashing.

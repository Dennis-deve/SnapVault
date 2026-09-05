# What changed, and how to push it

## 0. Cloudinary "empty response" / upload failures

**Bug A — the Cloudinary v2 callback was misread.**
Correction to the earlier notes: the app imports Cloudinary's **v2** API,
which calls `callback(undefined, result)` on success and `callback(error)`
on failure. The **internal v1** uploader uses a single result argument; the
v2 adapter converts it to the error-first form before our code sees it.

The previous single-argument handler discarded the actual success result
and treated the absent error argument as an empty response. This reproduced
`Cloudinary upload returned empty response - env present cloud_name=true
api_key=true api_secret=true` even though the upload had succeeded upstream.
It was a callback-handling bug, not an environment-variable naming change.

`uploadToCloudinary()` now reads both arguments for images and chunked video
uploads. It keeps upstream failures as **502** responses with Cloudinary's
reason and diagnostic hint. It also sets `disable_promises: true` because the
helper already wraps the callback in its own Promise; otherwise the SDK can
reject an unused internal Promise and cause an unhandled rejection.

**Bug B — "album not found" and "not your album" were both 403.**
`POST /api/upload` (plus the legacy `/api/media` and `batch-move`) collapsed
two different failures into one bare `403 Forbidden`: the `albumId` not
existing in the database (a deleted album, or a stale bookmark/URL after a
database reset/redeploy) looked identical to "this album belongs to someone
else." That is exactly the undiagnosable 403 you were seeing. They are now
split: missing album → **404 "Album not found"**, foreign album → **403
"You can only upload to albums you own"** (and the server logs which two user
IDs disagreed, so the Render logs tell you which case fired).

**Client:** `client/src/lib/upload.ts` now turns the server's response into a
readable, actionable message per status code (expired session, wrong account,
album gone, file too large, storage unavailable) instead of dumping the raw
body.

**Tests:** `server/__tests__/upload.test.ts` now uses the v2 error-first
callback contract (image + video), including null/undefined error arguments,
genuinely empty/malformed responses, retry behavior, and temp-file cleanup.
`server/__tests__/cloudinary-sdk.test.ts` exercises the **installed SDK** with
only HTTPS transport stubbed, so incorrect uploader mocks cannot hide this
regression again. It covers images, multi-chunk videos, upstream errors, and
retries without real credentials or external uploads. The existing
Cloudinary-error→502 mapping and 404-vs-403 album checks remain covered.

**Render environment names (unchanged):** set these on the backend
`snapvault-api` service, not only on the frontend static site:

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

These match `server/cloudinary.ts`, `render.yaml`, and `.env.example`.
The old `cloud_name` / `api_key` / `api_secret` labels were SDK option names,
not alternate Render variable names. The presence diagnostic now uses the
full environment-variable names and booleans only. `true` confirms a value
is present; it does **not** validate the credentials. No secret rotation or
renaming is required for this callback fix. `CLOUDINARY_AUTH_TOKEN_KEY` is
optional and unrelated to this upload error.

**What to do when you redeploy:**
1. Deploy the corrected backend code to the `snapvault-api` service (merge
   this branch into the branch Render deploys, then redeploy if auto-deploy is
   disabled). Restarting the old code or rebuilding only the frontend will
   not apply this fix.
2. Retry an upload from an album that exists in your *current* account.
   - If it succeeds — done.
   - If you now get a clear **404** — that album no longer exists in the
     database (common after a DB reset). Go back to your album list, pick a
     live album, and retry.
   - If you get a **502** naming Cloudinary (e.g. "Unknown account",
     "Invalid API Key", "Insufficient permissions") — the Cloudinary
     credentials/plan in the Render env vars need attention
     (`CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`).
   - If you get **403 "You can only upload to albums you own"** — you're
     logged in as a different account than the one that owns the album; log
     out and log back in as the right one.

---

## 1. Large mobile video uploads (reliability fix)

**Before:** `multer.memoryStorage()` loaded an entire uploaded file into a
single in-memory `Buffer` before your server ever started sending it to
Cloudinary. A 100–200MB phone video means a 100–200MB buffer sitting in
Node's heap, and on a small hosting instance (Render/Railway free tiers)
that's often enough on its own to hit the memory ceiling — worse with more
than one upload happening at once. This is exactly the kind of upload
phones commonly produce, so it was a real, likely-to-be-hit failure mode,
not an edge case.

**Fix — stream to disk, then chunk-upload from disk:**
- `server/routes/shared.ts`: `multer` now uses `diskStorage` instead of
  `memoryStorage`. Bytes are written to a temp file (in the OS temp dir) as
  they arrive over the network, so server memory usage stays flat no matter
  how large the file is.
- `uploadToCloudinary()` now takes a file **path** instead of a `Buffer`.
  Videos are uploaded with Cloudinary's `upload_large`, which reads the file
  back off disk in bounded chunks (6MB at a time) and uploads chunk-by-chunk
  — this is Cloudinary's documented, recommended method for large/video
  assets, and it's also more resilient to flaky mobile connections than one
  giant request. Images (always small after client-side compression) still
  use a normal single-shot upload.
- The temp file is deleted once the upload settles — success or failure —
  and there's a defensive cleanup in the route handler too, so a temp file
  never gets orphaned on disk even if the request is rejected before
  reaching Cloudinary (e.g. an ownership check failing).

No client-side changes were needed for this — the browser still posts a
normal `multipart/form-data` request; the fix is entirely in how the server
handles what it receives.

*(Note: I deliberately did not add local video transcoding/compression,
e.g. via ffmpeg. That would add a new native binary dependency your hosting
provider would need to support, plus real CPU cost per upload on an already
small instance — trading a memory risk for a CPU/deployment risk. The
disk-streaming + chunked-upload approach above removes the memory problem
without that trade-off. Cloudinary's own `quality: 'auto:best'` /
`video_codec: 'auto'` settings, already in place, continue to optimize the
stored/delivered file.)*

## 2. Public sharing flow gap

**Before:** Sharing an album required it to be unlocked first, but nothing
stopped the reverse: locking an album that was **already** publicly shared.
The public read routes (`/api/public/albums/:shareToken` and
`.../media`) only ever checked `isPublic`, never `isLocked` — so a shared
album that got locked afterward kept serving its contents to anyone who had
the link, with no PIN required at all. The lock only affected the
authenticated `/api/albums/:id` routes, not the public ones.

**Fix:**
- `server/routes/albums.routes.ts`: locking an album (`POST
  /api/albums/:id/lock`) now also turns off its public sharing if it was on,
  the same way sharing already requires the album to be unlocked. The share
  token itself is kept (same convention as unsharing), so re-sharing after
  a later unlock reuses the same link instead of minting a new one.
- `server/routes/public.routes.ts`: both public read routes now also check
  `!album.isLocked` directly, as a defense-in-depth measure — so even if a
  future code path or a stale row ever violated the invariant above, a
  locked album still could not be served publicly.
- Added `server/__tests__/public-share-lock.test.ts`, which shares an
  album, confirms the public link works, locks the album, and asserts the
  same link now 404s.

## Files touched

```
server/routes/shared.ts                    (disk-based upload + chunked Cloudinary upload)
server/routes/media.routes.ts              (pass file path instead of buffer; cleanup)
server/routes/albums.routes.ts             (locking revokes public sharing)
server/routes/public.routes.ts             (defense-in-depth isLocked check)
server/__tests__/public-share-lock.test.ts (new regression test)
```

Nothing else was modified — no other routes, components, schemas, or
configs were touched, and the full existing test suite (`npx vitest run`)
plus a full TypeScript typecheck (`npx tsc --noEmit`) both pass.

---

## How to push these changes to your GitHub repo

You said this is your existing project, so the folder here does **not**
include a `.git` directory (it was working-copy files only). Pick whichever
of these matches your situation:

### A) You already have this project pushed to GitHub

1. Unzip this archive somewhere, then copy the changed files listed above
   into your existing local clone of the repo (overwriting the old
   versions), or just copy the whole folder over your working copy if
   you're not tracking anything else locally that isn't in this zip.
2. From inside your local repo:
   ```bash
   git status                 # confirm only the expected files show as changed
   git add server/routes/shared.ts server/routes/media.routes.ts \
           server/routes/albums.routes.ts server/routes/public.routes.ts \
           server/__tests__/public-share-lock.test.ts
   git commit -m "Fix in-memory video upload buffering and public-share/lock gap"
   git push origin main        # or whatever your default branch is called
   ```
3. If you deploy on Render/Railway/Vercel from GitHub, pushing to the
   connected branch will trigger a redeploy automatically — no other config
   changes are needed. If you deploy manually, redeploy as you normally
   would after this push.

### B) This is a fresh copy and you want to initialize a new repo

1. Unzip this archive.
2. From inside the unzipped folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit with reliability and sharing fixes"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
   (Create the empty repo on GitHub first if it doesn't exist yet, via
   github.com → New repository — don't initialize it with a README so
   there's no merge conflict on first push.)

### Before pushing either way

- Double check `.env` is **not** committed (it's already in `.gitignore`).
  Your Cloudinary/database secrets belong in your hosting provider's
  environment variable settings, not in the repo.
- Run the test suite locally once more if you want extra confidence:
  ```bash
  npm install
  npx vitest run
  npx tsc --noEmit
  ```

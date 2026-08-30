# Deploying these changes

This covers taking the code in this zip from "files on disk" to "running app
with your changes live," including the new database columns/tables and
Google Sign-In setup.

## 1. Unzip and install

```bash
unzip SnapVault-fixed.zip
cd SnapVault-main
npm install
```

## 2. Set environment variables

Copy `.env.example` to `.env` and fill in at minimum:

- `DATABASE_URL` — your Postgres connection string
- `SESSION_SECRET` and `JWT_SECRET` — generate with `openssl rand -base64 48`
  (the app will now refuse to start in production without these — see
  "Security fixes" below)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

Everything else in `.env.example` is optional (Google Sign-In, email, custom
storage quota) — the app runs fine without them, those features just stay
off.

## 3. Push the schema changes to your database

This round of work added several columns and tables:

- `media.isFavorite` (favorites feature)
- `media.cloudinaryPublicId`, `media.cloudinaryResourceType` (signed Cloudinary delivery)
- `search_history` table (recent searches feature)
- `users.googleId` column + `users.password` made nullable (Google Sign-In)
- `users.publicSharingEnabled` (public album sharing kill switch)
- `albums.isPublic`, `albums.shareToken` (public album sharing)
- `email_change_tokens` table (verified email-change flow)

Apply them with Drizzle:

```bash
npm run db:push
```

If `drizzle-kit push` prompts you about the `password` column becoming
nullable, confirm — this is expected (Google-only accounts have no local
password). It will not touch or clear any existing passwords.

**Note on existing media:** the switch to Cloudinary's signed "authenticated"
delivery type only applies to files uploaded *after* this change. Anything
uploaded before it keeps working exactly as before (plain public URL) — the
app detects which kind each file is per-row and handles both. If you want
existing files upgraded to signed delivery too, that's a manual Cloudinary
asset migration (`rename` with `to_type: 'authenticated'`) not included here,
since it touches production data and I didn't have a real Cloudinary account
to test it against.

## 4. Run it

**Local development:**
```bash
npm run dev
```
Opens on http://localhost:5000 (client + API on the same port in dev).

**Production build:**
```bash
npm run build
npm run start
```
This runs `vite build` (client) + `esbuild` (server) into `dist/`, then
serves it with `NODE_ENV=production node dist/index.js`.

**If you deploy to Render/Railway/Fly/etc.:** point the build command at
`npm run build` and the start command at `npm run start`, set the env vars
from step 2 in that platform's dashboard, and run `npm run db:push` once
(either locally against the prod `DATABASE_URL`, or via a one-off shell on
the platform) before or right after the first deploy.

## 5. Set up "Continue with Google" (optional)

1. Go to the [Google Cloud Console credentials page](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** (application type: **Web application**).
3. Under **Authorized redirect URIs**, add:
   - `https://your-deployed-domain.com/api/auth/google/callback` (production)
   - `http://localhost:5000/api/auth/google/callback` (local dev, if you
     want to test it locally too)
4. Copy the generated **Client ID** and **Client Secret** into your `.env`
   as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Restart the server. The "Continue with Google" button will now appear on
   Login and Signup automatically — it's hidden by default when these
   aren't set, rather than showing a broken button.

No code changes needed beyond this — the button self-detects via
`GET /api/auth/google/status`.

## 7. Run the automated tests (optional but recommended)

```bash
npm test
```

Runs a small Vitest + Supertest suite covering the two highest-value
scenarios from the original security review: locked albums can't be read
without a valid unlock token, and the Magic PIN can't be used to log into
the account. These run against an in-memory fake of the storage layer, not
your real database, so they're safe to run anytime without touching data.

## 8. Sanity-check after deploying

- Sign up with email/password, confirm login works.
- Try "Continue with Google" if configured — first time creates an account,
  signing in again with the same Google account logs into the same one.
- If you already have existing users and one of them uses "Continue with
  Google" with the *same email* as an existing password account, it links
  to that existing account automatically (Google has already verified they
  own the email, so this is safe) rather than creating a duplicate.
- Lock an album, log out, log back in, confirm you're asked for the PIN
  again before seeing that album's contents (this is the server-side
  enforcement added in the security pass — worth re-checking after any
  deploy that touches auth).
- Change your email from Settings, confirm you receive (or, without
  RESEND_API_KEY set, see logged to the server console) a verification link,
  and that the account email doesn't change until you click it.
- Turn on Public Sharing in Settings, share an album, and open the link in
  a private/incognito window to confirm it's viewable without logging in —
  then turn Public Sharing off and confirm the same link now 404s.

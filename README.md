# SnapVault

SnapVault is a mobile-first media backup app for organizing and storing photos and videos in the cloud. It combines a React frontend, an Express backend, and a Postgres-backed data layer for uploads, albums, and account management.

## Features

- Upload and browse media by album
- Search across albums and media metadata
- Authenticate with email and password, with optional PIN support
- Manage account settings and password resets
- Deploy as a full-stack app on platforms like Render or Railway

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- Backend: Express, TypeScript, Drizzle ORM, Passport.js
- Data: PostgreSQL via Neon or another compatible provider

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the app:

   ```bash
   npm run dev
   ```

3. Build for production:

   ```bash
   npm run build
   ```

## Environment Variables

Set the following values before running the app:

```bash
DATABASE_URL=postgresql://user:pass@host/db
SESSION_SECRET=change-me
NODE_ENV=development
```

Optional production values:

```bash
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
RESEND_API_KEY=your_resend_key
FROM_EMAIL="SnapVault <noreply@yourdomain.com>"
CLIENT_URL=https://your-domain.example
```

## Deployment

The deployment target for this repository is the app code under the GitHub path https://github.com/Dennis-deve/SnapVault/tree/main/Downloads/SnapVault/SnapVault-main. If you are deploying from a platform such as Render, Railway, or Vercel, set the app root to that folder when configuring the project.

Review the deployment guide in [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for platform-specific setup steps.

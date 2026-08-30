# 🚀 SnapVault Deployment Guide

## Quick Overview

The app code for deployment lives in the GitHub path:
- https://github.com/Dennis-deve/SnapVault/tree/main/Downloads/SnapVault/SnapVault-main

Your app has:
- **Frontend**: React + Vite (TypeScript)
- **Backend**: Express.js + TypeScript
- **Database**: Neon PostgreSQL (already cloud-hosted)
- **Media Storage**: Cloudinary (already cloud-hosted)

## 📋 Recommended Deployment Options

### Option 1: Vercel (Recommended - Easiest) ⭐

**Best for**: Quick deployment, automatic HTTPS, great DX

**Steps**:

1. **Install Vercel CLI**
   ```powershell
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```powershell
   vercel login
   ```

3. **Deploy**
   ```powershell
   vercel
   ```

4. **Set Environment Variables** (in Vercel Dashboard):
   - `DATABASE_URL` - Your Neon PostgreSQL connection string
   - `CLOUDINARY_CLOUD_NAME` - Your Cloudinary cloud name
   - `CLOUDINARY_API_KEY` - Your Cloudinary API key
   - `CLOUDINARY_API_SECRET` - Your Cloudinary API secret
   - `SESSION_SECRET` - Random string for sessions (generate one)

5. **Configure vercel.json** (already set up for you - see below)

**Pros**:
- ✅ Free tier available
- ✅ Automatic HTTPS
- ✅ CDN globally
- ✅ Automatic deployments from Git
- ✅ Zero config for Vite projects

**Cons**:
- ⚠️ Serverless functions (may need adjustments for long uploads)

---

### Option 2: Railway.app (Best for Full-Stack) 🚂

**Best for**: Traditional server deployment, WebSocket support

**Steps**:

1. **Sign up at** [railway.app](https://railway.app)

2. **Install Railway CLI**
   ```powershell
   npm install -g @railway/cli
   ```

3. **Login**
   ```powershell
   railway login
   ```

4. **Initialize Project**
   ```powershell
   railway init
   ```

5. **Add Environment Variables**
   ```powershell
   railway variables set DATABASE_URL="your_neon_url"
   railway variables set CLOUDINARY_CLOUD_NAME="your_cloud_name"
   railway variables set CLOUDINARY_API_KEY="your_api_key"
   railway variables set CLOUDINARY_API_SECRET="your_api_secret"
   railway variables set SESSION_SECRET="random_secret_here"
   ```

6. **Deploy**
   ```powershell
   railway up
   ```

**Pros**:
- ✅ Traditional server (not serverless)
- ✅ Better for file uploads
- ✅ Free $5/month credit
- ✅ Easy database integration

---

### Option 3: Render.com (Balanced Option) 🎨

**Best for**: Free tier, traditional hosting

**Steps**:

1. **Sign up at** [render.com](https://render.com)

2. **Create New Web Service**
   - Connect the GitHub repository that contains the app code under the path `Downloads/SnapVault/SnapVault-main`
   - Set the root directory to `Downloads/SnapVault/SnapVault-main` in your platform settings
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run preview`

3. **Add Environment Variables** (in Render Dashboard):
   - `DATABASE_URL`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
   - `SESSION_SECRET`

**Pros**:
- ✅ Generous free tier
- ✅ Auto-deploy from Git
- ✅ Traditional server

**Cons**:
- ⚠️ Free tier spins down after inactivity

---

### Option 4: Heroku (Traditional Choice) 🟣

**Steps**:

1. **Install Heroku CLI**
   ```powershell
   # Download from https://devcenter.heroku.com/articles/heroku-cli
   ```

2. **Login**
   ```powershell
   heroku login
   ```

3. **Create App**
   ```powershell
   heroku create snapvault-yourname
   ```

4. **Add Environment Variables**
   ```powershell
   heroku config:set DATABASE_URL="your_neon_url"
   heroku config:set CLOUDINARY_CLOUD_NAME="your_cloud_name"
   heroku config:set CLOUDINARY_API_KEY="your_api_key"
   heroku config:set CLOUDINARY_API_SECRET="your_api_secret"
   heroku config:set SESSION_SECRET="random_secret"
   ```

5. **Deploy**
   ```powershell
   git push heroku main
   ```

**Note**: Heroku no longer has a free tier (minimum $5/month)

---

## 🔧 Pre-Deployment Checklist

### 1. **Environment Variables Ready**

Create a `.env.production` file (DON'T commit this):
```env
DATABASE_URL=postgresql://user:pass@host/db
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
SESSION_SECRET=generate_random_string_here
PORT=5000
```

### 2. **Build Test Locally**
```powershell
npm run build
```

Should create a `dist` folder with no errors.

### 3. **Database Migrations**

Your Neon database should already have tables. If not:
```powershell
npx drizzle-kit push
```

### 4. **Update CORS Settings**

In `server/index.ts`, update allowed origins:
```typescript
app.use(cors({
  origin: [
    'http://localhost:5000',
    'https://your-domain.vercel.app',  // Add your domain
  ],
  credentials: true
}));
```

---

## 📁 Required Configuration Files

### `vercel.json` (For Vercel)
```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": null,
  "outputDirectory": "dist/public",
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/index.js"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### `railway.toml` (For Railway)
```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npm run preview"
healthcheckPath = "/"
healthcheckTimeout = 100
restartPolicyType = "on-failure"
restartPolicyMaxRetries = 10
```

### `render.yaml` (For Render)
```yaml
services:
  - type: web
    name: snapvault
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm run preview
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: CLOUDINARY_CLOUD_NAME
        sync: false
      - key: CLOUDINARY_API_KEY
        sync: false
      - key: CLOUDINARY_API_SECRET
        sync: false
      - key: SESSION_SECRET
        generateValue: true
```

---

## 🌐 Custom Domain Setup

### After Deployment (All Platforms):

1. **Get your deployed URL** (e.g., `https://your-app.vercel.app`)

2. **Buy a domain** (Namecheap, GoDaddy, Google Domains)

3. **Configure DNS**:
   - Add CNAME record: `www` → `your-app.vercel.app`
   - Add A record for root domain (IP provided by platform)

4. **Update platform settings**:
   - Add custom domain in dashboard
   - Platform will auto-provision SSL certificate

---

## 🔒 Security Checklist Before Going Live

- [ ] Change `SESSION_SECRET` to a strong random value
- [ ] Enable HTTPS only (most platforms do this automatically)
- [ ] Review CORS settings to only allow your domain
- [ ] Set up rate limiting for API endpoints
- [ ] Review file upload size limits
- [ ] Set up monitoring/error tracking (Sentry, LogRocket)
- [ ] Enable database backups (Neon provides this)
- [ ] Review Cloudinary usage limits

---

## 📊 Monitoring & Analytics

### Add These After Deployment:

1. **Sentry** (Error Tracking)
   ```powershell
   npm install @sentry/react @sentry/node
   ```

2. **Google Analytics** (Usage Analytics)
   - Add GA4 tag to `index.html`

3. **Uptime Monitoring**
   - UptimeRobot (free)
   - Pingdom
   - Better Uptime

---

## 💰 Cost Estimation (Monthly)

### Free Tier (Recommended for Starting):
- **Neon PostgreSQL**: Free (512 MB, 1 database)
- **Cloudinary**: Free (25 GB storage, 25 GB bandwidth)
- **Vercel/Railway/Render**: Free tier available
- **Total**: $0/month ✅

### Production (Low Traffic):
- **Neon**: $0-20
- **Cloudinary**: $0-25
- **Hosting**: $5-10
- **Total**: ~$10-50/month

---

## 🚀 Quick Start: Deploy Now!

**Fastest Method (Vercel)**:

```powershell
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login
vercel login

# 3. Deploy (answer prompts)
vercel

# 4. Set environment variables in Vercel dashboard
# 5. Done! 🎉
```

---

## 📞 Need Help?

**Common Issues**:

1. **Build Fails**: Check `npm run build` locally first
2. **Database Connection**: Verify DATABASE_URL format
3. **File Uploads Fail**: Check Cloudinary credentials
4. **404 Errors**: Configure routing properly (SPA fallback)

**Support Contacts**:
- DESTECH SOLUTIONS: +233 544 216 532
- Platform Support: Check respective documentation

---

## 🎯 Post-Deployment Tasks

1. ✅ Test all features on live site
2. ✅ Test Magic PIN functionality
3. ✅ Upload test photos/videos
4. ✅ Create test albums
5. ✅ Test on mobile devices
6. ✅ Share with test users
7. ✅ Monitor error logs
8. ✅ Set up automated backups

---

**Congratulations! Your SnapVault is ready to go live! 🎉**

Choose your deployment platform and follow the steps above. Vercel is recommended for the easiest start!

# SnapVault - Render.com Deployment Guide

Complete guide to deploy SnapVault on Render.com with PostgreSQL, Cloudinary, and Express + React.

## 📋 Prerequisites

Before deploying, ensure you have:

1. ✅ **GitHub Repository**: Code pushed to https://github.com/Dennis-deve/SnapVault
2. ✅ **Neon PostgreSQL Database**: Get connection string from https://neon.tech
3. ✅ **Cloudinary Account**: Get credentials from https://cloudinary.com/console
4. ✅ **Render Account**: Sign up at https://render.com

---

## 🚀 Deployment Steps

### Step 1: Prepare Database

1. **Go to Neon PostgreSQL Dashboard**
   - Copy your connection string (format: `postgresql://user:password@host/database`)
   - Keep it ready for Render environment variables

### Step 2: Get Cloudinary Credentials

1. **Go to Cloudinary Console**
   - Navigate to Dashboard → Settings → Access Keys
   - Copy these values:
     - Cloud Name
     - API Key
     - API Secret

### Step 3: Deploy to Render

#### Option A: Deploy with Blueprint (Recommended - Uses render.yaml)

1. **Go to Render Dashboard**: https://dashboard.render.com

2. **Click "New +" → "Blueprint"**

3. **Connect GitHub Repository**:
   - Select: `Dennis-deve/SnapVault`
   - Render will automatically detect `render.yaml`

4. **Configure Service**:
   - Service Name: `snapvault`
   - Branch: `main`

5. **Add Environment Variables**:
   Click "Add Environment Variable" for each:

   ```bash
   DATABASE_URL=postgresql://your_neon_connection_string
   CLOUDINARY_CLOUD_NAME=dmoaoxm4b
   CLOUDINARY_API_KEY=435595983999468
   CLOUDINARY_API_SECRET=PU0EOZYP_GfwJ6E5QS15gNfWlXc
   SESSION_SECRET=dt608xvNmMLcJneEHXwypSkqOFuB1rP4
   NODE_ENV=production
   PORT=10000
   ```

   > **Note**: Render automatically sets `PORT=10000` for web services. Do not change this.

6. **Click "Apply"** - Render will:
   - Install dependencies (`npm install`)
   - Build frontend and backend (`npm run build`)
   - Start the server (`npm run start`)

#### Option B: Manual Deployment

1. **Go to Render Dashboard** → Click "New +" → "Web Service"

2. **Connect Repository**: Select `Dennis-deve/SnapVault`

3. **Configure Service**:
   ```
   Name: snapvault
   Region: Oregon (US West)
   Branch: main
   Runtime: Node
   Build Command: npm install && npm run build
   Start Command: npm run start
   Plan: Free
   ```

4. **Advanced Settings**:
   - Health Check Path: `/health`
   - Auto-Deploy: Yes

5. **Environment Variables** (same as Option A above)

6. **Click "Create Web Service"**

---

## 🔍 Deployment Validation

### 1. Check Build Logs
- Monitor build progress in Render dashboard
- Ensure no errors during `npm install` and `npm run build`

### 2. Test Health Endpoint
Once deployed, visit:
```
https://snapvault.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-07T...",
  "uptime": 123.45,
  "environment": "production"
}
```

### 3. Test Frontend
- Visit: `https://snapvault.onrender.com`
- You should see the SnapVault landing page
- Test signup/login functionality

### 4. Test Media Upload
1. Create an account
2. Create an album
3. Upload a test image or video
4. Verify it appears in Cloudinary dashboard
5. Check if thumbnail generation works for videos

### 5. Test Database Persistence
1. Create an album
2. Restart the Render service (Dashboard → Manual Deploy)
3. Login again - your album should still be there

---

## ⚙️ Configuration Details

### Environment Variables Explained

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection | `postgresql://user:pass@host/db` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account identifier | `dmoaoxm4b` |
| `CLOUDINARY_API_KEY` | Cloudinary authentication | `435595983999468` |
| `CLOUDINARY_API_SECRET` | Cloudinary secret key | `PU0E...` |
| `SESSION_SECRET` | Express session encryption | Random 32+ char string |
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | Server port (auto-set by Render) | `10000` |

### Server Configuration

- **Runtime**: Node 18+
- **Build**: Vite (frontend) + esbuild (backend)
- **Output**: `dist/public` (frontend) + `dist/index.js` (backend)
- **Start**: Express server serves both API and static files
- **Health Check**: `/health` endpoint for monitoring

### CORS Configuration

The app automatically allows:
- All `.onrender.com` domains
- `localhost:5000` and `localhost:3000` (development)
- Custom domains configured via `FRONTEND_URL` env variable

---

## 📈 Scaling Options

### Free Tier (Current)
- ✅ 512MB RAM
- ✅ Shared CPU
- ✅ Auto-sleep after 15 min inactivity
- ✅ Free SSL certificate
- ⚠️ Cold starts (~30 seconds)

### Starter Plan ($7/month)
- ✨ 1GB RAM
- ✨ Dedicated CPU
- ✨ No auto-sleep
- ✨ Faster response times

### Pro Plan (Pay-as-you-go)
- 🚀 2GB+ RAM
- 🚀 Multiple instances
- 🚀 Zero-downtime deploys
- 🚀 Horizontal scaling

**To Upgrade**: Dashboard → Service → Settings → Plan

---

## 🛠️ Troubleshooting

### Issue: 405 Method Not Allowed

**Cause**: CORS configuration issue

**Solution**:
1. Check environment variable `FRONTEND_URL` is set correctly
2. Verify Render domain is allowed in `server/index.ts`
3. Restart service after env var changes

### Issue: Build Fails

**Cause**: Missing dependencies or build errors

**Solution**:
```bash
# Run locally first
npm install
npm run build

# Check for TypeScript errors
npm run check

# Push fixes to GitHub
git add .
git commit -m "Fix build errors"
git push origin main
```

### Issue: Database Connection Error

**Cause**: Incorrect `DATABASE_URL` or network issue

**Solution**:
1. Verify Neon connection string format
2. Ensure Neon database is running (not paused)
3. Check Render logs for specific error

### Issue: Cloudinary Upload Fails

**Cause**: Invalid credentials or size limits

**Solution**:
1. Verify all 3 Cloudinary env vars are correct
2. Check file size limit (100MB max)
3. Test credentials in Cloudinary dashboard

### Issue: Session Not Persisting

**Cause**: Missing or weak `SESSION_SECRET`

**Solution**:
1. Generate new random secret (32+ characters)
2. Update env variable in Render
3. Restart service

### Issue: App Sleeps on Free Tier

**Behavior**: Normal for free tier (15 min inactivity)

**Solutions**:
- Upgrade to Starter plan ($7/mo)
- Use external ping service (e.g., UptimeRobot)
- Accept cold starts for low-traffic apps

---

## 🔄 Continuous Deployment

Render automatically deploys when you push to GitHub:

```bash
# Make changes locally
git add .
git commit -m "Update feature"
git push origin main

# Render will automatically:
# 1. Detect the push
# 2. Build the app
# 3. Deploy if build succeeds
# 4. Keep old version running until new one is ready
```

**Disable Auto-Deploy**: Dashboard → Service → Settings → Auto-Deploy (toggle off)

---

## 🌐 Custom Domain (Optional)

### Add Your Domain

1. **Go to Render Dashboard** → Service → Settings → Custom Domain
2. **Add Domain**: `snapvault.com` or `www.snapvault.com`
3. **Configure DNS** (in your domain registrar):
   ```
   Type: CNAME
   Name: @ or www
   Value: snapvault.onrender.com
   ```
4. **Wait for DNS Propagation** (5-60 minutes)
5. **Render Auto-Provisions SSL** (Let's Encrypt)

---

## 📊 Monitoring

### View Logs
Dashboard → Service → Logs (Live tail)

### Metrics
Dashboard → Service → Metrics
- CPU usage
- Memory usage
- Request count
- Response times

### Alerts
Dashboard → Service → Settings → Notifications
- Set up email alerts for:
  - Deploy failures
  - Service crashes
  - High memory usage

---

## 🔐 Security Best Practices

1. ✅ **Never commit `.env` files** - Use Render environment variables
2. ✅ **Use strong SESSION_SECRET** - Generate random 32+ characters
3. ✅ **Enable HTTPS only** - Render provides free SSL
4. ✅ **Rotate secrets regularly** - Update SESSION_SECRET quarterly
5. ✅ **Monitor logs** - Check for suspicious activity
6. ✅ **Keep dependencies updated** - Run `npm audit` regularly

---

## 📚 Additional Resources

- **Render Docs**: https://render.com/docs
- **Neon Docs**: https://neon.tech/docs
- **Cloudinary Docs**: https://cloudinary.com/documentation
- **Express Guide**: https://expressjs.com/
- **React Deployment**: https://react.dev/learn/start-a-new-react-project

---

## ✅ Post-Deployment Checklist

- [ ] Health check endpoint returns `{"status":"ok"}`
- [ ] Frontend loads at `https://snapvault.onrender.com`
- [ ] Signup creates new user in database
- [ ] Login works with email + password
- [ ] Magic PIN lock/unlock functions
- [ ] Image upload works
- [ ] Video upload works with thumbnail generation
- [ ] Album creation and deletion work
- [ ] Search functionality works
- [ ] Settings page updates PIN
- [ ] HTTPS certificate is active
- [ ] Auto-deploy is enabled
- [ ] Environment variables are set correctly

---

## 🎉 Success!

Your SnapVault app is now live at:
**https://snapvault.onrender.com**

**Next Steps**:
1. Share the URL with users
2. Monitor performance in Render dashboard
3. Set up custom domain (optional)
4. Upgrade to paid plan when needed
5. Add monitoring/analytics tools

---

**Need Help?**
- Render Support: https://render.com/support
- SnapVault Issues: https://github.com/Dennis-deve/SnapVault/issues
- Contact: +233 544 216 532

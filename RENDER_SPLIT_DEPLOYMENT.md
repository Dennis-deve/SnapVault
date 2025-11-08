# 🚀 SnapVault - Split Architecture Deployment Guide

## Architecture Overview

This guide deploys SnapVault as a modern **split architecture** for better scalability:

```
┌─────────────────────────────────────────────────┐
│           Frontend (Static Site)                │
│     https://snapvault.onrender.com              │
│                                                 │
│  • React + Vite (optimized static files)       │
│  • CDN-cached for fast global delivery         │
│  • Auto-deploy from GitHub                     │
│  • Free SSL certificate                        │
└────────────────┬────────────────────────────────┘
                 │
                 │ API Calls
                 ▼
┌─────────────────────────────────────────────────┐
│         Backend API (Web Service)               │
│   https://snapvault-api.onrender.com            │
│                                                 │
│  • Node.js + Express                           │
│  • REST API endpoints                          │
│  • Session management                          │
│  • File upload handling                        │
│  • Health check endpoint                       │
└──────┬──────────────────┬───────────────────────┘
       │                  │
       ▼                  ▼
┌─────────────┐    ┌──────────────┐
│    Neon     │    │  Cloudinary  │
│  PostgreSQL │    │    Media     │
│  Database   │    │   Storage    │
└─────────────┘    └──────────────┘
```

---

## 📋 Prerequisites

- ✅ GitHub repository: https://github.com/Dennis-deve/SnapVault
- ✅ Neon PostgreSQL database URL
- ✅ Cloudinary credentials
- ✅ Render.com account

---

## 🎯 Deployment Steps

### Step 1: Deploy Backend API First

#### 1.1 Create Backend Service

1. **Go to Render Dashboard**: https://dashboard.render.com

2. **Click "New +"** → **"Web Service"**

3. **Connect GitHub Repository**:
   - Select: `Dennis-deve/SnapVault`
   - Click "Connect"

4. **Configure Service**:
   ```
   Name: snapvault-api
   Region: Oregon (US West)
   Branch: main
   Runtime: Node
   Build Command: npm install && npm run build:server
   Start Command: npm run start
   Plan: Free
   ```

5. **Advanced Settings**:
   - Health Check Path: `/health`
   - Auto-Deploy: Yes

#### 1.2 Add Backend Environment Variables

Click "Add Environment Variable" for each:

```bash
DATABASE_URL=postgresql://your_neon_connection_string
CLOUDINARY_CLOUD_NAME=dmoaoxm4b
CLOUDINARY_API_KEY=435595983999468
CLOUDINARY_API_SECRET=PU0EOZYP_GfwJ6E5QS15gNfWlXc
SESSION_SECRET=dt608xvNmMLcJneEHXwypSkqOFuB1rP4
NODE_ENV=production
PORT=10000
FRONTEND_URL=https://snapvault.onrender.com
```

6. **Click "Create Web Service"**

7. **Wait 5-10 minutes** for deployment

8. **Copy API URL**: Will be something like `https://snapvault-api.onrender.com`

9. **Test Health Check**:
   Visit: `https://snapvault-api.onrender.com/health`
   
   Expected response:
   ```json
   {
     "status": "ok",
     "timestamp": "2025-11-07T...",
     "uptime": 123.45,
     "environment": "production"
   }
   ```

---

### Step 2: Deploy Frontend Static Site

#### 2.1 Create Static Site Service

1. **Go to Render Dashboard** → **Click "New +"** → **"Static Site"**

2. **Connect Repository**:
   - Select: `Dennis-deve/SnapVault`

3. **Configure Static Site**:
   ```
   Name: snapvault
   Branch: main
   Build Command: npm install && npm run build:client
   Publish Directory: dist/public
   ```

4. **Auto-Deploy**: Enable (checked)

#### 2.2 Add Frontend Environment Variable

**Critical**: Add this BEFORE deploying:

```bash
VITE_API_URL=https://snapvault-api.onrender.com
```

Replace with your actual backend URL from Step 1.8

5. **Click "Create Static Site"**

6. **Wait 3-5 minutes** for deployment

---

### Step 3: Update Backend CORS

After frontend deploys, update backend `FRONTEND_URL`:

1. Go to **Backend Service** (snapvault-api)
2. **Environment** tab
3. Update `FRONTEND_URL` with actual frontend URL:
   ```bash
   FRONTEND_URL=https://snapvault.onrender.com
   ```
4. Click "Save Changes"
5. Service will auto-redeploy

---

## ✅ Verification Checklist

### Backend API Tests

1. **Health Check**:
   ```bash
   curl https://snapvault-api.onrender.com/health
   ```
   Expected: `{"status":"ok",...}`

2. **CORS Headers**:
   ```bash
   curl -I https://snapvault-api.onrender.com/api/albums
   ```
   Should include: `access-control-allow-origin`

### Frontend Tests

1. **Static Site Loads**:
   - Visit: `https://snapvault.onrender.com`
   - Should see SnapVault landing page

2. **API Connection**:
   - Open browser console (F12)
   - Check for errors
   - Network tab should show requests to `snapvault-api.onrender.com`

### End-to-End Tests

1. ✅ Create account
2. ✅ Login with password
3. ✅ Create album
4. ✅ Upload image (check Cloudinary)
5. ✅ Upload video (verify thumbnail generation)
6. ✅ Test Magic PIN lock/unlock
7. ✅ Search functionality
8. ✅ Update PIN in settings
9. ✅ Logout and login again

---

## 🌐 URLs After Deployment

| Service | URL | Purpose |
|---------|-----|---------|
| **Frontend** | https://snapvault.onrender.com | User-facing app |
| **Backend API** | https://snapvault-api.onrender.com | REST API |
| **Health Check** | https://snapvault-api.onrender.com/health | Monitoring |
| **Database** | Neon PostgreSQL | Data persistence |
| **Media Storage** | Cloudinary | Image/video storage |

---

## 🔧 Configuration Details

### Frontend Environment Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `VITE_API_URL` | https://snapvault-api.onrender.com | Backend API URL |

### Backend Environment Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | postgresql://... | Neon database connection |
| `CLOUDINARY_CLOUD_NAME` | dmoaoxm4b | Cloudinary account |
| `CLOUDINARY_API_KEY` | 435595983999468 | Cloudinary auth |
| `CLOUDINARY_API_SECRET` | PU0E... | Cloudinary secret |
| `SESSION_SECRET` | dt608xv... | Session encryption |
| `NODE_ENV` | production | Runtime environment |
| `PORT` | 10000 | Server port |
| `FRONTEND_URL` | https://snapvault.onrender.com | CORS allowed origin |

---

## 📊 Architecture Benefits

### Frontend (Static Site)

✅ **Performance**:
- CDN caching for global delivery
- Instant page loads
- No server processing

✅ **Scalability**:
- Handles unlimited traffic
- Auto-scales with CDN
- No cold starts

✅ **Cost**:
- Free tier (no usage limits)
- No bandwidth charges

### Backend (Web Service)

✅ **Flexibility**:
- Full Node.js environment
- WebSocket support
- File upload processing

✅ **Security**:
- Session management
- Authentication
- CORS control

✅ **Reliability**:
- Health monitoring
- Auto-restart on failure
- Error logging

---

## 🔄 Deployment Flow

### Automatic Deployment

Both services auto-deploy when you push to GitHub:

```bash
# Make changes locally
git add .
git commit -m "Update feature"
git push origin main

# Render automatically:
# 1. Detects GitHub push
# 2. Builds frontend (3-5 min)
# 3. Builds backend (5-10 min)
# 4. Deploys both services
# 5. Keeps old version running until new one is ready
```

### Manual Deployment

**Backend**:
1. Dashboard → snapvault-api → Manual Deploy → Deploy Latest Commit

**Frontend**:
1. Dashboard → snapvault → Manual Deploy → Deploy Latest Commit

---

## 🛠️ Troubleshooting

### Issue: Frontend Shows "Failed to Fetch"

**Cause**: API URL not configured or incorrect

**Solution**:
1. Check `VITE_API_URL` in frontend environment variables
2. Verify backend URL is correct (no trailing slash)
3. Rebuild frontend: Dashboard → snapvault → Manual Deploy

### Issue: CORS Error

**Cause**: Backend doesn't allow frontend origin

**Solution**:
1. Check `FRONTEND_URL` in backend environment variables
2. Ensure it matches actual frontend URL
3. Redeploy backend

### Issue: 401 Unauthorized

**Cause**: Session cookies not working across domains

**Solution**:
- Sessions work correctly with credentials: 'include'
- Verify CORS credentials are enabled (already configured)
- Check browser console for cookie errors

### Issue: Image Upload Fails

**Cause**: File too large or Cloudinary credentials wrong

**Solution**:
1. Check file size (max 200MB supported)
2. Verify Cloudinary env vars in backend
3. Test Cloudinary credentials in dashboard
4. For files > 100MB, ensure stable internet connection
5. Videos may take 1-2 minutes to process on Cloudinary

### Issue: Backend Sleeps (Free Tier)

**Behavior**: Normal - free tier sleeps after 15 min inactivity

**Solutions**:
- Upgrade to Starter plan ($7/mo)
- Use external ping service
- Accept 30-second cold starts

---

## 📈 Scaling Options

### Current Setup (Free Tier)

| Resource | Frontend | Backend |
|----------|----------|---------|
| RAM | N/A (Static) | 512MB |
| CPU | N/A (Static) | Shared |
| Bandwidth | Unlimited | Free tier |
| Auto-sleep | No | Yes (15 min) |
| Cold start | N/A | ~30 seconds |

### Upgrade Path

**Starter Plan ($7/mo per service = $14/mo total)**:
- ✅ Backend: 1GB RAM, dedicated CPU, no sleep
- ✅ Frontend: Stays free (static sites don't need upgrade)
- ✅ Faster response times
- ✅ Better for production traffic

**Pro Plan ($25+/mo per service)**:
- 🚀 Multiple instances
- 🚀 Horizontal scaling
- 🚀 Zero-downtime deploys
- 🚀 Advanced metrics

---

## 🔐 Security Checklist

- [x] HTTPS on both frontend and backend (auto SSL)
- [x] CORS restricted to frontend URL
- [x] Session cookies HttpOnly + Secure
- [x] Password hashing with bcrypt
- [x] Environment variables isolated
- [x] API key rotation capability
- [x] Health check for monitoring

---

## 🎉 Advantages of Split Architecture

### vs. Monolithic Deployment

| Feature | Split | Monolithic |
|---------|-------|------------|
| **CDN Caching** | ✅ Yes | ❌ No |
| **Static Delivery** | ✅ Instant | ⏳ Server processed |
| **Independent Scaling** | ✅ Yes | ❌ No |
| **Cost Efficiency** | ✅ Frontend free | 💰 Both paid |
| **Cold Starts** | ✅ Frontend never | ⏳ Full app |
| **Deploy Speed** | ✅ Faster | ⏳ Slower |
| **Complexity** | ⚠️ 2 services | ✅ 1 service |

**Recommendation**: Split architecture is better for production, especially with high traffic.

---

## 📚 Additional Resources

- **Render Static Sites**: https://render.com/docs/static-sites
- **Render Web Services**: https://render.com/docs/web-services
- **Environment Variables**: https://render.com/docs/environment-variables
- **Custom Domains**: https://render.com/docs/custom-domains

---

## 🆘 Need Help?

- **Quick Issues**: Check Render service logs
- **API Errors**: Test `/health` endpoint
- **CORS Problems**: Verify environment variables
- **Contact**: +233 544 216 532
- **GitHub Issues**: https://github.com/Dennis-deve/SnapVault/issues

---

## ✅ Post-Deployment Summary

After successful deployment, you'll have:

1. ✅ **Frontend**: Fast static site with CDN
2. ✅ **Backend**: REST API with session management
3. ✅ **Database**: Neon PostgreSQL
4. ✅ **Storage**: Cloudinary media hosting
5. ✅ **SSL**: Free HTTPS certificates
6. ✅ **Auto-Deploy**: Push to GitHub = live deployment
7. ✅ **Monitoring**: Health check endpoints

**Total Cost**: $0/month (free tier) or $7/month (backend starter + frontend free)

**Estimated Setup Time**: 15-20 minutes

---

**Last Updated**: November 7, 2025  
**Version**: 2.0.0 (Split Architecture)  
**Status**: ✅ Production Ready

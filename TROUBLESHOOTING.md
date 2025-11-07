# 🔍 SnapVault Troubleshooting Guide

## Quick Diagnostics Checklist

Use this guide to systematically identify and fix issues with your deployed SnapVault application.

---

## 🎯 Step 1: Check Backend Health

### Test Backend API

1. **Health Check Endpoint**:
   ```bash
   curl https://snapvault-api.onrender.com/health
   ```
   
   **Expected Response**:
   ```json
   {
     "status": "ok",
     "timestamp": "2025-11-07T...",
     "uptime": 123.45,
     "environment": "production"
   }
   ```

   ✅ **If successful**: Backend is running
   ❌ **If fails**: Backend deployment issue (see Section A)

2. **Check Backend Logs**:
   - Go to: https://dashboard.render.com
   - Click: **snapvault-api** service
   - Click: **Logs** tab
   - Look for:
     - ✅ `serving on port 10000`
     - ❌ Error messages
     - ❌ Crash loops

---

## 🎨 Step 2: Check Frontend Deployment

### Test Frontend Access

1. **Visit Frontend URL**:
   ```
   https://snapvault.onrender.com
   ```

   **What do you see?**

   ✅ **SnapVault Login/Landing Page**: Frontend working
   
   ❌ **Render Error Page** ("There's nothing here yet" or 404):
   - Frontend not deployed yet
   - Wrong publish directory
   - Build failed
   - **Solution**: See Section B

   ❌ **Blank White Page**:
   - JavaScript error
   - API connection issue
   - **Solution**: See Section C

2. **Check Frontend Logs**:
   - Dashboard → **snapvault** (static site)
   - Click: **Logs** tab
   - Look for:
     - ✅ `Build successful`
     - ✅ `Site is live`
     - ❌ Build errors

---

## 🌐 Step 3: Check Browser Console

### Open Developer Tools

1. **Open Browser Console**:
   - Press **F12** (or Right-click → Inspect)
   - Go to **Console** tab

2. **Look for Errors**:

   **Common Errors & Solutions**:

   ❌ **"Failed to fetch" or "Network error"**:
   - API URL not configured
   - Backend is down
   - **Solution**: See Section D

   ❌ **CORS Error** ("blocked by CORS policy"):
   - Backend CORS not configured for frontend URL
   - **Solution**: See Section E

   ❌ **401 Unauthorized** (on /api/albums):
   - Normal! You need to login first
   - This is correct behavior

   ❌ **404 Not Found** (on API calls):
   - Wrong API URL
   - Backend routes not working
   - **Solution**: See Section F

3. **Check Network Tab**:
   - Go to **Network** tab
   - Try to login or create an account
   - Look at the requests:
   
   ✅ **Requests go to**: `snapvault-api.onrender.com`
   ❌ **Requests go to**: `localhost` or wrong URL
   - **Solution**: See Section D

---

## 📊 Step 4: Test Full Flow

### End-to-End Testing

1. **Create Account**:
   - Click "Sign Up"
   - Fill in: username, email, password, PIN
   - Click "Create Account"
   
   ✅ **Success**: Redirects to dashboard
   ❌ **Error**: Check console, see Section G

2. **Login**:
   - Enter credentials
   - Click "Login"
   
   ✅ **Success**: Redirects to dashboard
   ❌ **Error**: Check database connection (Section H)

3. **Create Album**:
   - Click "+" button
   - Enter album name
   - Click "Create"
   
   ✅ **Success**: Album appears
   ❌ **Error**: API issue (Section F)

4. **Upload File**:
   - Click album
   - Click upload
   - Select image/video
   
   ✅ **Success**: File uploads to Cloudinary
   ❌ **Error**: Cloudinary issue (Section I)

---

## 🔧 Detailed Solutions

### Section A: Backend Deployment Issues

**Problem**: Backend health check fails or logs show errors

**Diagnosis Steps**:

1. **Check Render Dashboard**:
   - Service status: Should be "Live" (green)
   - If "Deploy failed" (red): Check build logs

2. **Common Build Errors**:

   ```
   Error: Cannot find module 'esbuild'
   ```
   **Fix**: Already fixed - esbuild is in dependencies

   ```
   Error: Cannot find module '@vitejs/plugin-react'
   ```
   **Fix**: Already fixed - vite import only in development

   ```
   Error: connect ECONNREFUSED (database)
   ```
   **Fix**: Check `DATABASE_URL` in environment variables

3. **Check Environment Variables**:
   - Dashboard → snapvault-api → **Environment**
   - Verify all variables are set:
   
   ```bash
   DATABASE_URL=postgresql://...       ✅ Set?
   CLOUDINARY_CLOUD_NAME=dmoaoxm4b    ✅ Set?
   CLOUDINARY_API_KEY=435595983999468 ✅ Set?
   CLOUDINARY_API_SECRET=PU0E...      ✅ Set?
   SESSION_SECRET=dt608xv...          ✅ Set?
   NODE_ENV=production                ✅ Set?
   PORT=10000                         ✅ Set?
   FRONTEND_URL=https://...           ✅ Set?
   ```

4. **Manual Redeploy**:
   - Dashboard → snapvault-api
   - Click **Manual Deploy**
   - Select **"Deploy latest commit"**

---

### Section B: Frontend Not Showing (Render Error Page)

**Problem**: Frontend shows "There's nothing here yet" or Render error

**Diagnosis**:

1. **Check if Static Site Created**:
   - Dashboard → Look for "snapvault" service
   - Type should be: **Static Site**
   - If missing: **You need to create it** (see frontend deployment steps)

2. **Check Build Logs**:
   - Dashboard → snapvault → Logs
   
   **Common Errors**:
   
   ```
   Error: Could not resolve "./components/..."
   ```
   **Fix**: Build failed, check for import errors in code
   
   ```
   ENOENT: no such file or directory 'dist/public'
   ```
   **Fix**: Wrong publish directory

3. **Verify Settings**:
   - Dashboard → snapvault → **Settings**
   - Build Command: `npm install && npm run build:client`
   - Publish Directory: `dist/public`
   
4. **Check Publish Directory Locally**:
   ```bash
   npm run build:client
   ls dist/public
   ```
   
   Should show:
   ```
   index.html
   assets/
   ```

5. **Manual Redeploy**:
   - Dashboard → snapvault
   - Manual Deploy → **"Clear build cache & deploy"**

---

### Section C: Frontend Shows Blank Page

**Problem**: Page loads but shows nothing (white screen)

**Diagnosis**:

1. **Check Browser Console** (F12):
   - Look for JavaScript errors
   - Common causes:
     - API connection failed
     - Missing environment variable
     - Build issue

2. **Check Environment Variable**:
   - Dashboard → snapvault → **Environment**
   - Verify:
   ```
   VITE_API_URL=https://snapvault-api.onrender.com
   ```
   - ⚠️ **NO trailing slash!**

3. **Test API URL**:
   ```bash
   # Should work
   curl https://snapvault-api.onrender.com/health
   ```

4. **Rebuild Frontend**:
   - If you changed `VITE_API_URL`:
   - Dashboard → snapvault → Manual Deploy
   - Environment variables require rebuild!

---

### Section D: API Connection Issues

**Problem**: "Failed to fetch" or requests go to wrong URL

**Root Cause**: `VITE_API_URL` not set or incorrect

**Fix**:

1. **Check Frontend Environment**:
   - Dashboard → snapvault → Environment
   - Should have:
   ```
   VITE_API_URL=https://snapvault-api.onrender.com
   ```

2. **Verify in Code**:
   Open browser console and run:
   ```javascript
   console.log(import.meta.env.VITE_API_URL)
   ```
   
   Should show: `https://snapvault-api.onrender.com`
   
   If undefined or wrong:
   - Set environment variable
   - Redeploy frontend

3. **Test API Connection**:
   ```bash
   curl https://snapvault-api.onrender.com/health
   ```

---

### Section E: CORS Errors

**Problem**: "blocked by CORS policy" in console

**What is CORS?**
Browser security that blocks requests between different domains.

**Fix**:

1. **Check Backend FRONTEND_URL**:
   - Dashboard → snapvault-api → Environment
   - Verify `FRONTEND_URL` matches your actual frontend URL:
   ```
   FRONTEND_URL=https://snapvault.onrender.com
   ```
   
   ⚠️ **Must match exactly!**
   - If your frontend is: `https://snapvault-abc123.onrender.com`
   - Set: `FRONTEND_URL=https://snapvault-abc123.onrender.com`

2. **Check CORS Headers**:
   ```bash
   curl -I -X OPTIONS https://snapvault-api.onrender.com/api/albums \
     -H "Origin: https://snapvault.onrender.com"
   ```
   
   Should show:
   ```
   access-control-allow-origin: https://snapvault.onrender.com
   access-control-allow-credentials: true
   ```

3. **Redeploy Backend** after changing FRONTEND_URL:
   - Dashboard → snapvault-api → Manual Deploy

---

### Section F: API Endpoints Return 404

**Problem**: API calls return 404 Not Found

**Diagnosis**:

1. **Check API URL Format**:
   ```javascript
   // ✅ Correct
   https://snapvault-api.onrender.com/api/albums
   
   // ❌ Wrong
   https://snapvault-api.onrender.com//api/albums  (double slash)
   https://snapvault-api.onrender.comaapi/albums   (missing slash)
   ```

2. **Test Endpoints**:
   ```bash
   # Health check (public)
   curl https://snapvault-api.onrender.com/health
   
   # Albums (requires auth - should return 401, not 404)
   curl https://snapvault-api.onrender.com/api/albums
   ```
   
   Expected:
   - /health → 200 OK
   - /api/albums → 401 Unauthorized (means route exists!)
   - If 404 → Backend routes not loaded

3. **Check Backend Logs**:
   - Dashboard → snapvault-api → Logs
   - Look for route registration:
   ```
   serving on port 10000
   ```

---

### Section G: Signup/Login Errors

**Problem**: Cannot create account or login

**Diagnosis**:

1. **Check Browser Console**:
   - F12 → Console
   - Look for specific error message

2. **Common Errors**:

   **"User already exists"**:
   - ✅ Normal - email/username taken
   - Try different credentials

   **"Database error"**:
   - ❌ Database connection issue
   - See Section H

   **"Invalid credentials"**:
   - ✅ Normal - wrong password
   - Check password

   **Network error**:
   - Backend is down or sleeping
   - Wait 30 seconds (cold start)

3. **Test Backend Response**:
   ```bash
   # Try signup via API (should work)
   curl -X POST https://snapvault-api.onrender.com/api/register \
     -H "Content-Type: application/json" \
     -d '{"username":"test","email":"test@test.com","password":"pass123","pin":"1234"}'
   ```

---

### Section H: Database Connection Issues

**Problem**: "Database error" or queries fail

**Diagnosis**:

1. **Check DATABASE_URL**:
   - Dashboard → snapvault-api → Environment
   - Should start with: `postgresql://`
   - Should be from Neon (not local)

2. **Test Database Connection**:
   - Go to: https://console.neon.tech
   - Open your project
   - SQL Editor → Run:
   ```sql
   SELECT * FROM users LIMIT 1;
   ```
   
   ✅ Works? Database is fine
   ❌ Error? Database issue

3. **Check Database Schema**:
   Make sure you ran migrations:
   ```bash
   # Locally (one time setup)
   npx drizzle-kit push
   ```

4. **Verify Connection String**:
   ```bash
   # Format should be:
   postgresql://[user]:[password]@[host]/[database]?sslmode=require
   ```

---

### Section I: File Upload Issues (Cloudinary)

**Problem**: Cannot upload images/videos

**Diagnosis**:

1. **Check Cloudinary Credentials**:
   - Dashboard → snapvault-api → Environment
   - Verify all 3 variables:
   ```
   CLOUDINARY_CLOUD_NAME=dmoaoxm4b
   CLOUDINARY_API_KEY=435595983999468
   CLOUDINARY_API_SECRET=PU0E...
   ```

2. **Test Cloudinary Connection**:
   - Login to: https://cloudinary.com/console
   - Check your cloud name matches
   - Verify API credentials

3. **Check File Size**:
   - Max size: 100MB
   - Try smaller file first

4. **Check Browser Console**:
   - Look for upload errors
   - Common:
     - `413 Payload Too Large` → File too big
     - `401 Unauthorized` → Wrong credentials
     - `Timeout` → File too large or slow network

5. **Check Backend Logs**:
   - Dashboard → snapvault-api → Logs
   - Look for Cloudinary errors during upload

---

## 🚨 Emergency Recovery

### Backend Won't Start

1. **Check latest deployment logs**
2. **Rollback to previous version**:
   - Dashboard → snapvault-api
   - Deployments → Find last working version
   - Click "⋮" → **Redeploy**

### Frontend Broken After Update

1. **Rollback deployment**:
   - Dashboard → snapvault
   - Deployments → Previous version
   - Click "⋮" → **Redeploy**

### Complete Fresh Deploy

1. **Delete both services**
2. **Follow deployment guide from scratch**
3. **Use fresh database** (optional)

---

## 📋 Health Check Checklist

Run this checklist to verify everything works:

### Backend Health
- [ ] Health endpoint responds: `curl https://snapvault-api.onrender.com/health`
- [ ] Service status is "Live" in Render dashboard
- [ ] All environment variables set (8 total)
- [ ] Logs show no errors
- [ ] Database connection works

### Frontend Health
- [ ] URL loads: `https://snapvault.onrender.com`
- [ ] Shows SnapVault page (not Render error)
- [ ] No console errors (F12)
- [ ] VITE_API_URL environment variable set
- [ ] Build logs show success

### CORS & Connectivity
- [ ] Browser console: No CORS errors
- [ ] Network tab: Requests go to correct API URL
- [ ] FRONTEND_URL matches actual frontend URL
- [ ] Credentials (cookies) are included in requests

### Features Work
- [ ] Can create account
- [ ] Can login
- [ ] Can create album
- [ ] Can upload image
- [ ] Can upload video (with thumbnail)
- [ ] Can search
- [ ] Can delete media
- [ ] Can update PIN in settings
- [ ] Magic PIN lock/unlock works

---

## 🔍 Advanced Debugging

### Enable Detailed Logging

**Backend Logs**:
```bash
# In Render dashboard
Dashboard → snapvault-api → Logs → Enable "Auto-scroll"
```

**Frontend Logs** (Browser):
```javascript
// In browser console
localStorage.setItem('debug', '*')
// Reload page
// Check console for detailed logs
```

### Test API Directly

```bash
# Health check
curl https://snapvault-api.onrender.com/health

# Register (should work)
curl -X POST https://snapvault-api.onrender.com/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@test.com","password":"Test123!","pin":"1234"}'

# Login (should return session cookie)
curl -X POST https://snapvault-api.onrender.com/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!"}'

# Albums (should return 401 without cookie)
curl https://snapvault-api.onrender.com/api/albums
```

### Check All URLs

```bash
# Backend
echo "Backend: https://snapvault-api.onrender.com"
curl -I https://snapvault-api.onrender.com/health

# Frontend
echo "Frontend: https://snapvault.onrender.com"
curl -I https://snapvault.onrender.com

# Database
echo "Database: Check Neon Console"

# Cloudinary
echo "Cloudinary: Check cloudinary.com/console"
```

---

## 📞 Getting Help

### Before Asking for Help, Collect:

1. **Error Messages**:
   - Browser console errors (screenshot)
   - Backend logs (copy last 50 lines)
   - Frontend build logs

2. **Environment**:
   - Backend URL
   - Frontend URL
   - Which step fails

3. **What You Tried**:
   - List troubleshooting steps already attempted
   - Any changes made recently

### Contact:
- Phone: +233 544 216 532
- GitHub Issues: https://github.com/Dennis-deve/SnapVault/issues

---

## ✅ Quick Reference

### Service URLs
- **Frontend**: https://snapvault.onrender.com
- **Backend**: https://snapvault-api.onrender.com
- **Health Check**: https://snapvault-api.onrender.com/health
- **Render Dashboard**: https://dashboard.render.com

### Common Commands
```bash
# Test backend
curl https://snapvault-api.onrender.com/health

# Build frontend locally
npm run build:client

# Build backend locally
npm run build:server

# Check dist folder
ls dist/public

# View git status
git status

# Redeploy (push to GitHub)
git push origin main
```

### Key Files
- `package.json` - Build scripts
- `server/index.ts` - Backend entry
- `client/src/lib/api.ts` - API URL config
- `vite.config.ts` - Frontend build config
- `render.yaml` - Deployment config

---

**Last Updated**: November 7, 2025  
**Version**: 1.0.0  
**Status**: ✅ Ready to Debug!

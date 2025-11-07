# ✅ SnapVault Deployment Fix - Complete Checklist

## 🔧 Issue Fixed

**Problem**: Frontend was making API calls to relative URLs instead of the backend API server.

**Root Cause**: The `client/src/lib/auth.tsx` file had a hardcoded `/api/auth/me` endpoint without using `getApiUrl()`.

**Solution Applied**: ✅ Updated `auth.tsx` to use `getApiUrl()` for all API calls.

---

## 📦 What Was Changed

### File: `client/src/lib/auth.tsx`

**Before**:
```typescript
const response = await fetch("/api/auth/me", {
  credentials: "include",
});
```

**After**:
```typescript
import { getApiUrl } from "./api";

const response = await fetch(getApiUrl("/api/auth/me"), {
  credentials: "include",
});
```

This ensures the frontend makes requests to `https://snapvault-api.onrender.com/api/auth/me` instead of trying to fetch from the static site itself.

---

## 🚀 Deployment Status

### Changes Pushed to GitHub
- ✅ Commit: `fix: Use getApiUrl in auth.tsx to support split deployment`
- ✅ Pushed to: `main` branch
- ✅ Render will auto-deploy in ~3-5 minutes

### Services That Will Redeploy
1. **Frontend (snapvault-moau)**: Will rebuild with the fix
2. **Backend (snapvault-api)**: No changes, stays running

---

## ⏱️ Wait Time

**Frontend Rebuild**: 3-5 minutes

**How to Monitor**:
1. Go to: https://dashboard.render.com
2. Click: Your frontend service (snapvault-moau)
3. Watch: Logs tab for deployment progress
4. Look for: `Build successful` message

---

## ✅ Verification Steps (After 5 Minutes)

### Step 1: Check Frontend Deployment
1. Go to Render Dashboard → Frontend service
2. Verify status shows: **"Live"** (green)
3. Check logs for: `Site is live`

### Step 2: Clear Browser Cache
**Important!** Your browser may have cached the old version.

**Chrome/Edge**:
1. Press `Ctrl + Shift + Delete`
2. Select "Cached images and files"
3. Click "Clear data"

**Or use Incognito/Private mode**:
- `Ctrl + Shift + N` (Chrome)
- `Ctrl + Shift + P` (Edge/Firefox)

### Step 3: Test the Application

Visit: **https://snapvault-moau.onrender.com/**

1. **Open Developer Console** (F12)
   - Check Console tab for errors
   - Should see NO "invalid URL" errors

2. **Try to Sign Up**:
   - Click "Sign Up"
   - Fill in:
     - Username: testuser
     - Email: test@example.com
     - Password: Test123!
     - PIN: 1234
   - Click "Create Account"
   - ✅ Should redirect to dashboard
   - ❌ If error, check console

3. **Test Login**:
   - Use credentials above
   - Click "Login"
   - ✅ Should redirect to dashboard

4. **Test Album Creation**:
   - Click "+" button
   - Enter album name: "Test Album"
   - Click "Create"
   - ✅ Album should appear

5. **Test File Upload**:
   - Click on album
   - Click upload button
   - Select an image
   - ✅ Image should upload to Cloudinary
   - ✅ Should see thumbnail

6. **Check Network Tab** (F12 → Network):
   - Look at API requests
   - ✅ All requests should go to: `snapvault-api.onrender.com`
   - ✅ Should show status 200 (success) or 401 (before login - normal)

---

## 🐛 If You Still See Errors

### Error: "invalid URL" or "Failed to fetch"

**Possible Causes**:
1. Frontend hasn't redeployed yet (wait 5 min)
2. Browser cache (clear cache / use incognito)
3. Environment variable not set

**Check Environment Variables**:

1. **Frontend** (snapvault-moau):
   - Dashboard → Environment tab
   - Must have: `VITE_API_URL=https://snapvault-api.onrender.com`
   - If missing, add it and redeploy

2. **Backend** (snapvault-api):
   - Dashboard → Environment tab  
   - Must have: `FRONTEND_URL=https://snapvault-moau.onrender.com`
   - If wrong, update it

### Error: CORS Policy

**Check**:
1. Backend `FRONTEND_URL` matches actual frontend URL
2. After updating, wait for backend to redeploy (~2-3 min)

### Error: 401 Unauthorized on /api/albums

**This is NORMAL!**
- The endpoint requires you to be logged in first
- Login, then it will work

### Error: Cannot login/signup

**Check Backend Logs**:
1. Dashboard → snapvault-api → Logs
2. Look for errors like:
   - Database connection issues
   - Missing environment variables
   - Cloudinary errors

---

## 🎯 Complete System Check

Run this checklist after deployment completes:

### Backend Health
- [ ] Visit: https://snapvault-api.onrender.com/health
- [ ] Response: `{"status":"ok",...}`
- [ ] Backend status in Render: "Live" (green)
- [ ] No errors in backend logs

### Frontend Health
- [ ] Visit: https://snapvault-moau.onrender.com/
- [ ] Shows SnapVault landing page (not Render error)
- [ ] No console errors (F12)
- [ ] Frontend status in Render: "Live" (green)

### Environment Variables
**Backend (snapvault-api)**:
- [ ] `DATABASE_URL` set
- [ ] `CLOUDINARY_CLOUD_NAME` set
- [ ] `CLOUDINARY_API_KEY` set
- [ ] `CLOUDINARY_API_SECRET` set
- [ ] `SESSION_SECRET` set
- [ ] `NODE_ENV=production`
- [ ] `PORT=10000`
- [ ] `FRONTEND_URL=https://snapvault-moau.onrender.com`

**Frontend (snapvault-moau)**:
- [ ] `VITE_API_URL=https://snapvault-api.onrender.com`

### Features Work
- [ ] Can create account
- [ ] Can login
- [ ] Can create album
- [ ] Can upload image
- [ ] Can upload video
- [ ] Search works
- [ ] Can delete media
- [ ] PIN lock/unlock works
- [ ] Settings update works

### API Connectivity
- [ ] Browser console: No CORS errors
- [ ] Network tab: Requests go to snapvault-api.onrender.com
- [ ] Status codes: 200 (success) or 401 (unauthorized - normal before login)

---

## 📊 Expected Behavior

### Before Login
- `/api/auth/me` → 401 Unauthorized (✅ Normal)
- `/api/albums` → 401 Unauthorized (✅ Normal)
- Login page loads correctly

### After Login
- `/api/auth/me` → 200 OK with user data
- `/api/albums` → 200 OK with albums list
- Can create/delete albums
- Can upload files

---

## 🔄 If Problem Persists

### Manual Redeploy Frontend

1. Dashboard → snapvault-moau
2. **Manual Deploy** button
3. Select: **"Clear build cache & deploy"**
4. Wait 3-5 minutes

### Check Build Logs

1. Dashboard → snapvault-moau → Logs
2. Look for build errors
3. Should show:
   ```
   vite v5.x.x building for production...
   ✓ built in Xm Ys
   Site is live
   ```

### Test API Directly

```bash
# Test backend health (should work)
curl https://snapvault-api.onrender.com/health

# Test signup (should work)
curl -X POST https://snapvault-api.onrender.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@test.com","password":"Test123!","pin":"1234"}'
```

---

## 📱 Test on Different Devices

Once working, test on:
- [ ] Desktop browser (Chrome, Edge, Firefox)
- [ ] Mobile browser (Safari, Chrome mobile)
- [ ] Incognito/Private mode
- [ ] Different network (mobile data)

---

## 🎉 Success Criteria

Your app is working correctly when:

✅ Frontend loads at https://snapvault-moau.onrender.com/  
✅ Can create account and login  
✅ Dashboard shows properly  
✅ Can create albums  
✅ Can upload images/videos  
✅ Files appear in Cloudinary dashboard  
✅ Search functionality works  
✅ No console errors  
✅ All API requests go to snapvault-api.onrender.com  

---

## 📞 Need Help?

If issues persist after 10 minutes:

1. **Check this checklist** - Did you complete all steps?
2. **Check Render logs** - Any deployment errors?
3. **Check browser console** - What's the exact error?
4. **Clear cache** - Try incognito mode
5. **Wait longer** - Sometimes deploys take 5-7 minutes

**Contact**:
- Phone: +233 544 216 532
- GitHub: https://github.com/Dennis-deve/SnapVault/issues

---

## 📝 Summary

**What happened**: Fixed hardcoded API URL in auth.tsx  
**What to do**: Wait 5 minutes, clear browser cache, test app  
**Expected result**: App works perfectly with no errors  

**Current time**: Check deployment status in ~5 minutes  
**Your frontend**: https://snapvault-moau.onrender.com/  
**Your backend**: https://snapvault-api.onrender.com  

---

**Last Updated**: November 7, 2025  
**Fix Version**: 1.0.1  
**Status**: ✅ Fix Deployed - Waiting for Render to Rebuild

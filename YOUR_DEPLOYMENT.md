# 🎯 SnapVault - Your Deployment URLs

## Your Live Application

### ✅ Current Deployment Status

| Service | URL | Status |
|---------|-----|--------|
| **Frontend (Live)** | https://snapvault-moau.onrender.com/ | ✅ Working |
| **Backend API** | https://snapvault-api.onrender.com | ✅ Working |
| **Health Check** | https://snapvault-api.onrender.com/health | ✅ Working |

---

## 🔧 Required Configuration

### Backend Environment Variables (snapvault-api)

Make sure these are set in Render Dashboard → snapvault-api → Environment:

```bash
DATABASE_URL=postgresql://your_neon_connection_string
CLOUDINARY_CLOUD_NAME=dmoaoxm4b
CLOUDINARY_API_KEY=435595983999468
CLOUDINARY_API_SECRET=PU0EOZYP_GfwJ6E5QS15gNfWlXc
SESSION_SECRET=dt608xvNmMLcJneEHXwypSkqOFuB1rP4
NODE_ENV=production
PORT=10000
FRONTEND_URL=https://snapvault-moau.onrender.com
```

⚠️ **Important**: Set `FRONTEND_URL=https://snapvault-moau.onrender.com` (your actual frontend URL)

### Frontend Environment Variables (snapvault-moau)

Make sure this is set in Render Dashboard → snapvault-moau → Environment:

```bash
VITE_API_URL=https://snapvault-api.onrender.com
```

---

## ✅ Verification Steps

### 1. Test Backend Health
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

### 2. Test Frontend
1. Visit: https://snapvault-moau.onrender.com/
2. Should see SnapVault login/landing page
3. Press F12 → Console tab
4. Should see NO errors

### 3. Test CORS
1. Open browser console (F12)
2. Try to signup/login
3. Check Network tab
4. Requests should go to: `snapvault-api.onrender.com`
5. No CORS errors should appear

### 4. End-to-End Test
1. ✅ Create account at https://snapvault-moau.onrender.com/
2. ✅ Login with your credentials
3. ✅ Create an album
4. ✅ Upload an image
5. ✅ Upload a video (verify thumbnail generation)
6. ✅ Search for media
7. ✅ Delete media
8. ✅ Update PIN in settings
9. ✅ Test Magic PIN lock/unlock

---

## 🔍 Troubleshooting Your Deployment

### Issue: "Failed to fetch" or Network Errors

**Check**:
1. Is `VITE_API_URL` set in frontend environment?
   - Dashboard → snapvault-moau → Environment
   - Should be: `https://snapvault-api.onrender.com`

2. Test backend is running:
   ```bash
   curl https://snapvault-api.onrender.com/health
   ```

### Issue: CORS Errors

**Check**:
1. Is `FRONTEND_URL` set in backend environment?
   - Dashboard → snapvault-api → Environment
   - Should be: `https://snapvault-moau.onrender.com`

2. After updating, redeploy backend:
   - Dashboard → snapvault-api → Manual Deploy

### Issue: 401 Unauthorized on /api/albums

**This is NORMAL!**
- The endpoint requires authentication
- You must login first
- Then it will work

### Issue: Cannot Login/Signup

**Check Database**:
1. Verify `DATABASE_URL` is set in backend
2. Check backend logs for database errors:
   - Dashboard → snapvault-api → Logs

### Issue: Image Upload Fails

**Check Cloudinary**:
1. Verify all 3 Cloudinary variables are set in backend:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`

2. Check backend logs for upload errors

---

## 🚀 How to Update Your App

### Push Changes to Production

```bash
# 1. Make your changes locally
git add .
git commit -m "Your update message"
git push origin main

# 2. Render auto-deploys:
# - Frontend rebuilds (2-3 minutes)
# - Backend rebuilds (3-5 minutes)
```

### Manual Redeploy

**Backend**:
1. Dashboard → snapvault-api
2. Manual Deploy → "Deploy latest commit"

**Frontend**:
1. Dashboard → snapvault-moau
2. Manual Deploy → "Deploy latest commit"

---

## 📊 Service Details

### Frontend (Static Site)
- **Service Name**: snapvault-moau
- **Type**: Static Site
- **Build Command**: `npm install && npm run build:client`
- **Publish Directory**: `dist/public`
- **Auto Deploy**: Yes
- **Cost**: Free

### Backend (Web Service)
- **Service Name**: snapvault-api
- **Type**: Web Service
- **Build Command**: `npm install && npm run build:server`
- **Start Command**: `npm run start`
- **Health Check**: `/health`
- **Auto Deploy**: Yes
- **Cost**: Free (with sleep after 15 min inactivity)

---

## 🎯 Quick Access Links

### Render Dashboard
- **Main Dashboard**: https://dashboard.render.com
- **Backend Service**: https://dashboard.render.com/web/[your-backend-id]
- **Frontend Service**: https://dashboard.render.com/static/[your-frontend-id]

### External Services
- **Neon Database**: https://console.neon.tech
- **Cloudinary**: https://cloudinary.com/console

### Your App
- **Live App**: https://snapvault-moau.onrender.com/
- **API Health**: https://snapvault-api.onrender.com/health

---

## 📱 Share Your App

Your app is live! Share this URL:

**https://snapvault-moau.onrender.com/**

Features:
- ✅ Secure cloud media storage
- ✅ Photo & video uploads
- ✅ Album organization
- ✅ Magic PIN lock protection
- ✅ Search functionality
- ✅ Automatic video thumbnails

---

## 🔐 Security Notes

- ✅ HTTPS encryption (automatic SSL)
- ✅ Password hashing with bcrypt
- ✅ Secure session management
- ✅ CORS protection
- ✅ HttpOnly cookies
- ✅ Environment variable isolation

---

## 💰 Cost Breakdown

**Current Setup (Free Tier)**:
- Frontend: **$0/month** (Render Static Site)
- Backend: **$0/month** (Free tier, sleeps after 15 min)
- Database: **$0/month** (Neon free tier)
- Media Storage: **$0/month** (Cloudinary free tier)

**Total Cost**: **$0/month**

**Limitations**:
- Backend sleeps after 15 min inactivity
- First request after sleep takes ~30 seconds (cold start)
- 512MB RAM on backend
- Shared CPU

**To Upgrade** (No Sleep, Faster):
- Backend Starter: **$7/month**
- Gets you: 1GB RAM, dedicated CPU, no sleep

---

## 📞 Support

If you need help:
1. Check `TROUBLESHOOTING.md` for common issues
2. Check Render logs (Dashboard → Service → Logs)
3. Check browser console (F12)
4. Contact: +233 544 216 532
5. GitHub Issues: https://github.com/Dennis-deve/SnapVault/issues

---

**Last Updated**: November 7, 2025  
**Status**: ✅ Live and Working!  
**Your App**: https://snapvault-moau.onrender.com/

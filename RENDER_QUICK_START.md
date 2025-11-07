# 🚀 Quick Render.com Deployment

## One-Click Deploy

1. **Go to**: https://dashboard.render.com
2. **Click**: "New +" → "Blueprint"
3. **Select**: `Dennis-deve/SnapVault` repository
4. **Add Environment Variables**:

```bash
DATABASE_URL=postgresql://neon_user:password@neon_host/neon_db
CLOUDINARY_CLOUD_NAME=dmoaoxm4b
CLOUDINARY_API_KEY=435595983999468
CLOUDINARY_API_SECRET=PU0EOZYP_GfwJ6E5QS15gNfWlXc
SESSION_SECRET=dt608xvNmMLcJneEHXwypSkqOFuB1rP4
NODE_ENV=production
PORT=10000
```

5. **Click**: "Apply" → Wait 5-10 minutes

## ✅ Verify Deployment

- **Health Check**: https://snapvault.onrender.com/health
- **App URL**: https://snapvault.onrender.com

## 📝 Important Notes

- ⚠️ **Free tier sleeps after 15 min** - First load takes ~30 seconds
- ✅ **Auto-deploy enabled** - Push to GitHub = auto-deploy
- ✅ **Free SSL certificate** - HTTPS enabled automatically
- ✅ **PORT is auto-set** - Render uses port 10000

## 🔧 Troubleshooting

**Build fails?**
```bash
# Test locally first
npm run build
```

**405 errors?**
- Check CORS configuration in `server/index.ts`
- Verify `.onrender.com` domains are allowed

**Database connection fails?**
- Verify `DATABASE_URL` format: `postgresql://user:pass@host/db`
- Ensure Neon database is not paused

**Cloudinary upload fails?**
- Verify all 3 env vars are set correctly
- Check file size limit (100MB max)

## 📚 Full Documentation

See: `RENDER_DEPLOYMENT.md` for complete guide

## 🎯 Next Steps After Deploy

1. Test signup/login
2. Upload test media
3. Verify database persistence
4. Set up custom domain (optional)
5. Upgrade to paid plan when needed ($7/mo for no sleep)

---

**Support**: +233 544 216 532 | **Docs**: RENDER_DEPLOYMENT.md

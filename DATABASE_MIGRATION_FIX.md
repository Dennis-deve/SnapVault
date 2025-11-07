# 🔧 Database Migration Fix - SnapVault

## 🚨 Issue Identified

**Error**: 500 Internal Server Error on signup  
**Cause**: Database tables don't exist on Neon PostgreSQL  
**Solution**: Run database migration to create tables

---

## ✅ Quick Fix - Run Database Migration

### Option 1: Push Schema to Neon (Recommended)

1. **Make sure you have the DATABASE_URL locally**:
   
   Create a `.env` file in your project root (if not exists):
   ```bash
   DATABASE_URL=your_neon_connection_string_from_render
   ```

2. **Run the migration command**:
   ```bash
   npx drizzle-kit push
   ```

3. **Confirm the push**:
   - It will show you the tables to create
   - Type `yes` to confirm

4. **Expected output**:
   ```
   ✓ Pulling schema from database...
   ✓ Generating migrations...
   ✓ Executing migrations...
   ✓ Done!
   ```

### Option 2: Use Neon SQL Editor

If you can't run locally, use Neon's console:

1. **Go to Neon Console**: https://console.neon.tech
2. **Select your project**
3. **Click "SQL Editor"**
4. **Run this SQL**:

```sql
-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  pin TEXT
);

-- Create albums table
CREATE TABLE IF NOT EXISTS albums (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  user_id VARCHAR NOT NULL,
  is_locked INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create media table
CREATE TABLE IF NOT EXISTS media (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  album_id VARCHAR,
  user_id VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_albums_user_id ON albums(user_id);
CREATE INDEX IF NOT EXISTS idx_media_album_id ON media(album_id);
CREATE INDEX IF NOT EXISTS idx_media_user_id ON media(user_id);
```

5. **Click "Run"**
6. **Verify tables created**:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```

---

## 📋 Step-by-Step Guide (Option 1 - Recommended)

### Step 1: Get Your DATABASE_URL

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click**: snapvault-api (backend service)
3. **Go to**: Environment tab
4. **Find**: `DATABASE_URL`
5. **Copy**: The full PostgreSQL connection string
   - Should look like: `postgresql://user:pass@host/db?sslmode=require`

### Step 2: Create Local .env File

1. **Open your project folder**
2. **Create file**: `.env` (in root directory)
3. **Add**:
   ```
   DATABASE_URL=postgresql://your_actual_connection_string
   ```

### Step 3: Run Migration

Open terminal in your project folder:

```bash
npx drizzle-kit push
```

**You'll see**:
```
? Do you want to push changes to the database? (Y/n)
```

**Type**: `Y` and press Enter

**Wait for**:
```
✓ Tables created successfully!
```

### Step 4: Verify Tables Created

Check in Neon Console or run:

```bash
npx drizzle-kit studio
```

This opens a local database browser at http://localhost:4983

---

## 🔍 Verify Migration Success

### In Neon Console

1. Go to: https://console.neon.tech
2. Select your project
3. SQL Editor
4. Run:
   ```sql
   \dt
   ```
   OR
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```

**Expected Tables**:
- ✅ users
- ✅ albums
- ✅ media

### Test Signup Again

1. **Wait 30 seconds** (for backend to reconnect to DB)
2. **Go to**: https://snapvault-moau.onrender.com/
3. **Click**: Sign Up
4. **Fill in**:
   - Email: test@example.com
   - Password: Test123!
   - PIN: 1234
5. **Click**: Create Account
6. **Expected**: ✅ Redirects to dashboard

---

## 🚨 Common Issues

### Issue: "DATABASE_URL not found"

**Solution**: Make sure `.env` file is in the root directory (same level as `package.json`)

### Issue: "Connection refused"

**Solution**: 
1. Check DATABASE_URL is correct
2. Make sure it includes `?sslmode=require`
3. Verify Neon database is running

### Issue: "Tables already exist"

**Good!** Migration already done. Skip to testing.

### Issue: npx command not found

**Solution**: Make sure you're in the project directory:
```bash
cd C:\Users\hello\Downloads\CloudMediaVault
```

---

## 📝 Complete Command Reference

### Local Migration
```bash
# Navigate to project
cd C:\Users\hello\Downloads\CloudMediaVault

# Create .env with DATABASE_URL
echo DATABASE_URL=postgresql://your_connection_string > .env

# Run migration
npx drizzle-kit push

# Verify with studio (optional)
npx drizzle-kit studio
```

### SQL Direct (Neon Console)
```sql
-- Create all tables
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  pin TEXT
);

CREATE TABLE IF NOT EXISTS albums (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  user_id VARCHAR NOT NULL,
  is_locked INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  album_id VARCHAR,
  user_id VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Verify
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';
```

---

## ✅ After Migration Complete

Your app should work perfectly:

1. ✅ Signup works
2. ✅ Login works
3. ✅ Albums can be created
4. ✅ Files can be uploaded
5. ✅ Search works
6. ✅ All features functional

---

## 🎯 Quick Summary

**Problem**: Database tables don't exist  
**Solution**: Run `npx drizzle-kit push`  
**Time**: 2-3 minutes  
**Result**: App fully functional  

**Choose**: Option 1 (local push) if you have Node.js, Option 2 (Neon SQL) if not

---

**Last Updated**: November 7, 2025  
**Status**: Ready to Fix Database  
**Next**: Run migration, then test signup!

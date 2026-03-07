# Deploy Frontend to GitHub Pages (Free)

## Option 1: GitHub Pages (Easiest)

Your `siteserver` repo is already ready to deploy to GitHub Pages at no cost.

### Step 1: Enable GitHub Pages
1. Go to your **siteserver** GitHub repo
2. Click **Settings → Pages**
3. Under **Branch**, select `main` (or `gh-pages` if you prefer)
4. Click **Save**
5. Wait 1-2 minutes, then visit: `https://YOUR_GITHUB_USERNAME.github.io/siteserver`

### Step 2: Update Frontend Config
Once your GitHub Pages URL is live, update `app-config.js`:

```javascript
window.APP_CONFIG.API_BASE_URL = 'https://steam-auth-backend-xxxxx.onrender.com';
```

(Replace `xxxxx` with your actual Render backend service name)

### Step 3: Push the Update
```bash
cd '/home/vboxuser/Desktop/server and site/site'
git add app-config.js
git commit -m "point to cloud backend"
git push origin main
```

GitHub Pages will update automatically within 1-2 minutes.

---

## Option 2: Custom Domain on GitHub Pages

If you own a domain (like `shipzibi.com`):

### Step 1: Point Domain to GitHub
In your registrar (Namecheap, Godaddy, etc.):
- Add these **A records**:
  ```
  185.199.108.153
  185.199.109.153
  185.199.110.153
  185.199.111.153
  ```
- Add **CNAME** for `www` → `YOUR_GITHUB_USERNAME.github.io`

### Step 2: Configure GitHub Pages
1. Go to repo **Settings → Pages**
2. Under **Custom domain**, enter your domain (e.g., `shipzibi.com`)
3. Check **Enforce HTTPS**
4. Click **Save**

DNS will take up to 48 hours to fully propagate.

---

## Verify Everything Works

1. Go to your frontend URL (GitHub Pages or custom domain)
2. Click **Sign In With Steam**
3. You should be redirected to Steam (not localhost)
4. Approve authentication
5. You should be logged in on your site
6. Check browser console (F12) for any CORS errors

If you see CORS errors, make sure `FRONTEND_ORIGIN` in Render matches your site URL **exactly**.

---

## Next Steps

Once both frontend and backend are live:
- Both are accessible from anywhere
- No port forwarding needed
- No home IP exposure
- You can share the link with others

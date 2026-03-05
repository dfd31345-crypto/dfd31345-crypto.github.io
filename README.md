# Test Site (simple static)

This folder contains a simple static test site.

Files:

Quick local test:

```bash
cd "site"
python3 -m http.server 8000
# then open http://localhost:8000
```

Deploy with GitHub Pages (recommended for beginners):

1. Create a new GitHub repository and push this `site` folder as the repo root (or the `gh-pages` branch).
2. In the repo Settings → Pages, select the branch/folder to publish.
3. If you want a custom domain, put your domain (example: `your-domain.example`) into the `CNAME` file (already present) and push.

Namecheap DNS settings (example for GitHub Pages):

  - `185.199.108.153`
  - `185.199.109.153`
  - `185.199.110.153`
  - `185.199.111.153`
  - Host: `www`
  - Value: `USERNAME.github.io`

Notes for Namecheap: open **Domain List → Manage → Advanced DNS** and add the records above. DNS changes can take up to 48 hours but often propagate sooner.

If you prefer Netlify or Vercel, they provide an easier UI for connecting a repo and will give you the exact DNS records to add for your domain.

Quick deploy instructions (automated scripts)
------------------------------------------

I added two helper scripts to automate deployment and DNS setup. Because I cannot accept passwords or permanently hold credentials for you, you must run these locally on your machine:

- `deploy-github.sh` — creates (if needed) and pushes the site to `dfd31345-crypto.github.io`. Requires `gh` (GitHub CLI) installed and authenticated with `gh auth login`.
- `cloudflare-dns.sh` — creates the 4 required A records and the `www` CNAME pointing to your GitHub Pages site. Requires you to set `CF_TOKEN` in your environment (temporary):

  ```bash
  export CF_TOKEN="<your-cloudflare-api-token>"
  ./cloudflare-dns.sh
  ```

Security notes
--------------
- Do NOT paste passwords or tokens into chat. Revoke the Cloudflare token you shared earlier and create a new one with only DNS:Edit permission for this zone before running the script.
- The scripts require you to run them locally so your credentials remain under your control.

Namecheap / Cloudflare guidance
--------------------------------
- If you already set Cloudflare's nameservers at Namecheap, you do not need to add DNS records at Namecheap — manage DNS in Cloudflare.
- If you are NOT using Cloudflare nameservers, add these records at Namecheap DNS:

  - Type: A, Host: @, Value: 185.199.108.153
  - Type: A, Host: @, Value: 185.199.109.153
  - Type: A, Host: @, Value: 185.199.110.153
  - Type: A, Host: @, Value: 185.199.111.153
  - Type: CNAME, Host: www, Value: dfd31345-crypto.github.io

Local preview
-------------
Run this inside the `site/` folder and open http://localhost:8000:

```bash
python3 -m http.server 8000
```

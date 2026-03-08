const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');

const SITE_DIR = path.resolve(__dirname, '..');
const CACHE_FILE = path.join(SITE_DIR, 'case-drops-cache.js');
const CASES_DIR = path.join(SITE_DIR, 'assets', 'cases');

function sanitizeFile(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 160);
}

function decodeSocialPayload(url) {
  const value = String(url || '');
  const marker = '/social-images/';
  const idx = value.indexOf(marker);
  if (idx === -1) return null;

  const rawToken = value.slice(idx + marker.length).replace(/\.(png|jpe?g).*$/i, '');
  const token = rawToken.replace(/[^A-Za-z0-9_-]/g, '');
  if (!token) return null;

  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    // Some tokens decode with trailing control bytes; strip those before JSON.parse.
    const jsonText = Buffer.from(base64 + '='.repeat(padLen), 'base64')
      .toString('utf8')
      .trim()
      .replace(/>+$/, '')
      .replace(/[\u0000-\u001f\u007f-\u009f\ufffd]+$/g, '');
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function decodeNestedItemUrl(url) {
  const value = String(url || '');
  const marker = '/items/';
  const idx = value.indexOf(marker);
  if (idx === -1) return '';

  const token = value.slice(idx + marker.length).split('/')[0].replace(/[^A-Za-z0-9_-]/g, '');
  if (!token) return '';

  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    return Buffer.from(base64 + '='.repeat(padLen), 'base64')
      .toString('utf8')
      .replace(/\u0000/g, '')
      .replace(/[\u0000-\u001f\u007f-\u009f\ufffd]+$/g, '')
      .trim();
  } catch {
    return '';
  }
}

function toDirectImageUrl(imageUrl) {
  const payload = decodeSocialPayload(imageUrl);
  const encodedImageUrl = payload && payload.image_url ? String(payload.image_url) : '';
  if (!encodedImageUrl) return '';

  const nested = decodeNestedItemUrl(encodedImageUrl).replace(/[\u0000\ufffd]+$/g, '');
  if (nested.startsWith('https://cdn.csgoskins.gg/')) return nested;

  // Fallback to the first decoded URL when nested token is missing.
  return encodedImageUrl.startsWith('https://cdn.csgoskins.gg/') ? encodedImageUrl : '';
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchBuffer(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBufferWithRetry(url, maxAttempts = 5) {
  let delayMs = 350;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchBuffer(url);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await sleep(delayMs);
        delayMs = Math.min(delayMs * 2, 3500);
      }
    }
  }

  throw lastErr || new Error('Image fetch failed');
}

async function saveImage(url, filePath) {
  const buf = await fetchBufferWithRetry(url, 5);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
}

function readCache() {
  const script = fs.readFileSync(CACHE_FILE, 'utf8');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(script, context);
  return context.window.CASE_DROPS_CACHE || {};
}

async function main() {
  const cache = readCache();
  const unresolved = {};
  let savedCount = 0;
  let totalItems = 0;

  for (const [caseName, entry] of Object.entries(cache)) {
    const slug = String(entry && entry.slug ? entry.slug : '').trim();
    if (!slug) continue;

    const weaponsDir = path.join(CASES_DIR, slug, 'weapons');
    fs.mkdirSync(weaponsDir, { recursive: true });

    const items = [
      ...(Array.isArray(entry.weapons) ? entry.weapons : []),
      ...(Array.isArray(entry.specials) ? entry.specials : [])
    ];

    for (let i = 0; i < items.length; i += 1) {
      totalItems += 1;
      const item = items[i] || {};
      const itemName = String(item.name || item.marketHashName || `item_${i + 1}`).trim();
      const source = toDirectImageUrl(item.image || '');

      if (!source) {
        if (!unresolved[caseName]) unresolved[caseName] = [];
        unresolved[caseName].push(itemName);
        continue;
      }

      const fileName = `${String(i + 1).padStart(3, '0')}_${sanitizeFile(itemName)}.png`;
      const filePath = path.join(weaponsDir, fileName);

      try {
        await saveImage(source, filePath);
        savedCount += 1;
      } catch {
        if (!unresolved[caseName]) unresolved[caseName] = [];
        unresolved[caseName].push(itemName);
      }
    }
  }

  const unresolvedPath = path.join(SITE_DIR, 'assets', 'cases-unresolved-from-cache.json');
  fs.writeFileSync(unresolvedPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), totalItems, savedCount, unresolved }, null, 2)}\n`);

  console.log(`Total items: ${totalItems}`);
  console.log(`Saved images: ${savedCount}`);
  console.log(`Unresolved file: ${unresolvedPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');
const https = require('https');

const SITE_DIR = path.resolve(__dirname, '..');
const CASES_DIR = path.join(SITE_DIR, 'assets', 'cases');
const OUTPUT_REPORT = path.join(SITE_DIR, 'assets', 'cases-download-report.json');

const CRATES_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json';

const TARGET_CASES = [
  'Kilowatt Case',
  'Revolution Case',
  'Recoil Case',
  'Dreams & Nightmares Case',
  'Snakebite Case',
  'Fracture Case',
  'Prisma 2 Case',
  'CS20 Case',
  'Prisma Case',
  'Danger Zone Case',
  'Horizon Case',
  'Clutch Case',
  'Spectrum 2 Case',
  'Spectrum Case',
  'Gamma 2 Case',
  'Gamma Case',
  'Chroma 3 Case',
  'Chroma 2 Case',
  'Chroma Case',
  'Falchion Case',
  'Operation Wildfire Case',
  'Operation Breakout Weapon Case',
  'Operation Vanguard Weapon Case',
  'Operation Phoenix Weapon Case',
  'Huntsman Weapon Case'
];

function safeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitizeFile(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 170);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchText(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      }
    }, (res) => {
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

async function fetchBufferWithRetry(url, maxAttempts = 6) {
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

  throw lastErr || new Error('Failed to download image');
}

function normalizeImageUrl(url) {
  return String(url || '')
    .replace('https://community.cloudflare.steamstatic.com/economy/image/', 'https://community.akamai.steamstatic.com/economy/image/')
    .replace('https://steamcommunity-a.akamaihd.net/economy/image/', 'https://community.akamai.steamstatic.com/economy/image/');
}

function readTargetCaseDirs() {
  const dirs = fs.readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const bySlug = new Map(dirs.map((d) => [d, d]));
  return bySlug;
}

async function main() {
  const crates = JSON.parse(await fetchText(CRATES_URL));
  const cratesByName = new Map(crates.map((c) => [c.name, c]));
  const caseDirs = readTargetCaseDirs();

  const report = {
    generatedAt: new Date().toISOString(),
    source: CRATES_URL,
    perCase: {},
    missingCasesInSource: [],
    missingCaseFolders: [],
    failedItems: {}
  };

  let totalExpected = 0;
  let totalSaved = 0;

  for (const caseName of TARGET_CASES) {
    const crate = cratesByName.get(caseName);
    if (!crate) {
      report.missingCasesInSource.push(caseName);
      continue;
    }

    const caseSlug = safeSlug(caseName);
    const folderName = caseDirs.get(caseSlug);
    if (!folderName) {
      report.missingCaseFolders.push({ caseName, expectedSlug: caseSlug });
      continue;
    }

    const weaponsDir = path.join(CASES_DIR, folderName, 'weapons');
    fs.mkdirSync(weaponsDir, { recursive: true });

    // Rebuild folder from source-of-truth so stale files don't remain.
    for (const file of fs.readdirSync(weaponsDir)) {
      if (file.toLowerCase().endsWith('.png')) {
        fs.unlinkSync(path.join(weaponsDir, file));
      }
    }

    const items = [
      ...(Array.isArray(crate.contains) ? crate.contains : []),
      ...(Array.isArray(crate.contains_rare) ? crate.contains_rare : [])
    ];

    totalExpected += items.length;
    report.perCase[caseName] = { slug: folderName, expected: items.length, saved: 0 };

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] || {};
      const itemName = String(item.name || item.market_hash_name || `item_${i + 1}`).trim();
      const imageUrl = normalizeImageUrl(item.image || '');
      if (!imageUrl) {
        if (!report.failedItems[caseName]) report.failedItems[caseName] = [];
        report.failedItems[caseName].push(itemName);
        continue;
      }

      const fileName = `${String(i + 1).padStart(3, '0')}_${sanitizeFile(itemName)}.png`;
      const filePath = path.join(weaponsDir, fileName);

      try {
        const buf = await fetchBufferWithRetry(imageUrl, 6);
        fs.writeFileSync(filePath, buf);
        totalSaved += 1;
        report.perCase[caseName].saved += 1;
      } catch {
        if (!report.failedItems[caseName]) report.failedItems[caseName] = [];
        report.failedItems[caseName].push(itemName);
      }
    }
  }

  report.totalExpected = totalExpected;
  report.totalSaved = totalSaved;

  fs.writeFileSync(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Total expected: ${totalExpected}`);
  console.log(`Total saved: ${totalSaved}`);
  console.log(`Report: ${OUTPUT_REPORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

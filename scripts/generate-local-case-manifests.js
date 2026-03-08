const fs = require('fs');
const path = require('path');
const https = require('https');

const SITE_DIR = path.resolve(__dirname, '..');
const CASES_DIR = path.join(SITE_DIR, 'assets', 'cases');
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

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchText(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function safeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function legacySlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function listCaseFolders() {
  return fs.readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function pngCountInWeapons(folderName) {
  const weaponsDir = path.join(CASES_DIR, folderName, 'weapons');
  if (!fs.existsSync(weaponsDir)) return 0;
  return fs.readdirSync(weaponsDir).filter((f) => f.toLowerCase().endsWith('.png')).length;
}

function pickFolder(caseName, folders) {
  const candidates = [
    safeSlug(caseName),
    legacySlug(caseName),
    safeSlug(caseName).replace('dreams-and-nightmares', 'dreams-nightmares')
  ];

  let best = null;
  let bestCount = -1;

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!folders.includes(candidate)) continue;
    const count = pngCountInWeapons(candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  if (best) return best;

  const fuzzy = folders.filter((f) => {
    const lower = f.toLowerCase();
    const name = caseName.toLowerCase();
    return lower.includes(name.split(' ')[0]) && lower.includes('case');
  });

  if (fuzzy.length) {
    return fuzzy.sort((a, b) => pngCountInWeapons(b) - pngCountInWeapons(a))[0];
  }

  return safeSlug(caseName);
}

function rarityFromItem(item, fallback) {
  const raw = String((item && item.rarity && item.rarity.name) || fallback || 'Mil-Spec').trim();
  if (/mil-?spec/i.test(raw)) return 'Mil-Spec';
  if (/restricted/i.test(raw)) return 'Restricted';
  if (/classified/i.test(raw)) return 'Classified';
  if (/covert/i.test(raw)) return 'Covert';
  if (/consumer/i.test(raw)) return 'Consumer';
  if (/industrial/i.test(raw)) return 'Industrial';
  if (/extraordinary/i.test(raw)) return 'Extraordinary';
  if (/contraband/i.test(raw)) return 'Contraband';
  return raw;
}

function fileByIndex(weaponsDir, index1Based) {
  const prefix = `${String(index1Based).padStart(3, '0')}_`;
  const files = fs.readdirSync(weaponsDir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort();
  return files.find((f) => f.startsWith(prefix)) || '';
}

async function main() {
  const crates = JSON.parse(await fetchText(CRATES_URL));
  const cratesByName = new Map(crates.map((c) => [c.name, c]));
  const folders = listCaseFolders();

  const localImages = {
    generatedAt: new Date().toISOString(),
    source: 'local-assets-cases-plus-bymykel-crates',
    cases: {},
    weapons: {}
  };

  const dropsCache = {};
  const missing = [];

  for (const caseName of TARGET_CASES) {
    const crate = cratesByName.get(caseName);
    if (!crate) {
      missing.push(caseName);
      continue;
    }

    const folder = pickFolder(caseName, folders);
    const weaponsDir = path.join(CASES_DIR, folder, 'weapons');
    const contains = Array.isArray(crate.contains) ? crate.contains : [];
    const rare = Array.isArray(crate.contains_rare) ? crate.contains_rare : [];
    const all = [...contains, ...rare];

    const weapons = [];
    const specials = [];

    for (let i = 0; i < all.length; i += 1) {
      const item = all[i] || {};
      const itemName = String(item.name || item.market_hash_name || `Item ${i + 1}`).trim();
      const fileName = fs.existsSync(weaponsDir) ? fileByIndex(weaponsDir, i + 1) : '';
      const relPath = fileName ? `assets/cases/${folder}/weapons/${fileName}` : '';

      const baseEntry = {
        name: itemName,
        image: relPath,
        marketHashName: itemName,
        rarity: rarityFromItem(item, i >= contains.length ? 'Extraordinary' : 'Mil-Spec'),
        floatMin: Number.isFinite(item.min_float) ? item.min_float : 0,
        floatMax: Number.isFinite(item.max_float) ? item.max_float : 1
      };

      if (i < contains.length) weapons.push(baseEntry);
      else specials.push(baseEntry);

      if (relPath) {
        localImages.weapons[itemName] = relPath;
      }
    }

    dropsCache[caseName] = {
      source: 'local-assets-bymykel-crates',
      slug: folder,
      weapons,
      specials
    };

    const casePreviewImage = weapons.find((w) => w.image) || specials.find((s) => s.image) || null;

    localImages.cases[caseName] = {
      image: casePreviewImage ? casePreviewImage.image : '',
      folder: `assets/cases/${folder}`,
      csgContainerUrl: ''
    };
  }

  const localManifestPath = path.join(SITE_DIR, 'case-local-images.js');
  const dropsCachePath = path.join(SITE_DIR, 'case-drops-cache.js');
  const missingPath = path.join(SITE_DIR, 'assets', 'cases-manifest-missing.json');

  fs.writeFileSync(localManifestPath, `window.CASE_LOCAL_IMAGES = ${JSON.stringify(localImages, null, 2)};\n`);
  fs.writeFileSync(dropsCachePath, `window.CASE_DROPS_CACHE = ${JSON.stringify(dropsCache, null, 2)};\n`);
  fs.writeFileSync(missingPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), missing }, null, 2)}\n`);

  console.log(`Wrote ${localManifestPath}`);
  console.log(`Wrote ${dropsCachePath}`);
  console.log(`Missing source cases: ${missing.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

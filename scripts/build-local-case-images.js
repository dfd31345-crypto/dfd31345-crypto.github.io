const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');

const SITE_DIR = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(SITE_DIR, 'index.html');
const OUTPUT_BASE = path.join(SITE_DIR, 'assets', 'cases');
const OUTPUT_TMP = path.join(SITE_DIR, 'assets', 'cases.__tmp');
const MANIFEST_FILE = path.join(SITE_DIR, 'case-local-images.js');

const CSG_BASE = 'https://csgoskins.gg';
const DEFAULT_SEARCH_URL = 'https://search.csgoskins.gg';
const CSGODB_BASE = 'https://www.csgodatabase.com';
const STEAM_MARKET_BASE = 'https://steamcommunity.com';

const WEAR_LEVELS = [
  'Factory New',
  'Minimal Wear',
  'Field-Tested',
  'Well-Worn',
  'Battle-Scarred'
];

function safeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function sanitizeFile(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 140);
}

function stripWearSuffix(name) {
  return String(name || '').replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, '').trim();
}

function toFactoryNew(name) {
  const base = stripWearSuffix(name);
  if (!base) return '';
  return `${base} (Factory New)`;
}

function withWear(name, wear) {
  const base = stripWearSuffix(name);
  if (!base || !wear) return '';
  return `${base} (${wear})`;
}

function normalizeImageUrl(url) {
  if (!url) return '';
  return String(url)
    .replace('https://community.cloudflare.steamstatic.com/economy/image/', 'https://steamcommunity-a.akamaihd.net/economy/image/')
    .replace('https://community.cloudflare.steamstatic.com', 'https://steamcommunity-a.akamaihd.net')
    .replace('https://community.akamai.steamstatic.com/economy/image/', 'https://steamcommunity-a.akamaihd.net/economy/image/');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSteamUrl(url) {
  return /(^https?:\/\/)?(steamcommunity\.com|steamcommunity-a\.akamaihd\.net|community\.akamai\.steamstatic\.com|community\.cloudflare\.steamstatic\.com)/i.test(String(url || ''));
}

let steamNextAllowedAt = 0;

async function waitForSteamWindow() {
  const now = Date.now();
  if (now < steamNextAllowedAt) {
    await sleep(steamNextAllowedAt - now);
  }
  // Keep request pace low to reduce 429 frequency.
  steamNextAllowedAt = Date.now() + 1400;
}

async function fetchSteamText(url, options = {}) {
  const maxAttempts = Number.isFinite(options.maxAttempts) ? options.maxAttempts : 8;
  let delayMs = 1500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await waitForSteamWindow();
    const response = await fetchText(url, options);
    if (response && response.status === 200) return response;

    if (response && response.status === 429 && attempt < maxAttempts) {
      // Exponential backoff plus jitter when Steam rate-limits.
      const jitter = Math.floor(Math.random() * 600);
      await sleep(delayMs + jitter);
      delayMs = Math.min(delayMs * 2, 20000);
      continue;
    }

    if (response && response.status >= 500 && attempt < maxAttempts) {
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, 12000);
      continue;
    }

    return response;
  }

  return { status: 0, text: '' };
}

function htmlDecode(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function fetchText(url, options = {}) {
  const method = options.method || 'GET';
  const body = options.body || null;
  const extraHeaders = options.headers || {};

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)',
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...extraHeaders
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchText(res.headers.location, options));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function fetchJson(url, options = {}) {
  return fetchText(url, options).then(({ status, text }) => {
    if (status !== 200) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
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

async function saveImage(url, targetPath) {
  const buf = await fetchBuffer(url);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, buf);
}

function parseIndexLists() {
  const html = fs.readFileSync(INDEX_FILE, 'utf8');
  const cs2CasesMatch = html.match(/const cs2Cases = (\[[\s\S]*?\n\s*\];)/);
  const cs2Cases = cs2CasesMatch
    ? vm.runInNewContext(`(${cs2CasesMatch[1].replace(/;\s*$/, '')})`, {})
    : [];

  return {
    cs2Cases: Array.isArray(cs2Cases) ? cs2Cases : []
  };
}

function decodeSocialImageUrl(url) {
  const value = String(url || '').trim();
  const marker = '/social-images/';
  const idx = value.indexOf(marker);
  if (idx === -1) return '';
  const tokenWithExt = value.slice(idx + marker.length);
  const token = tokenWithExt.replace(/\.png.*$/i, '').replace(/\.jpg.*$/i, '').replace(/\.jpeg.*$/i, '');
  if (!token) return '';
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLen);
    const json = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return normalizeImageUrl(json && json.image_url ? json.image_url : '');
  } catch {
    return '';
  }
}

function extractMetaContent(html, name) {
  const re = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]+)"`, 'i');
  const m = String(html || '').match(re);
  return m && m[1] ? htmlDecode(m[1]) : '';
}

function extractJsonLdObjects(html) {
  const text = String(html || '');
  const re = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = String(m[1] || '').trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }
  return out;
}

function normalizeItemName(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .replace(/\|\s+/g, '| ')
    .trim();
}

function extractContainerItemsFromHtml(html) {
  const blocks = extractJsonLdObjects(html);
  const items = [];
  const seen = new Set();
  for (const block of blocks) {
    const listEntries = Array.isArray(block && block.itemListElement) ? block.itemListElement : [];
    for (const entry of listEntries) {
      const product = entry && entry.item ? entry.item : null;
      const raw = product && product.name ? product.name : '';
      const name = normalizeItemName(raw);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      let imageUrl = '';
      const imgs = Array.isArray(product && product.image) ? product.image : [];
      if (imgs.length) {
        for (const img of imgs) {
          const decoded = decodeSocialImageUrl(img);
          if (decoded) {
            imageUrl = decoded;
            break;
          }
          if (!imageUrl && img) imageUrl = normalizeImageUrl(String(img));
        }
      }

      items.push({ name, imageUrl });
    }
  }
  return items;
}

function extractContainerImageFromHtml(html) {
  const og = String(html || '').match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  const social = og && og[1] ? htmlDecode(og[1]) : '';
  const decodedSocial = decodeSocialImageUrl(social);
  if (decodedSocial) return decodedSocial;
  if (social) return normalizeImageUrl(social);

  const blocks = extractJsonLdObjects(html);
  for (const block of blocks) {
    if (Array.isArray(block && block.image) && block.image.length) {
      for (const img of block.image) {
        const decoded = decodeSocialImageUrl(img);
        if (decoded) return decoded;
      }
    }
  }

  return '';
}

async function fetchCsgSearchConfig() {
  const page = await fetchText(`${CSG_BASE}/containers/kilowatt-case`);
  if (!page || page.status !== 200) {
    return { searchUrl: DEFAULT_SEARCH_URL, searchKey: '' };
  }
  const searchUrl = extractMetaContent(page.text, 'search-url') || DEFAULT_SEARCH_URL;
  const searchKey = extractMetaContent(page.text, 'search-key') || '';
  return { searchUrl, searchKey };
}

async function searchContainerUrl(caseName, searchUrl, searchKey) {
  if (!searchUrl || !searchKey || !caseName) return '';
  const payload = JSON.stringify({ q: `${caseName} skins`, limit: 5 });
  const data = await fetchJson(`${searchUrl}/indexes/pages/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${searchKey}`,
      'Content-Type': 'application/json',
      Origin: CSG_BASE,
      Referer: `${CSG_BASE}/containers/kilowatt-case`
    },
    body: payload
  });
  const hits = Array.isArray(data && data.hits) ? data.hits : [];
  for (const hit of hits) {
    const url = hit && hit.url ? String(hit.url) : '';
    if (!url.includes('/containers/')) continue;
    if (url.includes('/specials')) continue;
    return url;
  }
  return '';
}

function candidateContainerSlugs(caseName) {
  const base = safeSlug(caseName)
    .replace(/-weapon-case$/, '-case')
    .replace(/-case$/, '-case');
  const out = [base];
  if (base.endsWith('-case')) {
    out.push(base.replace(/-case$/, '-weapon-case'));
  }
  if (base.includes('operation-')) {
    out.push(base.replace(/-case$/, '-weapon-case'));
  }
  return Array.from(new Set(out.filter(Boolean)));
}

async function fetchContainerByUrl(containerUrl) {
  if (!containerUrl) return null;
  const page = await fetchText(containerUrl);
  if (!page || page.status !== 200) return null;

  const items = extractContainerItemsFromHtml(page.text);
  const imageUrl = extractContainerImageFromHtml(page.text);

  let specials = [];
  const specialsPage = await fetchText(`${containerUrl.replace(/\/$/, '')}/specials`);
  if (specialsPage && specialsPage.status === 200) {
    specials = extractContainerItemsFromHtml(specialsPage.text);
  }

  return {
    containerUrl,
    imageUrl,
    weapons: items,
    specials
  };
}

async function fetchCaseFromCsgoskins(caseName, searchConfig) {
  const searchedUrl = await searchContainerUrl(caseName, searchConfig.searchUrl, searchConfig.searchKey);
  const tried = new Set();

  if (searchedUrl) {
    tried.add(searchedUrl);
    const bySearch = await fetchContainerByUrl(searchedUrl);
    if (bySearch && (bySearch.weapons.length || bySearch.specials.length)) return bySearch;
  }

  for (const slug of candidateContainerSlugs(caseName)) {
    const url = `${CSG_BASE}/containers/${slug}`;
    if (tried.has(url)) continue;
    tried.add(url);
    const bySlug = await fetchContainerByUrl(url);
    if (bySlug && (bySlug.weapons.length || bySlug.specials.length)) return bySlug;
  }

  return {
    containerUrl: searchedUrl || '',
    imageUrl: '',
    weapons: [],
    specials: []
  };
}

function extractSteamListingImage(html) {
  const relMatch = html.match(/<link\s+rel="image_src"\s+href="([^"]+)"/i);
  if (relMatch && relMatch[1]) return normalizeImageUrl(htmlDecode(relMatch[1]));
  const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  if (ogMatch && ogMatch[1]) return normalizeImageUrl(htmlDecode(ogMatch[1]));
  const anyEconomyMatch = html.match(/https?:[^"\s]+economy\/image\/[^"\s<]+/i);
  if (anyEconomyMatch && anyEconomyMatch[0]) return normalizeImageUrl(htmlDecode(anyEconomyMatch[0].replace(/\\\//g, '/')));
  return '';
}

function extractSteamMarketNameFromUrl(url) {
  const value = String(url || '');
  if (!value) return '';

  const listingMatch = value.match(/steamcommunity\.com\/market\/listings\/730\/([^"'\s<]+)/i);
  if (listingMatch && listingMatch[1]) {
    try {
      return decodeURIComponent(listingMatch[1]);
    } catch {
      return listingMatch[1];
    }
  }

  const searchMatch = value.match(/steamcommunity\.com\/market\/search\?[^"'\s<]*\bappid=730\b[^"'\s<]*/i);
  if (searchMatch && searchMatch[0]) {
    const queryMatch = searchMatch[0].match(/[?&]q=([^&"'\s<]+)/i);
    if (queryMatch && queryMatch[1]) {
      try {
        return decodeURIComponent(queryMatch[1]);
      } catch {
        return queryMatch[1];
      }
    }
  }

  return '';
}

function extractSteamMarketNameFromCsgodbHtml(html) {
  const text = String(html || '');
  if (!text) return '';

  const steamUrlRegex = /https?:\/\/steamcommunity\.com\/market\/(?:listings\/730\/[^"'\s<]+|search\?[^"'\s<]+)/gi;
  let match;
  while ((match = steamUrlRegex.exec(text)) !== null) {
    const marketName = extractSteamMarketNameFromUrl(match[0]);
    if (marketName) return marketName;
  }

  return '';
}

function csgodbSlugCandidates(itemName) {
  const base = stripWearSuffix(itemName);
  const parts = base.split('|').map((p) => p.trim()).filter(Boolean);
  const weapon = parts[0] || '';
  const finish = parts.slice(1).join(' ') || '';

  const out = new Set();
  const normalizedBase = base.replace(/\s*\|\s*/g, ' ').trim();
  if (normalizedBase) out.add(safeSlug(normalizedBase));

  if (weapon && finish) {
    out.add(safeSlug(`${weapon} ${finish}`));
  }

  const parenMatch = finish.match(/\(([^)]+)\)/);
  if (weapon && parenMatch && parenMatch[1]) {
    out.add(safeSlug(`${weapon} ${parenMatch[1]}`));
  }

  const asciiFinish = finish
    .replace(/[\u2665\u2764]/g, ' heart ')
    .replace(/[^\x00-\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (weapon && asciiFinish) {
    out.add(safeSlug(`${weapon} ${asciiFinish}`));
  }

  return Array.from(out).filter(Boolean);
}

const csgodbSteamNameCache = new Map();

async function resolveSteamNameViaCsgodb(itemName) {
  const key = String(itemName || '').toLowerCase().trim();
  if (!key) return '';
  if (csgodbSteamNameCache.has(key)) return csgodbSteamNameCache.get(key);

  for (const slug of csgodbSlugCandidates(itemName)) {
    const url = `${CSGODB_BASE}/skins/${slug}/`;
    const page = await fetchText(url);
    if (!page || page.status !== 200) continue;
    const resolved = extractSteamMarketNameFromCsgodbHtml(page.text);
    if (resolved) {
      csgodbSteamNameCache.set(key, resolved);
      return resolved;
    }
  }

  csgodbSteamNameCache.set(key, '');
  return '';
}

const marketImageCache = new Map();

async function getSteamListingImage(marketHashName) {
  if (!marketHashName) return '';
  if (marketImageCache.has(marketHashName)) return marketImageCache.get(marketHashName);

  const listingUrl = `${STEAM_MARKET_BASE}/market/listings/730/${encodeURIComponent(marketHashName)}`;
  const response = await fetchSteamText(listingUrl, { maxAttempts: 8 });
  const image = response && response.status === 200 ? extractSteamListingImage(response.text) : '';
  const normalized = normalizeImageUrl(image || '');
  marketImageCache.set(marketHashName, normalized || '');
  return normalized || '';
}

function buildSteamNameCandidates(itemName) {
  const out = [];
  const original = String(itemName || '').trim();
  const base = stripWearSuffix(original);
  const fn = toFactoryNew(original);

  if (fn) out.push(fn);
  if (original) out.push(original);
  if (base) {
    out.push(base);
    for (const wear of WEAR_LEVELS) {
      out.push(withWear(base, wear));
    }
  }

  return Array.from(new Set(out.filter(Boolean)));
}

function buildCsgodbSteamCandidates(itemName, csgodbResolvedName) {
  const out = [];
  if (csgodbResolvedName) out.push(csgodbResolvedName);

  const direct = buildSteamNameCandidates(itemName);
  for (const value of direct) out.push(value);

  const resolvedBase = stripWearSuffix(csgodbResolvedName || '');
  if (resolvedBase) {
    out.push(resolvedBase);
    for (const wear of WEAR_LEVELS) {
      out.push(withWear(resolvedBase, wear));
    }
  }

  return Array.from(new Set(out.filter(Boolean)));
}

async function getSteamImageByCandidates(candidates) {
  const seen = new Set();
  for (const candidate of candidates) {
    const key = String(candidate || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const image = await getSteamListingImage(candidate);
    if (image && isSteamUrl(image)) {
      return { image, usedName: candidate };
    }
  }

  return { image: '', usedName: '' };
}

async function getSteamFactoryNewImage(itemName) {
  const candidates = buildSteamNameCandidates(itemName);
  return getSteamImageByCandidates(candidates);
}

async function getSteamImageWithCsgodbFallback(itemName) {
  let result = await getSteamFactoryNewImage(itemName);
  if (result.image) return { ...result, resolvedViaCsgodb: false };

  const csgodbSteamName = await resolveSteamNameViaCsgodb(itemName);
  if (!csgodbSteamName) return { image: '', usedName: '', resolvedViaCsgodb: false };

  const candidates = buildCsgodbSteamCandidates(itemName, csgodbSteamName);
  result = await getSteamImageByCandidates(candidates);
  return { ...result, resolvedViaCsgodb: Boolean(result.image) };
}

// Fallback: csgoskins sometimes embeds the same Steam economy image URL in item JSON-LD.
function getSteamImageFromCsgItem(item) {
  if (!item || !item.imageUrl) return '';
  const normalized = normalizeImageUrl(item.imageUrl);
  return isSteamUrl(normalized) ? normalized : '';
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
    const current = fs.readFileSync(filePath, 'utf8');
    if (current === content) return false;
  }
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, content);
  return true;
}

async function main() {
  const { cs2Cases } = parseIndexLists();
  const csgSearch = await fetchCsgSearchConfig();

  fs.rmSync(OUTPUT_TMP, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_TMP, { recursive: true });

  const allCaseNames = new Set(cs2Cases.map((c) => c.name));

  const caseByName = new Map(cs2Cases.map((c) => [c.name, c]));
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'csgoskins-membership-steam-factory-new-csgodb-steam-name-fallback-csg-item-steam-image',
    cases: {},
    weapons: {}
  };

  let resolvedViaCsgodb = 0;
  let resolvedViaCsgItemSteam = 0;
  const unresolvedByCase = {};

  for (const caseName of allCaseNames) {
    const caseSlug = safeSlug(caseName);
    const caseDir = path.join(OUTPUT_TMP, caseSlug);
    const weaponsDir = path.join(caseDir, 'weapons');
    fs.mkdirSync(weaponsDir, { recursive: true });

    const curatedCase = caseByName.get(caseName) || { steamHashName: caseName };
    const csg = await fetchCaseFromCsgoskins(caseName, csgSearch);

    const entries = [
      ...(Array.isArray(csg.weapons) ? csg.weapons : []),
      ...(Array.isArray(csg.specials) ? csg.specials : [])
    ];

    const uniqueItems = [];
    const seenNames = new Set();
    for (const item of entries) {
      const value = String(item && item.name ? item.name : '').trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      uniqueItems.push({
        name: value,
        csgSteamImageUrl: getSteamImageFromCsgItem(item)
      });
    }

    const caseSteamName = curatedCase.steamHashName || caseName;
    let caseImageUrl = await getSteamListingImage(caseSteamName);
    if (!caseImageUrl && csg.imageUrl) {
      caseImageUrl = csg.imageUrl;
    }
    const caseImagePath = path.join(caseDir, 'case.png');
    if (caseImageUrl) {
      try {
        await saveImage(caseImageUrl, caseImagePath);
      } catch {
        // keep empty; set below
      }
    }

    manifest.cases[caseName] = {
      image: fs.existsSync(caseImagePath) ? `assets/cases/${caseSlug}/case.png` : '',
      folder: `assets/cases/${caseSlug}`,
      csgContainerUrl: csg.containerUrl || ''
    };

    for (let i = 0; i < uniqueItems.length; i += 1) {
      const item = uniqueItems[i];
      const itemName = item.name;
      const result = await getSteamImageWithCsgodbFallback(itemName);
      if (result.resolvedViaCsgodb) resolvedViaCsgodb += 1;
      const targetName = `${String(i + 1).padStart(3, '0')}_${sanitizeFile(itemName)}.png`;
      const targetPath = path.join(weaponsDir, targetName);
      const relPath = `assets/cases/${caseSlug}/weapons/${targetName}`;

      const imageUrl = result.image || item.csgSteamImageUrl || '';
      if (!result.image && item.csgSteamImageUrl) resolvedViaCsgItemSteam += 1;

      if (imageUrl) {
        try {
          // Always overwrite so any non-Steam file is replaced by the Steam source.
          await saveImage(imageUrl, targetPath);
          manifest.weapons[itemName] = relPath;
          const stripped = stripWearSuffix(itemName);
          if (stripped && !manifest.weapons[stripped]) manifest.weapons[stripped] = relPath;
          if (result.usedName && !manifest.weapons[result.usedName]) manifest.weapons[result.usedName] = relPath;
        } catch {
          // Ignore broken entries.
        }
      } else {
        if (!unresolvedByCase[caseName]) unresolvedByCase[caseName] = [];
        unresolvedByCase[caseName].push(itemName);
      }
    }
  }

  const mappedCount = Object.keys(manifest.weapons).length;
  const unresolvedPath = path.join(SITE_DIR, 'assets', 'cases-unresolved.json');
  const unresolvedPayload = {
    generatedAt: new Date().toISOString(),
    unresolvedByCase
  };

  if (mappedCount > 0) {
    fs.rmSync(OUTPUT_BASE, { recursive: true, force: true });
    fs.renameSync(OUTPUT_TMP, OUTPUT_BASE);
    fs.writeFileSync(MANIFEST_FILE, `window.CASE_LOCAL_IMAGES = ${JSON.stringify(manifest, null, 2)};\n`);
    writeIfChanged(unresolvedPath, `${JSON.stringify(unresolvedPayload, null, 2)}\n`);
  } else {
    fs.rmSync(OUTPUT_TMP, { recursive: true, force: true });
    console.warn('No weapon images mapped from Steam. Keeping existing assets/manifest unchanged.');
    writeIfChanged(unresolvedPath, `${JSON.stringify(unresolvedPayload, null, 2)}\n`);
  }

  console.log(`Wrote ${MANIFEST_FILE}`);
  console.log(`Unresolved list: ${unresolvedPath}`);
  console.log(`Cases: ${Object.keys(manifest.cases).length}, weapons mapped: ${mappedCount}`);
  console.log(`Resolved via csgodatabase -> Steam: ${resolvedViaCsgodb}`);
  console.log(`Resolved via csgoskins item -> Steam image URL: ${resolvedViaCsgItemSteam}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

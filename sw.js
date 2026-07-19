/**
 * ==============================================================================
 * Service Worker: オフライン対応
 * ------------------------------------------------------------------------------
 * 方針: 更新フローは従来どおりネットワーク優先のまま、オフライン時のみ
 *       キャッシュから配信する（プリキャッシュ固定化による stale 化を避ける）。
 *
 * 注意:
 *   - GET 以外（HEAD 等）は扱わない。script.js の loadCharacters() が
 *     HEAD + Last-Modified でデータ更新を判定しているため、素通しが必須。
 *   - クロスオリジン（Google Fonts / CDN / GA）は扱わない。
 *   - キャラ画像のみ cache-first（枚数が多く、ほぼ不変のため）。
 * ==============================================================================
 */
const CACHE_VERSION = 'kage-v1';
const APP_CACHE = `${CACHE_VERSION}-app`;
const IMG_CACHE = `${CACHE_VERSION}-img`;

const PRECACHE_URLS = [
    './',
    'index.html',
    'style/style.css',
    'js/i18n.js',
    'js/script.js',
    'i18n/ja.json',
    'i18n/en.json',
    'characters/update_date_ja.json',
    'manifest.webmanifest',
    'image/kage.webp'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(APP_CACHE)
            .then(c => c.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    // キャラ画像: cache-first
    if (url.pathname.includes('/image/characters/')) {
        e.respondWith(
            caches.open(IMG_CACHE).then(async (cache) => {
                const hit = await cache.match(req);
                if (hit) return hit;
                const resp = await fetch(req);
                if (resp.ok) cache.put(req, resp.clone());
                return resp;
            })
        );
        return;
    }

    // その他の同一オリジン: network-first、失敗時のみキャッシュ
    // ナビゲーションは ?pos= 等のクエリ違いで別エントリ化しないよう './' に集約
    const cacheKey = req.mode === 'navigate' ? './' : req;
    e.respondWith(
        fetch(req).then((resp) => {
            if (resp.ok) {
                const copy = resp.clone();
                caches.open(APP_CACHE).then(c => c.put(cacheKey, copy));
            }
            return resp;
        }).catch(async () => {
            const hit = await caches.match(cacheKey);
            return hit || Response.error();
        })
    );
});

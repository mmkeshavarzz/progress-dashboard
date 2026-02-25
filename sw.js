/*
 * ============================================
 *  Service Worker - داشبورد پیشروی دروس
 *  Version: 1.4.2
 *  Strategy: Cache First + Network Fallback
 * ============================================
 */

// -- نام کش و نسخه (هر بار آپدیت کردی، ورژن رو عوض کن) --
const CACHE_NAME = 'dashboard-doross-v1.4.2';

// -- لیست فایل‌هایی که باید کش بشن --
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-384x384.png',
  './icons/icon-512x512.png',
  // -- CDN ها (کتابخانه‌های خارجی) --
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap'
];

// ============================
//  رویداد Install - کش کردن فایل‌ها
// ============================
self.addEventListener('install', (event) => {
  console.log('[SW] 🔧 Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 📦 Caching app shell & assets...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        // فعال‌سازی فوری بدون انتظار
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] ❌ Cache failed:', err);
      })
  );
});

// ============================
//  رویداد Activate - پاک‌سازی کش‌های قدیمی
// ============================
self.addEventListener('activate', (event) => {
  console.log('[SW] ✅ Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] 🗑️ Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        // کنترل فوری همه تب‌ها
        return self.clients.claim();
      })
  );
});

// ============================
//  رویداد Fetch - استراتژی: اول کش، بعد شبکه
// ============================
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // فقط GET ریکوئست‌ها رو هندل کن
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // اگه توی کش بود، برگردون + در پس‌زمینه آپدیت کن
          // (Stale While Revalidate)
          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              // اگه ریسپانس معتبر بود، کش رو آپدیت کن
              if (networkResponse && networkResponse.status === 200) {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(request, responseClone));
              }
              return networkResponse;
            })
            .catch(() => {
              // اگه آفلاین بود، مهم نیست
            });

          return cachedResponse;
        }

        // اگه توی کش نبود، از شبکه بگیر
        return fetch(request)
          .then((networkResponse) => {
            // ریسپانس معتبر رو کش کن
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => {
            // اگه آفلاین بود و توی کش هم نبود
            // برای صفحات HTML یه فال‌بک نشون بده
            if (request.headers.get('accept').includes('text/html')) {
              return new Response(
                `<!DOCTYPE html>
                <html lang="fa" dir="rtl">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>آفلاین</title>
                  <style>
                    body {
                      font-family: Vazirmatn, Tahoma, sans-serif;
                      display: flex;
                      justify-content: center;
                      align-items: center;
                      min-height: 100vh;
                      margin: 0;
                      background: #F5F0EB;
                      color: #333;
                      text-align: center;
                    }
                    .container {
                      padding: 2rem;
                      background: rgba(255,255,255,0.7);
                      border-radius: 24px;
                      backdrop-filter: blur(10px);
                      max-width: 400px;
                    }
                    .emoji { font-size: 4rem; }
                    h2 { color: #7C6FAE; }
                    p { color: #666; line-height: 1.8; }
                    button {
                      margin-top: 1rem;
                      padding: 12px 24px;
                      background: #7C6FAE;
                      color: white;
                      border: none;
                      border-radius: 12px;
                      font-family: inherit;
                      font-size: 1rem;
                      cursor: pointer;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="emoji">📡</div>
                    <h2>اتصال اینترنت قطع شده!</h2>
                    <p>فعلاً آفلاینی رفیق 😅<br>اینترنتتو چک کن و دوباره تلاش کن</p>
                    <button onclick="location.reload()">🔄 تلاش مجدد</button>
                  </div>
                </body>
                </html>`,
                {
                  headers: { 'Content-Type': 'text/html; charset=utf-8' }
                }
              );
            }
          });
      })
  );
});



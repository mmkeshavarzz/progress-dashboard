// ============================================
// 🛠️ Service Worker - داشبورد پیشروی دروس
// نسخه  1.4.1
// ============================================

const CACHE_NAME = 'dashboard-pishroft-v1.4.1';
const DYNAMIC_CACHE = 'dashboard-dynamic-v1.3.0';

// 📦 فایل‌هایی که باید کش بشن (App Shell)
const STATIC_ASSETS = [
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
  './icons/icon-512x512.png'
];

// 🔗 منابع CDN خارجی که داشبورد ازشون استفاده می‌کنه
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap'
];

// ============================================
// 📥 رویداد Install - کش کردن فایل‌های استاتیک
// ============================================
self.addEventListener('install', (event) => {
  console.log('🚀 [SW] نصب Service Worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 [SW] کش کردن فایل‌های اصلی...');
        // اول فایل‌های استاتیک رو کش کن
        return cache.addAll(STATIC_ASSETS)
          .then(() => {
            // بعد CDN ها رو جداگانه کش کن (اگه فِیل شد مشکلی نیست)
            return Promise.allSettled(
              CDN_ASSETS.map((url) =>
                fetch(url, { mode: 'cors' })
                  .then((response) => {
                    if (response.ok) {
                      return cache.put(url, response);
                    }
                  })
                  .catch((err) => {
                    console.warn(`⚠️ [SW] نتونستم کش کنم: ${url}`, err);
                  })
              )
            );
          });
      })
      .then(() => {
        console.log('✅ [SW] همه فایل‌ها کش شدن!');
        return self.skipWaiting(); // فوری فعال بشه
      })
  );
});

// ============================================
// 🔄 رویداد Activate - پاکسازی کش‌های قدیمی
// ============================================
self.addEventListener('activate', (event) => {
  console.log('⚡ [SW] فعال‌سازی Service Worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // کش‌هایی که مال نسخه فعلی نیستن رو پاک کن
              return name !== CACHE_NAME && name !== DYNAMIC_CACHE;
            })
            .map((name) => {
              console.log(`🗑️ [SW] حذف کش قدیمی: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('✅ [SW] فعال‌سازی کامل شد!');
        return self.clients.claim(); // کنترل همه تب‌ها
      })
  );
});

// ============================================
// 🌐 رویداد Fetch - استراتژی: Stale While Revalidate
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // فقط درخواست‌های GET رو هندل کن
  if (request.method !== 'GET') return;

  // 🔀 استراتژی بر اساس نوع درخواست
  if (isStaticAsset(request.url)) {
    // فایل‌های استاتیک → Cache First
    event.respondWith(cacheFirst(request));
  } else if (isCDNAsset(request.url)) {
    // فایل‌های CDN → Stale While Revalidate
    event.respondWith(staleWhileRevalidate(request));
  } else if (isFontRequest(request.url)) {
    // فونت‌ها → Cache First (فونت‌ها تغییر نمی‌کنن)
    event.respondWith(cacheFirst(request));
  } else {
    // بقیه → Network First
    event.respondWith(networkFirst(request));
  }
});

// ============================================
// 🎯 استراتژی‌های کشینگ
// ============================================

/**
 * Cache First: اول از کش بخون، اگه نبود برو شبکه
 * مناسب برای فایل‌هایی که تغییر نمی‌کنن
 */
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return createOfflineFallback();
  }
}

/**
 * Network First: اول از شبکه بخون، اگه نشد از کش
 * مناسب برای محتوای پویا
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return createOfflineFallback();
  }
}

/**
 * Stale While Revalidate: فوری از کش بده، پشت صحنه آپدیت کن
 * مناسب برای CDN ها
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}

// ============================================
// 🔍 توابع کمکی
// ============================================

function isStaticAsset(url) {
  return STATIC_ASSETS.some((asset) => url.endsWith(asset.replace('./', '')));
}

function isCDNAsset(url) {
  return CDN_ASSETS.some((cdn) => url.startsWith(cdn.split('?')[0]));
}

function isFontRequest(url) {
  return url.includes('fonts.googleapis.com') ||
         url.includes('fonts.gstatic.com') ||
         url.endsWith('.woff2') ||
         url.endsWith('.woff') ||
         url.endsWith('.ttf');
}

/**
 * 📴 صفحه آفلاین - وقتی نه کش داریم نه اینترنت
 */
function createOfflineFallback() {
  const html = `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>آفلاین - داشبورد پیشروی دروس</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Vazirmatn', Tahoma, sans-serif;
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
          color: #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          text-align: center;
          padding: 2rem;
        }
        .container {
          background: rgba(30, 41, 59, 0.8);
          border-radius: 24px;
          padding: 3rem 2rem;
          max-width: 480px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(99, 102, 241, 0.3);
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
        }
        .emoji { font-size: 4rem; margin-bottom: 1rem; }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #a5b4fc; }
        p { color: #94a3b8; line-height: 1.8; margin-bottom: 1.5rem; }
        button {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          border: none;
          padding: 12px 32px;
          border-radius: 12px;
          font-size: 1rem;
          font-family: inherit;
          cursor: pointer;
          transition: transform 0.2s;
        }
        button:hover { transform: scale(1.05); }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="emoji">📡</div>
        <h1>اینترنت قطعه!</h1>
        <p>
          نگران نباش، داده‌هات توی حافظه مرورگر ذخیره شدن 😌<br>
          فقط کافیه دوباره آنلاین بشی تا همه چی برگرده.
        </p>
        <button onclick="window.location.reload()">🔄 تلاش دوباره</button>
      </div>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// ============================================
// 📨 رویداد Message - ارتباط با صفحه اصلی
// ============================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
    console.log('🗑️ [SW] همه کش‌ها پاک شدن!');
  }
});

console.log('📊 [SW] Service Worker داشبورد پیشروی دروس بارگذاری شد! 🎓');


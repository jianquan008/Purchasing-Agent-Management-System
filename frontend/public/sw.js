const CACHE_NAME = 'daigou-management-v1.0.0';
const STATIC_CACHE_NAME = 'daigou-static-v1.0.0';
const DYNAMIC_CACHE_NAME = 'daigou-dynamic-v1.0.0';

// 需要缓存的静态资源
const STATIC_ASSETS = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico'
];

// 需要缓存的API路径
const API_CACHE_PATTERNS = [
  /^\/api\/inventory/,
  /^\/api\/receipts\/list/,
  /^\/api\/auth\/profile/
];

// 离线页面HTML
const OFFLINE_PAGE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>离线模式 - 代购管理系统</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
      color: #333;
    }
    .offline-container {
      text-align: center;
      padding: 40px 20px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      max-width: 400px;
    }
    .offline-icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    .offline-title {
      font-size: 24px;
      margin-bottom: 16px;
      color: #1890ff;
    }
    .offline-message {
      font-size: 16px;
      line-height: 1.5;
      color: #666;
      margin-bottom: 24px;
    }
    .retry-button {
      background: #1890ff;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.3s;
    }
    .retry-button:hover {
      background: #40a9ff;
    }
  </style>
</head>
<body>
  <div class="offline-container">
    <div class="offline-icon">📱</div>
    <h1 class="offline-title">离线模式</h1>
    <p class="offline-message">
      您当前处于离线状态。<br>
      部分功能可能无法使用，请检查网络连接后重试。
    </p>
    <button class="retry-button" onclick="window.location.reload()">
      重新连接
    </button>
  </div>
</body>
</html>
`;

// Service Worker 安装事件
self.addEventListener('install', (event) => {
  console.log('Service Worker 安装中...');
  
  event.waitUntil(
    Promise.all([
      // 缓存静态资源
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('缓存静态资源...');
        return cache.addAll(STATIC_ASSETS);
      }),
      // 缓存离线页面
      caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
        console.log('缓存离线页面...');
        return cache.put('/offline', new Response(OFFLINE_PAGE, {
          headers: { 'Content-Type': 'text/html' }
        }));
      })
    ]).then(() => {
      console.log('Service Worker 安装完成');
      // 强制激活新的 Service Worker
      return self.skipWaiting();
    })
  );
});

// Service Worker 激活事件
self.addEventListener('activate', (event) => {
  console.log('Service Worker 激活中...');
  
  event.waitUntil(
    // 清理旧缓存
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE_NAME && 
              cacheName !== DYNAMIC_CACHE_NAME &&
              cacheName !== CACHE_NAME) {
            console.log('删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker 激活完成');
      // 立即控制所有客户端
      return self.clients.claim();
    })
  );
});

// 网络请求拦截
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // 只处理同源请求
  if (url.origin !== location.origin) {
    return;
  }
  
  // HTML 请求 - 网络优先策略
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 缓存成功的响应
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // 网络失败时返回缓存或离线页面
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match('/offline');
          });
        })
    );
    return;
  }
  
  // API 请求 - 网络优先，缓存备用
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 只缓存 GET 请求的成功响应
          if (request.method === 'GET' && response.status === 200) {
            const shouldCache = API_CACHE_PATTERNS.some(pattern => 
              pattern.test(url.pathname)
            );
            
            if (shouldCache) {
              const responseClone = response.clone();
              caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
          }
          return response;
        })
        .catch(() => {
          // 网络失败时返回缓存的数据
          if (request.method === 'GET') {
            return caches.match(request).then((cachedResponse) => {
              if (cachedResponse) {
                // 添加离线标识头
                const headers = new Headers(cachedResponse.headers);
                headers.set('X-Served-From-Cache', 'true');
                
                return new Response(cachedResponse.body, {
                  status: cachedResponse.status,
                  statusText: cachedResponse.statusText,
                  headers: headers
                });
              }
              
              // 返回离线响应
              return new Response(JSON.stringify({
                error: '网络连接失败',
                offline: true,
                message: '当前处于离线状态，请检查网络连接'
              }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
              });
            });
          }
          
          // 非 GET 请求直接抛出错误
          throw new Error('网络连接失败');
        })
    );
    return;
  }
  
  // 静态资源 - 缓存优先策略
  if (request.destination === 'script' || 
      request.destination === 'style' || 
      request.destination === 'image' ||
      request.destination === 'font') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }
  
  // 其他请求使用默认策略
  event.respondWith(fetch(request));
});

// 后台同步
self.addEventListener('sync', (event) => {
  console.log('后台同步事件:', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // 这里可以添加后台同步逻辑
      // 比如同步离线时的数据
      syncOfflineData()
    );
  }
});

// 推送通知
self.addEventListener('push', (event) => {
  console.log('收到推送消息:', event);
  
  const options = {
    body: event.data ? event.data.text() : '您有新的消息',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: '查看详情',
        icon: '/favicon.ico'
      },
      {
        action: 'close',
        title: '关闭',
        icon: '/favicon.ico'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('代购管理系统', options)
  );
});

// 通知点击事件
self.addEventListener('notificationclick', (event) => {
  console.log('通知被点击:', event);
  
  event.notification.close();
  
  if (event.action === 'explore') {
    // 打开应用
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// 同步离线数据的函数
async function syncOfflineData() {
  try {
    // 获取离线存储的数据
    const offlineData = await getOfflineData();
    
    if (offlineData.length > 0) {
      // 尝试同步到服务器
      for (const data of offlineData) {
        try {
          await fetch(data.url, {
            method: data.method,
            headers: data.headers,
            body: data.body
          });
          
          // 同步成功，删除离线数据
          await removeOfflineData(data.id);
        } catch (error) {
          console.log('同步失败:', error);
        }
      }
    }
  } catch (error) {
    console.log('后台同步失败:', error);
  }
}

// 获取离线数据（示例实现）
async function getOfflineData() {
  // 这里应该从 IndexedDB 或其他存储中获取离线数据
  return [];
}

// 删除已同步的离线数据（示例实现）
async function removeOfflineData(id) {
  // 这里应该从存储中删除指定的离线数据
  console.log('删除离线数据:', id);
}

// 消息处理
self.addEventListener('message', (event) => {
  console.log('收到消息:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
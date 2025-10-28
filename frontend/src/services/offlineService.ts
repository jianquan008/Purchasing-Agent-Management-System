import { message } from 'antd';

interface OfflineRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
  retryCount: number;
}

interface OfflineData {
  receipts: any[];
  inventory: any[];
  lastSync: number;
}

class OfflineService {
  private dbName = 'DaigouOfflineDB';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;
  private requestQueue: OfflineRequest[] = [];
  private maxRetries = 3;
  private syncInProgress = false;

  constructor() {
    this.initDB();
    this.loadRequestQueue();
    this.setupEventListeners();
  }

  // 初始化 IndexedDB
  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('IndexedDB 打开失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB 初始化成功');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建离线请求存储
        if (!db.objectStoreNames.contains('requests')) {
          const requestStore = db.createObjectStore('requests', { keyPath: 'id' });
          requestStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 创建离线数据存储
        if (!db.objectStoreNames.contains('data')) {
          const dataStore = db.createObjectStore('data', { keyPath: 'key' });
        }

        // 创建缓存存储
        if (!db.objectStoreNames.contains('cache')) {
          const cacheStore = db.createObjectStore('cache', { keyPath: 'url' });
          cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  // 设置事件监听器
  private setupEventListeners(): void {
    // 监听网络状态变化
    window.addEventListener('online', () => {
      console.log('网络已连接，开始同步离线数据');
      this.syncOfflineRequests();
    });

    window.addEventListener('offline', () => {
      console.log('网络已断开，进入离线模式');
      message.warning('网络连接已断开，应用将在离线模式下运行');
    });

    // 监听页面卸载，保存待同步数据
    window.addEventListener('beforeunload', () => {
      this.saveRequestQueue();
    });
  }

  // 添加离线请求到队列
  public async addOfflineRequest(
    url: string,
    method: string,
    headers: Record<string, string> = {},
    body?: any
  ): Promise<void> {
    const request: OfflineRequest = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url,
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      timestamp: Date.now(),
      retryCount: 0
    };

    this.requestQueue.push(request);
    await this.saveRequestToDB(request);
    
    console.log('离线请求已添加到队列:', request);
    message.info('请求已保存，将在网络恢复后自动同步');
  }

  // 保存请求到 IndexedDB
  private async saveRequestToDB(request: OfflineRequest): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['requests'], 'readwrite');
      const store = transaction.objectStore('requests');
      const addRequest = store.add(request);

      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject(addRequest.error);
    });
  }

  // 从 IndexedDB 加载请求队列
  private async loadRequestQueue(): Promise<void> {
    if (!this.db) {
      // 等待数据库初始化
      setTimeout(() => this.loadRequestQueue(), 100);
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['requests'], 'readonly');
      const store = transaction.objectStore('requests');
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        this.requestQueue = getAllRequest.result || [];
        console.log(`从数据库加载了 ${this.requestQueue.length} 个离线请求`);
        resolve();
      };

      getAllRequest.onerror = () => reject(getAllRequest.error);
    });
  }

  // 保存请求队列到本地存储（备用方案）
  private saveRequestQueue(): void {
    try {
      localStorage.setItem('offline-requests', JSON.stringify(this.requestQueue));
    } catch (error) {
      console.error('保存离线请求队列失败:', error);
    }
  }

  // 同步离线请求
  public async syncOfflineRequests(): Promise<void> {
    if (this.syncInProgress || !navigator.onLine || this.requestQueue.length === 0) {
      return;
    }

    this.syncInProgress = true;
    console.log(`开始同步 ${this.requestQueue.length} 个离线请求`);

    const successfulRequests: string[] = [];
    const failedRequests: OfflineRequest[] = [];

    for (const request of this.requestQueue) {
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: {
            'Content-Type': 'application/json',
            ...request.headers
          },
          body: request.body
        });

        if (response.ok) {
          successfulRequests.push(request.id);
          console.log('离线请求同步成功:', request.id);
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error('离线请求同步失败:', request.id, error);
        request.retryCount++;
        
        if (request.retryCount < this.maxRetries) {
          failedRequests.push(request);
        } else {
          console.warn('离线请求重试次数已达上限，丢弃:', request.id);
        }
      }
    }

    // 更新请求队列
    this.requestQueue = failedRequests;
    
    // 从数据库删除成功的请求
    await this.removeRequestsFromDB(successfulRequests);

    if (successfulRequests.length > 0) {
      message.success(`成功同步 ${successfulRequests.length} 个离线请求`);
    }

    if (failedRequests.length > 0) {
      message.warning(`${failedRequests.length} 个请求同步失败，将稍后重试`);
    }

    this.syncInProgress = false;
  }

  // 从数据库删除请求
  private async removeRequestsFromDB(requestIds: string[]): Promise<void> {
    if (!this.db || requestIds.length === 0) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['requests'], 'readwrite');
      const store = transaction.objectStore('requests');
      
      let completed = 0;
      const total = requestIds.length;

      requestIds.forEach(id => {
        const deleteRequest = store.delete(id);
        deleteRequest.onsuccess = () => {
          completed++;
          if (completed === total) {
            resolve();
          }
        };
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });
    });
  }

  // 缓存数据
  public async cacheData(key: string, data: any): Promise<void> {
    if (!this.db) return;

    const cacheItem = {
      key,
      data,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');
      const putRequest = store.put(cacheItem);

      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    });
  }

  // 获取缓存数据
  public async getCachedData(key: string): Promise<any> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['data'], 'readonly');
      const store = transaction.objectStore('data');
      const getRequest = store.get(key);

      getRequest.onsuccess = () => {
        const result = getRequest.result;
        resolve(result ? result.data : null);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // 缓存 API 响应
  public async cacheResponse(url: string, response: any): Promise<void> {
    if (!this.db) return;

    const cacheItem = {
      url,
      response,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const putRequest = store.put(cacheItem);

      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    });
  }

  // 获取缓存的响应
  public async getCachedResponse(url: string, maxAge: number = 300000): Promise<any> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readonly');
      const store = transaction.objectStore('cache');
      const getRequest = store.get(url);

      getRequest.onsuccess = () => {
        const result = getRequest.result;
        if (result && (Date.now() - result.timestamp) < maxAge) {
          resolve(result.response);
        } else {
          resolve(null);
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // 清理过期缓存
  public async cleanExpiredCache(maxAge: number = 86400000): Promise<void> {
    if (!this.db) return;

    const cutoffTime = Date.now() - maxAge;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(cutoffTime);
      const deleteRequest = index.openCursor(range);

      deleteRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      deleteRequest.onerror = () => reject(deleteRequest.error);
    });
  }

  // 获取离线状态信息
  public getOfflineStatus(): {
    isOnline: boolean;
    queueLength: number;
    syncInProgress: boolean;
  } {
    return {
      isOnline: navigator.onLine,
      queueLength: this.requestQueue.length,
      syncInProgress: this.syncInProgress
    };
  }

  // 清空离线队列
  public async clearOfflineQueue(): Promise<void> {
    this.requestQueue = [];
    
    if (this.db) {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['requests'], 'readwrite');
        const store = transaction.objectStore('requests');
        const clearRequest = store.clear();

        clearRequest.onsuccess = () => {
          console.log('离线队列已清空');
          resolve();
        };

        clearRequest.onerror = () => reject(clearRequest.error);
      });
    }
  }
}

// 创建单例实例
export const offlineService = new OfflineService();
export default offlineService;
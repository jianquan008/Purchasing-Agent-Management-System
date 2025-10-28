import { useState, useEffect } from 'react';
import { pwaService } from '../services/pwaService';

interface PWAState {
  isOnline: boolean;
  canInstall: boolean;
  hasUpdate: boolean;
  isInstalled: boolean;
  isStandalone: boolean;
}

interface PWAActions {
  installApp: () => Promise<void>;
  updateApp: () => void;
  requestNotificationPermission: () => Promise<boolean>;
  sendNotification: (title: string, options?: NotificationOptions) => void;
  subscribeToPush: () => Promise<PushSubscription | null>;
}

export const usePWA = (): PWAState & PWAActions => {
  const [state, setState] = useState<PWAState>({
    isOnline: navigator.onLine,
    canInstall: false,
    hasUpdate: false,
    isInstalled: false,
    isStandalone: false
  });

  useEffect(() => {
    // 检查是否在独立模式下运行（已安装）
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        (window.navigator as any).standalone ||
                        document.referrer.includes('android-app://');

    // 检查是否已安装
    const isInstalled = isStandalone || 
                       localStorage.getItem('pwa-installed') === 'true';

    setState(prev => ({
      ...prev,
      isStandalone,
      isInstalled
    }));

    // 监听网络状态变化
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
    };

    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 监听安装提示
    const handleBeforeInstallPrompt = () => {
      setState(prev => ({ ...prev, canInstall: true }));
    };

    const handleAppInstalled = () => {
      setState(prev => ({ 
        ...prev, 
        canInstall: false, 
        isInstalled: true 
      }));
      localStorage.setItem('pwa-installed', 'true');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // 定期检查PWA状态
    const checkPWAStatus = () => {
      setState(prev => ({
        ...prev,
        canInstall: pwaService.canInstall(),
        hasUpdate: pwaService.hasUpdateAvailable(),
        isOnline: pwaService.isOnlineStatus()
      }));
    };

    const interval = setInterval(checkPWAStatus, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearInterval(interval);
    };
  }, []);

  const installApp = async (): Promise<void> => {
    await pwaService.installApp();
  };

  const updateApp = (): void => {
    pwaService.updateApp();
  };

  const requestNotificationPermission = async (): Promise<boolean> => {
    return await pwaService.requestNotificationPermission();
  };

  const sendNotification = (title: string, options?: NotificationOptions): void => {
    pwaService.sendNotification(title, options);
  };

  const subscribeToPush = async (): Promise<PushSubscription | null> => {
    return await pwaService.subscribeToPush();
  };

  return {
    ...state,
    installApp,
    updateApp,
    requestNotificationPermission,
    sendNotification,
    subscribeToPush
  };
};

// 离线数据管理Hook
export const useOfflineData = () => {
  const [offlineQueue, setOfflineQueue] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // 当网络恢复时，尝试同步离线数据
      syncOfflineData();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 从本地存储加载离线队列
    loadOfflineQueue();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadOfflineQueue = () => {
    try {
      const stored = localStorage.getItem('offline-queue');
      if (stored) {
        setOfflineQueue(JSON.parse(stored));
      }
    } catch (error) {
      console.error('加载离线队列失败:', error);
    }
  };

  const saveOfflineQueue = (queue: any[]) => {
    try {
      localStorage.setItem('offline-queue', JSON.stringify(queue));
      setOfflineQueue(queue);
    } catch (error) {
      console.error('保存离线队列失败:', error);
    }
  };

  const addToOfflineQueue = (request: any) => {
    const newQueue = [...offlineQueue, {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...request
    }];
    saveOfflineQueue(newQueue);
  };

  const removeFromOfflineQueue = (id: number) => {
    const newQueue = offlineQueue.filter(item => item.id !== id);
    saveOfflineQueue(newQueue);
  };

  const syncOfflineData = async () => {
    if (!isOnline || offlineQueue.length === 0) return;

    for (const item of offlineQueue) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body
        });

        if (response.ok) {
          removeFromOfflineQueue(item.id);
        }
      } catch (error) {
        console.error('同步离线数据失败:', error);
      }
    }
  };

  const clearOfflineQueue = () => {
    localStorage.removeItem('offline-queue');
    setOfflineQueue([]);
  };

  return {
    offlineQueue,
    isOnline,
    addToOfflineQueue,
    removeFromOfflineQueue,
    syncOfflineData,
    clearOfflineQueue
  };
};

// PWA安装提示Hook
export const useInstallPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    let deferredPrompt: any;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e;
      setCanInstall(true);
      
      // 检查是否应该显示安装提示
      const lastPromptTime = localStorage.getItem('last-install-prompt');
      const now = Date.now();
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      
      if (!lastPromptTime || now - parseInt(lastPromptTime) > oneWeek) {
        setShowPrompt(true);
      }
    };

    const handleAppInstalled = () => {
      setCanInstall(false);
      setShowPrompt(false);
      deferredPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (canInstall) {
      await pwaService.installApp();
      setShowPrompt(false);
      localStorage.setItem('last-install-prompt', Date.now().toString());
    }
  };

  const dismissPrompt = () => {
    setShowPrompt(false);
    localStorage.setItem('last-install-prompt', Date.now().toString());
  };

  return {
    showPrompt,
    canInstall,
    install,
    dismissPrompt
  };
};
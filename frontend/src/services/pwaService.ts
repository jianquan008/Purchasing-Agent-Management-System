import { message } from 'antd';

interface PWAInstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

class PWAService {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private installPrompt: PWAInstallPrompt | null = null;
  private isOnline = navigator.onLine;
  private updateAvailable = false;

  constructor() {
    this.init();
  }

  private async init() {
    // 注册 Service Worker
    await this.registerServiceWorker();
    
    // 监听网络状态变化
    this.setupNetworkListeners();
    
    // 监听安装提示
    this.setupInstallPrompt();
    
    // 监听应用更新
    this.setupUpdateListener();
  }

  // 注册 Service Worker
  private async registerServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });

        this.swRegistration = registration;
        console.log('Service Worker 注册成功:', registration.scope);

        // 监听 Service Worker 更新
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                this.updateAvailable = true;
                this.showUpdateNotification();
              }
            });
          }
        });

        // 监听 Service Worker 控制变化
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });

      } catch (error) {
        console.error('Service Worker 注册失败:', error);
      }
    }
  }

  // 设置网络状态监听
  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      message.success('网络连接已恢复');
      this.syncOfflineData();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      message.warning('网络连接已断开，应用将在离线模式下运行');
    });
  }

  // 设置安装提示监听
  private setupInstallPrompt(): void {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPrompt = e as PWAInstallPrompt;
      this.showInstallBanner();
    });

    // 监听应用安装
    window.addEventListener('appinstalled', () => {
      message.success('应用安装成功！');
      this.installPrompt = null;
    });
  }

  // 设置更新监听
  private setupUpdateListener(): void {
    // 检查更新
    if (this.swRegistration) {
      setInterval(() => {
        this.swRegistration?.update();
      }, 60000); // 每分钟检查一次更新
    }
  }

  // 显示安装横幅
  private showInstallBanner(): void {
    const installBanner = document.createElement('div');
    installBanner.id = 'pwa-install-banner';
    installBanner.innerHTML = `
      <div style="
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        background: #1890ff;
        color: white;
        padding: 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 14px;
      ">
        <div>
          <div style="font-weight: bold; margin-bottom: 4px;">安装代购管理系统</div>
          <div style="opacity: 0.9;">添加到主屏幕，获得更好的使用体验</div>
        </div>
        <div>
          <button id="pwa-install-btn" style="
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            margin-right: 8px;
            cursor: pointer;
          ">安装</button>
          <button id="pwa-dismiss-btn" style="
            background: transparent;
            border: none;
            color: white;
            padding: 8px;
            cursor: pointer;
            font-size: 18px;
          ">×</button>
        </div>
      </div>
    `;

    document.body.appendChild(installBanner);

    // 绑定事件
    document.getElementById('pwa-install-btn')?.addEventListener('click', () => {
      this.installApp();
    });

    document.getElementById('pwa-dismiss-btn')?.addEventListener('click', () => {
      this.dismissInstallBanner();
    });

    // 5秒后自动隐藏
    setTimeout(() => {
      this.dismissInstallBanner();
    }, 10000);
  }

  // 显示更新通知
  private showUpdateNotification(): void {
    const updateNotification = document.createElement('div');
    updateNotification.id = 'pwa-update-notification';
    updateNotification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        left: 20px;
        right: 20px;
        background: #52c41a;
        color: white;
        padding: 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 14px;
      ">
        <div>
          <div style="font-weight: bold; margin-bottom: 4px;">应用更新可用</div>
          <div style="opacity: 0.9;">发现新版本，点击更新获得最新功能</div>
        </div>
        <div>
          <button id="pwa-update-btn" style="
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            margin-right: 8px;
            cursor: pointer;
          ">更新</button>
          <button id="pwa-update-dismiss-btn" style="
            background: transparent;
            border: none;
            color: white;
            padding: 8px;
            cursor: pointer;
            font-size: 18px;
          ">×</button>
        </div>
      </div>
    `;

    document.body.appendChild(updateNotification);

    // 绑定事件
    document.getElementById('pwa-update-btn')?.addEventListener('click', () => {
      this.updateApp();
    });

    document.getElementById('pwa-update-dismiss-btn')?.addEventListener('click', () => {
      this.dismissUpdateNotification();
    });
  }

  // 安装应用
  public async installApp(): Promise<void> {
    if (this.installPrompt) {
      try {
        await this.installPrompt.prompt();
        const { outcome } = await this.installPrompt.userChoice;
        
        if (outcome === 'accepted') {
          console.log('用户接受了安装提示');
        } else {
          console.log('用户拒绝了安装提示');
        }
        
        this.installPrompt = null;
        this.dismissInstallBanner();
      } catch (error) {
        console.error('安装失败:', error);
        message.error('安装失败，请稍后重试');
      }
    }
  }

  // 更新应用
  public updateApp(): void {
    if (this.swRegistration?.waiting) {
      this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      this.dismissUpdateNotification();
    }
  }

  // 隐藏安装横幅
  private dismissInstallBanner(): void {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
      banner.remove();
    }
  }

  // 隐藏更新通知
  private dismissUpdateNotification(): void {
    const notification = document.getElementById('pwa-update-notification');
    if (notification) {
      notification.remove();
    }
  }

  // 同步离线数据
  private async syncOfflineData(): Promise<void> {
    if ('serviceWorker' in navigator && this.swRegistration) {
      try {
        // 检查是否支持后台同步
        if ('sync' in this.swRegistration) {
          await (this.swRegistration as any).sync.register('background-sync');
          console.log('后台同步已注册');
        } else {
          console.log('浏览器不支持后台同步');
        }
      } catch (error) {
        console.error('后台同步注册失败:', error);
      }
    }
  }

  // 请求通知权限
  public async requestNotificationPermission(): Promise<boolean> {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  // 发送本地通知
  public sendNotification(title: string, options?: NotificationOptions): void {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options
      });
    }
  }

  // 订阅推送通知
  public async subscribeToPush(): Promise<PushSubscription | null> {
    if (this.swRegistration && 'PushManager' in window) {
      try {
        const subscription = await this.swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(
            // 这里应该是你的 VAPID 公钥
            'YOUR_VAPID_PUBLIC_KEY'
          )
        });
        
        console.log('推送订阅成功:', subscription);
        return subscription;
      } catch (error) {
        console.error('推送订阅失败:', error);
        return null;
      }
    }
    return null;
  }

  // 转换 VAPID 密钥格式
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // 获取网络状态
  public isOnlineStatus(): boolean {
    return this.isOnline;
  }

  // 检查是否有更新可用
  public hasUpdateAvailable(): boolean {
    return this.updateAvailable;
  }

  // 检查是否可以安装
  public canInstall(): boolean {
    return this.installPrompt !== null;
  }

  // 获取 Service Worker 注册信息
  public getRegistration(): ServiceWorkerRegistration | null {
    return this.swRegistration;
  }
}

// 创建单例实例
export const pwaService = new PWAService();
export default pwaService;
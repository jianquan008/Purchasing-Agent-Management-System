// 组件预加载工具
class ComponentPreloader {
  private preloadedComponents = new Set<string>();
  private preloadPromises = new Map<string, Promise<any>>();

  // 预加载组件
  preload(componentName: string, importFn: () => Promise<any>): Promise<any> {
    if (this.preloadedComponents.has(componentName)) {
      return Promise.resolve();
    }

    if (this.preloadPromises.has(componentName)) {
      return this.preloadPromises.get(componentName)!;
    }

    const promise = importFn()
      .then((module) => {
        this.preloadedComponents.add(componentName);
        this.preloadPromises.delete(componentName);
        return module;
      })
      .catch((error) => {
        console.warn(`Failed to preload component ${componentName}:`, error);
        this.preloadPromises.delete(componentName);
        throw error;
      });

    this.preloadPromises.set(componentName, promise);
    return promise;
  }

  // 批量预加载组件
  preloadMultiple(components: Array<{ name: string; importFn: () => Promise<any> }>) {
    return Promise.allSettled(
      components.map(({ name, importFn }) => this.preload(name, importFn))
    );
  }

  // 检查组件是否已预加载
  isPreloaded(componentName: string): boolean {
    return this.preloadedComponents.has(componentName);
  }

  // 清除预加载缓存
  clear() {
    this.preloadedComponents.clear();
    this.preloadPromises.clear();
  }
}

// 创建全局预加载器实例
export const componentPreloader = new ComponentPreloader();

// 页面组件预加载配置
export const PAGE_COMPONENTS = {
  Dashboard: () => import('../pages/Dashboard'),
  ReceiptOCR: () => import('../pages/ReceiptOCR'),
  Inventory: () => import('../pages/Inventory'),
  History: () => import('../pages/History'),
  UserManagement: () => import('../pages/UserManagement'),
  SystemManagement: () => import('../pages/SystemManagement'),
  Analytics: () => import('../pages/Analytics'),
};

// 预加载核心页面组件
export const preloadCoreComponents = () => {
  return componentPreloader.preloadMultiple([
    { name: 'Dashboard', importFn: PAGE_COMPONENTS.Dashboard },
    { name: 'ReceiptOCR', importFn: PAGE_COMPONENTS.ReceiptOCR },
    { name: 'Inventory', importFn: PAGE_COMPONENTS.Inventory },
    { name: 'Analytics', importFn: PAGE_COMPONENTS.Analytics },
  ]);
};

// 预加载管理员页面组件
export const preloadAdminComponents = () => {
  return componentPreloader.preloadMultiple([
    { name: 'UserManagement', importFn: PAGE_COMPONENTS.UserManagement },
    { name: 'SystemManagement', importFn: PAGE_COMPONENTS.SystemManagement },
  ]);
};

// 根据用户角色预加载相关组件
export const preloadByUserRole = (isAdmin: boolean) => {
  const corePromise = preloadCoreComponents();
  
  if (isAdmin) {
    return Promise.allSettled([corePromise, preloadAdminComponents()]);
  }
  
  return corePromise;
};

// 创建带预加载功能的导航处理器
export const createPreloadingNavigationHandler = (
  componentName: keyof typeof PAGE_COMPONENTS,
  onNavigate?: () => void
) => {
  return {
    onMouseEnter: () => {
      componentPreloader.preload(componentName, PAGE_COMPONENTS[componentName]);
    },
    onClick: onNavigate,
  };
};
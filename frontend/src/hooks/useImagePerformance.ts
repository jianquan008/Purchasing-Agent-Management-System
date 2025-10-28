import { useCallback, useRef } from 'react';

interface ImagePerformanceMetrics {
  loadTime: number;
  size: number;
  format: string;
  dimensions: { width: number; height: number };
  cacheHit: boolean;
}

interface ImagePerformanceHook {
  trackImageLoad: (src: string, startTime?: number) => Promise<ImagePerformanceMetrics>;
  getAverageLoadTime: () => number;
  getTotalImagesLoaded: () => number;
  getCacheHitRate: () => number;
  clearMetrics: () => void;
}

export const useImagePerformance = (): ImagePerformanceHook => {
  const metricsRef = useRef<ImagePerformanceMetrics[]>([]);
  const loadStartTimes = useRef<Map<string, number>>(new Map());

  const trackImageLoad = useCallback(async (src: string, startTime?: number): Promise<ImagePerformanceMetrics> => {
    const loadStartTime = startTime || loadStartTimes.current.get(src) || performance.now();
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        const loadEndTime = performance.now();
        const loadTime = loadEndTime - loadStartTime;
        
        // 检测是否来自缓存
        const cacheHit = loadTime < 10; // 小于10ms通常表示来自缓存
        
        // 估算图片大小（实际实现中可能需要更精确的方法）
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          
          // 获取图片数据来估算大小
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const estimatedSize = imageData.data.length;
          
          const metrics: ImagePerformanceMetrics = {
            loadTime,
            size: estimatedSize,
            format: src.split('.').pop()?.toLowerCase() || 'unknown',
            dimensions: {
              width: img.naturalWidth,
              height: img.naturalHeight
            },
            cacheHit
          };
          
          metricsRef.current.push(metrics);
          loadStartTimes.current.delete(src);
          
          resolve(metrics);
        } else {
          // 如果无法获取canvas context，返回基本信息
          const metrics: ImagePerformanceMetrics = {
            loadTime,
            size: 0,
            format: src.split('.').pop()?.toLowerCase() || 'unknown',
            dimensions: {
              width: img.naturalWidth,
              height: img.naturalHeight
            },
            cacheHit
          };
          
          metricsRef.current.push(metrics);
          loadStartTimes.current.delete(src);
          
          resolve(metrics);
        }
      };
      
      img.onerror = () => {
        loadStartTimes.current.delete(src);
        reject(new Error(`Failed to load image: ${src}`));
      };
      
      // 记录开始时间
      if (!startTime) {
        loadStartTimes.current.set(src, performance.now());
      }
      
      img.src = src;
    });
  }, []);

  const getAverageLoadTime = useCallback((): number => {
    const metrics = metricsRef.current;
    if (metrics.length === 0) return 0;
    
    const totalTime = metrics.reduce((sum, metric) => sum + metric.loadTime, 0);
    return totalTime / metrics.length;
  }, []);

  const getTotalImagesLoaded = useCallback((): number => {
    return metricsRef.current.length;
  }, []);

  const getCacheHitRate = useCallback((): number => {
    const metrics = metricsRef.current;
    if (metrics.length === 0) return 0;
    
    const cacheHits = metrics.filter(metric => metric.cacheHit).length;
    return (cacheHits / metrics.length) * 100;
  }, []);

  const clearMetrics = useCallback((): void => {
    metricsRef.current = [];
    loadStartTimes.current.clear();
  }, []);

  return {
    trackImageLoad,
    getAverageLoadTime,
    getTotalImagesLoaded,
    getCacheHitRate,
    clearMetrics
  };
};

// 全局图片性能监控器
class GlobalImagePerformanceMonitor {
  private metrics: ImagePerformanceMetrics[] = [];
  private observers: IntersectionObserver[] = [];

  // 监控页面中的所有图片
  monitorPageImages() {
    const images = document.querySelectorAll('img');
    
    images.forEach(img => {
      if (img.dataset.monitored) return; // 避免重复监控
      
      img.dataset.monitored = 'true';
      
      // 使用Intersection Observer监控图片进入视口
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const startTime = performance.now();
              
              const handleLoad = () => {
                const loadTime = performance.now() - startTime;
                
                this.metrics.push({
                  loadTime,
                  size: 0, // 无法直接获取
                  format: img.src.split('.').pop()?.toLowerCase() || 'unknown',
                  dimensions: {
                    width: img.naturalWidth,
                    height: img.naturalHeight
                  },
                  cacheHit: loadTime < 10
                });
                
                img.removeEventListener('load', handleLoad);
                observer.unobserve(img);
              };
              
              if (img.complete) {
                handleLoad();
              } else {
                img.addEventListener('load', handleLoad);
              }
            }
          });
        },
        { threshold: 0.1 }
      );
      
      observer.observe(img);
      this.observers.push(observer);
    });
  }

  // 获取性能报告
  getPerformanceReport() {
    const totalImages = this.metrics.length;
    if (totalImages === 0) {
      return {
        totalImages: 0,
        averageLoadTime: 0,
        cacheHitRate: 0,
        slowestImage: null,
        fastestImage: null
      };
    }

    const loadTimes = this.metrics.map(m => m.loadTime);
    const averageLoadTime = loadTimes.reduce((sum, time) => sum + time, 0) / totalImages;
    const cacheHits = this.metrics.filter(m => m.cacheHit).length;
    const cacheHitRate = (cacheHits / totalImages) * 100;
    
    const slowestImage = this.metrics.reduce((prev, current) => 
      prev.loadTime > current.loadTime ? prev : current
    );
    
    const fastestImage = this.metrics.reduce((prev, current) => 
      prev.loadTime < current.loadTime ? prev : current
    );

    return {
      totalImages,
      averageLoadTime: Math.round(averageLoadTime),
      cacheHitRate: Math.round(cacheHitRate),
      slowestImage,
      fastestImage
    };
  }

  // 清理监控器
  cleanup() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.metrics = [];
  }
}

export const globalImageMonitor = new GlobalImagePerformanceMonitor();

// 在开发环境中自动启动监控
if (process.env.NODE_ENV === 'development') {
  // 页面加载完成后开始监控
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => globalImageMonitor.monitorPageImages(), 1000);
    });
  } else {
    setTimeout(() => globalImageMonitor.monitorPageImages(), 1000);
  }
  
  // 在控制台提供性能报告函数
  (window as any).getImagePerformanceReport = () => {
    console.table(globalImageMonitor.getPerformanceReport());
  };
}
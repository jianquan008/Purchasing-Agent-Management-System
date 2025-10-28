import React from 'react';

/**
 * 图像优化工具类
 * 提供图像懒加载、缓存和优化功能
 */

interface ImageCacheEntry {
  url: string;
  blob: Blob;
  timestamp: number;
  size: number;
}

class ImageOptimizationService {
  private cache = new Map<string, ImageCacheEntry>();
  private readonly MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24小时
  private loadingPromises = new Map<string, Promise<string>>();

  /**
   * 懒加载图像
   */
  async lazyLoadImage(src: string, options?: {
    placeholder?: string;
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
  }): Promise<string> {
    // 检查缓存
    const cached = this.getFromCache(src);
    if (cached) {
      return URL.createObjectURL(cached.blob);
    }

    // 检查是否正在加载
    if (this.loadingPromises.has(src)) {
      return this.loadingPromises.get(src)!;
    }

    // 开始加载
    const loadPromise = this.loadAndCacheImage(src, options);
    this.loadingPromises.set(src, loadPromise);

    try {
      const result = await loadPromise;
      this.loadingPromises.delete(src);
      return result;
    } catch (error) {
      this.loadingPromises.delete(src);
      throw error;
    }
  }

  /**
   * 加载并缓存图像
   */
  private async loadAndCacheImage(src: string, options?: {
    placeholder?: string;
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
  }): Promise<string> {
    try {
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`Failed to load image: ${response.statusText}`);
      }

      let blob = await response.blob();

      // 如果指定了优化选项，进行图像处理
      if (options && (options.quality || options.maxWidth || options.maxHeight)) {
        blob = await this.optimizeImage(blob, options);
      }

      // 缓存图像
      this.addToCache(src, blob);

      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('图像加载失败:', error);
      
      // 返回占位符或抛出错误
      if (options?.placeholder) {
        return options.placeholder;
      }
      throw error;
    }
  }

  /**
   * 优化图像
   */
  private async optimizeImage(blob: Blob, options: {
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
  }): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(blob);
        return;
      }

      img.onload = () => {
        try {
          // 计算新尺寸
          let { width, height } = img;
          const { maxWidth = width, maxHeight = height } = options;

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width *= ratio;
            height *= ratio;
          }

          // 设置画布尺寸
          canvas.width = width;
          canvas.height = height;

          // 绘制图像
          ctx.drawImage(img, 0, 0, width, height);

          // 转换为Blob
          canvas.toBlob(
            (optimizedBlob) => {
              if (optimizedBlob) {
                resolve(optimizedBlob);
              } else {
                resolve(blob);
              }
            },
            'image/jpeg',
            options.quality || 0.8
          );
        } catch (error) {
          console.error('图像优化失败:', error);
          resolve(blob);
        }
      };

      img.onerror = () => {
        resolve(blob);
      };

      img.src = URL.createObjectURL(blob);
    });
  }

  /**
   * 从缓存获取图像
   */
  private getFromCache(url: string): ImageCacheEntry | null {
    const entry = this.cache.get(url);
    if (!entry) return null;

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.CACHE_EXPIRY) {
      this.cache.delete(url);
      URL.revokeObjectURL(url);
      return null;
    }

    return entry;
  }

  /**
   * 添加到缓存
   */
  private addToCache(url: string, blob: Blob): void {
    // 检查缓存大小
    this.cleanupCache();

    const entry: ImageCacheEntry = {
      url,
      blob,
      timestamp: Date.now(),
      size: blob.size
    };

    this.cache.set(url, entry);
  }

  /**
   * 清理缓存
   */
  private cleanupCache(): void {
    const entries: [string, ImageCacheEntry][] = [];
    this.cache.forEach((entry, url) => {
      entries.push([url, entry]);
    });
    
    const totalSize = entries.reduce((sum, [, entry]) => sum + entry.size, 0);

    if (totalSize > this.MAX_CACHE_SIZE) {
      // 按时间戳排序，删除最旧的条目
      entries.sort(([, a], [, b]) => a.timestamp - b.timestamp);
      
      let currentSize = totalSize;
      for (const [url, entry] of entries) {
        if (currentSize <= this.MAX_CACHE_SIZE * 0.8) break;
        
        this.cache.delete(url);
        URL.revokeObjectURL(entry.url);
        currentSize -= entry.size;
      }
    }
  }

  /**
   * 预加载图像
   */
  async preloadImages(urls: string[]): Promise<void> {
    const promises = urls.map(url => 
      this.lazyLoadImage(url).catch(error => {
        console.warn(`预加载图像失败: ${url}`, error);
      })
    );

    await Promise.allSettled(promises);
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.forEach((entry, url) => {
      URL.revokeObjectURL(entry.url);
    });
    this.cache.clear();
    this.loadingPromises.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    size: number;
    count: number;
    maxSize: number;
  } {
    const entries: ImageCacheEntry[] = [];
    this.cache.forEach((entry) => {
      entries.push(entry);
    });
    
    const size = entries.reduce((sum, entry) => sum + entry.size, 0);
    
    return {
      size,
      count: entries.length,
      maxSize: this.MAX_CACHE_SIZE
    };
  }
}

// 单例实例
export const imageOptimization = new ImageOptimizationService();

/**
 * React Hook for lazy loading images
 */
export function useLazyImage(src: string, options?: {
  placeholder?: string;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}) {
  const [imageSrc, setImageSrc] = React.useState<string>(options?.placeholder || '');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!src) return;

    setLoading(true);
    setError(null);

    imageOptimization.lazyLoadImage(src, options)
      .then(optimizedSrc => {
        setImageSrc(optimizedSrc);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
        if (options?.placeholder) {
          setImageSrc(options.placeholder);
        }
      });

    // 清理函数
    return () => {
      if (imageSrc && imageSrc !== options?.placeholder) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [src, options?.placeholder, options?.quality, options?.maxWidth, options?.maxHeight]);

  return { imageSrc, loading, error };
}

/**
 * 图像懒加载组件
 */
interface LazyImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'onLoad' | 'onError'> {
  src: string;
  placeholder?: string;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  onLoad?: () => void;
  onError?: (error: string) => void;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  placeholder,
  quality,
  maxWidth,
  maxHeight,
  onLoad,
  onError,
  ...imgProps
}) => {
  const { imageSrc, loading, error } = useLazyImage(src, {
    placeholder,
    quality,
    maxWidth,
    maxHeight
  });

  React.useEffect(() => {
    if (!loading && !error && onLoad) {
      onLoad();
    }
  }, [loading, error, onLoad]);

  React.useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  const { style, alt, ...restProps } = imgProps;

  return (
    <img
      {...restProps}
      src={imageSrc}
      style={{
        ...style,
        opacity: loading ? 0.5 : 1,
        transition: 'opacity 0.3s ease'
      }}
      alt={alt || '图片'}
    />
  );
};

export default imageOptimization;
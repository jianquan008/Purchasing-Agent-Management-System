import React from 'react';

/**
 * 缩略图生成和管理服务
 */

interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

interface ThumbnailCacheEntry {
  url: string;
  blob: Blob;
  timestamp: number;
  originalUrl: string;
  options: ThumbnailOptions;
}

class ThumbnailService {
  private cache = new Map<string, ThumbnailCacheEntry>();
  private readonly MAX_CACHE_SIZE = 20 * 1024 * 1024; // 20MB for thumbnails
  private readonly CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
  private generationPromises = new Map<string, Promise<string>>();

  /**
   * 生成缩略图
   */
  async generateThumbnail(
    imageUrl: string, 
    options: ThumbnailOptions = {}
  ): Promise<string> {
    const {
      width = 200,
      height = 200,
      quality = 0.7,
      format = 'jpeg'
    } = options;

    const cacheKey = this.getCacheKey(imageUrl, options);
    
    // 检查缓存
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return URL.createObjectURL(cached.blob);
    }

    // 检查是否正在生成
    if (this.generationPromises.has(cacheKey)) {
      return this.generationPromises.get(cacheKey)!;
    }

    // 开始生成缩略图
    const generatePromise = this.createThumbnail(imageUrl, { width, height, quality, format });
    this.generationPromises.set(cacheKey, generatePromise);

    try {
      const result = await generatePromise;
      this.generationPromises.delete(cacheKey);
      return result;
    } catch (error) {
      this.generationPromises.delete(cacheKey);
      throw error;
    }
  }

  /**
   * 创建缩略图
   */
  private async createThumbnail(
    imageUrl: string,
    options: Required<ThumbnailOptions>
  ): Promise<string> {
    try {
      // 加载原始图片
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to load image: ${response.statusText}`);
      }

      const blob = await response.blob();
      const thumbnailBlob = await this.resizeImage(blob, options);
      
      // 缓存缩略图
      const cacheKey = this.getCacheKey(imageUrl, options);
      this.addToCache(cacheKey, thumbnailBlob, imageUrl, options);

      return URL.createObjectURL(thumbnailBlob);
    } catch (error) {
      console.error('缩略图生成失败:', error);
      throw error;
    }
  }

  /**
   * 调整图片大小
   */
  private async resizeImage(
    blob: Blob,
    options: Required<ThumbnailOptions>
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      img.onload = () => {
        try {
          const { width: targetWidth, height: targetHeight, quality, format } = options;
          
          // 计算缩放比例，保持宽高比
          const aspectRatio = img.width / img.height;
          let newWidth = targetWidth;
          let newHeight = targetHeight;

          if (aspectRatio > 1) {
            // 宽图
            newHeight = targetWidth / aspectRatio;
          } else {
            // 高图
            newWidth = targetHeight * aspectRatio;
          }

          // 设置画布尺寸
          canvas.width = newWidth;
          canvas.height = newHeight;

          // 使用高质量缩放
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // 绘制缩放后的图片
          ctx.drawImage(img, 0, 0, newWidth, newHeight);

          // 转换为Blob
          const mimeType = format === 'png' ? 'image/png' : 
                          format === 'webp' ? 'image/webp' : 'image/jpeg';
          
          canvas.toBlob(
            (thumbnailBlob) => {
              if (thumbnailBlob) {
                resolve(thumbnailBlob);
              } else {
                reject(new Error('Failed to create thumbnail blob'));
              }
            },
            mimeType,
            quality
          );
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image for thumbnail generation'));
      };

      img.src = URL.createObjectURL(blob);
    });
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(url: string, options: ThumbnailOptions): string {
    const { width = 200, height = 200, quality = 0.7, format = 'jpeg' } = options;
    return `${url}_${width}x${height}_${quality}_${format}`;
  }

  /**
   * 从缓存获取缩略图
   */
  private getFromCache(cacheKey: string): ThumbnailCacheEntry | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.CACHE_EXPIRY) {
      this.cache.delete(cacheKey);
      URL.revokeObjectURL(entry.url);
      return null;
    }

    return entry;
  }

  /**
   * 添加到缓存
   */
  private addToCache(
    cacheKey: string,
    blob: Blob,
    originalUrl: string,
    options: ThumbnailOptions
  ): void {
    // 清理缓存
    this.cleanupCache();

    const entry: ThumbnailCacheEntry = {
      url: URL.createObjectURL(blob),
      blob,
      timestamp: Date.now(),
      originalUrl,
      options
    };

    this.cache.set(cacheKey, entry);
  }

  /**
   * 清理缓存
   */
  private cleanupCache(): void {
    const entries: [string, ThumbnailCacheEntry][] = [];
    this.cache.forEach((entry, key) => {
      entries.push([key, entry]);
    });
    
    const totalSize = entries.reduce((sum, [, entry]) => sum + entry.blob.size, 0);

    if (totalSize > this.MAX_CACHE_SIZE) {
      // 按时间戳排序，删除最旧的条目
      entries.sort(([, a], [, b]) => a.timestamp - b.timestamp);
      
      let currentSize = totalSize;
      for (const [key, entry] of entries) {
        if (currentSize <= this.MAX_CACHE_SIZE * 0.8) break;
        
        this.cache.delete(key);
        URL.revokeObjectURL(entry.url);
        currentSize -= entry.blob.size;
      }
    }
  }

  /**
   * 批量生成缩略图
   */
  async generateThumbnails(
    imageUrls: string[],
    options: ThumbnailOptions = {}
  ): Promise<{ [url: string]: string }> {
    const results: { [url: string]: string } = {};
    
    const promises = imageUrls.map(async (url) => {
      try {
        const thumbnailUrl = await this.generateThumbnail(url, options);
        results[url] = thumbnailUrl;
      } catch (error) {
        console.warn(`Failed to generate thumbnail for ${url}:`, error);
        results[url] = url; // 使用原图作为后备
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * 预生成收据图片缩略图
   */
  async preGenerateReceiptThumbnails(receiptImageUrls: string[]): Promise<void> {
    const thumbnailOptions: ThumbnailOptions[] = [
      { width: 150, height: 150, quality: 0.6 }, // 小缩略图
      { width: 300, height: 300, quality: 0.7 }, // 中等缩略图
    ];

    const promises = receiptImageUrls.flatMap(url =>
      thumbnailOptions.map(options =>
        this.generateThumbnail(url, options).catch(error => {
          console.warn(`Failed to pre-generate thumbnail for ${url}:`, error);
        })
      )
    );

    await Promise.allSettled(promises);
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.forEach((entry) => {
      URL.revokeObjectURL(entry.url);
    });
    this.cache.clear();
    this.generationPromises.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    size: number;
    count: number;
    maxSize: number;
  } {
    const entries: ThumbnailCacheEntry[] = [];
    this.cache.forEach((entry) => {
      entries.push(entry);
    });
    
    const size = entries.reduce((sum, entry) => sum + entry.blob.size, 0);
    
    return {
      size,
      count: entries.length,
      maxSize: this.MAX_CACHE_SIZE
    };
  }
}

// 单例实例
export const thumbnailService = new ThumbnailService();

/**
 * React Hook for thumbnail generation
 */
export function useThumbnail(
  imageUrl: string,
  options: ThumbnailOptions = {}
) {
  const [thumbnailUrl, setThumbnailUrl] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!imageUrl) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    thumbnailService
      .generateThumbnail(imageUrl, options)
      .then(url => {
        setThumbnailUrl(url);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setThumbnailUrl(imageUrl); // 使用原图作为后备
        setLoading(false);
      });

    // 清理函数
    return () => {
      if (thumbnailUrl && thumbnailUrl !== imageUrl) {
        URL.revokeObjectURL(thumbnailUrl);
      }
    };
  }, [imageUrl, options.width, options.height, options.quality, options.format]);

  return { thumbnailUrl, loading, error };
}

export default thumbnailService;
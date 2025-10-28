import React, { useState, useRef, useEffect } from 'react';
import { Skeleton, Image } from 'antd';
import { imageOptimization } from '../utils/imageOptimization';
import { useImagePerformance } from '../hooks/useImagePerformance';

interface OptimizedImageProps {
  src: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  placeholder?: string;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  className?: string;
  style?: React.CSSProperties;
  lazy?: boolean;
  thumbnail?: boolean;
  onLoad?: () => void;
  onError?: (error: string) => void;
  fallback?: string;
  preview?: boolean;
  onClick?: () => void;
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt = '图片',
  width,
  height,
  placeholder,
  quality = 0.8,
  maxWidth,
  maxHeight,
  className,
  style,
  lazy = true,
  thumbnail = false,
  onLoad,
  onError,
  fallback,
  preview = true,
  onClick,
  ...props
}) => {
  const [imageSrc, setImageSrc] = useState<string>(placeholder || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inView, setInView] = useState(!lazy);
  const imgRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const { trackImageLoad } = useImagePerformance();

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!lazy || inView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before the image comes into view
        threshold: 0.1,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [lazy, inView]);

  // Load image when in view
  useEffect(() => {
    if (!inView || !src) return;

    setLoading(true);
    setError(null);

    const loadOptions = {
      placeholder,
      quality,
      maxWidth: thumbnail ? Math.min(maxWidth || 200, 200) : maxWidth,
      maxHeight: thumbnail ? Math.min(maxHeight || 200, 200) : maxHeight,
    };

    const loadStartTime = performance.now();
    
    imageOptimization
      .lazyLoadImage(src, loadOptions)
      .then((optimizedSrc) => {
        setImageSrc(optimizedSrc);
        setLoading(false);
        
        // 跟踪图片加载性能
        trackImageLoad(src, loadStartTime).catch(console.warn);
        
        onLoad?.();
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
        
        if (fallback) {
          setImageSrc(fallback);
        } else if (placeholder) {
          setImageSrc(placeholder);
        }
        
        onError?.(err.message);
      });
  }, [inView, src, placeholder, quality, maxWidth, maxHeight, thumbnail, onLoad, onError, fallback]);

  // Generate placeholder based on dimensions
  const generatePlaceholder = () => {
    const w = typeof width === 'number' ? width : 200;
    const h = typeof height === 'number' ? height : 150;
    
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="${w}" height="${h}" fill="#F5F5F5"/>
        <text x="${w/2}" y="${h/2}" font-family="Arial" font-size="14" fill="#999999" text-anchor="middle">
          ${loading ? '加载中...' : error ? '加载失败' : '图片'}
        </text>
      </svg>
    `)}`;
  };

  const containerStyle: React.CSSProperties = {
    width,
    height,
    display: 'inline-block',
    position: 'relative',
    overflow: 'hidden',
    ...style,
  };

  if (!inView) {
    return (
      <div ref={imgRef} style={containerStyle} className={className}>
        <Skeleton.Image 
          style={{ width: '100%', height: '100%' }} 
          active={false}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div ref={imgRef} style={containerStyle} className={className}>
        <Skeleton.Image 
          style={{ width: '100%', height: '100%' }} 
          active={true}
        />
      </div>
    );
  }

  if (error && !imageSrc) {
    return (
      <div 
        ref={imgRef} 
        style={{
          ...containerStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
          color: '#999',
          fontSize: '12px',
        }}
        className={className}
      >
        图片加载失败
      </div>
    );
  }

  return (
    <div ref={imgRef} style={containerStyle} className={className} onClick={onClick}>
      <Image
        src={imageSrc || generatePlaceholder()}
        alt={alt}
        width="100%"
        height="100%"
        style={{
          objectFit: 'cover',
          transition: 'opacity 0.3s ease',
          cursor: onClick ? 'pointer' : 'default',
        }}
        placeholder={
          <Skeleton.Image 
            style={{ width: '100%', height: '100%' }} 
            active={true}
          />
        }
        fallback={fallback || generatePlaceholder()}
        preview={preview}
        {...props}
      />
    </div>
  );
};

export default OptimizedImage;
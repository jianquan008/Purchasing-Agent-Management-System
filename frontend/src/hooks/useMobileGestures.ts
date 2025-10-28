import { useEffect, useRef, useCallback, useState } from 'react';

interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  velocityThreshold?: number;
}

interface PullRefreshOptions {
  onRefresh?: () => void;
  threshold?: number;
  maxDistance?: number;
  disabled?: boolean;
}

interface PinchZoomOptions {
  onZoomIn?: (scale: number) => void;
  onZoomOut?: (scale: number) => void;
  onZoomChange?: (scale: number) => void;
  minScale?: number;
  maxScale?: number;
}

// 滑动手势Hook
export const useSwipeGesture = (options: SwipeGestureOptions) => {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 50,
    velocityThreshold = 0.3
  } = options;

  const startPoint = useRef<TouchPoint | null>(null);
  const elementRef = useRef<HTMLElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    startPoint.current = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    };
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!startPoint.current) return;

    const touch = e.changedTouches[0];
    const endPoint = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    };

    const deltaX = endPoint.x - startPoint.current.x;
    const deltaY = endPoint.y - startPoint.current.y;
    const deltaTime = endPoint.timestamp - startPoint.current.timestamp;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const velocity = distance / deltaTime;

    if (distance < threshold || velocity < velocityThreshold) {
      return;
    }

    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (absDeltaX > absDeltaY) {
      // 水平滑动
      if (deltaX > 0) {
        onSwipeRight?.();
      } else {
        onSwipeLeft?.();
      }
    } else {
      // 垂直滑动
      if (deltaY > 0) {
        onSwipeDown?.();
      } else {
        onSwipeUp?.();
      }
    }

    startPoint.current = null;
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold, velocityThreshold]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);

  return elementRef;
};

// 下拉刷新Hook
export const usePullRefresh = (options: PullRefreshOptions) => {
  const {
    onRefresh,
    threshold = 80,
    maxDistance = 120,
    disabled = false
  } = options;

  const elementRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const isRefreshing = useRef<boolean>(false);
  const isPulling = useRef<boolean>(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing.current) return;
    
    const touch = e.touches[0];
    startY.current = touch.clientY;
    currentY.current = touch.clientY;
    
    // 只有在页面顶部时才允许下拉刷新
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    if (scrollTop === 0) {
      isPulling.current = true;
    }
  }, [disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing.current || !isPulling.current) return;

    const touch = e.touches[0];
    currentY.current = touch.clientY;
    const deltaY = currentY.current - startY.current;

    if (deltaY > 0) {
      e.preventDefault();
      const distance = Math.min(deltaY, maxDistance);
      
      // 更新UI指示器位置
      const element = elementRef.current;
      if (element) {
        const indicator = element.querySelector('.pull-refresh-indicator');
        if (indicator) {
          (indicator as HTMLElement).style.transform = `translateY(${distance}px)`;
          
          if (distance >= threshold) {
            indicator.classList.add('ready-to-refresh');
          } else {
            indicator.classList.remove('ready-to-refresh');
          }
        }
      }
    }
  }, [disabled, threshold, maxDistance]);

  const handleTouchEnd = useCallback(() => {
    if (disabled || isRefreshing.current || !isPulling.current) return;

    const deltaY = currentY.current - startY.current;
    isPulling.current = false;

    if (deltaY >= threshold) {
      isRefreshing.current = true;
      onRefresh?.();
      
      // 重置UI
      setTimeout(() => {
        isRefreshing.current = false;
        const element = elementRef.current;
        if (element) {
          const indicator = element.querySelector('.pull-refresh-indicator');
          if (indicator) {
            (indicator as HTMLElement).style.transform = 'translateY(0)';
            indicator.classList.remove('ready-to-refresh');
          }
        }
      }, 1000);
    } else {
      // 重置UI
      const element = elementRef.current;
      if (element) {
        const indicator = element.querySelector('.pull-refresh-indicator');
        if (indicator) {
          (indicator as HTMLElement).style.transform = 'translateY(0)';
          indicator.classList.remove('ready-to-refresh');
        }
      }
    }
  }, [disabled, threshold, onRefresh]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return elementRef;
};

// 双指缩放Hook
export const usePinchZoom = (options: PinchZoomOptions) => {
  const {
    onZoomIn,
    onZoomOut,
    onZoomChange,
    minScale = 0.5,
    maxScale = 3
  } = options;

  const elementRef = useRef<HTMLElement>(null);
  const initialDistance = useRef<number>(0);
  const currentScale = useRef<number>(1);

  const getDistance = (touch1: Touch, touch2: Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      initialDistance.current = getDistance(e.touches[0], e.touches[1]);
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      
      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      const scale = currentDistance / initialDistance.current;
      const newScale = Math.max(minScale, Math.min(maxScale, currentScale.current * scale));
      
      onZoomChange?.(newScale);
      
      if (newScale > currentScale.current) {
        onZoomIn?.(newScale);
      } else if (newScale < currentScale.current) {
        onZoomOut?.(newScale);
      }
      
      currentScale.current = newScale;
      initialDistance.current = currentDistance;
    }
  }, [onZoomIn, onZoomOut, onZoomChange, minScale, maxScale]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
    };
  }, [handleTouchStart, handleTouchMove]);

  return elementRef;
};

// 震动反馈Hook
export const useHapticFeedback = () => {
  const vibrate = useCallback((pattern: number | number[] = 10) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }, []);

  const lightImpact = useCallback(() => {
    vibrate(10);
  }, [vibrate]);

  const mediumImpact = useCallback(() => {
    vibrate(20);
  }, [vibrate]);

  const heavyImpact = useCallback(() => {
    vibrate(30);
  }, [vibrate]);

  const selectionChanged = useCallback(() => {
    vibrate([5, 5]);
  }, [vibrate]);

  const notificationSuccess = useCallback(() => {
    vibrate([10, 50, 10]);
  }, [vibrate]);

  const notificationWarning = useCallback(() => {
    vibrate([10, 50, 10, 50, 10]);
  }, [vibrate]);

  const notificationError = useCallback(() => {
    vibrate([20, 50, 20, 50, 20]);
  }, [vibrate]);

  return {
    vibrate,
    lightImpact,
    mediumImpact,
    heavyImpact,
    selectionChanged,
    notificationSuccess,
    notificationWarning,
    notificationError
  };
};

// 移动端检测Hook
export const useIsMobile = (breakpoint: number = 768) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= breakpoint);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, [breakpoint]);

  return isMobile;
};
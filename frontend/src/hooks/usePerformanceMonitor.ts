import React, { useEffect, useRef, useState } from 'react';

interface PerformanceMetrics {
  renderTime: number;
  componentMountTime: number;
  memoryUsage?: number;
  networkRequests: number;
  errorCount: number;
}

interface PerformanceEntry {
  name: string;
  startTime: number;
  duration: number;
  entryType: string;
}

/**
 * 性能监控 Hook
 */
export function usePerformanceMonitor(componentName: string) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    componentMountTime: 0,
    networkRequests: 0,
    errorCount: 0
  });

  const mountTimeRef = useRef<number>(Date.now());
  const renderCountRef = useRef<number>(0);
  const errorCountRef = useRef<number>(0);

  useEffect(() => {
    const startTime = mountTimeRef.current;
    const mountTime = Date.now() - startTime;

    // 记录组件挂载时间
    setMetrics(prev => ({
      ...prev,
      componentMountTime: mountTime
    }));

    // 监听性能条目
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      
      entries.forEach((entry) => {
        if (entry.name.includes('navigation')) {
          // 页面导航性能
          console.log(`[Performance] ${componentName} navigation:`, entry.duration);
        } else if (entry.entryType === 'measure') {
          // 自定义测量
          console.log(`[Performance] ${componentName} measure:`, entry.name, entry.duration);
        }
      });
    });

    // 观察导航和测量条目
    try {
      observer.observe({ entryTypes: ['navigation', 'measure'] });
    } catch (error) {
      console.warn('Performance Observer not supported:', error);
    }

    // 监听内存使用情况（如果支持）
    const updateMemoryUsage = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        setMetrics(prev => ({
          ...prev,
          memoryUsage: memory.usedJSHeapSize
        }));
      }
    };

    const memoryInterval = setInterval(updateMemoryUsage, 5000);

    // 监听网络请求
    const originalFetch = window.fetch;
    let requestCount = 0;

    window.fetch = async (...args) => {
      requestCount++;
      setMetrics(prev => ({
        ...prev,
        networkRequests: requestCount
      }));

      try {
        const response = await originalFetch(...args);
        return response;
      } catch (error) {
        errorCountRef.current++;
        setMetrics(prev => ({
          ...prev,
          errorCount: errorCountRef.current
        }));
        throw error;
      }
    };

    return () => {
      observer.disconnect();
      clearInterval(memoryInterval);
      window.fetch = originalFetch;
    };
  }, [componentName]);

  // 记录渲染时间
  useEffect(() => {
    renderCountRef.current++;
    const renderStart = performance.now();

    // 使用 requestAnimationFrame 来测量渲染完成时间
    requestAnimationFrame(() => {
      const renderTime = performance.now() - renderStart;
      setMetrics(prev => ({
        ...prev,
        renderTime: renderTime
      }));
    });
  });

  // 性能标记函数
  const markStart = (name: string) => {
    performance.mark(`${componentName}-${name}-start`);
  };

  const markEnd = (name: string) => {
    const startMark = `${componentName}-${name}-start`;
    const endMark = `${componentName}-${name}-end`;
    const measureName = `${componentName}-${name}`;

    performance.mark(endMark);
    
    try {
      performance.measure(measureName, startMark, endMark);
      
      // 获取测量结果
      const measures = performance.getEntriesByName(measureName, 'measure');
      if (measures.length > 0) {
        const measure = measures[measures.length - 1];
        console.log(`[Performance] ${measureName}: ${measure.duration.toFixed(2)}ms`);
      }
    } catch (error) {
      console.warn('Performance measure failed:', error);
    }
  };

  // 记录用户交互
  const recordInteraction = (interactionName: string, startTime?: number) => {
    const endTime = performance.now();
    const duration = startTime ? endTime - startTime : 0;
    
    console.log(`[Interaction] ${componentName} - ${interactionName}: ${duration.toFixed(2)}ms`);
    
    // 可以发送到分析服务
    if (duration > 100) {
      console.warn(`[Performance Warning] Slow interaction: ${interactionName} took ${duration.toFixed(2)}ms`);
    }
  };

  return {
    metrics,
    markStart,
    markEnd,
    recordInteraction,
    renderCount: renderCountRef.current
  };
}

/**
 * 网络性能监控 Hook
 */
export function useNetworkMonitor() {
  const [networkMetrics, setNetworkMetrics] = useState({
    requestCount: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    slowRequests: 0
  });

  useEffect(() => {
    const requestTimes = new Map<string, number>();
    const responseTimes: number[] = [];

    // 拦截 fetch 请求
    const originalFetch = window.fetch;
    
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const startTime = performance.now();
      
      requestTimes.set(url, startTime);
      
      setNetworkMetrics(prev => ({
        ...prev,
        requestCount: prev.requestCount + 1
      }));

      try {
        const response = await originalFetch(input, init);
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        responseTimes.push(duration);
        
        // 保持最近100个请求的响应时间
        if (responseTimes.length > 100) {
          responseTimes.shift();
        }
        
        const averageTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
        const slowCount = responseTimes.filter(time => time > 3000).length;
        
        setNetworkMetrics(prev => ({
          ...prev,
          averageResponseTime: averageTime,
          slowRequests: slowCount
        }));

        // 记录慢请求
        if (duration > 3000) {
          console.warn(`[Network] Slow request: ${url} took ${duration.toFixed(2)}ms`);
        }

        return response;
      } catch (error) {
        setNetworkMetrics(prev => ({
          ...prev,
          failedRequests: prev.failedRequests + 1
        }));
        
        console.error(`[Network] Request failed: ${url}`, error);
        throw error;
      } finally {
        requestTimes.delete(url);
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return networkMetrics;
}

/**
 * 组件渲染性能监控 Hook
 */
export function useRenderPerformance(componentName: string, dependencies: any[] = []) {
  const renderCountRef = useRef(0);
  const lastRenderTimeRef = useRef(0);
  const [renderStats, setRenderStats] = useState({
    renderCount: 0,
    lastRenderTime: 0,
    averageRenderTime: 0,
    slowRenders: 0
  });

  useEffect(() => {
    const startTime = performance.now();
    renderCountRef.current++;

    // 使用 setTimeout 来确保渲染完成后测量
    const timeoutId = setTimeout(() => {
      const renderTime = performance.now() - startTime;
      lastRenderTimeRef.current = renderTime;

      setRenderStats(prev => {
        const newAverageTime = (prev.averageRenderTime * (prev.renderCount - 1) + renderTime) / prev.renderCount;
        const newSlowRenders = renderTime > 16 ? prev.slowRenders + 1 : prev.slowRenders;

        return {
          renderCount: renderCountRef.current,
          lastRenderTime: renderTime,
          averageRenderTime: newAverageTime,
          slowRenders: newSlowRenders
        };
      });

      // 警告慢渲染
      if (renderTime > 16) {
        console.warn(`[Render Performance] ${componentName} slow render: ${renderTime.toFixed(2)}ms`);
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, dependencies);

  return renderStats;
}

/**
 * 内存使用监控 Hook
 */
export function useMemoryMonitor() {
  const [memoryStats, setMemoryStats] = useState({
    usedJSHeapSize: 0,
    totalJSHeapSize: 0,
    jsHeapSizeLimit: 0,
    memoryPressure: 'low' as 'low' | 'medium' | 'high'
  });

  useEffect(() => {
    const updateMemoryStats = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
        
        let pressure: 'low' | 'medium' | 'high' = 'low';
        if (usageRatio > 0.8) pressure = 'high';
        else if (usageRatio > 0.6) pressure = 'medium';

        setMemoryStats({
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          memoryPressure: pressure
        });

        // 内存压力警告
        if (pressure === 'high') {
          console.warn('[Memory] High memory usage detected:', {
            used: (memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + 'MB',
            limit: (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2) + 'MB',
            usage: (usageRatio * 100).toFixed(1) + '%'
          });
        }
      }
    };

    // 立即更新一次
    updateMemoryStats();

    // 定期更新
    const interval = setInterval(updateMemoryStats, 10000); // 每10秒

    return () => clearInterval(interval);
  }, []);

  return memoryStats;
}

/**
 * 综合性能监控 Hook
 */
export function usePerformanceDashboard(componentName: string) {
  const performanceMetrics = usePerformanceMonitor(componentName);
  const networkMetrics = useNetworkMonitor();
  const memoryMetrics = useMemoryMonitor();
  const renderMetrics = useRenderPerformance(componentName);

  const overallScore = React.useMemo(() => {
    let score = 100;

    // 渲染性能评分
    if (renderMetrics.averageRenderTime > 16) score -= 20;
    if (renderMetrics.slowRenders > 5) score -= 10;

    // 网络性能评分
    if (networkMetrics.averageResponseTime > 3000) score -= 15;
    if (networkMetrics.failedRequests > 0) score -= 10;

    // 内存使用评分
    if (memoryMetrics.memoryPressure === 'high') score -= 25;
    if (memoryMetrics.memoryPressure === 'medium') score -= 10;

    return Math.max(0, score);
  }, [renderMetrics, networkMetrics, memoryMetrics]);

  return {
    performance: performanceMetrics,
    network: networkMetrics,
    memory: memoryMetrics,
    render: renderMetrics,
    overallScore,
    recommendations: generateRecommendations(renderMetrics, networkMetrics, memoryMetrics)
  };
}

function generateRecommendations(
  renderMetrics: any,
  networkMetrics: any,
  memoryMetrics: any
): string[] {
  const recommendations: string[] = [];

  if (renderMetrics.averageRenderTime > 16) {
    recommendations.push('考虑使用 React.memo 或 useMemo 优化组件渲染');
  }

  if (renderMetrics.slowRenders > 5) {
    recommendations.push('检查组件是否有不必要的重新渲染');
  }

  if (networkMetrics.averageResponseTime > 3000) {
    recommendations.push('考虑实现请求缓存或优化API响应时间');
  }

  if (networkMetrics.failedRequests > 0) {
    recommendations.push('添加网络错误重试机制');
  }

  if (memoryMetrics.memoryPressure === 'high') {
    recommendations.push('检查是否存在内存泄漏，考虑清理未使用的对象');
  }

  return recommendations;
}
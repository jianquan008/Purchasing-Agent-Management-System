import * as fs from 'fs';
import * as path from 'path';
import { ErrorHandlingService } from './errorHandlingService';

/**
 * 系统监控指标接口
 */
export interface SystemMetrics {
  timestamp: Date;
  ocrRequests: {
    total: number;
    successful: number;
    failed: number;
    fallbackUsed: number;
    averageProcessingTime: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  performance: {
    averageResponseTime: number;
    slowestOperations: Array<{
      operation: string;
      duration: number;
      timestamp: Date;
    }>;
  };
  system: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    diskSpace?: {
      total: number;
      used: number;
      available: number;
    };
  };
}

/**
 * 监控和指标收集服务
 */
export class MonitoringService {
  private static instance: MonitoringService;
  private errorHandler: ErrorHandlingService;
  private metricsHistory: SystemMetrics[] = [];
  private startTime: Date;
  private requestCounts: Map<string, number> = new Map();
  private responseTimes: Map<string, number[]> = new Map();

  private constructor() {
    this.errorHandler = ErrorHandlingService.getInstance();
    this.startTime = new Date();
    
    // 定期收集系统指标
    setInterval(() => {
      this.collectSystemMetrics();
    }, 60000); // 每分钟收集一次
    
    // 定期清理历史数据
    setInterval(() => {
      this.cleanupMetricsHistory();
    }, 3600000); // 每小时清理一次
  }

  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * 增强的请求指标记录
   */
  public recordRequest(
    operation: string, 
    success: boolean, 
    duration: number, 
    usedFallback: boolean = false,
    errorType?: string,
    retryCount?: number
  ): void {
    const timestamp = new Date();
    
    // 更新请求计数
    const totalKey = `${operation}_total`;
    const successKey = `${operation}_success`;
    const failureKey = `${operation}_failure`;
    const fallbackKey = `${operation}_fallback`;

    this.requestCounts.set(totalKey, (this.requestCounts.get(totalKey) || 0) + 1);
    
    if (success) {
      this.requestCounts.set(successKey, (this.requestCounts.get(successKey) || 0) + 1);
    } else {
      this.requestCounts.set(failureKey, (this.requestCounts.get(failureKey) || 0) + 1);
      
      // 记录错误类型统计
      if (errorType) {
        const errorKey = `${operation}_error_${errorType}`;
        this.requestCounts.set(errorKey, (this.requestCounts.get(errorKey) || 0) + 1);
      }
    }
    
    if (usedFallback) {
      this.requestCounts.set(fallbackKey, (this.requestCounts.get(fallbackKey) || 0) + 1);
    }

    // 记录重试统计
    if (retryCount && retryCount > 1) {
      const retryKey = `${operation}_retries`;
      const currentRetries = this.requestCounts.get(retryKey) || 0;
      this.requestCounts.set(retryKey, currentRetries + retryCount - 1);
    }

    // 记录响应时间
    if (!this.responseTimes.has(operation)) {
      this.responseTimes.set(operation, []);
    }
    const times = this.responseTimes.get(operation)!;
    times.push(duration);
    
    // 只保留最近100次的响应时间
    if (times.length > 100) {
      times.shift();
    }

    // 检查是否需要发出警报
    this.checkForAlerts(operation, success, duration, usedFallback, errorType);

    // 记录详细的请求日志用于分析
    this.logRequestDetails(operation, success, duration, usedFallback, timestamp, errorType, retryCount);
  }

  /**
   * 检查警报条件
   */
  private checkForAlerts(
    operation: string, 
    success: boolean, 
    duration: number, 
    usedFallback: boolean,
    errorType?: string
  ): void {
    const now = Date.now();
    
    // 检查响应时间警报
    if (duration > 30000) { // 超过30秒
      console.warn(`[ALERT] 操作 ${operation} 响应时间过长: ${duration}ms`);
      this.logAlert('SLOW_RESPONSE', `${operation} 响应时间 ${duration}ms 超过阈值`, {
        operation,
        duration,
        threshold: 30000
      });
    }
    
    // 检查失败率警报
    if (!success) {
      const recentFailures = this.getRecentFailureCount(operation, 300000); // 5分钟内
      if (recentFailures >= 5) {
        console.warn(`[ALERT] 操作 ${operation} 5分钟内失败 ${recentFailures} 次`);
        this.logAlert('HIGH_FAILURE_RATE', `${operation} 短时间内多次失败`, {
          operation,
          failureCount: recentFailures,
          timeWindow: '5分钟',
          errorType
        });
      }
    }
    
    // 检查降级使用警报
    if (usedFallback) {
      const recentFallbacks = this.getRecentFallbackCount(operation, 600000); // 10分钟内
      if (recentFallbacks >= 3) {
        console.warn(`[ALERT] 操作 ${operation} 10分钟内使用降级 ${recentFallbacks} 次`);
        this.logAlert('FREQUENT_FALLBACK', `${operation} 频繁使用降级服务`, {
          operation,
          fallbackCount: recentFallbacks,
          timeWindow: '10分钟'
        });
      }
    }
  }

  /**
   * 记录警报
   */
  private logAlert(alertType: string, message: string, context: Record<string, any>): void {
    try {
      const logDir = process.env.LOG_DIR || './logs';
      const alertLogPath = path.join(logDir, 'alerts.log');
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const alertEntry = {
        timestamp: new Date().toISOString(),
        type: alertType,
        message,
        context,
        severity: this.getAlertSeverity(alertType)
      };
      
      const logLine = JSON.stringify(alertEntry) + '\n';
      fs.appendFileSync(alertLogPath, logLine);
    } catch (error) {
      console.error('记录警报失败:', error);
    }
  }

  /**
   * 获取警报严重程度
   */
  private getAlertSeverity(alertType: string): string {
    switch (alertType) {
      case 'HIGH_FAILURE_RATE':
        return 'HIGH';
      case 'FREQUENT_FALLBACK':
        return 'MEDIUM';
      case 'SLOW_RESPONSE':
        return 'MEDIUM';
      default:
        return 'LOW';
    }
  }

  /**
   * 获取最近失败次数
   */
  private getRecentFailureCount(operation: string, timeWindowMs: number): number {
    try {
      const logDir = process.env.LOG_DIR || './logs';
      const requestLogPath = path.join(logDir, 'requests.log');
      
      if (!fs.existsSync(requestLogPath)) {
        return 0;
      }

      const logContent = fs.readFileSync(requestLogPath, 'utf-8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      const cutoffTime = new Date(Date.now() - timeWindowMs);
      let failureCount = 0;
      
      for (const line of lines.slice(-100)) { // 只检查最近100条记录
        try {
          const logEntry = JSON.parse(line);
          const logTime = new Date(logEntry.timestamp);
          
          if (logTime >= cutoffTime && 
              logEntry.operation === operation && 
              !logEntry.success) {
            failureCount++;
          }
        } catch (parseError) {
          // 忽略解析错误的日志行
        }
      }
      
      return failureCount;
    } catch (error) {
      console.error('获取失败次数失败:', error);
      return 0;
    }
  }

  /**
   * 获取最近降级使用次数
   */
  private getRecentFallbackCount(operation: string, timeWindowMs: number): number {
    try {
      const logDir = process.env.LOG_DIR || './logs';
      const requestLogPath = path.join(logDir, 'requests.log');
      
      if (!fs.existsSync(requestLogPath)) {
        return 0;
      }

      const logContent = fs.readFileSync(requestLogPath, 'utf-8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      const cutoffTime = new Date(Date.now() - timeWindowMs);
      let fallbackCount = 0;
      
      for (const line of lines.slice(-100)) { // 只检查最近100条记录
        try {
          const logEntry = JSON.parse(line);
          const logTime = new Date(logEntry.timestamp);
          
          if (logTime >= cutoffTime && 
              logEntry.operation === operation && 
              logEntry.usedFallback) {
            fallbackCount++;
          }
        } catch (parseError) {
          // 忽略解析错误的日志行
        }
      }
      
      return fallbackCount;
    } catch (error) {
      console.error('获取降级次数失败:', error);
      return 0;
    }
  }

  /**
   * 记录详细的请求信息
   */
  private logRequestDetails(
    operation: string, 
    success: boolean, 
    duration: number, 
    usedFallback: boolean, 
    timestamp: Date,
    errorType?: string,
    retryCount?: number
  ): void {
    try {
      const logDir = process.env.LOG_DIR || './logs';
      const requestLogPath = path.join(logDir, 'requests.log');
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const logEntry = {
        timestamp: timestamp.toISOString(),
        operation,
        success,
        duration,
        usedFallback,
        errorType,
        retryCount,
        hour: timestamp.getHours(),
        dayOfWeek: timestamp.getDay(),
        performanceCategory: this.categorizePerformance(duration),
        isSlowRequest: duration > 10000,
        isVerySlowRequest: duration > 30000
      };
      
      const logLine = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(requestLogPath, logLine);
    } catch (error) {
      console.error('记录请求详情失败:', error);
    }
  }

  /**
   * 性能分类
   */
  private categorizePerformance(duration: number): string {
    if (duration < 1000) return 'fast';
    if (duration < 5000) return 'normal';
    if (duration < 15000) return 'slow';
    if (duration < 30000) return 'very_slow';
    return 'extremely_slow';
  }

  /**
   * 获取当前系统指标
   */
  public getCurrentMetrics(): SystemMetrics {
    const now = new Date();
    const uptime = now.getTime() - this.startTime.getTime();

    // 计算OCR请求指标
    const ocrTotal = this.requestCounts.get('ocr_recognition_total') || 0;
    const ocrSuccess = this.requestCounts.get('ocr_recognition_success') || 0;
    const ocrFailure = this.requestCounts.get('ocr_recognition_failure') || 0;
    const ocrFallback = this.requestCounts.get('ocr_recognition_fallback') || 0;
    
    const ocrTimes = this.responseTimes.get('ocr_recognition') || [];
    const averageOcrTime = ocrTimes.length > 0 ? 
      ocrTimes.reduce((sum, time) => sum + time, 0) / ocrTimes.length : 0;

    // 分析错误日志
    const errorStats = this.analyzeErrorLogs();

    // 计算平均响应时间
    let totalResponseTime = 0;
    let totalRequests = 0;
    for (const [operation, times] of this.responseTimes.entries()) {
      totalResponseTime += times.reduce((sum, time) => sum + time, 0);
      totalRequests += times.length;
    }
    const averageResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;

    // 获取最慢的操作
    const slowestOperations = this.getSlowestOperations();

    return {
      timestamp: now,
      ocrRequests: {
        total: ocrTotal,
        successful: ocrSuccess,
        failed: ocrFailure,
        fallbackUsed: ocrFallback,
        averageProcessingTime: averageOcrTime
      },
      errors: errorStats,
      performance: {
        averageResponseTime,
        slowestOperations
      },
      system: {
        uptime,
        memoryUsage: process.memoryUsage()
      }
    };
  }

  /**
   * 分析错误日志
   */
  private analyzeErrorLogs(): { total: number; byType: Record<string, number>; bySeverity: Record<string, number> } {
    const result = {
      total: 0,
      byType: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>
    };

    try {
      const logDir = process.env.LOG_DIR || './logs';
      const errorLogPath = path.join(logDir, 'errors.log');
      
      if (!fs.existsSync(errorLogPath)) {
        return result;
      }

      const logContent = fs.readFileSync(errorLogPath, 'utf-8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      // 只分析最近1小时的日志
      const oneHourAgo = new Date(Date.now() - 3600000);
      
      for (const line of lines) {
        try {
          const logEntry = JSON.parse(line);
          const logTime = new Date(logEntry.timestamp);
          
          if (logTime >= oneHourAgo) {
            result.total++;
            
            // 按类型统计
            const errorType = logEntry.type || 'UNKNOWN';
            result.byType[errorType] = (result.byType[errorType] || 0) + 1;
            
            // 按严重程度统计
            const severity = logEntry.severity || 'UNKNOWN';
            result.bySeverity[severity] = (result.bySeverity[severity] || 0) + 1;
          }
        } catch (parseError) {
          // 忽略解析错误的日志行
        }
      }
    } catch (error) {
      console.error('分析错误日志失败:', error);
    }

    return result;
  }

  /**
   * 获取最慢的操作
   */
  private getSlowestOperations(): Array<{ operation: string; duration: number; timestamp: Date }> {
    const slowOperations: Array<{ operation: string; duration: number; timestamp: Date }> = [];
    
    for (const [operation, times] of this.responseTimes.entries()) {
      if (times.length > 0) {
        const maxTime = Math.max(...times);
        if (maxTime > 5000) { // 只记录超过5秒的操作
          slowOperations.push({
            operation,
            duration: maxTime,
            timestamp: new Date() // 简化处理，使用当前时间
          });
        }
      }
    }
    
    return slowOperations.sort((a, b) => b.duration - a.duration).slice(0, 10);
  }

  /**
   * 收集系统指标
   */
  private collectSystemMetrics(): void {
    try {
      const metrics = this.getCurrentMetrics();
      this.metricsHistory.push(metrics);
      
      // 记录到文件
      this.saveMetricsToFile(metrics);
    } catch (error) {
      console.error('收集系统指标失败:', error);
    }
  }

  /**
   * 保存指标到文件
   */
  private saveMetricsToFile(metrics: SystemMetrics): void {
    try {
      const logDir = process.env.LOG_DIR || './logs';
      const metricsLogPath = path.join(logDir, 'system_metrics.log');
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const logEntry = JSON.stringify(metrics) + '\n';
      fs.appendFileSync(metricsLogPath, logEntry);
    } catch (error) {
      console.error('保存系统指标失败:', error);
    }
  }

  /**
   * 清理历史指标数据
   */
  private cleanupMetricsHistory(): void {
    // 只保留最近24小时的数据
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000);
    this.metricsHistory = this.metricsHistory.filter(
      metrics => metrics.timestamp >= twentyFourHoursAgo
    );
  }

  /**
   * 获取指标历史
   */
  public getMetricsHistory(hours: number = 24): SystemMetrics[] {
    const cutoffTime = new Date(Date.now() - hours * 3600000);
    return this.metricsHistory.filter(metrics => metrics.timestamp >= cutoffTime);
  }

  /**
   * 生成监控报告
   */
  public generateReport(): {
    summary: string;
    recommendations: string[];
    alerts: string[];
    errorPatterns: Record<string, any>;
    performanceAnalysis: Record<string, any>;
  } {
    const metrics = this.getCurrentMetrics();
    const summary: string[] = [];
    const recommendations: string[] = [];
    const alerts: string[] = [];

    // 系统运行时间
    const uptimeHours = Math.floor(metrics.system.uptime / (1000 * 60 * 60));
    summary.push(`系统运行时间: ${uptimeHours} 小时`);

    // OCR请求统计
    if (metrics.ocrRequests.total > 0) {
      const successRate = (metrics.ocrRequests.successful / metrics.ocrRequests.total * 100).toFixed(1);
      const fallbackRate = (metrics.ocrRequests.fallbackUsed / metrics.ocrRequests.total * 100).toFixed(1);
      
      summary.push(`OCR请求: 总计${metrics.ocrRequests.total}, 成功率${successRate}%, 降级率${fallbackRate}%`);
      summary.push(`平均处理时间: ${metrics.ocrRequests.averageProcessingTime.toFixed(0)}ms`);

      // 成功率过低警告
      if (parseFloat(successRate) < 80) {
        alerts.push(`OCR成功率过低 (${successRate}%)，请检查服务状态`);
        recommendations.push('检查网络连接和AWS Bedrock服务状态');
      }

      // 降级率过高警告
      if (parseFloat(fallbackRate) > 20) {
        alerts.push(`OCR降级率过高 (${fallbackRate}%)，主服务可能存在问题`);
        recommendations.push('检查Bedrock Claude API配置和限额');
      }

      // 处理时间过长警告
      if (metrics.ocrRequests.averageProcessingTime > 30000) {
        alerts.push(`OCR平均处理时间过长 (${metrics.ocrRequests.averageProcessingTime.toFixed(0)}ms)`);
        recommendations.push('考虑优化图像预处理或调整超时设置');
      }
    }

    // 错误统计和模式分析
    const errorPatterns = this.analyzeErrorPatterns();
    if (metrics.errors.total > 0) {
      summary.push(`错误总数: ${metrics.errors.total}`);
      
      // 错误率过高警告
      if (metrics.errors.total > 50) {
        alerts.push(`错误数量过多 (${metrics.errors.total})，请检查系统状态`);
      }

      // 分析主要错误类型
      const topErrorType = Object.entries(metrics.errors.byType)
        .sort(([,a], [,b]) => (b as number) - (a as number))[0];
      
      if (topErrorType) {
        summary.push(`主要错误类型: ${topErrorType[0]} (${topErrorType[1]}次)`);
        
        // 针对性建议
        switch (topErrorType[0]) {
          case 'NETWORK_ERROR':
            recommendations.push('网络错误频发，检查网络连接稳定性');
            break;
          case 'API_RATE_LIMIT':
            recommendations.push('API限流频繁，考虑调整请求频率或升级配额');
            break;
          case 'API_TIMEOUT':
            recommendations.push('API超时频繁，检查网络延迟或调整超时设置');
            break;
        }
      }
    }

    // 性能分析
    const performanceAnalysis = this.analyzePerformance();
    
    // 内存使用情况
    const memoryUsageMB = Math.round(metrics.system.memoryUsage.heapUsed / 1024 / 1024);
    summary.push(`内存使用: ${memoryUsageMB}MB`);

    if (memoryUsageMB > 500) {
      alerts.push(`内存使用过高 (${memoryUsageMB}MB)`);
      recommendations.push('考虑重启服务以释放内存');
    }

    // 性能建议
    if (metrics.performance.averageResponseTime > 10000) {
      recommendations.push('系统响应时间较慢，建议检查网络和服务器性能');
    }

    if (metrics.performance.slowestOperations.length > 0) {
      recommendations.push('存在慢操作，建议优化相关功能');
    }

    // 熔断器状态检查
    const circuitBreakerStatus = this.errorHandler.getAllCircuitBreakerStatus();
    const openCircuits = Object.entries(circuitBreakerStatus)
      .filter(([, info]) => info.state === 'OPEN');
    
    if (openCircuits.length > 0) {
      alerts.push(`${openCircuits.length}个服务处于熔断状态`);
      recommendations.push('检查熔断的服务并考虑手动重置');
    }

    return {
      summary: summary.join('\n'),
      recommendations,
      alerts,
      errorPatterns,
      performanceAnalysis
    };
  }

  /**
   * 分析错误模式
   */
  private analyzeErrorPatterns(): Record<string, any> {
    try {
      const logDir = process.env.LOG_DIR || './logs';
      const errorLogPath = path.join(logDir, 'errors.log');
      
      if (!fs.existsSync(errorLogPath)) {
        return { message: '无错误日志数据' };
      }

      const logContent = fs.readFileSync(errorLogPath, 'utf-8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      // 分析最近24小时的错误
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000);
      const recentErrors: any[] = [];
      
      for (const line of lines) {
        try {
          const logEntry = JSON.parse(line);
          const logTime = new Date(logEntry.timestamp);
          
          if (logTime >= twentyFourHoursAgo) {
            recentErrors.push(logEntry);
          }
        } catch (parseError) {
          // 忽略解析错误的日志行
        }
      }

      // 按小时分组分析错误趋势
      const errorsByHour: Record<number, number> = {};
      const errorsByType: Record<string, number> = {};
      const errorsByOperation: Record<string, number> = {};

      for (const error of recentErrors) {
        const hour = new Date(error.timestamp).getHours();
        errorsByHour[hour] = (errorsByHour[hour] || 0) + 1;
        errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
        
        if (error.context?.operation) {
          errorsByOperation[error.context.operation] = (errorsByOperation[error.context.operation] || 0) + 1;
        }
      }

      // 找出错误高峰时段
      const peakErrorHour = Object.entries(errorsByHour)
        .sort(([,a], [,b]) => (b as number) - (a as number))[0];

      return {
        totalRecentErrors: recentErrors.length,
        errorsByHour,
        errorsByType,
        errorsByOperation,
        peakErrorHour: peakErrorHour ? {
          hour: parseInt(peakErrorHour[0]),
          count: peakErrorHour[1]
        } : null,
        analysisTime: new Date().toISOString()
      };
    } catch (error) {
      console.error('分析错误模式失败:', error);
      return { error: '分析失败' };
    }
  }

  /**
   * 分析性能趋势
   */
  private analyzePerformance(): Record<string, any> {
    const performanceData: Record<string, any> = {};
    
    // 分析各操作的性能分布
    for (const [operation, times] of this.responseTimes.entries()) {
      if (times.length > 0) {
        const sortedTimes = [...times].sort((a, b) => a - b);
        const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
        const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
        const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
        
        performanceData[operation] = {
          count: times.length,
          average: times.reduce((sum, time) => sum + time, 0) / times.length,
          median: p50,
          p95,
          p99,
          min: Math.min(...times),
          max: Math.max(...times)
        };
      }
    }
    
    return performanceData;
  }

  /**
   * 重置统计数据
   */
  public resetStats(): void {
    this.requestCounts.clear();
    this.responseTimes.clear();
    this.metricsHistory = [];
    console.log('监控统计数据已重置');
  }
}
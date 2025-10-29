import * as fs from 'fs';
import * as path from 'path';

/**
 * 错误类型枚举
 */
export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  API_TIMEOUT = 'API_TIMEOUT',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  IMAGE_PROCESSING_ERROR = 'IMAGE_PROCESSING_ERROR',
  PARSING_ERROR = 'PARSING_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * 错误信息接口
 */
export interface ErrorInfo {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  originalError?: Error;
  context?: Record<string, any>;
  timestamp: Date;
  retryable: boolean;
}

/**
 * 重试配置接口
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: ErrorType[];
  jitterEnabled?: boolean;
  timeoutMs?: number;
}

/**
 * 熔断器状态
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',     // 正常状态
  OPEN = 'OPEN',         // 熔断状态
  HALF_OPEN = 'HALF_OPEN' // 半开状态
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;    // 失败阈值
  recoveryTimeout: number;     // 恢复超时时间
  monitoringPeriod: number;    // 监控周期
  minimumRequests: number;     // 最小请求数
}

/**
 * 熔断器状态信息
 */
export interface CircuitBreakerInfo {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
  totalRequests: number;
  successfulRequests: number;
}

/**
 * 错误处理和监控服务
 */
export class ErrorHandlingService {
  private static instance: ErrorHandlingService;
  private logDir: string;
  private errorLogPath: string;
  private metricsLogPath: string;
  private circuitBreakers: Map<string, CircuitBreakerInfo> = new Map();
  private circuitBreakerConfig: CircuitBreakerConfig;

  private constructor() {
    this.logDir = process.env.LOG_DIR || './logs';
    this.errorLogPath = path.join(this.logDir, 'errors.log');
    this.metricsLogPath = path.join(this.logDir, 'metrics.log');
    this.circuitBreakerConfig = this.getDefaultCircuitBreakerConfig();
    this.ensureLogDirectory();
    
    // 定期清理熔断器状态
    setInterval(() => {
      this.cleanupCircuitBreakers();
    }, 60000); // 每分钟清理一次
  }

  public static getInstance(): ErrorHandlingService {
    if (!ErrorHandlingService.instance) {
      ErrorHandlingService.instance = new ErrorHandlingService();
    }
    return ErrorHandlingService.instance;
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 分析错误并返回错误信息
   */
  public analyzeError(error: any, context?: Record<string, any>): ErrorInfo {
    const timestamp = new Date();
    let errorType = ErrorType.UNKNOWN_ERROR;
    let severity = ErrorSeverity.MEDIUM;
    let retryable = false;
    let message = '未知错误';

    if (error instanceof Error) {
      message = error.message;

      // 网络相关错误
      if (error.message.includes('ECONNREFUSED') || 
          error.message.includes('ENOTFOUND') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('network')) {
        errorType = ErrorType.NETWORK_ERROR;
        severity = ErrorSeverity.HIGH;
        retryable = true;
      }
      // API超时错误
      else if (error.message.includes('timeout') || 
               error.message.includes('TimeoutError')) {
        errorType = ErrorType.API_TIMEOUT;
        severity = ErrorSeverity.MEDIUM;
        retryable = true;
      }
      // 限流错误
      else if (error.message.toLowerCase().includes('rate limit') || 
               error.message.includes('throttle') ||
               error.message.includes('429') ||
               error.message.includes('请求频率过高') ||
               error.message.includes('API请求频率过高') ||
               error.message.toLowerCase().includes('rate limit exceeded')) {
        errorType = ErrorType.API_RATE_LIMIT;
        severity = ErrorSeverity.MEDIUM;
        retryable = true;
      }
      // 认证错误
      else if (error.message.includes('unauthorized') || 
               error.message.includes('authentication') ||
               error.message.includes('401') ||
               error.message.includes('403')) {
        errorType = ErrorType.AUTHENTICATION_ERROR;
        severity = ErrorSeverity.HIGH;
        retryable = false;
      }
      // 服务不可用
      else if (error.message.includes('service unavailable') ||
               error.message.includes('502') ||
               error.message.includes('503') ||
               error.message.includes('504')) {
        errorType = ErrorType.SERVICE_UNAVAILABLE;
        severity = ErrorSeverity.HIGH;
        retryable = true;
      }
      // 图像处理错误
      else if (error.message.includes('image') || 
               error.message.includes('sharp') ||
               error.message.includes('图像')) {
        errorType = ErrorType.IMAGE_PROCESSING_ERROR;
        severity = ErrorSeverity.MEDIUM;
        retryable = false;
      }
      // 解析错误
      else if (error.message.includes('parse') || 
               error.message.includes('JSON') ||
               error.message.includes('解析')) {
        errorType = ErrorType.PARSING_ERROR;
        severity = ErrorSeverity.MEDIUM;
        retryable = false;
      }
      // 请求格式错误
      else if (error.message.includes('invalid request') ||
               error.message.includes('bad request') ||
               error.message.includes('400')) {
        errorType = ErrorType.INVALID_REQUEST;
        severity = ErrorSeverity.LOW;
        retryable = false;
      }
    }

    return {
      type: errorType,
      severity,
      message,
      originalError: error instanceof Error ? error : undefined,
      context,
      timestamp,
      retryable
    };
  }

  /**
   * 记录错误日志
   */
  public logError(errorInfo: ErrorInfo): void {
    const logEntry = {
      timestamp: errorInfo.timestamp.toISOString(),
      type: errorInfo.type,
      severity: errorInfo.severity,
      message: errorInfo.message,
      context: errorInfo.context,
      stack: errorInfo.originalError?.stack,
      retryable: errorInfo.retryable
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      fs.appendFileSync(this.errorLogPath, logLine);
    } catch (writeError) {
      console.error('写入错误日志失败:', writeError);
    }

    // 同时输出到控制台
    console.error(`[${errorInfo.severity}] ${errorInfo.type}: ${errorInfo.message}`, {
      context: errorInfo.context,
      timestamp: errorInfo.timestamp
    });
  }

  /**
   * 记录性能指标
   */
  public logMetrics(operation: string, duration: number, success: boolean, context?: Record<string, any>): void {
    const metricsEntry = {
      timestamp: new Date().toISOString(),
      operation,
      duration,
      success,
      context
    };

    const logLine = JSON.stringify(metricsEntry) + '\n';

    try {
      fs.appendFileSync(this.metricsLogPath, logLine);
    } catch (writeError) {
      console.error('写入性能日志失败:', writeError);
    }
  }

  /**
   * 获取默认重试配置
   */
  public getDefaultRetryConfig(): RetryConfig {
    return {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitterEnabled: true,
      timeoutMs: 60000,
      retryableErrors: [
        ErrorType.NETWORK_ERROR,
        ErrorType.API_TIMEOUT,
        ErrorType.API_RATE_LIMIT,
        ErrorType.SERVICE_UNAVAILABLE
      ]
    };
  }

  /**
   * 获取默认熔断器配置
   */
  public getDefaultCircuitBreakerConfig(): CircuitBreakerConfig {
    return {
      failureThreshold: 5,      // 5次失败后熔断
      recoveryTimeout: 60000,   // 60秒后尝试恢复
      monitoringPeriod: 300000, // 5分钟监控周期
      minimumRequests: 10       // 最少10个请求才开始统计
    };
  }

  /**
   * 计算重试延迟时间（支持抖动）
   */
  public calculateRetryDelay(attempt: number, config: RetryConfig): number {
    const baseDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    let delay = Math.min(baseDelay, config.maxDelay);
    
    // 添加抖动以避免惊群效应
    if (config.jitterEnabled) {
      const jitter = Math.random() * 0.3; // 30%的抖动
      delay = delay * (1 + jitter);
    }
    
    return Math.floor(delay);
  }

  /**
   * 判断错误是否可重试
   */
  public isRetryableError(errorInfo: ErrorInfo, config: RetryConfig): boolean {
    return errorInfo.retryable && config.retryableErrors.includes(errorInfo.type);
  }

  /**
   * 生成用户友好的错误消息
   */
  public getUserFriendlyMessage(errorInfo: ErrorInfo): string {
    // 如果错误消息中包含熔断信息，直接返回
    if (errorInfo.message.includes('服务熔断中')) {
      return errorInfo.message;
    }
    
    switch (errorInfo.type) {
      case ErrorType.NETWORK_ERROR:
        return '网络连接失败，请检查网络连接后重试';
      case ErrorType.API_TIMEOUT:
        return '服务响应超时，请稍后重试';
      case ErrorType.API_RATE_LIMIT:
        return '请求过于频繁，请稍后重试';
      case ErrorType.AUTHENTICATION_ERROR:
        return '身份验证失败，请检查配置';
      case ErrorType.SERVICE_UNAVAILABLE:
        return '服务暂时不可用，请稍后重试';
      case ErrorType.IMAGE_PROCESSING_ERROR:
        return '图像处理失败，请检查图片格式和质量';
      case ErrorType.PARSING_ERROR:
        return '数据解析失败，请重新上传图片';
      case ErrorType.INVALID_REQUEST:
        return '请求格式不正确，请检查输入数据';
      default:
        // 对于未知错误，如果没有特殊消息，返回通用消息
        if (errorInfo.type === ErrorType.UNKNOWN_ERROR && !errorInfo.message.includes('服务熔断中')) {
          return '系统出现错误，请联系管理员';
        }
        return errorInfo.message || '系统出现错误，请联系管理员';
    }
  }

  /**
   * 执行带重试和熔断器的操作
   */
  public async executeWithRetryAndCircuitBreaker<T>(
    operation: () => Promise<T>,
    operationName: string,
    retryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.getDefaultRetryConfig(), ...retryConfig };
    
    // 检查熔断器状态
    if (!this.canExecute(operationName)) {
      const circuitInfo = this.circuitBreakers.get(operationName);
      const errorInfo = this.analyzeError(
        new Error(`服务熔断中，预计恢复时间: ${circuitInfo?.nextAttemptTime?.toLocaleString()}`),
        { operation: operationName, circuitBreakerState: circuitInfo?.state }
      );
      this.logError(errorInfo);
      throw new Error(this.getUserFriendlyMessage(errorInfo));
    }

    let lastError: Error | null = null;
    const startTime = Date.now();
    let networkFailureCount = 0;
    let rateLimitHit = false;
    let timeoutCount = 0;
    let consecutiveFailures = 0;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        // 动态调整超时时间，考虑更多因素
        const dynamicTimeout = this.calculateEnhancedTimeout(
          config.timeoutMs || 60000, 
          attempt, 
          networkFailureCount, 
          timeoutCount,
          consecutiveFailures
        );
        
        // 增强的超时处理，支持取消
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
          abortController.abort();
        }, dynamicTimeout);

        try {
          const result = await this.executeWithTimeout(
            operation, 
            dynamicTimeout, 
            abortController.signal
          );

          clearTimeout(timeoutId);

          // 记录成功，重置失败计数器
          this.recordSuccess(operationName);
          consecutiveFailures = 0;
          
          const duration = Date.now() - startTime;
          this.logMetrics(`${operationName}_retry_success`, duration, true, {
            attempt,
            totalAttempts: attempt,
            networkFailures: networkFailureCount,
            timeoutCount,
            rateLimitHit,
            consecutiveFailures: 0,
            finalTimeout: dynamicTimeout,
            recoveredFromFailures: attempt > 1
          });

          console.log(`${operationName} 执行成功 (尝试 ${attempt}/${config.maxRetries}, 耗时 ${duration}ms)`);
          return result;

        } finally {
          clearTimeout(timeoutId);
        }

      } catch (error) {
        lastError = error as Error;
        consecutiveFailures++;
        
        const errorInfo = this.analyzeError(error, {
          operation: operationName,
          attempt,
          maxRetries: config.maxRetries,
          networkFailureCount,
          timeoutCount,
          rateLimitHit,
          consecutiveFailures,
          totalDuration: Date.now() - startTime
        });

        this.logError(errorInfo);

        // 统计特定错误类型
        if (errorInfo.type === ErrorType.NETWORK_ERROR) {
          networkFailureCount++;
        }
        if (errorInfo.type === ErrorType.API_RATE_LIMIT) {
          rateLimitHit = true;
        }
        if (errorInfo.type === ErrorType.API_TIMEOUT) {
          timeoutCount++;
        }

        // 记录失败
        this.recordFailure(operationName);

        // 检查是否应该提前终止重试
        if (this.shouldAbortRetry(errorInfo, attempt, config, consecutiveFailures)) {
          console.error(`${operationName} 提前终止重试: ${errorInfo.type} - ${errorInfo.message}`);
          break;
        }

        // 如果是最后一次尝试或错误不可重试，直接抛出
        if (attempt === config.maxRetries || !this.isRetryableError(errorInfo, config)) {
          console.error(`${operationName} 不可重试或达到最大重试次数: ${errorInfo.type} - ${errorInfo.message}`);
          break;
        }

        // 计算智能重试延迟
        const delay = this.calculateIntelligentRetryDelay(
          attempt, 
          config, 
          errorInfo, 
          networkFailureCount, 
          timeoutCount,
          consecutiveFailures
        );
        
        console.log(`${operationName} 第${attempt}次尝试失败 (${errorInfo.type}), 等待 ${delay}ms 后重试...`);
        await this.waitWithCancellation(delay);
      }
    }

    // 记录最终失败
    const duration = Date.now() - startTime;
    this.logMetrics(`${operationName}_retry_failure`, duration, false, {
      totalAttempts: config.maxRetries,
      finalError: lastError?.message,
      networkFailures: networkFailureCount,
      timeoutCount,
      rateLimitHit,
      consecutiveFailures,
      totalDuration: duration,
      failurePattern: this.analyzeFailurePattern(networkFailureCount, timeoutCount, rateLimitHit)
    });

    const finalErrorInfo = this.analyzeError(lastError, {
      operation: operationName,
      totalAttempts: config.maxRetries,
      finalFailure: true,
      networkFailures: networkFailureCount,
      timeoutCount,
      rateLimitHit,
      consecutiveFailures,
      totalDuration: duration
    });

    throw new Error(this.getUserFriendlyMessage(finalErrorInfo));
  }

  /**
   * 增强的超时时间计算
   */
  private calculateEnhancedTimeout(
    baseTimeout: number, 
    attempt: number, 
    networkFailureCount: number,
    timeoutCount: number,
    consecutiveFailures: number
  ): number {
    let timeout = baseTimeout;
    
    // 网络问题较多时增加超时时间
    if (networkFailureCount > 1) {
      timeout = Math.min(timeout * (1.3 + networkFailureCount * 0.2), 120000);
    }
    
    // 超时次数较多时增加超时时间
    if (timeoutCount > 1) {
      timeout = Math.min(timeout * (1.4 + timeoutCount * 0.3), 150000);
    }
    
    // 连续失败次数较多时增加超时时间
    if (consecutiveFailures > 2) {
      timeout = Math.min(timeout * (1.2 + consecutiveFailures * 0.1), 180000);
    }
    
    // 重试次数越多，超时时间越长
    if (attempt > 2) {
      timeout = Math.min(timeout * (1.1 + attempt * 0.1), 200000); // 最多3.3分钟
    }
    
    return Math.floor(timeout);
  }

  /**
   * 带超时和取消支持的操作执行
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    abortSignal?: AbortSignal
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let isCompleted = false;
      
      // 检查是否已经被取消
      if (abortSignal?.aborted) {
        reject(new Error('操作已被取消'));
        return;
      }
      
      // 监听取消信号
      const abortHandler = () => {
        if (!isCompleted) {
          isCompleted = true;
          reject(new Error(`操作超时 (${timeoutMs}ms)`));
        }
      };
      
      abortSignal?.addEventListener('abort', abortHandler);
      
      // 执行操作
      operation()
        .then(result => {
          if (!isCompleted) {
            isCompleted = true;
            abortSignal?.removeEventListener('abort', abortHandler);
            resolve(result);
          }
        })
        .catch(error => {
          if (!isCompleted) {
            isCompleted = true;
            abortSignal?.removeEventListener('abort', abortHandler);
            reject(error);
          }
        });
    });
  }

  /**
   * 判断是否应该提前终止重试
   */
  private shouldAbortRetry(
    errorInfo: ErrorInfo, 
    attempt: number, 
    config: RetryConfig,
    consecutiveFailures: number
  ): boolean {
    // 认证错误立即终止
    if (errorInfo.type === ErrorType.AUTHENTICATION_ERROR) {
      return true;
    }
    
    // 请求格式错误立即终止
    if (errorInfo.type === ErrorType.INVALID_REQUEST) {
      return true;
    }
    
    // 连续失败次数过多且已经尝试了一半以上，考虑提前终止
    if (consecutiveFailures >= 3 && attempt >= Math.ceil(config.maxRetries / 2)) {
      console.warn(`连续失败${consecutiveFailures}次，考虑提前终止重试`);
      return true;
    }
    
    return false;
  }

  /**
   * 智能重试延迟计算
   */
  private calculateIntelligentRetryDelay(
    attempt: number, 
    config: RetryConfig, 
    errorInfo: ErrorInfo, 
    networkFailureCount: number,
    timeoutCount: number,
    consecutiveFailures: number
  ): number {
    let baseDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    
    // 根据错误类型调整延迟
    switch (errorInfo.type) {
      case ErrorType.API_RATE_LIMIT:
        // 限流错误使用更长的延迟，并考虑连续失败次数
        baseDelay = Math.max(baseDelay * (3 + consecutiveFailures * 0.5), 30000 + consecutiveFailures * 10000);
        break;
        
      case ErrorType.NETWORK_ERROR:
        // 网络错误根据失败次数调整
        if (networkFailureCount > 2) {
          baseDelay = Math.max(baseDelay * (2 + networkFailureCount * 0.3), 15000);
        }
        break;
        
      case ErrorType.SERVICE_UNAVAILABLE:
        // 服务不可用时使用较长延迟
        baseDelay = Math.max(baseDelay * (2.5 + consecutiveFailures * 0.4), 25000);
        break;
        
      case ErrorType.API_TIMEOUT:
        // 超时错误根据超时次数调整
        if (timeoutCount > 1) {
          baseDelay = Math.max(baseDelay * (1.8 + timeoutCount * 0.4), 12000);
        }
        break;
        
      default:
        // 其他错误使用标准延迟
        baseDelay = Math.max(baseDelay, 5000);
    }
    
    // 连续失败次数过多时增加额外延迟
    if (consecutiveFailures > 2) {
      baseDelay = Math.min(baseDelay * (1 + consecutiveFailures * 0.2), config.maxDelay);
    }
    
    let delay = Math.min(baseDelay, config.maxDelay);
    
    // 添加智能抖动
    if (config.jitterEnabled) {
      const jitterFactor = 0.2 + Math.random() * 0.3; // 20%-50%的抖动
      delay = delay * (1 + jitterFactor);
    }
    
    return Math.floor(delay);
  }

  /**
   * 分析失败模式
   */
  private analyzeFailurePattern(
    networkFailureCount: number,
    timeoutCount: number,
    rateLimitHit: boolean
  ): string {
    const patterns: string[] = [];
    
    if (networkFailureCount > 2) {
      patterns.push('网络不稳定');
    }
    if (timeoutCount > 2) {
      patterns.push('响应超时频繁');
    }
    if (rateLimitHit) {
      patterns.push('触发限流');
    }
    
    if (patterns.length === 0) {
      return '随机失败';
    }
    
    return patterns.join(', ');
  }

  /**
   * 计算自适应重试延迟
   */
  private calculateAdaptiveRetryDelay(
    attempt: number, 
    config: RetryConfig, 
    errorInfo: ErrorInfo, 
    networkFailureCount: number
  ): number {
    let baseDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    
    // 根据错误类型调整延迟
    switch (errorInfo.type) {
      case ErrorType.API_RATE_LIMIT:
        // 限流错误使用更长的延迟
        baseDelay = Math.max(baseDelay * 3, 30000); // 至少30秒
        break;
        
      case ErrorType.NETWORK_ERROR:
        // 网络错误根据失败次数调整
        if (networkFailureCount > 2) {
          baseDelay = Math.max(baseDelay * 2, 15000); // 至少15秒
        }
        break;
        
      case ErrorType.SERVICE_UNAVAILABLE:
        // 服务不可用时使用较长延迟
        baseDelay = Math.max(baseDelay * 2, 20000); // 至少20秒
        break;
        
      case ErrorType.API_TIMEOUT:
        // 超时错误适度增加延迟
        baseDelay = Math.max(baseDelay * 1.5, 10000); // 至少10秒
        break;
    }
    
    let delay = Math.min(baseDelay, config.maxDelay);
    
    // 添加抖动以避免惊群效应
    if (config.jitterEnabled) {
      const jitter = Math.random() * 0.3; // 30%的抖动
      delay = delay * (1 + jitter);
    }
    
    return Math.floor(delay);
  }

  /**
   * 可取消的等待
   */
  private async waitWithCancellation(delay: number): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, delay);
      
      // 可以在这里添加取消逻辑，比如监听进程信号
      process.once('SIGINT', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  /**
   * 检查是否可以执行操作（熔断器检查）
   */
  public canExecute(operationName: string): boolean {
    const circuitInfo = this.getCircuitBreakerInfo(operationName);
    
    switch (circuitInfo.state) {
      case CircuitBreakerState.CLOSED:
        return true;
        
      case CircuitBreakerState.OPEN:
        // 检查是否到了尝试恢复的时间
        if (circuitInfo.nextAttemptTime && new Date() >= circuitInfo.nextAttemptTime) {
          this.setCircuitBreakerState(operationName, CircuitBreakerState.HALF_OPEN);
          return true;
        }
        return false;
        
      case CircuitBreakerState.HALF_OPEN:
        return true;
        
      default:
        return true;
    }
  }

  /**
   * 记录操作成功
   */
  public recordSuccess(operationName: string): void {
    const circuitInfo = this.getCircuitBreakerInfo(operationName);
    circuitInfo.successfulRequests++;
    circuitInfo.totalRequests++;
    
    // 如果是半开状态，成功后转为关闭状态
    if (circuitInfo.state === CircuitBreakerState.HALF_OPEN) {
      circuitInfo.state = CircuitBreakerState.CLOSED;
      circuitInfo.failureCount = 0;
      circuitInfo.lastFailureTime = undefined;
      circuitInfo.nextAttemptTime = undefined;
    }
    
    this.circuitBreakers.set(operationName, circuitInfo);
  }

  /**
   * 记录操作失败
   */
  public recordFailure(operationName: string): void {
    const circuitInfo = this.getCircuitBreakerInfo(operationName);
    circuitInfo.failureCount++;
    circuitInfo.totalRequests++;
    circuitInfo.lastFailureTime = new Date();
    
    // 检查是否需要熔断
    if (this.shouldTripCircuitBreaker(circuitInfo)) {
      circuitInfo.state = CircuitBreakerState.OPEN;
      circuitInfo.nextAttemptTime = new Date(Date.now() + this.circuitBreakerConfig.recoveryTimeout);
      
      console.warn(`熔断器触发: ${operationName}, 失败次数: ${circuitInfo.failureCount}, 恢复时间: ${circuitInfo.nextAttemptTime}`);
    }
    
    this.circuitBreakers.set(operationName, circuitInfo);
  }

  /**
   * 获取熔断器信息
   */
  public getCircuitBreakerInfo(operationName: string): CircuitBreakerInfo {
    if (!this.circuitBreakers.has(operationName)) {
      this.circuitBreakers.set(operationName, {
        state: CircuitBreakerState.CLOSED,
        failureCount: 0,
        totalRequests: 0,
        successfulRequests: 0
      });
    }
    
    return { ...this.circuitBreakers.get(operationName)! };
  }

  /**
   * 设置熔断器状态
   */
  private setCircuitBreakerState(operationName: string, state: CircuitBreakerState): void {
    const circuitInfo = this.getCircuitBreakerInfo(operationName);
    circuitInfo.state = state;
    this.circuitBreakers.set(operationName, circuitInfo);
  }

  /**
   * 判断是否应该触发熔断器
   */
  private shouldTripCircuitBreaker(circuitInfo: CircuitBreakerInfo): boolean {
    // 需要达到最小请求数才开始统计
    if (circuitInfo.totalRequests < this.circuitBreakerConfig.minimumRequests) {
      return false;
    }
    
    // 失败次数超过阈值
    if (circuitInfo.failureCount >= this.circuitBreakerConfig.failureThreshold) {
      return true;
    }
    
    // 失败率超过50%
    const failureRate = (circuitInfo.totalRequests - circuitInfo.successfulRequests) / circuitInfo.totalRequests;
    return failureRate > 0.5;
  }

  /**
   * 清理熔断器状态
   */
  private cleanupCircuitBreakers(): void {
    const now = new Date();
    const cleanupTime = new Date(now.getTime() - this.circuitBreakerConfig.monitoringPeriod);
    
    for (const [operationName, circuitInfo] of this.circuitBreakers.entries()) {
      // 清理长时间未使用的熔断器
      if (circuitInfo.lastFailureTime && circuitInfo.lastFailureTime < cleanupTime) {
        // 重置统计数据，但保持熔断状态
        if (circuitInfo.state === CircuitBreakerState.CLOSED) {
          circuitInfo.failureCount = 0;
          circuitInfo.totalRequests = 0;
          circuitInfo.successfulRequests = 0;
        }
      }
    }
  }

  /**
   * 获取所有熔断器状态
   */
  public getAllCircuitBreakerStatus(): Record<string, CircuitBreakerInfo> {
    const status: Record<string, CircuitBreakerInfo> = {};
    
    for (const [operationName, circuitInfo] of this.circuitBreakers.entries()) {
      status[operationName] = { ...circuitInfo };
    }
    
    return status;
  }

  /**
   * 重置熔断器
   */
  public resetCircuitBreaker(operationName: string): void {
    this.circuitBreakers.set(operationName, {
      state: CircuitBreakerState.CLOSED,
      failureCount: 0,
      totalRequests: 0,
      successfulRequests: 0
    });
    
    console.log(`熔断器已重置: ${operationName}`);
  }

  /**
   * 重置所有熔断器
   */
  public resetAllCircuitBreakers(): void {
    this.circuitBreakers.clear();
    console.log('所有熔断器已重置');
  }

  /**
   * 清理旧日志文件
   */
  public cleanupOldLogs(daysToKeep: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      const files = fs.readdirSync(this.logDir);
      
      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            console.log(`已删除过期日志文件: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error('清理日志文件失败:', error);
    }
  }
}
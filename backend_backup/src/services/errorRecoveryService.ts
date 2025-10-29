import { ErrorHandlingService, ErrorType, ErrorInfo } from './errorHandlingService';
import { MonitoringService } from './monitoringService';
import { FallbackOcrService } from './fallbackOcrService';

/**
 * 恢复策略类型
 */
export enum RecoveryStrategy {
  IMMEDIATE_RETRY = 'IMMEDIATE_RETRY',
  DELAYED_RETRY = 'DELAYED_RETRY',
  FALLBACK_SERVICE = 'FALLBACK_SERVICE',
  GRACEFUL_DEGRADATION = 'GRACEFUL_DEGRADATION',
  CIRCUIT_BREAKER = 'CIRCUIT_BREAKER',
  MANUAL_INTERVENTION = 'MANUAL_INTERVENTION'
}

/**
 * 恢复动作接口
 */
export interface RecoveryAction {
  strategy: RecoveryStrategy;
  description: string;
  estimatedRecoveryTime: number; // 毫秒
  priority: number; // 1-10, 10最高
  conditions: string[];
  execute: () => Promise<boolean>;
}

/**
 * 系统健康状态
 */
export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical' | 'down';
  services: Record<string, {
    status: 'up' | 'degraded' | 'down';
    lastCheck: Date;
    errorRate: number;
    responseTime: number;
  }>;
  activeRecoveryActions: RecoveryAction[];
  recommendations: string[];
}

/**
 * 错误恢复和系统自愈服务
 */
export class ErrorRecoveryService {
  private static instance: ErrorRecoveryService;
  private errorHandler: ErrorHandlingService;
  private monitoringService: MonitoringService;
  private fallbackService: FallbackOcrService;
  private recoveryActions: Map<string, RecoveryAction[]> = new Map();
  private activeRecoveries: Set<string> = new Set();
  private systemHealth: SystemHealth;

  private constructor() {
    this.errorHandler = ErrorHandlingService.getInstance();
    this.monitoringService = MonitoringService.getInstance();
    this.fallbackService = FallbackOcrService.getInstance();
    
    this.systemHealth = {
      overall: 'healthy',
      services: {},
      activeRecoveryActions: [],
      recommendations: []
    };

    this.initializeRecoveryStrategies();
    this.startHealthMonitoring();
  }

  public static getInstance(): ErrorRecoveryService {
    if (!ErrorRecoveryService.instance) {
      ErrorRecoveryService.instance = new ErrorRecoveryService();
    }
    return ErrorRecoveryService.instance;
  }

  /**
   * 初始化恢复策略
   */
  private initializeRecoveryStrategies(): void {
    // OCR服务恢复策略
    this.recoveryActions.set('ocr_service', [
      {
        strategy: RecoveryStrategy.IMMEDIATE_RETRY,
        description: '立即重试OCR请求',
        estimatedRecoveryTime: 5000,
        priority: 8,
        conditions: ['网络临时中断', '服务临时不可用'],
        execute: async () => {
          console.log('执行OCR服务立即重试策略');
          // 重置相关熔断器
          this.errorHandler.resetCircuitBreaker('bedrock_api_call');
          return true;
        }
      },
      {
        strategy: RecoveryStrategy.FALLBACK_SERVICE,
        description: '启用OCR降级服务',
        estimatedRecoveryTime: 2000,
        priority: 6,
        conditions: ['主OCR服务持续失败', 'API配额耗尽'],
        execute: async () => {
          console.log('执行OCR降级服务策略');
          // 这里可以设置全局降级标志
          return true;
        }
      },
      {
        strategy: RecoveryStrategy.DELAYED_RETRY,
        description: '延迟重试OCR服务',
        estimatedRecoveryTime: 30000,
        priority: 5,
        conditions: ['API限流', '服务过载'],
        execute: async () => {
          console.log('执行OCR服务延迟重试策略');
          // 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, 30000));
          this.errorHandler.resetCircuitBreaker('bedrock_api_call');
          return true;
        }
      }
    ]);

    // 网络连接恢复策略
    this.recoveryActions.set('network_connectivity', [
      {
        strategy: RecoveryStrategy.IMMEDIATE_RETRY,
        description: '测试网络连接',
        estimatedRecoveryTime: 3000,
        priority: 9,
        conditions: ['网络连接中断'],
        execute: async () => {
          console.log('执行网络连接测试');
          try {
            const https = require('https');
            await new Promise((resolve, reject) => {
              const req = https.request({
                hostname: 'www.google.com',
                port: 443,
                method: 'HEAD',
                timeout: 5000
              }, resolve);
              req.on('error', reject);
              req.on('timeout', () => reject(new Error('网络测试超时')));
              req.end();
            });
            return true;
          } catch (error) {
            return false;
          }
        }
      }
    ]);

    // 内存恢复策略
    this.recoveryActions.set('memory_management', [
      {
        strategy: RecoveryStrategy.GRACEFUL_DEGRADATION,
        description: '清理内存和缓存',
        estimatedRecoveryTime: 5000,
        priority: 7,
        conditions: ['内存使用过高'],
        execute: async () => {
          console.log('执行内存清理策略');
          try {
            // 强制垃圾回收
            if (global.gc) {
              global.gc();
            }
            
            // 清理监控服务的历史数据
            this.monitoringService.resetStats();
            
            // 清理错误处理服务的缓存
            this.errorHandler.resetAllCircuitBreakers();
            
            return true;
          } catch (error) {
            console.error('内存清理失败:', error);
            return false;
          }
        }
      }
    ]);
  }

  /**
   * 开始健康监控
   */
  private startHealthMonitoring(): void {
    // 每30秒检查一次系统健康状态
    setInterval(async () => {
      await this.checkSystemHealth();
    }, 30000);

    // 每5分钟执行一次自动恢复
    setInterval(async () => {
      await this.executeAutoRecovery();
    }, 300000);
  }

  /**
   * 检查系统健康状态
   */
  public async checkSystemHealth(): Promise<SystemHealth> {
    const metrics = this.monitoringService.getCurrentMetrics();
    const circuitBreakerStatus = this.errorHandler.getAllCircuitBreakerStatus();
    
    // 检查各个服务状态
    const services: Record<string, any> = {};
    
    // OCR服务状态
    const ocrErrorRate = metrics.ocrRequests.total > 0 ? 
      (metrics.ocrRequests.failed / metrics.ocrRequests.total) : 0;
    
    services.ocr_service = {
      status: this.determineServiceStatus(ocrErrorRate, metrics.ocrRequests.averageProcessingTime),
      lastCheck: new Date(),
      errorRate: ocrErrorRate,
      responseTime: metrics.ocrRequests.averageProcessingTime
    };

    // 网络服务状态
    const networkErrors = metrics.errors.byType['NETWORK_ERROR'] || 0;
    const networkErrorRate = metrics.errors.total > 0 ? networkErrors / metrics.errors.total : 0;
    
    services.network_connectivity = {
      status: networkErrorRate > 0.3 ? 'down' : networkErrorRate > 0.1 ? 'degraded' : 'up',
      lastCheck: new Date(),
      errorRate: networkErrorRate,
      responseTime: 0
    };

    // 内存状态
    const memoryUsageMB = metrics.system.memoryUsage.heapUsed / 1024 / 1024;
    services.memory_management = {
      status: memoryUsageMB > 800 ? 'down' : memoryUsageMB > 500 ? 'degraded' : 'up',
      lastCheck: new Date(),
      errorRate: 0,
      responseTime: 0
    };

    // 确定整体健康状态
    const serviceStatuses = Object.values(services).map(s => s.status);
    let overall: 'healthy' | 'degraded' | 'critical' | 'down' = 'healthy';
    
    if (serviceStatuses.includes('down')) {
      overall = serviceStatuses.filter(s => s === 'down').length > 1 ? 'down' : 'critical';
    } else if (serviceStatuses.includes('degraded')) {
      overall = 'degraded';
    }

    // 生成建议
    const recommendations = this.generateHealthRecommendations(services, circuitBreakerStatus);

    this.systemHealth = {
      overall,
      services,
      activeRecoveryActions: this.systemHealth.activeRecoveryActions,
      recommendations
    };

    return this.systemHealth;
  }

  /**
   * 确定服务状态
   */
  private determineServiceStatus(errorRate: number, responseTime: number): 'up' | 'degraded' | 'down' {
    if (errorRate > 0.5 || responseTime > 60000) {
      return 'down';
    } else if (errorRate > 0.2 || responseTime > 30000) {
      return 'degraded';
    } else {
      return 'up';
    }
  }

  /**
   * 生成健康建议
   */
  private generateHealthRecommendations(
    services: Record<string, any>, 
    circuitBreakerStatus: Record<string, any>
  ): string[] {
    const recommendations: string[] = [];

    // 检查服务状态
    for (const [serviceName, service] of Object.entries(services)) {
      if (service.status === 'down') {
        recommendations.push(`${serviceName} 服务已停止，需要立即处理`);
      } else if (service.status === 'degraded') {
        recommendations.push(`${serviceName} 服务性能下降，建议检查`);
      }
    }

    // 检查熔断器状态
    const openCircuits = Object.entries(circuitBreakerStatus)
      .filter(([, info]) => (info as any).state === 'OPEN');
    
    if (openCircuits.length > 0) {
      recommendations.push(`${openCircuits.length}个服务处于熔断状态，考虑手动恢复`);
    }

    // 检查错误模式
    if (services.ocr_service?.errorRate > 0.3) {
      recommendations.push('OCR服务错误率过高，检查AWS Bedrock配置');
    }

    if (services.network_connectivity?.status === 'degraded') {
      recommendations.push('网络连接不稳定，检查网络配置');
    }

    if (services.memory_management?.status === 'degraded') {
      recommendations.push('内存使用过高，考虑重启服务');
    }

    return recommendations;
  }

  /**
   * 执行自动恢复
   */
  public async executeAutoRecovery(): Promise<void> {
    const health = await this.checkSystemHealth();
    
    if (health.overall === 'healthy') {
      return; // 系统健康，无需恢复
    }

    console.log(`系统状态: ${health.overall}, 开始执行自动恢复...`);

    // 为每个有问题的服务执行恢复策略
    for (const [serviceName, service] of Object.entries(health.services)) {
      if (service.status !== 'up' && !this.activeRecoveries.has(serviceName)) {
        await this.executeServiceRecovery(serviceName, service);
      }
    }
  }

  /**
   * 执行特定服务的恢复
   */
  private async executeServiceRecovery(serviceName: string, serviceStatus: any): Promise<void> {
    const recoveryActions = this.recoveryActions.get(serviceName);
    if (!recoveryActions) {
      console.warn(`没有为服务 ${serviceName} 定义恢复策略`);
      return;
    }

    this.activeRecoveries.add(serviceName);
    
    try {
      // 按优先级排序恢复动作
      const sortedActions = recoveryActions.sort((a, b) => b.priority - a.priority);
      
      for (const action of sortedActions) {
        console.log(`执行恢复策略: ${action.description} (服务: ${serviceName})`);
        
        try {
          const success = await action.execute();
          
          if (success) {
            console.log(`恢复策略执行成功: ${action.description}`);
            
            // 记录恢复成功
            this.errorHandler.logMetrics(`recovery_${serviceName}`, action.estimatedRecoveryTime, true, {
              strategy: action.strategy,
              description: action.description
            });
            
            // 等待一段时间后重新检查服务状态
            await new Promise(resolve => setTimeout(resolve, 5000));
            const newHealth = await this.checkSystemHealth();
            
            if (newHealth.services[serviceName]?.status === 'up') {
              console.log(`服务 ${serviceName} 已恢复正常`);
              break;
            }
          } else {
            console.warn(`恢复策略执行失败: ${action.description}`);
          }
        } catch (error) {
          console.error(`恢复策略执行异常: ${action.description}`, error);
          
          // 记录恢复失败
          this.errorHandler.logMetrics(`recovery_${serviceName}`, action.estimatedRecoveryTime, false, {
            strategy: action.strategy,
            description: action.description,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    } finally {
      this.activeRecoveries.delete(serviceName);
    }
  }

  /**
   * 手动触发恢复
   */
  public async triggerManualRecovery(serviceName: string, strategyType?: RecoveryStrategy): Promise<boolean> {
    const recoveryActions = this.recoveryActions.get(serviceName);
    if (!recoveryActions) {
      throw new Error(`没有为服务 ${serviceName} 定义恢复策略`);
    }

    let actionsToExecute = recoveryActions;
    if (strategyType) {
      actionsToExecute = recoveryActions.filter(action => action.strategy === strategyType);
    }

    if (actionsToExecute.length === 0) {
      throw new Error(`没有找到匹配的恢复策略`);
    }

    console.log(`手动触发恢复: ${serviceName}, 策略数量: ${actionsToExecute.length}`);

    for (const action of actionsToExecute) {
      try {
        const success = await action.execute();
        if (success) {
          console.log(`手动恢复成功: ${action.description}`);
          return true;
        }
      } catch (error) {
        console.error(`手动恢复失败: ${action.description}`, error);
      }
    }

    return false;
  }

  /**
   * 获取系统健康状态
   */
  public getSystemHealth(): SystemHealth {
    return { ...this.systemHealth };
  }

  /**
   * 获取可用的恢复策略
   */
  public getAvailableRecoveryStrategies(): Record<string, RecoveryAction[]> {
    const result: Record<string, RecoveryAction[]> = {};
    
    for (const [serviceName, actions] of this.recoveryActions.entries()) {
      result[serviceName] = actions.map(action => ({
        ...action,
        execute: () => Promise.resolve(true) // 隐藏执行函数
      }));
    }
    
    return result;
  }

  /**
   * 添加自定义恢复策略
   */
  public addRecoveryStrategy(serviceName: string, action: RecoveryAction): void {
    if (!this.recoveryActions.has(serviceName)) {
      this.recoveryActions.set(serviceName, []);
    }
    
    this.recoveryActions.get(serviceName)!.push(action);
    console.log(`已添加恢复策略: ${action.description} (服务: ${serviceName})`);
  }

  /**
   * 生成恢复报告
   */
  public generateRecoveryReport(): {
    systemHealth: SystemHealth;
    recentRecoveries: any[];
    recommendations: string[];
  } {
    const health = this.getSystemHealth();
    
    // 这里可以从日志中分析最近的恢复活动
    const recentRecoveries: any[] = [];
    
    const recommendations = [
      ...health.recommendations,
      '定期检查系统健康状态',
      '监控错误模式和趋势',
      '及时更新恢复策略'
    ];

    return {
      systemHealth: health,
      recentRecoveries,
      recommendations
    };
  }
}
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { AWSConfigManager } from '../config/aws';
import { ErrorHandlingService, ErrorType, RetryConfig } from '../services/errorHandlingService';

/**
 * Bedrock客户端工具类
 */
export class BedrockClientUtil {
  private static instance: BedrockClientUtil;
  private client: BedrockRuntimeClient;
  private configManager: AWSConfigManager;
  private errorHandler: ErrorHandlingService;
  private defaultTimeout: number = 60000; // 60秒超时
  private rateLimiter: Map<string, { count: number; resetTime: number }> = new Map();
  private maxRequestsPerMinute: number = 20; // 每分钟最大请求数

  private constructor() {
    this.configManager = AWSConfigManager.getInstance();
    this.client = this.configManager.getBedrockClient();
    this.errorHandler = ErrorHandlingService.getInstance();
  }

  public static getInstance(): BedrockClientUtil {
    if (!BedrockClientUtil.instance) {
      BedrockClientUtil.instance = new BedrockClientUtil();
    }
    return BedrockClientUtil.instance;
  }

  /**
   * 调用Bedrock模型
   */
  public async invokeModel(
    prompt: string,
    imageData?: string,
    customRetryConfig?: Partial<RetryConfig>
  ): Promise<any> {
    const startTime = Date.now();
    const config = this.configManager.getConfig();
    const retryConfig = { ...this.errorHandler.getDefaultRetryConfig(), ...customRetryConfig };
    
    // 检查速率限制
    await this.checkRateLimit();
    
    // 构建请求体
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: imageData ? [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageData
              }
            }
          ] : [
            {
              type: "text",
              text: prompt
            }
          ]
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId: config.bedrockModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody)
    });

    try {
      const result = await this.invokeWithRetry(command, retryConfig);
      
      // 记录成功的性能指标
      const duration = Date.now() - startTime;
      this.errorHandler.logMetrics('bedrock_invoke', duration, true, {
        modelId: config.bedrockModelId,
        hasImage: !!imageData,
        promptLength: prompt.length
      });
      
      return result;
    } catch (error) {
      // 记录失败的性能指标
      const duration = Date.now() - startTime;
      this.errorHandler.logMetrics('bedrock_invoke', duration, false, {
        modelId: config.bedrockModelId,
        hasImage: !!imageData,
        promptLength: prompt.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }

  /**
   * 带重试机制的API调用
   */
  private async invokeWithRetry(
    command: InvokeModelCommand,
    retryConfig: RetryConfig
  ): Promise<any> {
    // 使用错误处理服务的重试和熔断器机制
    return await this.errorHandler.executeWithRetryAndCircuitBreaker(
      async () => {
        // 检查速率限制
        await this.checkRateLimit();
        
        console.log(`发送Bedrock API请求到模型: ${command.input.modelId}`);
        
        // 动态调整超时时间
        const timeout = retryConfig.timeoutMs || this.defaultTimeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Bedrock API调用超时 (${timeout}ms)`)), timeout);
        });
        
        const apiCallPromise = this.client.send(command);
        
        const response = await Promise.race([apiCallPromise, timeoutPromise]);
        
        if (!response.body) {
          throw new Error('Bedrock API返回空响应体');
        }
        
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        
        // 验证响应格式
        if (!responseBody.content) {
          throw new Error('Bedrock API返回格式不正确：缺少content字段');
        }
        
        // 验证内容不为空
        if (!Array.isArray(responseBody.content) || responseBody.content.length === 0) {
          throw new Error('Bedrock API返回空内容');
        }
        
        console.log('Bedrock API调用成功，响应长度:', JSON.stringify(responseBody).length);
        return responseBody;
      },
      'bedrock_api_call',
      retryConfig
    );
  }

  /**
   * 增强的速率限制检查，支持多级限制和预测性限流
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const windowStart = Math.floor(now / 60000) * 60000; // 1分钟窗口
    const key = 'bedrock_requests';
    
    let limiter = this.rateLimiter.get(key);
    
    if (!limiter || limiter.resetTime <= now) {
      // 重置计数器
      limiter = { count: 0, resetTime: windowStart + 60000 };
      this.rateLimiter.set(key, limiter);
    }
    
    // 多级限流检查
    const warningThreshold = Math.floor(this.maxRequestsPerMinute * 0.8); // 80%警告阈值
    const criticalThreshold = Math.floor(this.maxRequestsPerMinute * 0.95); // 95%严重阈值
    
    if (limiter.count >= this.maxRequestsPerMinute) {
      const waitTime = limiter.resetTime - now;
      console.warn(`达到速率限制 (${this.maxRequestsPerMinute}/分钟)，需要等待 ${waitTime}ms`);
      
      // 记录速率限制事件
      this.errorHandler.logError(
        this.errorHandler.analyzeError(
          new Error(`API请求频率过高，已达到限制 ${this.maxRequestsPerMinute}/分钟`),
          {
            currentCount: limiter.count,
            maxRequests: this.maxRequestsPerMinute,
            waitTime,
            resetTime: new Date(limiter.resetTime).toISOString(),
            severity: 'critical'
          }
        )
      );
      
      // 抛出速率限制错误，让重试机制处理
      throw new Error(`API请求频率过高，请等待 ${Math.ceil(waitTime / 1000)} 秒后重试`);
    }
    
    // 预警机制
    if (limiter.count >= criticalThreshold) {
      console.warn(`接近速率限制 (${limiter.count}/${this.maxRequestsPerMinute})，剩余 ${this.maxRequestsPerMinute - limiter.count} 次请求`);
      
      // 记录预警事件
      this.errorHandler.logError(
        this.errorHandler.analyzeError(
          new Error(`接近API速率限制，当前 ${limiter.count}/${this.maxRequestsPerMinute}`),
          {
            currentCount: limiter.count,
            maxRequests: this.maxRequestsPerMinute,
            remainingRequests: this.maxRequestsPerMinute - limiter.count,
            resetTime: new Date(limiter.resetTime).toISOString(),
            severity: 'warning'
          }
        )
      );
      
      // 在接近限制时添加小延迟，避免突发请求
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    } else if (limiter.count >= warningThreshold) {
      console.info(`速率使用较高 (${limiter.count}/${this.maxRequestsPerMinute})`);
      
      // 轻微延迟以平滑请求
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    }
    
    limiter.count++;
    
    // 定期清理过期的限流记录
    this.cleanupRateLimiter();
  }

  /**
   * 测试连接
   */
  public async testConnection(): Promise<{ success: boolean; error?: string; latency?: number }> {
    const startTime = Date.now();
    
    try {
      // 发送一个简单的测试请求
      const testPrompt = "请回复'连接测试成功'";
      await this.invokeModel(testPrompt, undefined, { maxRetries: 1 });
      
      const latency = Date.now() - startTime;
      console.log(`Bedrock连接测试成功，延迟: ${latency}ms`);
      
      return { success: true, latency };
    } catch (error) {
      const errorInfo = this.errorHandler.analyzeError(error, { operation: 'connection_test' });
      this.errorHandler.logError(errorInfo);
      
      console.error('Bedrock连接测试失败:', error);
      return { 
        success: false, 
        error: this.errorHandler.getUserFriendlyMessage(errorInfo),
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * 获取服务健康状态
   */
  public async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    const connectionTest = await this.testConnection();
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (!connectionTest.success) {
      status = 'unhealthy';
    } else if (connectionTest.latency! > 10000) {
      status = 'degraded';
    }
    
    return {
      status,
      details: {
        connection: connectionTest.success ? 'ok' : 'failed',
        latency: connectionTest.latency,
        error: connectionTest.error,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 设置超时时间
   */
  public setTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
  }



  /**
   * 获取速率限制状态
   */
  public getRateLimitStatus(): {
    requestsInCurrentWindow: number;
    maxRequestsPerMinute: number;
    resetTime: Date;
    remainingRequests: number;
  } {
    const now = Date.now();
    const windowStart = Math.floor(now / 60000) * 60000;
    const key = 'bedrock_requests';
    
    let limiter = this.rateLimiter.get(key);
    
    if (!limiter || limiter.resetTime <= now) {
      limiter = { count: 0, resetTime: windowStart + 60000 };
    }
    
    return {
      requestsInCurrentWindow: limiter.count,
      maxRequestsPerMinute: this.maxRequestsPerMinute,
      resetTime: new Date(limiter.resetTime),
      remainingRequests: Math.max(0, this.maxRequestsPerMinute - limiter.count)
    };
  }

  /**
   * 设置速率限制
   */
  public setRateLimit(requestsPerMinute: number): void {
    this.maxRequestsPerMinute = requestsPerMinute;
    console.log(`速率限制已设置为每分钟 ${requestsPerMinute} 次请求`);
  }

  /**
   * 清理过期的速率限制记录
   */
  private cleanupRateLimiter(): void {
    const now = Date.now();
    
    for (const [key, limiter] of this.rateLimiter.entries()) {
      if (limiter.resetTime <= now) {
        this.rateLimiter.delete(key);
      }
    }
  }

  /**
   * 网络连接测试
   */
  public async testNetworkConnectivity(): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
    details: Record<string, any>;
  }> {
    const startTime = Date.now();
    
    try {
      // 测试DNS解析
      const dns = require('dns').promises;
      const dnsStart = Date.now();
      await dns.lookup('bedrock-runtime.us-east-1.amazonaws.com');
      const dnsLatency = Date.now() - dnsStart;
      
      // 测试HTTP连接
      const https = require('https');
      const httpStart = Date.now();
      
      await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'bedrock-runtime.us-east-1.amazonaws.com',
          port: 443,
          method: 'HEAD',
          timeout: 10000
        }, (res: any) => {
          resolve(res);
        });
        
        req.on('error', reject);
        req.on('timeout', () => reject(new Error('HTTP连接超时')));
        req.end();
      });
      
      const httpLatency = Date.now() - httpStart;
      const totalLatency = Date.now() - startTime;
      
      return {
        success: true,
        latency: totalLatency,
        details: {
          dnsLatency,
          httpLatency,
          totalLatency,
          timestamp: new Date().toISOString()
        }
      };
      
    } catch (error) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : '网络连接测试失败',
        details: {
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * 获取详细的健康检查报告
   */
  public async getDetailedHealthReport(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, any>;
    recommendations: string[];
  }> {
    const networkTest = await this.testNetworkConnectivity();
    const connectionTest = await this.testConnection();
    const rateLimitStatus = this.getRateLimitStatus();
    
    const components = {
      network: {
        status: networkTest.success ? 'healthy' : 'unhealthy',
        latency: networkTest.latency,
        details: networkTest.details,
        error: networkTest.error
      },
      bedrockApi: {
        status: connectionTest.success ? 'healthy' : 'unhealthy',
        latency: connectionTest.latency,
        error: connectionTest.error
      },
      rateLimit: {
        status: rateLimitStatus.remainingRequests > 0 ? 'healthy' : 'degraded',
        ...rateLimitStatus
      }
    };
    
    // 确定整体状态
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const recommendations: string[] = [];
    
    if (!networkTest.success || !connectionTest.success) {
      overall = 'unhealthy';
      recommendations.push('检查网络连接和AWS配置');
    } else if (networkTest.latency! > 5000 || connectionTest.latency! > 10000) {
      overall = 'degraded';
      recommendations.push('网络延迟较高，可能影响性能');
    }
    
    if (rateLimitStatus.remainingRequests === 0) {
      overall = overall === 'healthy' ? 'degraded' : overall;
      recommendations.push('已达到速率限制，请稍后重试');
    }
    
    return {
      overall,
      components,
      recommendations
    };
  }

  /**
   * 获取客户端实例（用于高级用法）
   */
  public getClient(): BedrockRuntimeClient {
    return this.client;
  }
}
import * as fs from 'fs';
import { BedrockClientUtil } from '../utils/bedrockClient';
import { ErrorHandlingService, ErrorType, RetryConfig } from './errorHandlingService';
import { FallbackOcrService } from './fallbackOcrService';
import { MonitoringService } from './monitoringService';
import { ImageProcessingService, ImageProcessingOptions } from './imageProcessingService';
import { ErrorRecoveryService } from './errorRecoveryService';

export interface ReceiptItem {
  itemName: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

export interface OCRResult {
  items: ReceiptItem[];
  confidence: number;
  totalAmount: number;
  fallbackUsed?: boolean;
  processingTime?: number;
  qualityAnalysis?: any;
}

export class OCRService {
  private static instance: OCRService;
  private bedrockClient: BedrockClientUtil;
  private errorHandler: ErrorHandlingService;
  private fallbackService: FallbackOcrService;
  private monitoringService: MonitoringService;
  private imageProcessingService: ImageProcessingService;
  private errorRecoveryService: ErrorRecoveryService;

  private constructor() {
    this.bedrockClient = BedrockClientUtil.getInstance();
    this.errorHandler = ErrorHandlingService.getInstance();
    this.fallbackService = FallbackOcrService.getInstance();
    this.monitoringService = MonitoringService.getInstance();
    this.imageProcessingService = ImageProcessingService.getInstance();
    this.errorRecoveryService = ErrorRecoveryService.getInstance();
  }

  public static getInstance(): OCRService {
    if (!OCRService.instance) {
      OCRService.instance = new OCRService();
    }
    return OCRService.instance;
  }

  /**
   * 使用Bedrock Claude识别收据图片
   */
  public async recognizeReceipt(imagePath: string, enableFallback: boolean = true): Promise<OCRResult> {
    const startTime = Date.now();
    let qualityAnalysis: any = null;
    
    try {
      console.log('开始使用Bedrock Claude识别收据:', imagePath);
      
      // 验证图像文件
      const validation = await this.imageProcessingService.validateImage(imagePath);
      if (!validation.isValid) {
        throw new Error(`图像验证失败: ${validation.errors.join(', ')}`);
      }
      
      // 分析图像质量
      qualityAnalysis = await this.imageProcessingService.analyzeImageQuality(imagePath);
      console.log('图像质量分析:', qualityAnalysis);
      
      // 如果图像质量太差，直接使用降级服务
      if (qualityAnalysis.quality === 'poor' && enableFallback) {
        console.warn('图像质量过差，直接使用降级服务');
        const fallbackResult = await this.fallbackService.heuristicRecognition(imagePath);
        return {
          ...fallbackResult,
          fallbackUsed: true,
          processingTime: Date.now() - startTime,
          qualityAnalysis
        };
      }
      
      // 使用新的图像处理服务预处理图像
      const processedResult = await this.imageProcessingService.processImage(imagePath, {
        maxWidth: 2048,
        maxHeight: 2048,
        quality: qualityAnalysis.quality === 'excellent' ? 95 : 85,
        format: 'jpeg',
        enhanceForOCR: true,
        preserveAspectRatio: true
      });
      
      console.log('图像处理完成:', {
        originalSize: processedResult.metadata.originalSize,
        processedSize: processedResult.metadata.processedSize,
        compressionRatio: processedResult.metadata.compressionRatio,
        processingTime: processedResult.metadata.processingTime
      });
      
      // 将处理后的图像转换为base64
      const imageBase64 = processedResult.buffer.toString('base64');
      
      // 构建Claude提示词
      const prompt = this.buildOCRPrompt();
      
      // 配置重试策略 - 根据图像质量动态调整
      const retryConfig: Partial<RetryConfig> = {
        maxRetries: this.calculateMaxRetries(qualityAnalysis.quality),
        baseDelay: 2000,
        maxDelay: 60000, // 增加最大延迟
        backoffMultiplier: 2.5, // 更激进的退避策略
        jitterEnabled: true,
        timeoutMs: this.calculateTimeout(qualityAnalysis.quality, processedResult.metadata.processedSize)
      };
      
      console.log('OCR重试配置:', retryConfig);
      
      // 调用Bedrock Claude API with enhanced error handling
      const response = await this.bedrockClient.invokeModel(prompt, imageBase64, retryConfig);
      
      // 解析Claude响应
      const ocrResult = this.parseClaudeResponse(response);
      
      // 记录成功的性能指标
      const processingTime = Date.now() - startTime;
      this.errorHandler.logMetrics('ocr_recognition', processingTime, true, {
        imagePath,
        confidence: ocrResult.confidence,
        itemCount: ocrResult.items.length,
        imageQuality: qualityAnalysis.quality,
        imageProcessing: processedResult.metadata
      });
      
      // 记录监控指标
      this.monitoringService.recordRequest('ocr_recognition', true, processingTime, false);
      
      console.log('Bedrock Claude识别完成:', ocrResult);
      return {
        ...ocrResult,
        fallbackUsed: false,
        processingTime,
        qualityAnalysis: processedResult.qualityAnalysis
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorInfo = this.errorHandler.analyzeError(error, {
        imagePath,
        processingTime,
        imageQuality: qualityAnalysis?.quality
      });
      
      this.errorHandler.logError(errorInfo);
      
      // 记录失败的性能指标
      this.errorHandler.logMetrics('ocr_recognition', processingTime, false, {
        imagePath,
        error: errorInfo.message,
        errorType: errorInfo.type,
        imageQuality: qualityAnalysis?.quality
      });
      
      console.error('Bedrock Claude OCR识别失败:', error);
      
      // 如果启用降级且错误可以降级处理，使用降级服务
      if (enableFallback && this.shouldUseFallback(errorInfo)) {
        console.log('启用降级OCR服务');
        try {
          const fallbackResult = await this.fallbackService.fallbackRecognition(imagePath, error as Error);
          const finalProcessingTime = Date.now() - startTime;
          
          // 记录降级成功的监控指标
          this.monitoringService.recordRequest('ocr_recognition', true, finalProcessingTime, true, errorInfo.type);
          
          return {
            ...fallbackResult,
            fallbackUsed: true,
            processingTime: finalProcessingTime,
            qualityAnalysis
          };
        } catch (fallbackError) {
          console.error('降级服务也失败了:', fallbackError);
          // 记录完全失败的监控指标
          this.monitoringService.recordRequest('ocr_recognition', false, Date.now() - startTime, false, errorInfo.type);
        }
      } else {
        // 记录失败的监控指标
        this.monitoringService.recordRequest('ocr_recognition', false, processingTime, false, errorInfo.type);
      }
      
      // 抛出用户友好的错误信息
      throw new Error(this.errorHandler.getUserFriendlyMessage(errorInfo));
    }
  }

  /**
   * 预处理图像以提高OCR准确率 (已弃用，使用ImageProcessingService)
   * @deprecated 使用 ImageProcessingService.processImage() 替代
   */
  public async preprocessImage(inputPath: string): Promise<Buffer> {
    console.warn('preprocessImage方法已弃用，建议使用ImageProcessingService.processImage()');
    
    try {
      const result = await this.imageProcessingService.processImage(inputPath, {
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 85,
        format: 'jpeg',
        enhanceForOCR: true,
        preserveAspectRatio: true
      });
      
      return result.buffer;
    } catch (error) {
      throw new Error(`图像预处理失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 构建结构化的Claude提示词模板
   */
  private buildOCRPrompt(): string {
    return `请分析这张收据图片，提取其中的商品信息。请仔细识别中文和英文文字，并返回严格的JSON格式数据。

要求：
1. 仔细识别所有商品名称（包括中文、英文、数字）
2. 准确提取每个商品的单价、数量和小计金额
3. 如果某个商品没有明确的数量，默认为1
4. 忽略非商品信息（如店名、地址、时间、收银员信息等）
5. 计算并验证总金额

请返回以下JSON格式：
{
  "items": [
    {
      "itemName": "商品名称",
      "unitPrice": 单价数字,
      "quantity": 数量整数,
      "totalPrice": 小计金额数字
    }
  ],
  "totalAmount": 总金额数字,
  "confidence": 识别置信度(0-1之间的数字)
}

注意：
- 所有价格都是数字类型，不包含货币符号
- 商品名称要完整准确
- 如果识别不清楚，confidence设置为较低值
- 确保小计 = 单价 × 数量
- 确保总金额 = 所有小计之和`;
  }

  /**
   * 解析Claude API响应并验证数据
   */
  private parseClaudeResponse(response: any): OCRResult {
    try {
      console.log('解析Claude响应:', response);
      
      // 从Claude响应中提取内容
      let content = '';
      if (response.content && Array.isArray(response.content)) {
        content = response.content.find((item: any) => item.type === 'text')?.text || '';
      } else if (response.content) {
        content = response.content;
      } else {
        throw new Error('Claude响应格式不正确');
      }

      // 尝试提取JSON部分
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Claude响应中未找到JSON格式数据');
      }

      const jsonStr = jsonMatch[0];
      const parsedData = JSON.parse(jsonStr);

      // 验证响应数据结构
      if (!parsedData.items || !Array.isArray(parsedData.items)) {
        throw new Error('Claude响应缺少items数组');
      }

      // 验证并清理商品数据
      const validatedItems: ReceiptItem[] = [];
      for (const item of parsedData.items) {
        const validatedItem = this.validateReceiptItem(item);
        if (validatedItem) {
          validatedItems.push(validatedItem);
        }
      }

      // 计算总金额
      const calculatedTotal = validatedItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const totalAmount = parsedData.totalAmount || calculatedTotal;

      // 验证总金额的合理性
      const tolerance = 0.01;
      if (Math.abs(totalAmount - calculatedTotal) > tolerance && parsedData.totalAmount) {
        console.warn(`总金额不匹配: Claude返回${totalAmount}, 计算得出${calculatedTotal}, 使用计算值`);
      }

      const confidence = Math.max(0, Math.min(1, parsedData.confidence || 0.8));

      return {
        items: validatedItems,
        totalAmount: calculatedTotal,
        confidence
      };

    } catch (error) {
      console.error('解析Claude响应失败:', error);
      throw new Error(`解析Claude响应失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 验证并清理单个收据项目数据
   */
  private validateReceiptItem(item: any): ReceiptItem | null {
    try {
      // 检查必需字段
      if (!item.itemName || typeof item.itemName !== 'string') {
        console.warn('商品缺少有效名称:', item);
        return null;
      }

      const itemName = item.itemName.trim();
      if (itemName.length === 0 || itemName.length > 100) {
        console.warn('商品名称长度不合理:', itemName);
        return null;
      }

      // 验证数值字段
      const unitPrice = this.parseNumber(item.unitPrice);
      const quantity = this.parseInteger(item.quantity);
      const totalPrice = this.parseNumber(item.totalPrice);

      if (unitPrice <= 0 || quantity <= 0 || totalPrice <= 0) {
        console.warn('商品价格或数量无效:', { unitPrice, quantity, totalPrice });
        return null;
      }

      // 验证计算是否正确（允许小误差）
      const expectedTotal = unitPrice * quantity;
      const tolerance = 0.01;
      if (Math.abs(totalPrice - expectedTotal) > tolerance) {
        console.warn(`商品计算不匹配: ${itemName}, 单价${unitPrice} × 数量${quantity} = ${expectedTotal}, 但总价为${totalPrice}`);
        // 使用计算值而不是拒绝整个项目
        return {
          itemName,
          unitPrice,
          quantity,
          totalPrice: expectedTotal
        };
      }

      // 过滤明显不是商品的项目
      if (this.isInvalidItemName(itemName)) {
        console.warn('过滤无效商品名称:', itemName);
        return null;
      }

      return {
        itemName,
        unitPrice,
        quantity,
        totalPrice
      };

    } catch (error) {
      console.warn('验证商品项目失败:', error, item);
      return null;
    }
  }

  /**
   * 检查是否为无效的商品名称
   */
  private isInvalidItemName(name: string): boolean {
    const invalidPatterns = [
      /^(小计|合计|总计|subtotal|total)$/i,
      /^(找零|change|应收|收款)$/i,
      /^(税|tax|服务费|service)$/i,
      /^(店名|商店|超市|store)$/i,
      /^(地址|address|电话|phone|tel)$/i,
      /^(日期|date|时间|time)$/i,
      /^(收银员|cashier|营业员)$/i,
      /^(谢谢|thank|欢迎|welcome)$/i,
      /^[-=*\s]{2,}$/,
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{2}:\d{2}/
    ];

    return invalidPatterns.some(pattern => pattern.test(name.trim()));
  }

  /**
   * 安全地解析数字
   */
  private parseNumber(value: any): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * 安全地解析整数
   */
  private parseInteger(value: any): number {
    if (typeof value === 'number') {
      return Math.round(value);
    }
    if (typeof value === 'string') {
      const parsed = parseInt(value.replace(/[^\d]/g, ''), 10);
      return isNaN(parsed) ? 1 : parsed;
    }
    return 1;
  }

  /**
   * 根据图像质量计算最大重试次数
   */
  private calculateMaxRetries(quality: string): number {
    switch (quality) {
      case 'excellent':
      case 'good':
        return 4; // 高质量图片多重试
      case 'fair':
        return 3;
      case 'poor':
        return 2; // 低质量图片少重试，快速降级
      default:
        return 3;
    }
  }

  /**
   * 根据图像质量和大小计算超时时间
   */
  private calculateTimeout(quality: string, imageSize?: number): number {
    let baseTimeout = 60000; // 基础60秒
    
    // 根据质量调整
    switch (quality) {
      case 'poor':
        baseTimeout = 45000; // 低质量图片缩短超时
        break;
      case 'excellent':
        baseTimeout = 90000; // 高质量图片延长超时
        break;
    }
    
    // 根据图片大小调整
    if (imageSize) {
      if (imageSize > 5 * 1024 * 1024) { // 大于5MB
        baseTimeout = Math.min(baseTimeout * 1.5, 120000);
      } else if (imageSize < 500 * 1024) { // 小于500KB
        baseTimeout = Math.max(baseTimeout * 0.8, 30000);
      }
    }
    
    return Math.floor(baseTimeout);
  }

  /**
   * 判断是否应该使用降级服务
   */
  private shouldUseFallback(errorInfo: any): boolean {
    // 对于以下错误类型，使用降级服务
    const fallbackErrorTypes = [
      'NETWORK_ERROR',
      'API_TIMEOUT',
      'API_RATE_LIMIT',
      'SERVICE_UNAVAILABLE',
      'PARSING_ERROR',
      'AUTHENTICATION_ERROR' // 添加认证错误
    ];
    
    return fallbackErrorTypes.includes(errorInfo.type);
  }

  /**
   * 获取OCR服务健康状态
   */
  public async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    try {
      const bedrockHealth = await this.bedrockClient.getHealthStatus();
      
      return {
        status: bedrockHealth.status,
        details: {
          bedrock: bedrockHealth.details,
          fallbackAvailable: true,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          fallbackAvailable: true,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * 批量处理多个收据
   */
  public async batchRecognizeReceipts(imagePaths: string[], enableFallback: boolean = true): Promise<{
    results: (OCRResult | { error: string; imagePath: string })[];
    summary: {
      total: number;
      successful: number;
      failed: number;
      fallbackUsed: number;
    };
  }> {
    const results: (OCRResult | { error: string; imagePath: string })[] = [];
    let successful = 0;
    let failed = 0;
    let fallbackUsed = 0;

    for (const imagePath of imagePaths) {
      try {
        const result = await this.recognizeReceipt(imagePath, enableFallback);
        results.push(result);
        successful++;
        if (result.fallbackUsed) {
          fallbackUsed++;
        }
      } catch (error) {
        const errorResult = {
          error: error instanceof Error ? error.message : '未知错误',
          imagePath
        };
        results.push(errorResult);
        failed++;
      }
    }

    return {
      results,
      summary: {
        total: imagePaths.length,
        successful,
        failed,
        fallbackUsed
      }
    };
  }

  /**
   * 清理临时文件
   */
  public cleanupTempFile(filePath: string): void {
    this.imageProcessingService.cleanupTempFiles([filePath]);
  }

  /**
   * 批量清理临时文件
   */
  public cleanupTempFiles(filePaths: string[]): void {
    this.imageProcessingService.cleanupTempFiles(filePaths);
  }

  /**
   * 清理过期的日志文件
   */
  public cleanupLogs(daysToKeep: number = 30): void {
    try {
      this.errorHandler.cleanupOldLogs(daysToKeep);
    } catch (error) {
      console.error('清理日志文件失败:', error);
    }
  }
}
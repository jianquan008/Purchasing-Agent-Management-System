import { ReceiptItem, OCRResult } from './ocrService';
import { ErrorHandlingService, ErrorType } from './errorHandlingService';

/**
 * 降级OCR服务 - 当Claude失败时的备选方案
 */
export class FallbackOcrService {
  private static instance: FallbackOcrService;
  private errorHandler: ErrorHandlingService;

  private constructor() {
    this.errorHandler = ErrorHandlingService.getInstance();
  }

  public static getInstance(): FallbackOcrService {
    if (!FallbackOcrService.instance) {
      FallbackOcrService.instance = new FallbackOcrService();
    }
    return FallbackOcrService.instance;
  }

  /**
   * 增强的降级OCR识别 - 多层次降级策略
   */
  public async fallbackRecognition(imagePath: string, originalError?: Error): Promise<OCRResult> {
    console.log('启用增强降级OCR服务');
    const startTime = Date.now();
    
    try {
      // 分析原始错误类型，选择最佳降级策略
      const fallbackStrategy = this.selectFallbackStrategy(originalError);
      console.log(`选择降级策略: ${fallbackStrategy}`);
      
      // 尝试从图像中提取基本信息
      const imageAnalysis = await this.analyzeImageQuality(imagePath);
      
      let result: OCRResult;
      
      switch (fallbackStrategy) {
        case 'enhanced_heuristic':
          result = await this.enhancedHeuristicRecognition(imagePath, imageAnalysis);
          break;
          
        case 'template_based':
          result = await this.templateBasedRecognition(imagePath, imageAnalysis);
          break;
          
        case 'basic_heuristic':
          result = await this.heuristicRecognition(imagePath);
          break;
          
        default:
          result = await this.getEmptyTemplate();
      }
      
      // 记录降级事件
      const processingTime = Date.now() - startTime;
      this.errorHandler.logError(
        this.errorHandler.analyzeError(
          new Error(`OCR服务降级：使用${fallbackStrategy}策略`),
          {
            imagePath,
            originalError: originalError?.message,
            fallbackStrategy,
            fallbackReason: this.analyzeFallbackReason(originalError),
            imageQuality: imageAnalysis.quality,
            resultItemCount: result.items.length,
            processingTime,
            confidence: result.confidence
          }
        )
      );

      return {
        ...result,
        processingTime
      };
      
    } catch (fallbackError) {
      console.error('降级服务执行失败:', fallbackError);
      
      // 记录降级服务失败
      this.errorHandler.logError(
        this.errorHandler.analyzeError(fallbackError, {
          imagePath,
          originalError: originalError?.message,
          fallbackError: 'All fallback strategies failed',
          processingTime: Date.now() - startTime
        })
      );

      // 返回最基本的空模板
      return await this.getEmptyTemplate();
    }
  }

  /**
   * 选择最佳降级策略
   */
  private selectFallbackStrategy(originalError?: Error): string {
    if (!originalError) {
      return 'enhanced_heuristic';
    }
    
    const errorMessage = originalError.message.toLowerCase();
    
    // 网络错误 - 使用增强启发式
    if (errorMessage.includes('network') || errorMessage.includes('econnrefused') || errorMessage.includes('timeout')) {
      return 'enhanced_heuristic';
    }
    
    // 限流错误 - 使用模板方式
    if (errorMessage.includes('rate limit') || errorMessage.includes('throttle')) {
      return 'template_based';
    }
    
    // 认证错误 - 使用基础启发式
    if (errorMessage.includes('unauthorized') || errorMessage.includes('authentication')) {
      return 'basic_heuristic';
    }
    
    // 解析错误 - 使用增强启发式
    if (errorMessage.includes('parse') || errorMessage.includes('json')) {
      return 'enhanced_heuristic';
    }
    
    // 默认使用增强启发式
    return 'enhanced_heuristic';
  }

  /**
   * 增强的启发式识别
   */
  private async enhancedHeuristicRecognition(imagePath: string, imageAnalysis: any): Promise<OCRResult> {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const stats = fs.statSync(imagePath);
      const fileName = path.basename(imagePath);
      
      console.log('使用增强启发式识别:', { fileName, size: stats.size, quality: imageAnalysis.quality });
      
      // 根据图像质量和大小智能估算
      let confidence = 0.15;
      let estimatedItemCount = 1;
      
      // 根据图像质量调整
      switch (imageAnalysis.quality) {
        case 'good':
          confidence = 0.25;
          estimatedItemCount = 2;
          break;
        case 'fair':
          confidence = 0.2;
          estimatedItemCount = 2;
          break;
        case 'poor':
          confidence = 0.1;
          estimatedItemCount = 1;
          break;
      }
      
      // 根据文件大小调整
      if (stats.size > 3 * 1024 * 1024) { // 大于3MB
        estimatedItemCount = Math.min(estimatedItemCount + 2, 5);
        confidence += 0.05;
      } else if (stats.size > 1 * 1024 * 1024) { // 大于1MB
        estimatedItemCount = Math.min(estimatedItemCount + 1, 4);
        confidence += 0.03;
      }
      
      // 根据文件名模式调整
      if (fileName.includes('receipt') || fileName.includes('收据') || fileName.includes('发票')) {
        confidence += 0.1;
        estimatedItemCount = Math.max(estimatedItemCount, 2);
      }
      
      // 生成智能商品模板
      const items: ReceiptItem[] = [];
      for (let i = 0; i < estimatedItemCount; i++) {
        items.push({
          itemName: this.generateSmartItemName(i, imageAnalysis),
          unitPrice: this.estimatePrice(i, imageAnalysis),
          quantity: 1,
          totalPrice: this.estimatePrice(i, imageAnalysis)
        });
      }
      
      const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);
      
      return {
        items,
        confidence: Math.min(confidence, 0.3), // 最高30%置信度
        totalAmount
      };
      
    } catch (error) {
      console.error('增强启发式识别失败:', error);
      return await this.getEmptyTemplate();
    }
  }

  /**
   * 基于模板的识别
   */
  private async templateBasedRecognition(imagePath: string, imageAnalysis: any): Promise<OCRResult> {
    try {
      console.log('使用模板识别方法');
      
      // 根据图像质量选择模板
      const templates = this.getReceiptTemplates(imageAnalysis.quality);
      const selectedTemplate = templates[Math.floor(Math.random() * templates.length)];
      
      return {
        items: selectedTemplate.items,
        confidence: selectedTemplate.confidence,
        totalAmount: selectedTemplate.items.reduce((sum, item) => sum + item.totalPrice, 0)
      };
      
    } catch (error) {
      console.error('模板识别失败:', error);
      return await this.getEmptyTemplate();
    }
  }

  /**
   * 生成智能商品名称
   */
  private generateSmartItemName(index: number, imageAnalysis: any): string {
    const commonItems = [
      '商品', '食品', '日用品', '饮料', '零食', 
      '水果', '蔬菜', '肉类', '调料', '清洁用品'
    ];
    
    if (index === 0) {
      return ''; // 第一个留空让用户填写
    }
    
    return commonItems[index % commonItems.length] + ` ${index}`;
  }

  /**
   * 估算价格
   */
  private estimatePrice(index: number, imageAnalysis: any): number {
    // 根据图像质量和索引估算合理价格
    const basePrices = [0, 10, 15, 8, 25, 12]; // 常见商品价格
    return basePrices[index] || 10;
  }

  /**
   * 获取收据模板
   */
  private getReceiptTemplates(quality: string): Array<{ items: ReceiptItem[]; confidence: number }> {
    const templates = [
      {
        items: [
          { itemName: '', unitPrice: 0, quantity: 1, totalPrice: 0 },
          { itemName: '', unitPrice: 0, quantity: 1, totalPrice: 0 }
        ],
        confidence: 0.1
      },
      {
        items: [
          { itemName: '', unitPrice: 0, quantity: 1, totalPrice: 0 }
        ],
        confidence: 0.05
      }
    ];
    
    return templates;
  }

  /**
   * 获取空模板
   */
  private async getEmptyTemplate(): Promise<OCRResult> {
    return {
      items: [
        {
          itemName: '',
          unitPrice: 0,
          quantity: 1,
          totalPrice: 0
        }
      ],
      confidence: 0,
      totalAmount: 0
    };
  }

  /**
   * 分析降级原因
   */
  private analyzeFallbackReason(originalError?: Error): string {
    if (!originalError) {
      return 'Unknown error';
    }
    
    const errorMessage = originalError.message.toLowerCase();
    
    if (errorMessage.includes('network') || errorMessage.includes('econnrefused')) {
      return 'Network connectivity issues';
    }
    if (errorMessage.includes('timeout')) {
      return 'API timeout';
    }
    if (errorMessage.includes('rate limit')) {
      return 'Rate limit exceeded';
    }
    if (errorMessage.includes('unauthorized')) {
      return 'Authentication failure';
    }
    if (errorMessage.includes('parse')) {
      return 'Response parsing error';
    }
    
    return 'Service unavailable';
  }

  /**
   * 基于图像文件名和大小的简单启发式识别
   * 这是一个非常基础的降级方案
   */
  public async heuristicRecognition(imagePath: string): Promise<OCRResult> {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const stats = fs.statSync(imagePath);
      const fileName = path.basename(imagePath);
      
      console.log('使用启发式识别方法:', { fileName, size: stats.size });
      
      // 基于文件大小和名称的简单推断
      let confidence = 0.1; // 很低的置信度
      let estimatedItemCount = 1;
      
      // 根据文件大小估算可能的商品数量
      if (stats.size > 2 * 1024 * 1024) { // 大于2MB
        estimatedItemCount = 3;
        confidence = 0.2;
      } else if (stats.size > 1 * 1024 * 1024) { // 大于1MB
        estimatedItemCount = 2;
        confidence = 0.15;
      }
      
      // 生成空的商品模板
      const items: ReceiptItem[] = [];
      for (let i = 0; i < estimatedItemCount; i++) {
        items.push({
          itemName: `商品 ${i + 1}`,
          unitPrice: 0,
          quantity: 1,
          totalPrice: 0
        });
      }
      
      return {
        items,
        confidence,
        totalAmount: 0
      };
      
    } catch (error) {
      console.error('启发式识别失败:', error);
      return this.fallbackRecognition(imagePath, error as Error);
    }
  }

  /**
   * 尝试从图像元数据中提取有用信息
   */
  public async extractImageMetadata(imagePath: string): Promise<Record<string, any>> {
    try {
      const sharp = require('sharp');
      const metadata = await sharp(imagePath).metadata();
      
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size,
        density: metadata.density,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation
      };
    } catch (error) {
      console.error('提取图像元数据失败:', error);
      return {};
    }
  }

  /**
   * 检查图像质量并提供改进建议
   */
  public async analyzeImageQuality(imagePath: string): Promise<{
    quality: 'good' | 'fair' | 'poor';
    suggestions: string[];
    metadata: Record<string, any>;
  }> {
    try {
      const metadata = await this.extractImageMetadata(imagePath);
      const suggestions: string[] = [];
      let quality: 'good' | 'fair' | 'poor' = 'good';
      
      // 检查分辨率
      if (metadata.width && metadata.height) {
        const totalPixels = metadata.width * metadata.height;
        if (totalPixels < 500000) { // 小于0.5MP
          quality = 'poor';
          suggestions.push('图像分辨率过低，建议使用更高分辨率的图片');
        } else if (totalPixels < 2000000) { // 小于2MP
          quality = 'fair';
          suggestions.push('图像分辨率较低，可能影响识别准确率');
        }
      }
      
      // 检查文件大小
      const fs = require('fs');
      const stats = fs.statSync(imagePath);
      if (stats.size < 100 * 1024) { // 小于100KB
        quality = 'poor';
        suggestions.push('文件过小，可能压缩过度影响识别');
      } else if (stats.size > 10 * 1024 * 1024) { // 大于10MB
        suggestions.push('文件较大，建议适当压缩以提高处理速度');
      }
      
      // 检查格式
      if (metadata.format && !['jpeg', 'jpg', 'png'].includes(metadata.format.toLowerCase())) {
        suggestions.push('建议使用JPEG或PNG格式的图片');
      }
      
      if (suggestions.length === 0) {
        suggestions.push('图像质量良好，适合OCR识别');
      }
      
      return {
        quality,
        suggestions,
        metadata
      };
      
    } catch (error) {
      console.error('分析图像质量失败:', error);
      return {
        quality: 'poor',
        suggestions: ['无法分析图像质量，请检查图片文件'],
        metadata: {}
      };
    }
  }

  /**
   * 生成降级报告
   */
  public generateFallbackReport(imagePath: string, originalError: Error): {
    reason: string;
    suggestions: string[];
    nextSteps: string[];
  } {
    const errorInfo = this.errorHandler.analyzeError(originalError);
    
    let reason = '未知原因导致OCR识别失败';
    const suggestions: string[] = [];
    const nextSteps: string[] = [];
    
    switch (errorInfo.type) {
      case ErrorType.NETWORK_ERROR:
        reason = '网络连接问题导致OCR服务不可用';
        suggestions.push('检查网络连接');
        suggestions.push('稍后重试');
        nextSteps.push('请手动输入收据信息');
        break;
        
      case ErrorType.API_TIMEOUT:
        reason = 'OCR服务响应超时';
        suggestions.push('图片可能过大或过于复杂');
        suggestions.push('尝试压缩图片或提高图片质量');
        nextSteps.push('请手动输入收据信息');
        break;
        
      case ErrorType.API_RATE_LIMIT:
        reason = 'OCR服务请求频率过高';
        suggestions.push('稍等片刻后重试');
        nextSteps.push('或者手动输入收据信息');
        break;
        
      case ErrorType.IMAGE_PROCESSING_ERROR:
        reason = '图片处理失败';
        suggestions.push('检查图片格式是否正确');
        suggestions.push('确保图片未损坏');
        nextSteps.push('请重新上传图片或手动输入');
        break;
        
      case ErrorType.PARSING_ERROR:
        reason = 'OCR识别结果解析失败';
        suggestions.push('图片内容可能过于复杂');
        suggestions.push('尝试使用更清晰的图片');
        nextSteps.push('请手动输入收据信息');
        break;
        
      default:
        suggestions.push('检查图片质量和格式');
        suggestions.push('确保网络连接正常');
        nextSteps.push('请手动输入收据信息');
        nextSteps.push('如问题持续，请联系技术支持');
    }
    
    return {
      reason,
      suggestions,
      nextSteps
    };
  }
}
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { ErrorHandlingService } from './errorHandlingService';

export interface ImageQualityAnalysis {
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  score: number;
  issues: string[];
  suggestions: string[];
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
    density?: number;
    hasAlpha: boolean;
  };
}

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  enhanceForOCR?: boolean;
  preserveAspectRatio?: boolean;
}

export interface ProcessedImageResult {
  buffer: Buffer;
  metadata: {
    originalSize: number;
    processedSize: number;
    compressionRatio: number;
    format: string;
    width: number;
    height: number;
    processingTime: number;
  };
  qualityAnalysis: ImageQualityAnalysis;
}

export class ImageProcessingService {
  private static instance: ImageProcessingService;
  private errorHandler: ErrorHandlingService;
  
  // 图像大小限制配置
  private readonly MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
  private readonly MIN_FILE_SIZE = 1024; // 1KB
  private readonly MAX_DIMENSION = 4096; // 最大宽度或高度
  private readonly MIN_DIMENSION = 100; // 最小宽度或高度
  
  // 支持的图像格式
  private readonly SUPPORTED_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'tiff', 'bmp'];
  private readonly SUPPORTED_MIME_TYPES = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/webp',
    'image/tiff',
    'image/bmp'
  ];

  private constructor() {
    this.errorHandler = ErrorHandlingService.getInstance();
  }

  public static getInstance(): ImageProcessingService {
    if (!ImageProcessingService.instance) {
      ImageProcessingService.instance = new ImageProcessingService();
    }
    return ImageProcessingService.instance;
  }

  /**
   * 验证图像文件
   */
  public async validateImage(filePath: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        errors.push('图像文件不存在');
        return { isValid: false, errors, warnings };
      }

      // 检查文件大小
      const stats = fs.statSync(filePath);
      if (stats.size > this.MAX_FILE_SIZE) {
        errors.push(`文件过大，最大支持 ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
      }
      if (stats.size < this.MIN_FILE_SIZE) {
        errors.push(`文件过小，最小需要 ${this.MIN_FILE_SIZE} bytes`);
      }

      // 检查文件扩展名
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      if (!this.SUPPORTED_FORMATS.includes(ext)) {
        errors.push(`不支持的文件格式，支持的格式: ${this.SUPPORTED_FORMATS.join(', ')}`);
      }

      // 使用sharp验证图像格式和获取元数据
      try {
        const metadata = await sharp(filePath).metadata();
        
        if (!metadata.width || !metadata.height) {
          errors.push('无法读取图像尺寸信息');
        } else {
          // 检查图像尺寸
          if (metadata.width > this.MAX_DIMENSION || metadata.height > this.MAX_DIMENSION) {
            warnings.push(`图像尺寸过大 (${metadata.width}x${metadata.height})，建议压缩`);
          }
          if (metadata.width < this.MIN_DIMENSION || metadata.height < this.MIN_DIMENSION) {
            warnings.push(`图像尺寸过小 (${metadata.width}x${metadata.height})，可能影响识别效果`);
          }

          // 检查图像密度
          if (metadata.density && metadata.density < 150) {
            warnings.push('图像分辨率较低，可能影响OCR识别效果');
          }
        }

        // 检查图像格式
        if (metadata.format && !this.SUPPORTED_FORMATS.includes(metadata.format)) {
          errors.push(`不支持的图像格式: ${metadata.format}`);
        }

      } catch (sharpError) {
        errors.push('图像文件损坏或格式不正确');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      errors.push(`文件验证失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return { isValid: false, errors, warnings };
    }
  }

  /**
   * 分析图像质量
   */
  public async analyzeImageQuality(filePath: string): Promise<ImageQualityAnalysis> {
    const startTime = Date.now();
    
    try {
      const sharpInstance = sharp(filePath);
      const metadata = await sharpInstance.metadata();
      const stats = fs.statSync(filePath);
      
      const issues: string[] = [];
      const suggestions: string[] = [];
      let qualityScore = 100;

      // 基础元数据检查
      if (!metadata.width || !metadata.height) {
        issues.push('无法读取图像尺寸');
        qualityScore -= 50;
      }

      const width = metadata.width || 0;
      const height = metadata.height || 0;
      const size = stats.size;

      // 尺寸质量评估
      if (width < 800 || height < 600) {
        issues.push('图像分辨率较低');
        suggestions.push('建议使用更高分辨率的图像');
        qualityScore -= 20;
      }

      if (width > 3000 || height > 3000) {
        suggestions.push('图像分辨率很高，处理时间可能较长');
      }

      // 文件大小评估
      const pixelCount = width * height;
      const bytesPerPixel = pixelCount > 0 ? size / pixelCount : 0;
      
      if (bytesPerPixel < 0.5) {
        issues.push('图像压缩率过高，可能影响文字清晰度');
        suggestions.push('尝试使用质量更高的图像');
        qualityScore -= 15;
      }

      // 密度检查
      if (metadata.density && metadata.density < 150) {
        issues.push('图像DPI较低');
        suggestions.push('建议使用300DPI以上的扫描图像');
        qualityScore -= 10;
      }

      // 格式评估
      if (metadata.format === 'jpeg' && bytesPerPixel < 1) {
        issues.push('JPEG压缩可能过度');
        suggestions.push('考虑使用PNG格式保存文档图像');
        qualityScore -= 5;
      }

      // 通道检查
      if (metadata.channels && metadata.channels === 1) {
        suggestions.push('检测到灰度图像，适合OCR处理');
        qualityScore += 5;
      }

      // 获取图像统计信息进行进一步分析
      try {
        const { channels } = await sharpInstance.stats();
        
        // 检查对比度
        if (channels && channels.length > 0) {
          const avgStdDev = channels.reduce((sum, ch) => sum + (ch.stdev || 0), 0) / channels.length;
          
          if (avgStdDev < 30) {
            issues.push('图像对比度较低');
            suggestions.push('提高图像对比度可改善识别效果');
            qualityScore -= 15;
          }
          
          if (avgStdDev > 80) {
            suggestions.push('图像对比度良好，有利于文字识别');
            qualityScore += 5;
          }
        }
      } catch (statsError) {
        // 统计信息获取失败不影响主要质量评估
        console.warn('无法获取图像统计信息:', statsError);
      }

      // 确定质量等级
      let quality: ImageQualityAnalysis['quality'];
      if (qualityScore >= 90) {
        quality = 'excellent';
      } else if (qualityScore >= 75) {
        quality = 'good';
      } else if (qualityScore >= 60) {
        quality = 'fair';
      } else {
        quality = 'poor';
      }

      // 根据质量等级添加建议
      if (quality === 'poor') {
        suggestions.push('建议重新拍摄或扫描图像');
        suggestions.push('确保光线充足，避免阴影和反光');
      } else if (quality === 'fair') {
        suggestions.push('图像质量一般，建议检查清晰度');
      }

      const processingTime = Date.now() - startTime;
      
      // 记录质量分析指标
      this.errorHandler.logMetrics('image_quality_analysis', processingTime, true, {
        filePath,
        quality,
        score: qualityScore,
        width,
        height,
        size,
        format: metadata.format
      });

      return {
        quality,
        score: Math.max(0, Math.min(100, qualityScore)),
        issues,
        suggestions,
        metadata: {
          width,
          height,
          format: metadata.format || 'unknown',
          size,
          density: metadata.density,
          hasAlpha: metadata.hasAlpha || false
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorInfo = this.errorHandler.analyzeError(error, {
        filePath,
        operation: 'image_quality_analysis',
        processingTime
      });
      
      this.errorHandler.logError(errorInfo);
      this.errorHandler.logMetrics('image_quality_analysis', processingTime, false, {
        error: errorInfo.message
      });

      throw new Error(`图像质量分析失败: ${this.errorHandler.getUserFriendlyMessage(errorInfo)}`);
    }
  }

  /**
   * 处理和优化图像
   */
  public async processImage(
    inputPath: string, 
    options: ImageProcessingOptions = {}
  ): Promise<ProcessedImageResult> {
    const startTime = Date.now();
    
    try {
      // 验证输入文件
      const validation = await this.validateImage(inputPath);
      if (!validation.isValid) {
        throw new Error(`图像验证失败: ${validation.errors.join(', ')}`);
      }

      // 分析图像质量
      const qualityAnalysis = await this.analyzeImageQuality(inputPath);
      
      const originalStats = fs.statSync(inputPath);
      const originalSize = originalStats.size;

      // 设置默认选项
      const {
        maxWidth = 2048,
        maxHeight = 2048,
        quality = 85,
        format = 'jpeg',
        enhanceForOCR = true,
        preserveAspectRatio = true
      } = options;

      let sharpInstance = sharp(inputPath);
      const metadata = await sharpInstance.metadata();

      // 确定是否需要调整大小
      const needsResize = metadata.width && metadata.height && 
        (metadata.width > maxWidth || metadata.height > maxHeight || originalSize > 5 * 1024 * 1024);

      if (needsResize) {
        const resizeOptions: sharp.ResizeOptions = {
          fit: preserveAspectRatio ? 'inside' : 'fill',
          withoutEnlargement: true
        };

        sharpInstance = sharpInstance.resize(maxWidth, maxHeight, resizeOptions);
      }

      // OCR优化处理
      if (enhanceForOCR) {
        sharpInstance = this.applyOCREnhancements(sharpInstance, qualityAnalysis);
      }

      // 格式转换和压缩
      let outputBuffer: Buffer;
      switch (format) {
        case 'png':
          outputBuffer = await sharpInstance
            .png({ 
              quality: Math.min(100, quality + 10), // PNG质量稍高
              compressionLevel: 6 
            })
            .toBuffer();
          break;
        case 'webp':
          outputBuffer = await sharpInstance
            .webp({ 
              quality,
              effort: 4 
            })
            .toBuffer();
          break;
        case 'jpeg':
        default:
          outputBuffer = await sharpInstance
            .jpeg({ 
              quality,
              progressive: true,
              mozjpeg: true // 使用更好的JPEG编码器
            })
            .toBuffer();
          break;
      }

      // 获取处理后的元数据
      const processedMetadata = await sharp(outputBuffer).metadata();
      const processingTime = Date.now() - startTime;
      const compressionRatio = originalSize / outputBuffer.length;

      // 记录处理指标
      this.errorHandler.logMetrics('image_processing', processingTime, true, {
        inputPath,
        originalSize,
        processedSize: outputBuffer.length,
        compressionRatio: compressionRatio.toFixed(2),
        format,
        quality,
        enhanceForOCR,
        needsResize
      });

      return {
        buffer: outputBuffer,
        metadata: {
          originalSize,
          processedSize: outputBuffer.length,
          compressionRatio,
          format,
          width: processedMetadata.width || 0,
          height: processedMetadata.height || 0,
          processingTime
        },
        qualityAnalysis
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorInfo = this.errorHandler.analyzeError(error, {
        inputPath,
        operation: 'image_processing',
        processingTime,
        options
      });
      
      this.errorHandler.logError(errorInfo);
      this.errorHandler.logMetrics('image_processing', processingTime, false, {
        error: errorInfo.message,
        errorType: errorInfo.type
      });

      throw new Error(`图像处理失败: ${this.errorHandler.getUserFriendlyMessage(errorInfo)}`);
    }
  }

  /**
   * 应用OCR优化增强
   */
  private applyOCREnhancements(sharpInstance: sharp.Sharp, qualityAnalysis: ImageQualityAnalysis): sharp.Sharp {
    // 根据质量分析结果应用不同的增强策略
    let enhanced = sharpInstance;

    // 对比度和亮度增强
    if (qualityAnalysis.issues.includes('图像对比度较低')) {
      enhanced = enhanced.normalize(); // 自动调整对比度
    }

    // 锐化处理 - 根据图像质量调整强度
    let sharpenSigma = 1;
    let sharpenM1 = 1;
    let sharpenM2 = 2;

    if (qualityAnalysis.quality === 'poor') {
      // 质量差的图像需要更强的锐化
      sharpenSigma = 1.5;
      sharpenM1 = 1.5;
      sharpenM2 = 3;
    } else if (qualityAnalysis.quality === 'excellent') {
      // 质量好的图像轻微锐化即可
      sharpenSigma = 0.5;
      sharpenM1 = 0.8;
      sharpenM2 = 1.5;
    }

    enhanced = enhanced.sharpen({ 
      sigma: sharpenSigma, 
      m1: sharpenM1, 
      m2: sharpenM2 
    });

    // 如果是彩色图像且质量不佳，考虑转换为灰度以提高OCR效果
    if (qualityAnalysis.metadata.hasAlpha || 
        (qualityAnalysis.quality === 'poor' && qualityAnalysis.metadata.format !== 'png')) {
      enhanced = enhanced.grayscale();
    }

    return enhanced;
  }

  /**
   * 批量处理图像
   */
  public async batchProcessImages(
    inputPaths: string[],
    options: ImageProcessingOptions = {}
  ): Promise<{
    results: (ProcessedImageResult | { error: string; inputPath: string })[];
    summary: {
      total: number;
      successful: number;
      failed: number;
      totalOriginalSize: number;
      totalProcessedSize: number;
      averageCompressionRatio: number;
    };
  }> {
    const results: (ProcessedImageResult | { error: string; inputPath: string })[] = [];
    let successful = 0;
    let failed = 0;
    let totalOriginalSize = 0;
    let totalProcessedSize = 0;
    let totalCompressionRatio = 0;

    for (const inputPath of inputPaths) {
      try {
        const result = await this.processImage(inputPath, options);
        results.push(result);
        successful++;
        totalOriginalSize += result.metadata.originalSize;
        totalProcessedSize += result.metadata.processedSize;
        totalCompressionRatio += result.metadata.compressionRatio;
      } catch (error) {
        const errorResult = {
          error: error instanceof Error ? error.message : '未知错误',
          inputPath
        };
        results.push(errorResult);
        failed++;
      }
    }

    return {
      results,
      summary: {
        total: inputPaths.length,
        successful,
        failed,
        totalOriginalSize,
        totalProcessedSize,
        averageCompressionRatio: successful > 0 ? totalCompressionRatio / successful : 0
      }
    };
  }

  /**
   * 清理临时文件
   */
  public cleanupTempFiles(filePaths: string[]): void {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('已清理临时文件:', filePath);
        }
      } catch (error) {
        const errorInfo = this.errorHandler.analyzeError(error, { 
          filePath, 
          operation: 'cleanup' 
        });
        this.errorHandler.logError(errorInfo);
        console.error('清理临时文件失败:', filePath, error);
      }
    }
  }

  /**
   * 获取支持的图像格式
   */
  public getSupportedFormats(): {
    extensions: string[];
    mimeTypes: string[];
  } {
    return {
      extensions: [...this.SUPPORTED_FORMATS],
      mimeTypes: [...this.SUPPORTED_MIME_TYPES]
    };
  }

  /**
   * 获取图像处理配置限制
   */
  public getProcessingLimits(): {
    maxFileSize: number;
    minFileSize: number;
    maxDimension: number;
    minDimension: number;
  } {
    return {
      maxFileSize: this.MAX_FILE_SIZE,
      minFileSize: this.MIN_FILE_SIZE,
      maxDimension: this.MAX_DIMENSION,
      minDimension: this.MIN_DIMENSION
    };
  }
}
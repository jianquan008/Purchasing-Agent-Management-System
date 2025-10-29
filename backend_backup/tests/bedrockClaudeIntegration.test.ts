import { BedrockClientUtil } from '../src/utils/bedrockClient';
import { OCRService } from '../src/services/ocrService';
import { AWSConfigManager } from '../src/config/aws';
import fs from 'fs';
import path from 'path';

// Mock AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  InvokeModelCommand: jest.fn()
}));

// Mock other services
jest.mock('../src/services/errorHandlingService', () => ({
  ErrorType: {
    NETWORK_ERROR: 'NETWORK_ERROR',
    API_TIMEOUT: 'API_TIMEOUT',
    API_RATE_LIMIT: 'API_RATE_LIMIT',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    PARSING_ERROR: 'PARSING_ERROR'
  },
  ErrorHandlingService: {
    getInstance: jest.fn(() => ({
      analyzeError: jest.fn(() => ({ type: 'UNKNOWN', message: 'Test error' })),
      logError: jest.fn(),
      logMetrics: jest.fn(),
      getUserFriendlyMessage: jest.fn((error) => error.message || 'Test error'),
      getDefaultRetryConfig: jest.fn(() => ({
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      })),
      isRetryableError: jest.fn(() => true),
      calculateRetryDelay: jest.fn((attempt) => attempt * 1000)
    }))
  }
}));

jest.mock('../src/services/imageProcessingService', () => ({
  ImageProcessingService: {
    getInstance: jest.fn(() => ({
      validateImage: jest.fn(),
      analyzeImageQuality: jest.fn(),
      processImage: jest.fn(),
      cleanupTempFiles: jest.fn()
    }))
  }
}));

jest.mock('../src/services/fallbackOcrService', () => ({
  FallbackOcrService: {
    getInstance: jest.fn(() => ({
      heuristicRecognition: jest.fn(),
      fallbackRecognition: jest.fn()
    }))
  }
}));

jest.mock('../src/services/monitoringService', () => ({
  MonitoringService: {
    getInstance: jest.fn(() => ({
      recordRequest: jest.fn()
    }))
  }
}));

// Mock fs
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn()
}));

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { ImageProcessingService } from '../src/services/imageProcessingService';

describe('Bedrock Claude Integration Tests', () => {
  let bedrockClient: BedrockClientUtil;
  let ocrService: OCRService;
  let mockBedrockRuntimeClient: any;
  let mockImageProcessingService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singletons
    (BedrockClientUtil as any).instance = undefined;
    (OCRService as any).instance = undefined;
    (AWSConfigManager as any).instance = undefined;

    // Setup AWS config mock
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-sonnet-20240229-v1:0';

    mockBedrockRuntimeClient = {
      send: jest.fn()
    };
    (BedrockRuntimeClient as jest.Mock).mockImplementation(() => mockBedrockRuntimeClient);

    mockImageProcessingService = {
      validateImage: jest.fn(),
      analyzeImageQuality: jest.fn(),
      processImage: jest.fn(),
      cleanupTempFiles: jest.fn()
    };
    (ImageProcessingService.getInstance as jest.Mock).mockReturnValue(mockImageProcessingService);

    bedrockClient = BedrockClientUtil.getInstance();
    ocrService = OCRService.getInstance();
  });

  describe('BedrockClientUtil - Claude API调用单元测试', () => {
    it('should successfully invoke Claude model with text prompt', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: '连接测试成功'
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await bedrockClient.invokeModel('测试提示词');

      expect(mockBedrockRuntimeClient.send).toHaveBeenCalledTimes(1);
      expect(InvokeModelCommand).toHaveBeenCalledWith(expect.objectContaining({
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: expect.stringContaining('"anthropic_version":"bedrock-2023-05-31"')
      }));
      expect(result.content[0].text).toBe('连接测试成功');
    });

    it('should successfully invoke Claude model with image data', async () => {
      const mockImageData = 'base64-encoded-image-data';
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '苹果', unitPrice: 5.0, quantity: 2, totalPrice: 10.0 }],
              totalAmount: 10.0,
              confidence: 0.9
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await bedrockClient.invokeModel('识别收据', mockImageData);

      expect(mockBedrockRuntimeClient.send).toHaveBeenCalledTimes(1);
      const mockConstructor = InvokeModelCommand as jest.MockedClass<typeof InvokeModelCommand>;
      const callArgs = mockConstructor.mock.calls[0][0];
      const requestBody = JSON.parse(callArgs.body as string);
      
      expect(requestBody.messages[0].content).toHaveLength(2);
      expect(requestBody.messages[0].content[0].type).toBe('text');
      expect(requestBody.messages[0].content[1].type).toBe('image');
      expect(requestBody.messages[0].content[1].source.data).toBe(mockImageData);
    });

    it('should handle API timeout errors', async () => {
      mockBedrockRuntimeClient.send.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      // Set a very short timeout for testing
      bedrockClient.setTimeout(50);

      await expect(bedrockClient.invokeModel('测试提示词'))
        .rejects.toThrow('API调用超时');
    });

    it('should retry on transient failures', async () => {
      mockBedrockRuntimeClient.send
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValueOnce({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{ type: 'text', text: '重试成功' }]
          }))
        });

      const result = await bedrockClient.invokeModel('测试重试', undefined, { maxRetries: 3 });

      expect(mockBedrockRuntimeClient.send).toHaveBeenCalledTimes(3);
      expect(result.content[0].text).toBe('重试成功');
    });

    it('should fail after max retries exceeded', async () => {
      mockBedrockRuntimeClient.send.mockRejectedValue(new Error('Persistent error'));

      await expect(bedrockClient.invokeModel('测试失败', undefined, { maxRetries: 2 }))
        .rejects.toThrow('Bedrock API调用失败，已重试 2 次');

      expect(mockBedrockRuntimeClient.send).toHaveBeenCalledTimes(2);
    });

    it('should handle malformed API responses', async () => {
      const mockResponse = {
        body: new TextEncoder().encode('Invalid JSON response')
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      await expect(bedrockClient.invokeModel('测试格式错误'))
        .rejects.toThrow();
    });

    it('should handle empty API responses', async () => {
      const mockResponse = {};

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      await expect(bedrockClient.invokeModel('测试空响应'))
        .rejects.toThrow('Bedrock API返回空响应体');
    });
  });

  describe('OCRService - 图像处理功能测试', () => {
    beforeEach(() => {
      // Setup default mocks for image processing
      mockImageProcessingService.validateImage.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockImageProcessingService.analyzeImageQuality.mockResolvedValue({
        quality: 'good',
        score: 85,
        issues: [],
        suggestions: [],
        metadata: {
          width: 1920,
          height: 1080,
          format: 'jpeg',
          size: 2048000,
          hasAlpha: false
        }
      });

      mockImageProcessingService.processImage.mockResolvedValue({
        buffer: Buffer.from('processed-image-data'),
        metadata: {
          originalSize: 2048000,
          processedSize: 1024000,
          compressionRatio: 2.0,
          format: 'jpeg',
          width: 1920,
          height: 1080,
          processingTime: 500
        },
        qualityAnalysis: {
          quality: 'good',
          score: 85,
          issues: [],
          suggestions: [],
          metadata: {
            width: 1920,
            height: 1080,
            format: 'jpeg',
            size: 2048000,
            hasAlpha: false
          }
        }
      });
    });

    it('should process high-quality images with optimal settings', async () => {
      mockImageProcessingService.analyzeImageQuality.mockResolvedValue({
        quality: 'excellent',
        score: 95,
        issues: [],
        suggestions: [],
        metadata: { width: 2048, height: 1536, format: 'jpeg', size: 3072000, hasAlpha: false }
      });

      const mockClaudeResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '高质量商品', unitPrice: 15.0, quantity: 1, totalPrice: 15.0 }],
              totalAmount: 15.0,
              confidence: 0.95
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockClaudeResponse);

      const result = await ocrService.recognizeReceipt('/test/high-quality.jpg');

      expect(mockImageProcessingService.processImage).toHaveBeenCalledWith('/test/high-quality.jpg', {
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 95, // Higher quality for excellent images
        format: 'jpeg',
        enhanceForOCR: true,
        preserveAspectRatio: true
      });

      expect(result.confidence).toBe(0.95);
      expect(result.fallbackUsed).toBe(false);
    });

    it('should handle poor quality images with fallback', async () => {
      mockImageProcessingService.analyzeImageQuality.mockResolvedValue({
        quality: 'poor',
        score: 45,
        issues: ['低分辨率', '模糊'],
        suggestions: ['提高图像质量'],
        metadata: { width: 400, height: 300, format: 'jpeg', size: 50000, hasAlpha: false }
      });

      const mockFallbackService = require('../src/services/fallbackOcrService').FallbackOcrService.getInstance();
      mockFallbackService.heuristicRecognition.mockResolvedValue({
        items: [{ itemName: '降级识别商品', unitPrice: 8.0, quantity: 1, totalPrice: 8.0 }],
        totalAmount: 8.0,
        confidence: 0.6
      });

      const result = await ocrService.recognizeReceipt('/test/poor-quality.jpg');

      expect(mockFallbackService.heuristicRecognition).toHaveBeenCalledWith('/test/poor-quality.jpg');
      expect(result.fallbackUsed).toBe(true);
      expect(result.confidence).toBe(0.6);
    });

    it('should validate image files before processing', async () => {
      mockImageProcessingService.validateImage.mockResolvedValue({
        isValid: false,
        errors: ['文件不存在', '格式不支持'],
        warnings: []
      });

      await expect(ocrService.recognizeReceipt('/test/invalid.txt'))
        .rejects.toThrow('图像验证失败: 文件不存在, 格式不支持');

      expect(mockImageProcessingService.processImage).not.toHaveBeenCalled();
    });

    it('should handle image processing failures gracefully', async () => {
      mockImageProcessingService.processImage.mockRejectedValue(new Error('图像处理失败'));

      await expect(ocrService.recognizeReceipt('/test/corrupt.jpg'))
        .rejects.toThrow();

      expect(mockBedrockRuntimeClient.send).not.toHaveBeenCalled();
    });
  });

  describe('不同类型收据识别准确性测试', () => {
    const createMockClaudeResponse = (items: any[], confidence: number) => ({
      body: new TextEncoder().encode(JSON.stringify({
        content: [{
          type: 'text',
          text: JSON.stringify({
            items,
            totalAmount: items.reduce((sum, item) => sum + item.totalPrice, 0),
            confidence
          })
        }]
      }))
    });

    beforeEach(() => {
      // Setup default successful image processing
      mockImageProcessingService.validateImage.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockImageProcessingService.analyzeImageQuality.mockResolvedValue({
        quality: 'good',
        score: 80,
        issues: [],
        suggestions: [],
        metadata: { width: 1600, height: 1200, format: 'jpeg', size: 1500000, hasAlpha: false }
      });

      mockImageProcessingService.processImage.mockResolvedValue({
        buffer: Buffer.from('processed-receipt-data'),
        metadata: {
          originalSize: 1500000,
          processedSize: 800000,
          compressionRatio: 1.875,
          format: 'jpeg',
          width: 1600,
          height: 1200,
          processingTime: 300
        },
        qualityAnalysis: {
          quality: 'good',
          score: 80,
          issues: [],
          suggestions: [],
          metadata: { width: 1600, height: 1200, format: 'jpeg', size: 1500000, hasAlpha: false }
        }
      });
    });

    it('should recognize Chinese handwritten receipts', async () => {
      const mockResponse = createMockClaudeResponse([
        { itemName: '苹果', unitPrice: 6.8, quantity: 2, totalPrice: 13.6 },
        { itemName: '香蕉', unitPrice: 4.5, quantity: 3, totalPrice: 13.5 },
        { itemName: '牛奶', unitPrice: 15.0, quantity: 1, totalPrice: 15.0 }
      ], 0.82);

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/chinese-handwritten.jpg');

      expect(result.items).toHaveLength(3);
      expect(result.items[0].itemName).toBe('苹果');
      expect(result.items[1].itemName).toBe('香蕉');
      expect(result.items[2].itemName).toBe('牛奶');
      expect(result.totalAmount).toBe(42.1);
      expect(result.confidence).toBe(0.82);
    });

    it('should recognize printed receipts with high accuracy', async () => {
      const mockResponse = createMockClaudeResponse([
        { itemName: 'Coca Cola 330ml', unitPrice: 3.5, quantity: 2, totalPrice: 7.0 },
        { itemName: '薯片 原味', unitPrice: 8.9, quantity: 1, totalPrice: 8.9 },
        { itemName: '矿泉水 500ml', unitPrice: 2.0, quantity: 4, totalPrice: 8.0 }
      ], 0.94);

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/printed-receipt.jpg');

      expect(result.items).toHaveLength(3);
      expect(result.confidence).toBe(0.94);
      expect(result.totalAmount).toBe(23.9);
    });

    it('should handle mixed language receipts', async () => {
      const mockResponse = createMockClaudeResponse([
        { itemName: 'Apple iPhone 充电线', unitPrice: 128.0, quantity: 1, totalPrice: 128.0 },
        { itemName: 'Samsung Galaxy Case', unitPrice: 45.5, quantity: 2, totalPrice: 91.0 },
        { itemName: '无线耳机 Bluetooth', unitPrice: 299.0, quantity: 1, totalPrice: 299.0 }
      ], 0.88);

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/mixed-language.jpg');

      expect(result.items).toHaveLength(3);
      expect(result.items.some(item => /iPhone|Samsung|Bluetooth/.test(item.itemName))).toBe(true);
      expect(result.items.some(item => /充电线|无线耳机/.test(item.itemName))).toBe(true);
      expect(result.totalAmount).toBe(518.0);
    });

    it('should handle receipts with special characters and symbols', async () => {
      const mockResponse = createMockClaudeResponse([
        { itemName: '咖啡☕ (大杯)', unitPrice: 25.0, quantity: 1, totalPrice: 25.0 },
        { itemName: '蛋糕🍰 巧克力味', unitPrice: 35.0, quantity: 1, totalPrice: 35.0 },
        { itemName: '果汁 100% 橙汁', unitPrice: 12.5, quantity: 2, totalPrice: 25.0 }
      ], 0.79);

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/special-chars.jpg');

      expect(result.items).toHaveLength(3);
      expect(result.totalAmount).toBe(85.0);
      expect(result.confidence).toBe(0.79);
    });

    it('should filter out invalid items and recalculate totals', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [
                { itemName: '有效商品', unitPrice: 10.0, quantity: 2, totalPrice: 20.0 },
                { itemName: '', unitPrice: 5.0, quantity: 1, totalPrice: 5.0 }, // Invalid: empty name
                { itemName: '负价商品', unitPrice: -3.0, quantity: 1, totalPrice: -3.0 }, // Invalid: negative price
                { itemName: '小计', unitPrice: 0, quantity: 0, totalPrice: 0 }, // Invalid: subtotal line
                { itemName: '另一个有效商品', unitPrice: 15.0, quantity: 1, totalPrice: 15.0 }
              ],
              totalAmount: 37.0, // Original total including invalid items
              confidence: 0.75
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/mixed-valid-invalid.jpg');

      expect(result.items).toHaveLength(2); // Only valid items
      expect(result.items[0].itemName).toBe('有效商品');
      expect(result.items[1].itemName).toBe('另一个有效商品');
      expect(result.totalAmount).toBe(35.0); // Recalculated total
    });

    it('should handle calculation errors in Claude response', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [
                { itemName: '商品A', unitPrice: 10.0, quantity: 3, totalPrice: 35.0 }, // Wrong: should be 30.0
                { itemName: '商品B', unitPrice: 8.5, quantity: 2, totalPrice: 17.0 } // Correct
              ],
              totalAmount: 52.0, // Wrong total
              confidence: 0.85
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/calculation-errors.jpg');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].totalPrice).toBe(30.0); // Corrected calculation
      expect(result.items[1].totalPrice).toBe(17.0); // Unchanged
      expect(result.totalAmount).toBe(47.0); // Corrected total
    });
  });

  describe('性能和负载测试', () => {
    beforeEach(() => {
      // Setup fast image processing for performance tests
      mockImageProcessingService.validateImage.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockImageProcessingService.analyzeImageQuality.mockResolvedValue({
        quality: 'good',
        score: 80,
        issues: [],
        suggestions: [],
        metadata: { width: 1024, height: 768, format: 'jpeg', size: 500000, hasAlpha: false }
      });

      mockImageProcessingService.processImage.mockResolvedValue({
        buffer: Buffer.from('fast-processed-data'),
        metadata: {
          originalSize: 500000,
          processedSize: 300000,
          compressionRatio: 1.67,
          format: 'jpeg',
          width: 1024,
          height: 768,
          processingTime: 100
        },
        qualityAnalysis: {
          quality: 'good',
          score: 80,
          issues: [],
          suggestions: [],
          metadata: { width: 1024, height: 768, format: 'jpeg', size: 500000, hasAlpha: false }
        }
      });
    });

    it('should complete single receipt recognition within acceptable time', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '测试商品', unitPrice: 10.0, quantity: 1, totalPrice: 10.0 }],
              totalAmount: 10.0,
              confidence: 0.85
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const startTime = Date.now();
      const result = await ocrService.recognizeReceipt('/test/performance.jpg');
      const endTime = Date.now();

      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.processingTime).toBeDefined();
      expect(result.items).toHaveLength(1);
    });

    it('should handle concurrent receipt processing', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '并发商品', unitPrice: 5.0, quantity: 1, totalPrice: 5.0 }],
              totalAmount: 5.0,
              confidence: 0.8
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const concurrentRequests = 5;
      const imagePaths = Array.from({ length: concurrentRequests }, (_, i) => `/test/concurrent-${i}.jpg`);

      const startTime = Date.now();
      const promises = imagePaths.map(path => ocrService.recognizeReceipt(path));
      const results = await Promise.all(promises);
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(10000); // All requests should complete within 10 seconds
      expect(results).toHaveLength(concurrentRequests);
      expect(results.every(result => result.items.length > 0)).toBe(true);
    });

    it('should handle batch processing efficiently', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '批量商品', unitPrice: 7.5, quantity: 1, totalPrice: 7.5 }],
              totalAmount: 7.5,
              confidence: 0.82
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const batchSize = 10;
      const imagePaths = Array.from({ length: batchSize }, (_, i) => `/test/batch-${i}.jpg`);

      const startTime = Date.now();
      const batchResult = await ocrService.batchRecognizeReceipts(imagePaths);
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      const averageTimePerImage = totalTime / batchSize;

      expect(batchResult.summary.total).toBe(batchSize);
      expect(batchResult.summary.successful).toBe(batchSize);
      expect(batchResult.summary.failed).toBe(0);
      expect(averageTimePerImage).toBeLessThan(2000); // Average less than 2 seconds per image
    });

    it('should handle memory efficiently with large images', async () => {
      // Simulate large image processing
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB buffer
      mockImageProcessingService.processImage.mockResolvedValue({
        buffer: largeBuffer,
        metadata: {
          originalSize: 20 * 1024 * 1024,
          processedSize: 10 * 1024 * 1024,
          compressionRatio: 2.0,
          format: 'jpeg',
          width: 4096,
          height: 3072,
          processingTime: 800
        },
        qualityAnalysis: {
          quality: 'excellent',
          score: 95,
          issues: [],
          suggestions: [],
          metadata: { width: 4096, height: 3072, format: 'jpeg', size: 20971520, hasAlpha: false }
        }
      });

      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '大图商品', unitPrice: 20.0, quantity: 1, totalPrice: 20.0 }],
              totalAmount: 20.0,
              confidence: 0.92
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const initialMemory = process.memoryUsage().heapUsed;
      const result = await ocrService.recognizeReceipt('/test/large-image.jpg');
      const finalMemory = process.memoryUsage().heapUsed;

      const memoryIncrease = finalMemory - initialMemory;
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Memory increase should be reasonable
      expect(result.items).toHaveLength(1);
    });

    it('should handle API rate limiting gracefully', async () => {
      let callCount = 0;
      mockBedrockRuntimeClient.send.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          const error = new Error('Rate limit exceeded');
          (error as any).name = 'ThrottlingException';
          return Promise.reject(error);
        }
        return Promise.resolve({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              type: 'text',
              text: JSON.stringify({
                items: [{ itemName: '限流后商品', unitPrice: 12.0, quantity: 1, totalPrice: 12.0 }],
                totalAmount: 12.0,
                confidence: 0.85
              })
            }]
          }))
        });
      });

      const startTime = Date.now();
      const result = await ocrService.recognizeReceipt('/test/rate-limit.jpg');
      const endTime = Date.now();

      expect(mockBedrockRuntimeClient.send).toHaveBeenCalledTimes(3); // 2 failures + 1 success
      expect(result.items).toHaveLength(1);
      expect(endTime - startTime).toBeGreaterThan(2000); // Should include retry delays
    });

    it('should measure and report processing metrics', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '指标商品', unitPrice: 8.0, quantity: 2, totalPrice: 16.0 }],
              totalAmount: 16.0,
              confidence: 0.87
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/metrics.jpg');

      expect(result.processingTime).toBeDefined();
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.qualityAnalysis).toBeDefined();
      expect(result.qualityAnalysis.score).toBe(80);

      // Verify metrics were logged
      const errorHandler = require('../src/services/errorHandlingService').ErrorHandlingService.getInstance();
      expect(errorHandler.logMetrics).toHaveBeenCalledWith(
        'ocr_recognition',
        expect.any(Number),
        true,
        expect.objectContaining({
          imagePath: '/test/metrics.jpg',
          confidence: 0.87,
          itemCount: 1,
          imageQuality: 'good'
        })
      );
    });
  });

  describe('错误处理和恢复测试', () => {
    it('should handle network connectivity issues', async () => {
      mockImageProcessingService.validateImage.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockImageProcessingService.analyzeImageQuality.mockResolvedValue({
        quality: 'good',
        score: 80,
        issues: [],
        suggestions: [],
        metadata: { width: 1024, height: 768, format: 'jpeg', size: 500000, hasAlpha: false }
      });

      mockImageProcessingService.processImage.mockResolvedValue({
        buffer: Buffer.from('processed-data'),
        metadata: {
          originalSize: 500000,
          processedSize: 300000,
          compressionRatio: 1.67,
          format: 'jpeg',
          width: 1024,
          height: 768,
          processingTime: 100
        },
        qualityAnalysis: {
          quality: 'good',
          score: 80,
          issues: [],
          suggestions: [],
          metadata: { width: 1024, height: 768, format: 'jpeg', size: 500000, hasAlpha: false }
        }
      });

      const networkError = new Error('Network unreachable');
      (networkError as any).code = 'ENETUNREACH';
      mockBedrockRuntimeClient.send.mockRejectedValue(networkError);

      // Mock fallback service
      const mockFallbackService = require('../src/services/fallbackOcrService').FallbackOcrService.getInstance();
      mockFallbackService.fallbackRecognition.mockResolvedValue({
        items: [{ itemName: '网络故障降级', unitPrice: 5.0, quantity: 1, totalPrice: 5.0 }],
        totalAmount: 5.0,
        confidence: 0.6
      });

      const result = await ocrService.recognizeReceipt('/test/network-error.jpg');

      expect(result.fallbackUsed).toBe(true);
      expect(result.items[0].itemName).toBe('网络故障降级');
    });

    it('should handle service health monitoring', async () => {
      // Test healthy status
      mockBedrockRuntimeClient.send.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ type: 'text', text: '连接测试成功' }]
        }))
      });

      const healthyStatus = await bedrockClient.getHealthStatus();
      expect(healthyStatus.status).toBe('healthy');
      expect(healthyStatus.details.connection).toBe('ok');

      // Test unhealthy status
      mockBedrockRuntimeClient.send.mockRejectedValue(new Error('Service unavailable'));

      const unhealthyStatus = await bedrockClient.getHealthStatus();
      expect(unhealthyStatus.status).toBe('unhealthy');
      expect(unhealthyStatus.details.connection).toBe('failed');
    });
  });
});
import { BedrockClientUtil } from '../src/utils/bedrockClient';
import { OCRService } from '../src/services/ocrService';

// Mock AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  InvokeModelCommand: jest.fn()
}));

// Mock services with minimal setup
jest.mock('../src/services/errorHandlingService', () => ({
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
      validateImage: jest.fn().mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      }),
      analyzeImageQuality: jest.fn().mockResolvedValue({
        quality: 'good',
        score: 80,
        issues: [],
        suggestions: [],
        metadata: { width: 1024, height: 768, format: 'jpeg', size: 500000, hasAlpha: false }
      }),
      processImage: jest.fn().mockResolvedValue({
        buffer: Buffer.from('processed-image-data'),
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
      }),
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

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

describe('Bedrock Claude Basic Integration Tests', () => {
  let bedrockClient: BedrockClientUtil;
  let ocrService: OCRService;
  let mockBedrockRuntimeClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singletons
    (BedrockClientUtil as any).instance = undefined;
    (OCRService as any).instance = undefined;

    // Setup AWS config
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-sonnet-20240229-v1:0';

    mockBedrockRuntimeClient = {
      send: jest.fn()
    };
    (BedrockRuntimeClient as jest.Mock).mockImplementation(() => mockBedrockRuntimeClient);

    bedrockClient = BedrockClientUtil.getInstance();
    ocrService = OCRService.getInstance();
  });

  describe('Basic Claude API Tests', () => {
    it('should successfully invoke Claude model', async () => {
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
      expect(result.content[0].text).toBe('连接测试成功');
    });

    it('should handle API errors gracefully', async () => {
      mockBedrockRuntimeClient.send.mockRejectedValue(new Error('API Error'));

      await expect(bedrockClient.invokeModel('测试提示词'))
        .rejects.toThrow('Bedrock API调用失败');
    });
  });

  describe('Basic OCR Tests', () => {
    it('should recognize receipt successfully', async () => {
      const mockClaudeResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [
                { itemName: '苹果', unitPrice: 5.0, quantity: 2, totalPrice: 10.0 }
              ],
              totalAmount: 10.0,
              confidence: 0.85
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockClaudeResponse);

      const result = await ocrService.recognizeReceipt('/test/receipt.jpg');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].itemName).toBe('苹果');
      expect(result.totalAmount).toBe(10.0);
      expect(result.confidence).toBe(0.85);
      expect(result.fallbackUsed).toBe(false);
    });

    it('should validate and filter invalid items', async () => {
      const mockClaudeResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [
                { itemName: '有效商品', unitPrice: 10.0, quantity: 1, totalPrice: 10.0 },
                { itemName: '', unitPrice: 5.0, quantity: 1, totalPrice: 5.0 }, // Invalid: empty name
                { itemName: '小计', unitPrice: 0, quantity: 0, totalPrice: 15.0 } // Invalid: subtotal
              ],
              totalAmount: 30.0,
              confidence: 0.8
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockClaudeResponse);

      const result = await ocrService.recognizeReceipt('/test/mixed-receipt.jpg');

      expect(result.items).toHaveLength(1); // Only valid items
      expect(result.items[0].itemName).toBe('有效商品');
      expect(result.totalAmount).toBe(10.0); // Recalculated
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle image validation failures', async () => {
      const mockImageProcessingService = require('../src/services/imageProcessingService').ImageProcessingService.getInstance();
      mockImageProcessingService.validateImage.mockResolvedValue({
        isValid: false,
        errors: ['文件不存在'],
        warnings: []
      });

      await expect(ocrService.recognizeReceipt('/test/invalid.jpg'))
        .rejects.toThrow('图像验证失败: 文件不存在');
    });

    it('should handle malformed Claude responses', async () => {
      const mockResponse = {
        body: new TextEncoder().encode('Invalid JSON response')
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      await expect(ocrService.recognizeReceipt('/test/receipt.jpg'))
        .rejects.toThrow();
    });
  });

  describe('Performance Tests', () => {
    it('should complete recognition within reasonable time', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '性能测试', unitPrice: 10.0, quantity: 1, totalPrice: 10.0 }],
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
    });

    it('should handle concurrent requests', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '并发测试', unitPrice: 5.0, quantity: 1, totalPrice: 5.0 }],
              totalAmount: 5.0,
              confidence: 0.8
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const concurrentRequests = 3;
      const promises = Array.from({ length: concurrentRequests }, (_, i) => 
        ocrService.recognizeReceipt(`/test/concurrent-${i}.jpg`)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(concurrentRequests);
      expect(results.every(result => result.items.length > 0)).toBe(true);
    });
  });
});
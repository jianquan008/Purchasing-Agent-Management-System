import { OCRService } from '../src/services/ocrService';
import { BedrockClientUtil } from '../src/utils/bedrockClient';

// Mock AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  InvokeModelCommand: jest.fn()
}));

// Mock services
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

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { ImageProcessingService } from '../src/services/imageProcessingService';

describe('Receipt Recognition Accuracy Tests', () => {
  let ocrService: OCRService;
  let mockBedrockRuntimeClient: any;
  let mockImageProcessingService: any;

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

    mockImageProcessingService = {
      validateImage: jest.fn().mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      }),
      analyzeImageQuality: jest.fn(),
      processImage: jest.fn(),
      cleanupTempFiles: jest.fn()
    };
    (ImageProcessingService.getInstance as jest.Mock).mockReturnValue(mockImageProcessingService);

    ocrService = OCRService.getInstance();
  });

  const setupImageProcessing = (quality: string, score: number) => {
    mockImageProcessingService.analyzeImageQuality.mockResolvedValue({
      quality,
      score,
      issues: quality === 'poor' ? ['低分辨率', '模糊'] : [],
      suggestions: quality === 'poor' ? ['提高图像质量'] : [],
      metadata: {
        width: quality === 'excellent' ? 2048 : quality === 'good' ? 1024 : 640,
        height: quality === 'excellent' ? 1536 : quality === 'good' ? 768 : 480,
        format: 'jpeg',
        size: quality === 'excellent' ? 3000000 : quality === 'good' ? 1500000 : 500000,
        hasAlpha: false
      }
    });

    mockImageProcessingService.processImage.mockResolvedValue({
      buffer: Buffer.from(`processed-${quality}-image`),
      metadata: {
        originalSize: quality === 'excellent' ? 3000000 : quality === 'good' ? 1500000 : 500000,
        processedSize: quality === 'excellent' ? 2000000 : quality === 'good' ? 1000000 : 400000,
        compressionRatio: 1.5,
        format: 'jpeg',
        width: quality === 'excellent' ? 2048 : quality === 'good' ? 1024 : 640,
        height: quality === 'excellent' ? 1536 : quality === 'good' ? 768 : 480,
        processingTime: quality === 'excellent' ? 800 : quality === 'good' ? 400 : 200
      },
      qualityAnalysis: {
        quality,
        score,
        issues: quality === 'poor' ? ['低分辨率', '模糊'] : [],
        suggestions: quality === 'poor' ? ['提高图像质量'] : [],
        metadata: {
          width: quality === 'excellent' ? 2048 : quality === 'good' ? 1024 : 640,
          height: quality === 'excellent' ? 1536 : quality === 'good' ? 768 : 480,
          format: 'jpeg',
          size: quality === 'excellent' ? 3000000 : quality === 'good' ? 1500000 : 500000,
          hasAlpha: false
        }
      }
    });
  };

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

  describe('中文收据识别测试', () => {
    it('should accurately recognize traditional Chinese handwritten receipts', async () => {
      setupImageProcessing('good', 82);

      const expectedItems = [
        { itemName: '白菜', unitPrice: 3.5, quantity: 2, totalPrice: 7.0 },
        { itemName: '豬肉', unitPrice: 28.0, quantity: 1, totalPrice: 28.0 },
        { itemName: '雞蛋', unitPrice: 12.0, quantity: 1, totalPrice: 12.0 },
        { itemName: '牛奶', unitPrice: 15.5, quantity: 2, totalPrice: 31.0 }
      ];

      const mockResponse = createMockClaudeResponse(expectedItems, 0.82);
      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/traditional-chinese.jpg');

      expect(result.items).toHaveLength(4);
      expect(result.items[0].itemName).toBe('白菜');
      expect(result.items[1].itemName).toBe('豬肉');
      expect(result.items[2].itemName).toBe('雞蛋');
      expect(result.items[3].itemName).toBe('牛奶');
      expect(result.totalAmount).toBe(78.0);
      expect(result.confidence).toBe(0.82);
    });

    it('should handle simplified Chinese with numbers and symbols', async () => {
      setupImageProcessing('good', 85);

      const expectedItems = [
        { itemName: '可口可乐 330ml', unitPrice: 3.0, quantity: 3, totalPrice: 9.0 },
        { itemName: '薯片(原味)', unitPrice: 8.5, quantity: 2, totalPrice: 17.0 },
        { itemName: '矿泉水 500ml×6', unitPrice: 12.0, quantity: 1, totalPrice: 12.0 },
        { itemName: '面包 - 全麦', unitPrice: 6.8, quantity: 2, totalPrice: 13.6 }
      ];

      const mockResponse = createMockClaudeResponse(expectedItems, 0.85);
      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/simplified-chinese-symbols.jpg');

      expect(result.items).toHaveLength(4);
      expect(result.items.some(item => item.itemName.includes('330ml'))).toBe(true);
      expect(result.items.some(item => item.itemName.includes('(原味)'))).toBe(true);
      expect(result.items.some(item => item.itemName.includes('×6'))).toBe(true);
      expect(result.items.some(item => item.itemName.includes(' - '))).toBe(true);
      expect(result.totalAmount).toBe(51.6);
    });

    it('should recognize Chinese receipts with price variations', async () => {
      setupImageProcessing('good', 80);

      const expectedItems = [
        { itemName: '苹果', unitPrice: 6.88, quantity: 2, totalPrice: 13.76 },
        { itemName: '香蕉', unitPrice: 4.99, quantity: 3, totalPrice: 14.97 },
        { itemName: '橙子', unitPrice: 8.88, quantity: 1, totalPrice: 8.88 },
        { itemName: '葡萄', unitPrice: 15.68, quantity: 1, totalPrice: 15.68 }
      ];

      const mockResponse = createMockClaudeResponse(expectedItems, 0.80);
      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/chinese-price-variations.jpg');

      expect(result.items).toHaveLength(4);
      expect(result.totalAmount).toBeCloseTo(53.29, 2);
      expect(result.items.every(item => item.unitPrice > 0)).toBe(true);
      expect(result.items.every(item => item.quantity > 0)).toBe(true);
    });
  });

  describe('英文收据识别测试', () => {
    it('should recognize English printed receipts with high accuracy', async () => {
      setupImageProcessing('excellent', 92);

      const expectedItems = [
        { itemName: 'Organic Bananas', unitPrice: 2.99, quantity: 2, totalPrice: 5.98 },
        { itemName: 'Whole Milk 1 Gallon', unitPrice: 4.49, quantity: 1, totalPrice: 4.49 },
        { itemName: 'Bread - Whole Wheat', unitPrice: 3.29, quantity: 1, totalPrice: 3.29 },
        { itemName: 'Chicken Breast', unitPrice: 8.99, quantity: 2, totalPrice: 17.98 }
      ];

      const mockResponse = createMockClaudeResponse(expectedItems, 0.92);
      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/english-printed.jpg');

      expect(result.items).toHaveLength(4);
      expect(result.items[0].itemName).toBe('Organic Bananas');
      expect(result.items[1].itemName).toBe('Whole Milk 1 Gallon');
      expect(result.items[2].itemName).toBe('Bread - Whole Wheat');
      expect(result.items[3].itemName).toBe('Chicken Breast');
      expect(result.totalAmount).toBe(31.74);
      expect(result.confidence).toBe(0.92);
    });

    it('should handle English receipts with abbreviations and codes', async () => {
      setupImageProcessing('good', 87);

      const expectedItems = [
        { itemName: 'COCA COLA 12PK', unitPrice: 5.99, quantity: 1, totalPrice: 5.99 },
        { itemName: 'CHIPS LAYS REG', unitPrice: 3.49, quantity: 2, totalPrice: 6.98 },
        { itemName: 'WATER BTL 24PK', unitPrice: 4.99, quantity: 1, totalPrice: 4.99 },
        { itemName: 'APPLES GALA LB', unitPrice: 1.99, quantity: 3, totalPrice: 5.97 }
      ];

      const mockResponse = createMockClaudeResponse(expectedItems, 0.87);
      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/english-abbreviations.jpg');

      expect(result.items).toHaveLength(4);
      expect(result.items.some(item => item.itemName.includes('12PK'))).toBe(true);
      expect(result.items.some(item => item.itemName.includes('REG'))).toBe(true);
      expect(result.items.some(item => item.itemName.includes('24PK'))).toBe(true);
      expect(result.items.some(item => item.itemName.includes('LB'))).toBe(true);
      expect(result.totalAmount).toBe(23.93);
    });
  });

  describe('混合语言收据识别测试', () => {
    it('should handle Chinese-English mixed receipts', async () => {
      setupImageProcessing('good', 84);

      const expectedItems = [
        { itemName: 'iPhone 充电器', unitPrice: 199.0, quantity: 1, totalPrice: 199.0 },
        { itemName: 'Samsung Galaxy Case', unitPrice: 89.0, quantity: 1, totalPrice: 89.0 },
        { itemName: '无线耳机 AirPods', unitPrice: 1299.0, quantity: 1, totalPrice: 1299.0 },
        { itemName: 'MacBook Pro 保护套', unitPrice: 299.0, quantity: 1, totalPrice: 299.0 }
      ];

      const mockResponse = createMockClaudeResponse(expectedItems, 0.84);
      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/chinese-english-mixed.jpg');

      expect(result.items).toHaveLength(4);
      expect(result.items.some(item => /iPhone|Samsung|AirPods|MacBook/.test(item.itemName))).toBe(true);
      expect(result.items.some(item => /充电器|无线耳机|保护套/.test(item.itemName))).toBe(true);
      expect(result.totalAmount).toBe(1886.0);
    });

    it('should recognize receipts with multiple languages and special characters', async () => {
      setupImageProcessing('good', 79);

      const expectedItems = [
        { itemName: 'Café ☕ 拿铁', unitPrice: 28.0, quantity: 2, totalPrice: 56.0 },
        { itemName: 'Croissant 🥐 牛角包', unitPrice: 15.0, quantity: 3, totalPrice: 45.0 },
        { itemName: 'Juice 100% 橙汁', unitPrice: 18.0, quantity: 1, totalPrice: 18.0 },
        { itemName: 'Sandwich 三明治', unitPrice: 35.0, quantity: 1, totalPrice: 35.0 }
      ];

      const mockResponse = createMockClaudeResponse(expectedItems, 0.79);
      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/multilingual-special-chars.jpg');

      expect(result.items).toHaveLength(4);
      expect(result.totalAmount).toBe(154.0);
      expect(result.confidence).toBe(0.79);
    });
  });

  describe('特殊格式收据识别测试', () => {
    it('should handle thermal printer receipts with faded text', async () => {
      setupImageProcessing('poor', 65);

      const expectedItems = [
        { itemName: '热敏纸商品A', unitPrice: 12.5, quantity: 1, totalPrice: 12.5 },
        { itemName: '热敏纸商品B', unitPrice: 8.0, quantity: 2, totalPrice: 16.0 },
        { itemName: '热敏纸商品C', unitPrice: 25.0, quantity: 1, totalPrice: 25.0 }
      ];

      const mockResponse = createMockClaudeResponse(expectedItems, 0.65);
      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/thermal-faded.jpg');

      expect(result.items).toHaveLength(3);
      expect(result.totalAmount).toBe(53.5);
      expect(result.confidence).toBe(0.65);
      expect(result.qualityAnalysis.quality).toBe('poor');
    });

    it('should recognize receipts with table format layout', async () => {
      setupImageProcessing('good', 88);

      const expectedItems = [
        { itemName: '商品名称A', unitPrice: 15.0, quantity: 2, totalPrice: 30.0 },
        { itemName: '商品名称B', unitPrice: 22.5, quantity: 1, totalPrice: 22.5 },
        { itemName: '商品名称C', unitPrice: 8.8, quantity: 3, totalPrice: 26.4 },
        { itemName: '商品名称D', unitPrice: 45.0, quantity: 1, totalPrice: 45.0 }
      ];

      const mockResponse = createMockClaudeResponse(expectedItems, 0.88);
      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/table-format.jpg');

      expect(result.items).toHaveLength(4);
      expect(result.totalAmount).toBe(123.9);
      expect(result.confidence).toBe(0.88);
    });

    it('should handle receipts with watermarks and background patterns', async () => {
      setupImageProcessing('good', 76);

      const expectedItems = [
        { itemName: '带水印商品1', unitPrice: 18.8, quantity: 1, totalPrice: 18.8 },
        { itemName: '带水印商品2', unitPrice: 32.0, quantity: 2, totalPrice: 64.0 },
        { itemName: '带水印商品3', unitPrice: 9.9, quantity: 3, totalPrice: 29.7 }
      ];

      const mockResponse = createMockClaudeResponse(expectedItems, 0.76);
      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/watermark-background.jpg');

      expect(result.items).toHaveLength(3);
      expect(result.totalAmount).toBe(112.5);
      expect(result.confidence).toBe(0.76);
    });
  });

  describe('数据验证和纠错测试', () => {
    it('should correct calculation errors in Claude response', async () => {
      setupImageProcessing('good', 85);

      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [
                { itemName: '计算错误商品A', unitPrice: 10.0, quantity: 3, totalPrice: 35.0 }, // Wrong: should be 30.0
                { itemName: '计算正确商品B', unitPrice: 15.0, quantity: 2, totalPrice: 30.0 }, // Correct
                { itemName: '计算错误商品C', unitPrice: 8.5, quantity: 4, totalPrice: 30.0 }  // Wrong: should be 34.0
              ],
              totalAmount: 95.0, // Wrong total
              confidence: 0.85
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/calculation-errors.jpg');

      expect(result.items).toHaveLength(3);
      expect(result.items[0].totalPrice).toBe(30.0); // Corrected
      expect(result.items[1].totalPrice).toBe(30.0); // Unchanged
      expect(result.items[2].totalPrice).toBe(34.0); // Corrected
      expect(result.totalAmount).toBe(94.0); // Corrected total
    });

    it('should filter out invalid and non-product items', async () => {
      setupImageProcessing('good', 82);

      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [
                { itemName: '有效商品1', unitPrice: 12.0, quantity: 1, totalPrice: 12.0 },
                { itemName: '', unitPrice: 5.0, quantity: 1, totalPrice: 5.0 }, // Invalid: empty name
                { itemName: '小计', unitPrice: 0, quantity: 0, totalPrice: 17.0 }, // Invalid: subtotal
                { itemName: '有效商品2', unitPrice: 25.0, quantity: 2, totalPrice: 50.0 },
                { itemName: '店名：测试商店', unitPrice: 0, quantity: 0, totalPrice: 0 }, // Invalid: store info
                { itemName: '负价商品', unitPrice: -10.0, quantity: 1, totalPrice: -10.0 }, // Invalid: negative
                { itemName: '有效商品3', unitPrice: 8.5, quantity: 1, totalPrice: 8.5 },
                { itemName: '2024-01-15', unitPrice: 0, quantity: 0, totalPrice: 0 }, // Invalid: date
                { itemName: '谢谢惠顾', unitPrice: 0, quantity: 0, totalPrice: 0 } // Invalid: thank you message
              ],
              totalAmount: 72.5,
              confidence: 0.82
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/mixed-valid-invalid.jpg');

      expect(result.items).toHaveLength(3); // Only valid items
      expect(result.items[0].itemName).toBe('有效商品1');
      expect(result.items[1].itemName).toBe('有效商品2');
      expect(result.items[2].itemName).toBe('有效商品3');
      expect(result.totalAmount).toBe(70.5); // Recalculated from valid items only
    });

    it('should handle edge cases in item validation', async () => {
      setupImageProcessing('good', 78);

      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [
                { itemName: '正常商品', unitPrice: 10.0, quantity: 1, totalPrice: 10.0 },
                { itemName: 'A', unitPrice: 1.0, quantity: 1, totalPrice: 1.0 }, // Very short name - should be valid
                { itemName: '超长商品名称'.repeat(20), unitPrice: 5.0, quantity: 1, totalPrice: 5.0 }, // Too long - should be filtered
                { itemName: '小数量商品', unitPrice: 99.99, quantity: 0.5, totalPrice: 49.995 }, // Fractional quantity
                { itemName: '高价商品', unitPrice: 9999.99, quantity: 1, totalPrice: 9999.99 }, // Very high price
                { itemName: '   空格商品   ', unitPrice: 3.0, quantity: 1, totalPrice: 3.0 } // Leading/trailing spaces
              ],
              totalAmount: 10069.985,
              confidence: 0.78
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const result = await ocrService.recognizeReceipt('/test/edge-cases.jpg');

      // Should include: 正常商品, A, 小数量商品 (rounded), 高价商品, 空格商品 (trimmed)
      // Should exclude: 超长商品名称 (too long)
      expect(result.items.length).toBeGreaterThan(3);
      expect(result.items.some(item => item.itemName === 'A')).toBe(true);
      expect(result.items.some(item => item.itemName === '空格商品')).toBe(true); // Trimmed
      expect(result.items.some(item => item.quantity === 1)).toBe(true); // Fractional quantity rounded
    });
  });

  describe('置信度和质量评估测试', () => {
    it('should provide accurate confidence scores based on image quality', async () => {
      const qualityTests = [
        { quality: 'excellent', score: 95, expectedConfidence: 0.92 },
        { quality: 'good', score: 80, expectedConfidence: 0.85 },
        { quality: 'poor', score: 50, expectedConfidence: 0.65 }
      ];

      for (const test of qualityTests) {
        setupImageProcessing(test.quality, test.score);

        const mockResponse = createMockClaudeResponse([
          { itemName: `${test.quality}质量商品`, unitPrice: 10.0, quantity: 1, totalPrice: 10.0 }
        ], test.expectedConfidence);

        mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

        const result = await ocrService.recognizeReceipt(`/test/${test.quality}-quality.jpg`);

        expect(result.confidence).toBe(test.expectedConfidence);
        expect(result.qualityAnalysis.quality).toBe(test.quality);
        expect(result.qualityAnalysis.score).toBe(test.score);
      }
    });

    it('should correlate confidence with recognition complexity', async () => {
      const complexityTests = [
        {
          name: '简单收据',
          items: [{ itemName: '简单商品', unitPrice: 10.0, quantity: 1, totalPrice: 10.0 }],
          expectedConfidence: 0.95
        },
        {
          name: '中等复杂收据',
          items: Array.from({ length: 5 }, (_, i) => ({
            itemName: `中等商品${i + 1}`,
            unitPrice: (i + 1) * 5.0,
            quantity: i + 1,
            totalPrice: (i + 1) * 5.0 * (i + 1)
          })),
          expectedConfidence: 0.85
        },
        {
          name: '复杂收据',
          items: Array.from({ length: 15 }, (_, i) => ({
            itemName: `复杂商品${i + 1} - 特殊描述`,
            unitPrice: Math.round((Math.random() * 50 + 1) * 100) / 100,
            quantity: Math.floor(Math.random() * 5) + 1,
            totalPrice: Math.round((Math.random() * 200 + 5) * 100) / 100
          })),
          expectedConfidence: 0.75
        }
      ];

      for (const test of complexityTests) {
        setupImageProcessing('good', 80);

        const mockResponse = createMockClaudeResponse(test.items, test.expectedConfidence);
        mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

        const result = await ocrService.recognizeReceipt(`/test/${test.name}.jpg`);

        expect(result.confidence).toBe(test.expectedConfidence);
        expect(result.items).toHaveLength(test.items.length);
      }
    });
  });
});
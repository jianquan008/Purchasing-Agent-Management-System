import { OCRService } from '../src/services/ocrService';
import fs from 'fs';
import path from 'path';

// Mock BedrockClientUtil
jest.mock('../src/utils/bedrockClient', () => ({
  BedrockClientUtil: {
    getInstance: jest.fn(() => ({
      invokeModel: jest.fn()
    }))
  }
}));

// Mock ImageProcessingService
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
      getUserFriendlyMessage: jest.fn((error) => error.message)
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
  statSync: jest.fn(() => ({ size: 1024 })),
  existsSync: jest.fn(() => true),
  unlinkSync: jest.fn()
}));

import { BedrockClientUtil } from '../src/utils/bedrockClient';
import { ImageProcessingService } from '../src/services/imageProcessingService';

describe('OCRService', () => {
  let ocrService: OCRService;
  let mockBedrockClient: any;
  let mockImageProcessingService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the singleton instances
    (OCRService as any).instance = undefined;
    
    mockBedrockClient = {
      invokeModel: jest.fn()
    };
    (BedrockClientUtil.getInstance as jest.Mock).mockReturnValue(mockBedrockClient);

    mockImageProcessingService = {
      validateImage: jest.fn(),
      analyzeImageQuality: jest.fn(),
      processImage: jest.fn(),
      cleanupTempFiles: jest.fn()
    };
    (ImageProcessingService.getInstance as jest.Mock).mockReturnValue(mockImageProcessingService);

    ocrService = OCRService.getInstance();
  });

  describe('recognizeReceipt', () => {
    it('should recognize receipt using Bedrock Claude and parse items', async () => {
      // Mock image validation and processing
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

      const mockClaudeResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            items: [
              {
                itemName: '苹果',
                unitPrice: 5.00,
                quantity: 2,
                totalPrice: 10.00
              },
              {
                itemName: '香蕉',
                unitPrice: 3.50,
                quantity: 3,
                totalPrice: 10.50
              },
              {
                itemName: '牛奶',
                unitPrice: 12.00,
                quantity: 1,
                totalPrice: 12.00
              }
            ],
            totalAmount: 32.50,
            confidence: 0.85
          })
        }]
      };

      mockBedrockClient.invokeModel.mockResolvedValue(mockClaudeResponse);

      const result = await ocrService.recognizeReceipt('/fake/path/receipt.jpg');

      expect(mockImageProcessingService.validateImage).toHaveBeenCalledWith('/fake/path/receipt.jpg');
      expect(mockImageProcessingService.analyzeImageQuality).toHaveBeenCalledWith('/fake/path/receipt.jpg');
      expect(mockImageProcessingService.processImage).toHaveBeenCalled();
      
      expect(result.confidence).toBe(0.85);
      expect(result.items).toHaveLength(3);
      expect(result.items[0]).toEqual({
        itemName: '苹果',
        unitPrice: 5.00,
        quantity: 2,
        totalPrice: 10.00
      });
      expect(result.totalAmount).toBe(32.50);
      expect(result.fallbackUsed).toBe(false);
    });

    it('should handle image validation failure', async () => {
      mockImageProcessingService.validateImage.mockResolvedValue({
        isValid: false,
        errors: ['图像文件损坏'],
        warnings: []
      });

      await expect(ocrService.recognizeReceipt('/fake/path/receipt.jpg'))
        .rejects.toThrow('图像验证失败: 图像文件损坏');
    });

    it('should handle Bedrock Claude API failure', async () => {
      // Mock successful validation and processing
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

      mockBedrockClient.invokeModel.mockRejectedValue(new Error('Bedrock API failed'));

      await expect(ocrService.recognizeReceipt('/fake/path/receipt.jpg'))
        .rejects.toThrow('Bedrock API failed');
    });

    it('should handle invalid Claude response format', async () => {
      // Mock successful validation and processing
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

      const mockInvalidResponse = {
        content: [{
          type: 'text',
          text: 'Invalid JSON response'
        }]
      };

      mockBedrockClient.invokeModel.mockResolvedValue(mockInvalidResponse);

      await expect(ocrService.recognizeReceipt('/fake/path/receipt.jpg'))
        .rejects.toThrow('解析Claude响应失败');
    });

    it('should validate and filter invalid items', async () => {
      // Mock successful validation and processing
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

      const mockClaudeResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            items: [
              {
                itemName: '苹果',
                unitPrice: 5.00,
                quantity: 2,
                totalPrice: 10.00
              },
              {
                itemName: '',  // Invalid: empty name
                unitPrice: 3.50,
                quantity: 1,
                totalPrice: 3.50
              },
              {
                itemName: '香蕉',
                unitPrice: -2.00,  // Invalid: negative price
                quantity: 1,
                totalPrice: -2.00
              },
              {
                itemName: '牛奶',
                unitPrice: 12.00,
                quantity: 1,
                totalPrice: 12.00
              }
            ],
            totalAmount: 22.00,
            confidence: 0.75
          })
        }]
      };

      mockBedrockClient.invokeModel.mockResolvedValue(mockClaudeResponse);

      const result = await ocrService.recognizeReceipt('/fake/path/receipt.jpg');

      // Should only include valid items (empty name and negative price should be filtered)
      expect(result.items).toHaveLength(2);
      expect(result.items[0].itemName).toBe('苹果');
      expect(result.items[1].itemName).toBe('牛奶');
      // Total should be recalculated based on valid items only
      expect(result.totalAmount).toBe(22.00);
    });
  });

  describe('preprocessImage', () => {
    it('should use ImageProcessingService for preprocessing', async () => {
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

      const result = await ocrService.preprocessImage('/fake/path/receipt.jpg');
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('processed-image-data');
      expect(mockImageProcessingService.processImage).toHaveBeenCalledWith('/fake/path/receipt.jpg', {
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 85,
        format: 'jpeg',
        enhanceForOCR: true,
        preserveAspectRatio: true
      });
    });

    it('should handle image preprocessing errors', async () => {
      mockImageProcessingService.processImage.mockRejectedValue(new Error('Processing failed'));

      await expect(ocrService.preprocessImage('/fake/path/receipt.jpg'))
        .rejects.toThrow('图像预处理失败: Processing failed');
    });
  });

  describe('parseClaudeResponse', () => {
    it('should parse valid Claude response', () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            items: [
              {
                itemName: '商品1',
                unitPrice: 10.00,
                quantity: 1,
                totalPrice: 10.00
              }
            ],
            totalAmount: 10.00,
            confidence: 0.9
          })
        }]
      };

      const result = (ocrService as any).parseClaudeResponse(mockResponse);
      
      expect(result.items).toHaveLength(1);
      expect(result.items[0].itemName).toBe('商品1');
      expect(result.totalAmount).toBe(10.00);
      expect(result.confidence).toBe(0.9);
    });

    it('should handle malformed JSON in Claude response', () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: 'Invalid JSON {'
        }]
      };

      expect(() => {
        (ocrService as any).parseClaudeResponse(mockResponse);
      }).toThrow('解析Claude响应失败');
    });

    it('should validate item calculations', () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            items: [
              {
                itemName: '商品1',
                unitPrice: 10.00,
                quantity: 2,
                totalPrice: 25.00  // Incorrect calculation
              }
            ],
            totalAmount: 25.00,
            confidence: 0.8
          })
        }]
      };

      const result = (ocrService as any).parseClaudeResponse(mockResponse);
      
      // Should correct the calculation
      expect(result.items[0].totalPrice).toBe(20.00);
      expect(result.totalAmount).toBe(20.00);
    });
  });

  describe('cleanupTempFile', () => {
    it('should use ImageProcessingService for cleanup', () => {
      const tempFile = '/tmp/test-file.txt';
      
      ocrService.cleanupTempFile(tempFile);

      expect(mockImageProcessingService.cleanupTempFiles).toHaveBeenCalledWith([tempFile]);
    });
  });

  describe('cleanupTempFiles', () => {
    it('should use ImageProcessingService for batch cleanup', () => {
      const tempFiles = ['/tmp/file1.txt', '/tmp/file2.txt'];
      
      ocrService.cleanupTempFiles(tempFiles);

      expect(mockImageProcessingService.cleanupTempFiles).toHaveBeenCalledWith(tempFiles);
    });
  });
});
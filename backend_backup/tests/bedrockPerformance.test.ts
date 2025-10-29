import { BedrockClientUtil } from '../src/utils/bedrockClient';
import { OCRService } from '../src/services/ocrService';

// Mock AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  InvokeModelCommand: jest.fn()
}));

// Mock other services with minimal setup for performance testing
jest.mock('../src/services/errorHandlingService', () => ({
  ErrorHandlingService: {
    getInstance: jest.fn(() => ({
      analyzeError: jest.fn(() => ({ type: 'UNKNOWN', message: 'Test error' })),
      logError: jest.fn(),
      logMetrics: jest.fn(),
      getUserFriendlyMessage: jest.fn((error) => error.message || 'Test error'),
      getDefaultRetryConfig: jest.fn(() => ({
        maxRetries: 3,
        baseDelay: 100, // Faster for testing
        maxDelay: 1000,
        backoffMultiplier: 2
      })),
      isRetryableError: jest.fn(() => true),
      calculateRetryDelay: jest.fn((attempt) => attempt * 100)
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
        buffer: Buffer.from('fast-processed-data'),
        metadata: {
          originalSize: 500000,
          processedSize: 300000,
          compressionRatio: 1.67,
          format: 'jpeg',
          width: 1024,
          height: 768,
          processingTime: 50
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

describe('Bedrock Claude Performance Tests', () => {
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

  describe('响应时间性能测试', () => {
    it('should complete API calls within acceptable latency', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '性能测试商品', unitPrice: 10.0, quantity: 1, totalPrice: 10.0 }],
              totalAmount: 10.0,
              confidence: 0.85
            })
          }]
        }))
      };

      // Simulate realistic API latency
      mockBedrockRuntimeClient.send.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockResponse), 800))
      );

      const measurements = [];
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await bedrockClient.invokeModel('性能测试提示词');
        const endTime = Date.now();
        measurements.push(endTime - startTime);
      }

      const averageLatency = measurements.reduce((sum, time) => sum + time, 0) / measurements.length;
      const maxLatency = Math.max(...measurements);
      const minLatency = Math.min(...measurements);

      console.log(`性能测试结果:
        平均延迟: ${averageLatency.toFixed(2)}ms
        最大延迟: ${maxLatency}ms
        最小延迟: ${minLatency}ms
        测试次数: ${iterations}`);

      expect(averageLatency).toBeLessThan(2000); // Average should be under 2 seconds
      expect(maxLatency).toBeLessThan(5000); // Max should be under 5 seconds
      expect(measurements.every(time => time > 0)).toBe(true);
    });

    it('should handle varying response sizes efficiently', async () => {
      const testCases = [
        {
          name: '小型响应',
          items: [{ itemName: '单品', unitPrice: 5.0, quantity: 1, totalPrice: 5.0 }]
        },
        {
          name: '中型响应',
          items: Array.from({ length: 10 }, (_, i) => ({
            itemName: `商品${i + 1}`,
            unitPrice: (i + 1) * 2.5,
            quantity: 1,
            totalPrice: (i + 1) * 2.5
          }))
        },
        {
          name: '大型响应',
          items: Array.from({ length: 50 }, (_, i) => ({
            itemName: `大量商品${i + 1}`,
            unitPrice: Math.random() * 20 + 1,
            quantity: Math.floor(Math.random() * 5) + 1,
            totalPrice: (Math.random() * 20 + 1) * (Math.floor(Math.random() * 5) + 1)
          }))
        }
      ];

      const results = [];

      for (const testCase of testCases) {
        const mockResponse = {
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              type: 'text',
              text: JSON.stringify({
                items: testCase.items,
                totalAmount: testCase.items.reduce((sum, item) => sum + item.totalPrice, 0),
                confidence: 0.85
              })
            }]
          }))
        };

        mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

        const startTime = Date.now();
        const result = await ocrService.recognizeReceipt(`/test/${testCase.name}.jpg`);
        const endTime = Date.now();

        const processingTime = endTime - startTime;
        results.push({
          name: testCase.name,
          itemCount: testCase.items.length,
          processingTime,
          itemsPerSecond: testCase.items.length / (processingTime / 1000)
        });

        expect(result.items.length).toBeGreaterThan(0); // At least some items should be recognized
        // Note: The actual count might differ due to validation and filtering
      }

      console.log('响应大小性能测试结果:');
      results.forEach(result => {
        console.log(`${result.name}: ${result.itemCount}项, ${result.processingTime}ms, ${result.itemsPerSecond.toFixed(2)}项/秒`);
      });

      // All processing should complete within reasonable time regardless of size
      expect(results.every(result => result.processingTime < 10000)).toBe(true);
    });
  });

  describe('并发负载测试', () => {
    it('should handle concurrent requests without degradation', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '并发商品', unitPrice: 8.0, quantity: 1, totalPrice: 8.0 }],
              totalAmount: 8.0,
              confidence: 0.82
            })
          }]
        }))
      };

      // Simulate realistic API response time with some variance
      mockBedrockRuntimeClient.send.mockImplementation(() => 
        new Promise(resolve => {
          const delay = 500 + Math.random() * 1000; // 500-1500ms
          setTimeout(() => resolve(mockResponse), delay);
        })
      );

      const concurrencyLevels = [1, 5, 10, 20];
      const results = [];

      for (const concurrency of concurrencyLevels) {
        const startTime = Date.now();
        
        const promises = Array.from({ length: concurrency }, (_, i) => 
          ocrService.recognizeReceipt(`/test/concurrent-${i}.jpg`)
        );

        const responses = await Promise.all(promises);
        const endTime = Date.now();

        const totalTime = endTime - startTime;
        const averageTimePerRequest = totalTime / concurrency;
        const throughput = concurrency / (totalTime / 1000);

        results.push({
          concurrency,
          totalTime,
          averageTimePerRequest,
          throughput,
          successCount: responses.length
        });

        expect(responses).toHaveLength(concurrency);
        expect(responses.every(response => response.items.length > 0)).toBe(true);
      }

      console.log('并发负载测试结果:');
      results.forEach(result => {
        console.log(`并发数: ${result.concurrency}, 总时间: ${result.totalTime}ms, 平均时间: ${result.averageTimePerRequest.toFixed(2)}ms, 吞吐量: ${result.throughput.toFixed(2)}请求/秒`);
      });

      // Verify that higher concurrency doesn't cause excessive degradation
      const baselineTime = results[0].averageTimePerRequest;
      const highConcurrencyTime = results[results.length - 1].averageTimePerRequest;
      const degradationRatio = highConcurrencyTime / baselineTime;

      expect(degradationRatio).toBeLessThan(3); // Should not degrade more than 3x
    });

    it('should maintain stability under sustained load', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '持续负载商品', unitPrice: 12.0, quantity: 1, totalPrice: 12.0 }],
              totalAmount: 12.0,
              confidence: 0.88
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockResponse), 50)) // Faster for testing
      );

      const duration = 2000; // 2 seconds for testing
      const requestInterval = 100; // Request every 100ms
      const startTime = Date.now();
      const results = [];
      let requestCount = 0;

      while (Date.now() - startTime < duration && requestCount < 10) { // Limit requests
        const requestStartTime = Date.now();
        
        try {
          const result = await ocrService.recognizeReceipt(`/test/sustained-${requestCount}.jpg`);
          const requestEndTime = Date.now();
          
          results.push({
            requestId: requestCount,
            responseTime: requestEndTime - requestStartTime,
            success: true,
            itemCount: result.items.length
          });
        } catch (error) {
          results.push({
            requestId: requestCount,
            responseTime: Date.now() - requestStartTime,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        requestCount++;
        
        // Wait for next interval
        const nextRequestTime = startTime + (requestCount * requestInterval);
        const waitTime = nextRequestTime - Date.now();
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      const successfulRequests = results.filter(r => r.success);
      const failedRequests = results.filter(r => !r.success);
      const averageResponseTime = successfulRequests.reduce((sum, r) => sum + r.responseTime, 0) / successfulRequests.length;
      const successRate = (successfulRequests.length / results.length) * 100;

      console.log(`持续负载测试结果:
        总请求数: ${results.length}
        成功请求: ${successfulRequests.length}
        失败请求: ${failedRequests.length}
        成功率: ${successRate.toFixed(2)}%
        平均响应时间: ${averageResponseTime.toFixed(2)}ms`);

      expect(successRate).toBeGreaterThan(95); // At least 95% success rate
      expect(averageResponseTime).toBeLessThan(3000); // Average response time under 3 seconds
    }, 15000); // Increase timeout
  });

  describe('内存和资源使用测试', () => {
    it('should not cause memory leaks during repeated operations', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '内存测试商品', unitPrice: 15.0, quantity: 1, totalPrice: 15.0 }],
              totalAmount: 15.0,
              confidence: 0.9
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const initialMemory = process.memoryUsage();
      const iterations = 20; // Reduced for testing

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      for (let i = 0; i < iterations; i++) {
        await ocrService.recognizeReceipt(`/test/memory-test-${i}.jpg`);
        
        // Periodically check memory usage
        if (i % 5 === 0) {
          const currentMemory = process.memoryUsage();
          const heapIncrease = currentMemory.heapUsed - initialMemory.heapUsed;
          
          // Memory increase should be reasonable
          expect(heapIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
        }
      }

      // Force garbage collection again
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const totalHeapIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`内存使用测试结果:
        初始堆内存: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
        最终堆内存: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
        内存增长: ${(totalHeapIncrease / 1024 / 1024).toFixed(2)}MB
        迭代次数: ${iterations}`);

      // Total memory increase should be reasonable after GC
      expect(totalHeapIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB total increase
    }, 15000); // Increase timeout

    it('should handle large batch operations efficiently', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: [{ itemName: '批量商品', unitPrice: 6.5, quantity: 1, totalPrice: 6.5 }],
              totalAmount: 6.5,
              confidence: 0.83
            })
          }]
        }))
      };

      mockBedrockRuntimeClient.send.mockResolvedValue(mockResponse);

      const batchSizes = [5, 10]; // Reduced for testing
      const results = [];

      for (const batchSize of batchSizes) {
        const imagePaths = Array.from({ length: batchSize }, (_, i) => `/test/batch-${i}.jpg`);
        
        const initialMemory = process.memoryUsage();
        const startTime = Date.now();
        
        const batchResult = await ocrService.batchRecognizeReceipts(imagePaths);
        
        const endTime = Date.now();
        const finalMemory = process.memoryUsage();
        
        const processingTime = endTime - startTime;
        const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
        const throughput = batchSize / (processingTime / 1000);

        results.push({
          batchSize,
          processingTime,
          memoryIncrease,
          throughput,
          successRate: (batchResult.summary.successful / batchResult.summary.total) * 100
        });

        expect(batchResult.summary.successful).toBe(batchSize);
        expect(batchResult.summary.failed).toBe(0);
      }

      console.log('批量操作性能测试结果:');
      results.forEach(result => {
        console.log(`批量大小: ${result.batchSize}, 处理时间: ${result.processingTime}ms, 内存增长: ${(result.memoryIncrease / 1024 / 1024).toFixed(2)}MB, 吞吐量: ${result.throughput.toFixed(2)}项/秒`);
      });

      // Verify linear scaling characteristics
      const smallBatch = results[0];
      const largeBatch = results[results.length - 1];
      const scalingRatio = largeBatch.batchSize / smallBatch.batchSize;
      const timeScalingRatio = largeBatch.processingTime / smallBatch.processingTime;

      // Processing time should scale reasonably (not exponentially)
      expect(timeScalingRatio).toBeLessThan(scalingRatio * 2);
    }, 15000); // Increase timeout
  });

  describe('错误恢复性能测试', () => {
    it('should recover quickly from transient failures', async () => {
      let callCount = 0;
      const failureRate = 0.3; // 30% failure rate

      mockBedrockRuntimeClient.send.mockImplementation(() => {
        callCount++;
        
        if (Math.random() < failureRate) {
          return Promise.reject(new Error('Transient failure'));
        }
        
        return Promise.resolve({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              type: 'text',
              text: JSON.stringify({
                items: [{ itemName: '恢复测试商品', unitPrice: 9.0, quantity: 1, totalPrice: 9.0 }],
                totalAmount: 9.0,
                confidence: 0.86
              })
            }]
          }))
        });
      });

      const attempts = 10; // Reduced for testing
      const results = [];

      for (let i = 0; i < attempts; i++) {
        const startTime = Date.now();
        
        try {
          const result = await ocrService.recognizeReceipt(`/test/recovery-${i}.jpg`);
          const endTime = Date.now();
          
          results.push({
            attempt: i,
            success: true,
            responseTime: endTime - startTime,
            itemCount: result.items.length
          });
        } catch (error) {
          const endTime = Date.now();
          
          results.push({
            attempt: i,
            success: false,
            responseTime: endTime - startTime,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const successfulAttempts = results.filter(r => r.success);
      const failedAttempts = results.filter(r => !r.success);
      const actualSuccessRate = (successfulAttempts.length / results.length) * 100;
      const averageRecoveryTime = successfulAttempts.length > 0 ? 
        successfulAttempts.reduce((sum, r) => sum + r.responseTime, 0) / successfulAttempts.length : 0;

      console.log(`错误恢复测试结果:
        总尝试次数: ${attempts}
        成功次数: ${successfulAttempts.length}
        失败次数: ${failedAttempts.length}
        实际成功率: ${actualSuccessRate.toFixed(2)}%
        平均恢复时间: ${averageRecoveryTime.toFixed(2)}ms`);

      // Should achieve reasonable success rate despite transient failures
      expect(actualSuccessRate).toBeGreaterThan(60); // Should be better than random due to retries
      if (successfulAttempts.length > 0) {
        expect(averageRecoveryTime).toBeLessThan(5000); // Recovery should be reasonably fast
      }
    }, 15000); // Increase timeout
  });
});
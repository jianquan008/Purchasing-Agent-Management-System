import { ErrorHandlingService, ErrorType, ErrorSeverity, CircuitBreakerState } from '../src/services/errorHandlingService';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ErrorHandlingService', () => {
  let errorHandler: ErrorHandlingService;
  const mockLogDir = './test-logs';

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock fs methods
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation();
    mockFs.appendFileSync.mockImplementation();
    mockFs.readdirSync.mockReturnValue([]);
    
    // Get fresh instance
    errorHandler = ErrorHandlingService.getInstance();
    
    // Reset circuit breakers
    errorHandler.resetAllCircuitBreakers();
  });

  describe('Error Analysis', () => {
    it('should correctly analyze network errors', () => {
      const networkError = new Error('ECONNREFUSED connection failed');
      const errorInfo = errorHandler.analyzeError(networkError);

      expect(errorInfo.type).toBe(ErrorType.NETWORK_ERROR);
      expect(errorInfo.severity).toBe(ErrorSeverity.HIGH);
      expect(errorInfo.retryable).toBe(true);
    });

    it('should correctly analyze timeout errors', () => {
      const timeoutError = new Error('Request timeout after 30000ms');
      const errorInfo = errorHandler.analyzeError(timeoutError);

      expect(errorInfo.type).toBe(ErrorType.API_TIMEOUT);
      expect(errorInfo.severity).toBe(ErrorSeverity.MEDIUM);
      expect(errorInfo.retryable).toBe(true);
    });

    it('should correctly analyze rate limit errors', () => {
      const rateLimitError = new Error('Rate limit exceeded, please try again later');
      const errorInfo = errorHandler.analyzeError(rateLimitError);

      expect(errorInfo.type).toBe(ErrorType.API_RATE_LIMIT);
      expect(errorInfo.severity).toBe(ErrorSeverity.MEDIUM);
      expect(errorInfo.retryable).toBe(true);
    });

    it('should correctly analyze authentication errors', () => {
      const authError = new Error('Unauthorized access - 401');
      const errorInfo = errorHandler.analyzeError(authError);

      expect(errorInfo.type).toBe(ErrorType.AUTHENTICATION_ERROR);
      expect(errorInfo.severity).toBe(ErrorSeverity.HIGH);
      expect(errorInfo.retryable).toBe(false);
    });
  });

  describe('Retry Configuration', () => {
    it('should provide default retry configuration', () => {
      const config = errorHandler.getDefaultRetryConfig();

      expect(config.maxRetries).toBe(3);
      expect(config.baseDelay).toBe(1000);
      expect(config.maxDelay).toBe(30000);
      expect(config.backoffMultiplier).toBe(2);
      expect(config.jitterEnabled).toBe(true);
      expect(config.timeoutMs).toBe(60000);
    });

    it('should calculate retry delay with exponential backoff', () => {
      const config = errorHandler.getDefaultRetryConfig();
      
      const delay1 = errorHandler.calculateRetryDelay(1, { ...config, jitterEnabled: false });
      const delay2 = errorHandler.calculateRetryDelay(2, { ...config, jitterEnabled: false });
      const delay3 = errorHandler.calculateRetryDelay(3, { ...config, jitterEnabled: false });

      expect(delay1).toBe(1000);
      expect(delay2).toBe(2000);
      expect(delay3).toBe(4000);
    });

    it('should apply jitter when enabled', () => {
      const config = errorHandler.getDefaultRetryConfig();
      
      const delay1 = errorHandler.calculateRetryDelay(1, config);
      const delay2 = errorHandler.calculateRetryDelay(1, config);

      // With jitter, delays should be different
      expect(delay1).not.toBe(delay2);
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(1300); // 30% jitter
    });

    it('should respect maximum delay', () => {
      const config = { ...errorHandler.getDefaultRetryConfig(), jitterEnabled: false };
      
      const delay = errorHandler.calculateRetryDelay(10, config);
      expect(delay).toBe(config.maxDelay);
    });
  });

  describe('Circuit Breaker', () => {
    const operationName = 'test_operation';

    it('should start in CLOSED state', () => {
      const circuitInfo = errorHandler.getCircuitBreakerInfo(operationName);
      expect(circuitInfo.state).toBe(CircuitBreakerState.CLOSED);
      expect(circuitInfo.failureCount).toBe(0);
    });

    it('should allow execution when circuit is CLOSED', () => {
      expect(errorHandler.canExecute(operationName)).toBe(true);
    });

    it('should record successful operations', () => {
      errorHandler.recordSuccess(operationName);
      
      const circuitInfo = errorHandler.getCircuitBreakerInfo(operationName);
      expect(circuitInfo.successfulRequests).toBe(1);
      expect(circuitInfo.totalRequests).toBe(1);
    });

    it('should record failed operations', () => {
      errorHandler.recordFailure(operationName);
      
      const circuitInfo = errorHandler.getCircuitBreakerInfo(operationName);
      expect(circuitInfo.failureCount).toBe(1);
      expect(circuitInfo.totalRequests).toBe(1);
      expect(circuitInfo.lastFailureTime).toBeDefined();
    });

    it('should trip circuit breaker after threshold failures', () => {
      const config = errorHandler.getDefaultCircuitBreakerConfig();
      
      // Record minimum requests first
      for (let i = 0; i < config.minimumRequests; i++) {
        errorHandler.recordFailure(operationName);
      }
      
      const circuitInfo = errorHandler.getCircuitBreakerInfo(operationName);
      expect(circuitInfo.state).toBe(CircuitBreakerState.OPEN);
      expect(circuitInfo.nextAttemptTime).toBeDefined();
    });

    it('should prevent execution when circuit is OPEN', () => {
      // Trip the circuit breaker
      const config = errorHandler.getDefaultCircuitBreakerConfig();
      for (let i = 0; i < config.minimumRequests; i++) {
        errorHandler.recordFailure(operationName);
      }
      
      expect(errorHandler.canExecute(operationName)).toBe(false);
    });

    it('should reset circuit breaker', () => {
      // Trip the circuit breaker
      const config = errorHandler.getDefaultCircuitBreakerConfig();
      for (let i = 0; i < config.minimumRequests; i++) {
        errorHandler.recordFailure(operationName);
      }
      
      // Reset it
      errorHandler.resetCircuitBreaker(operationName);
      
      const circuitInfo = errorHandler.getCircuitBreakerInfo(operationName);
      expect(circuitInfo.state).toBe(CircuitBreakerState.CLOSED);
      expect(circuitInfo.failureCount).toBe(0);
    });
  });

  describe('Execute with Retry and Circuit Breaker', () => {
    it('should execute operation successfully', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await errorHandler.executeWithRetryAndCircuitBreaker(
        mockOperation,
        'test_operation'
      );
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');
      
      const result = await errorHandler.executeWithRetryAndCircuitBreaker(
        mockOperation,
        'test_operation',
        { maxRetries: 3, baseDelay: 10 }
      );
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValue(new Error('Unauthorized - 401'));
      
      await expect(
        errorHandler.executeWithRetryAndCircuitBreaker(
          mockOperation,
          'test_operation'
        )
      ).rejects.toThrow();
      
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should respect circuit breaker state', async () => {
      const operationName = 'circuit_test';
      
      // Trip the circuit breaker
      const config = errorHandler.getDefaultCircuitBreakerConfig();
      for (let i = 0; i < config.minimumRequests; i++) {
        errorHandler.recordFailure(operationName);
      }
      
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      await expect(
        errorHandler.executeWithRetryAndCircuitBreaker(
          mockOperation,
          operationName
        )
      ).rejects.toThrow('服务熔断中');
      
      expect(mockOperation).not.toHaveBeenCalled();
    });
  });

  describe('User Friendly Messages', () => {
    it('should provide user-friendly error messages', () => {
      const networkError = errorHandler.analyzeError(new Error('ECONNREFUSED'));
      const message = errorHandler.getUserFriendlyMessage(networkError);
      
      expect(message).toBe('网络连接失败，请检查网络连接后重试');
    });

    it('should provide generic message for unknown errors', () => {
      const unknownError = errorHandler.analyzeError(new Error('Some unknown error'));
      const message = errorHandler.getUserFriendlyMessage(unknownError);
      
      expect(message).toBe('系统出现错误，请联系管理员');
    });
  });

  describe('Logging', () => {
    it('should log errors to file', () => {
      const error = new Error('Test error');
      const errorInfo = errorHandler.analyzeError(error);
      
      errorHandler.logError(errorInfo);
      
      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('errors.log'),
        expect.stringContaining('Test error')
      );
    });

    it('should log metrics to file', () => {
      errorHandler.logMetrics('test_operation', 1000, true, { test: 'data' });
      
      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('metrics.log'),
        expect.stringContaining('test_operation')
      );
    });
  });
});
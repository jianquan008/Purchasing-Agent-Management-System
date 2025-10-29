import { ErrorHandlingService, ErrorType, ErrorSeverity } from '../src/services/errorHandlingService';

describe('Error Handling Service', () => {
  let errorHandler: ErrorHandlingService;

  beforeEach(() => {
    errorHandler = ErrorHandlingService.getInstance();
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
      const timeoutError = new Error('Request timeout after 30 seconds');
      const errorInfo = errorHandler.analyzeError(timeoutError);

      expect(errorInfo.type).toBe(ErrorType.API_TIMEOUT);
      expect(errorInfo.severity).toBe(ErrorSeverity.MEDIUM);
      expect(errorInfo.retryable).toBe(true);
    });

    it('should correctly analyze rate limit errors', () => {
      const rateLimitError = new Error('Rate limit exceeded - 429');
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
      expect(config.retryableErrors).toContain(ErrorType.NETWORK_ERROR);
    });

    it('should calculate retry delays correctly', () => {
      const config = { ...errorHandler.getDefaultRetryConfig(), jitterEnabled: false };
      
      const delay1 = errorHandler.calculateRetryDelay(1, config);
      const delay2 = errorHandler.calculateRetryDelay(2, config);
      const delay3 = errorHandler.calculateRetryDelay(3, config);

      expect(delay1).toBe(1000);
      expect(delay2).toBe(2000);
      expect(delay3).toBe(4000);
    });

    it('should respect maximum delay', () => {
      const config = {
        ...errorHandler.getDefaultRetryConfig(),
        maxDelay: 5000,
        jitterEnabled: false
      };
      
      const delay = errorHandler.calculateRetryDelay(10, config);
      expect(delay).toBe(5000);
    });
  });

  describe('Error Retryability', () => {
    it('should identify retryable errors correctly', () => {
      const config = errorHandler.getDefaultRetryConfig();
      
      const networkError = errorHandler.analyzeError(new Error('ECONNREFUSED'));
      const authError = errorHandler.analyzeError(new Error('Unauthorized - 401'));

      expect(errorHandler.isRetryableError(networkError, config)).toBe(true);
      expect(errorHandler.isRetryableError(authError, config)).toBe(false);
    });
  });

  describe('User-Friendly Messages', () => {
    it('should generate appropriate user messages', () => {
      const networkError = errorHandler.analyzeError(new Error('ECONNREFUSED'));
      const message = errorHandler.getUserFriendlyMessage(networkError);

      expect(message).toBe('网络连接失败，请检查网络连接后重试');
    });

    it('should handle unknown errors gracefully', () => {
      const unknownError = errorHandler.analyzeError(new Error('Some random error'));
      const message = errorHandler.getUserFriendlyMessage(unknownError);

      expect(message).toBe('系统出现错误，请联系管理员');
    });
  });
});
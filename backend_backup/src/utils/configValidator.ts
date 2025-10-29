import { AWSConfigManager } from '../config/aws';
import { BedrockClientUtil } from './bedrockClient';

/**
 * 配置验证工具类
 */
export class ConfigValidator {
  private awsConfigManager: AWSConfigManager;
  private bedrockClient: BedrockClientUtil;

  constructor() {
    this.awsConfigManager = AWSConfigManager.getInstance();
    this.bedrockClient = BedrockClientUtil.getInstance();
  }

  /**
   * 验证所有必需的环境变量
   */
  public validateEnvironmentVariables(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const requiredVars = [
      'AWS_REGION',
      'AWS_ACCESS_KEY_ID', 
      'AWS_SECRET_ACCESS_KEY',
      'BEDROCK_MODEL_ID'
    ];

    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        errors.push(`Missing environment variable: ${varName}`);
      }
    }

    // 验证AWS区域格式
    if (process.env.AWS_REGION && !this.isValidAWSRegion(process.env.AWS_REGION)) {
      errors.push(`Invalid AWS region format: ${process.env.AWS_REGION}`);
    }

    // 验证模型ID格式
    if (process.env.BEDROCK_MODEL_ID && !this.isValidModelId(process.env.BEDROCK_MODEL_ID)) {
      errors.push(`Invalid Bedrock model ID format: ${process.env.BEDROCK_MODEL_ID}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证AWS配置
   */
  public async validateAWSConfiguration(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // 验证环境变量
      const envValidation = this.validateEnvironmentVariables();
      if (!envValidation.isValid) {
        errors.push(...envValidation.errors);
        return { isValid: false, errors };
      }

      // 验证AWS配置是否可以正确加载
      const config = this.awsConfigManager.getConfig();
      console.log('AWS配置加载成功:', {
        region: config.region,
        modelId: config.bedrockModelId,
        hasAccessKey: !!config.accessKeyId,
        hasSecretKey: !!config.secretAccessKey
      });

      // 测试Bedrock连接
      console.log('测试Bedrock连接...');
      const connectionTest = await this.bedrockClient.testConnection();
      if (!connectionTest) {
        errors.push('无法连接到AWS Bedrock服务，请检查网络连接和AWS凭据');
      }

    } catch (error) {
      errors.push(`AWS配置验证失败: ${(error as Error).message}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证AWS区域格式
   */
  private isValidAWSRegion(region: string): boolean {
    // AWS区域格式：us-east-1, eu-west-1, ap-southeast-1等
    const regionPattern = /^[a-z]{2}-[a-z]+-\d+$/;
    return regionPattern.test(region);
  }

  /**
   * 验证Bedrock模型ID格式
   */
  private isValidModelId(modelId: string): boolean {
    // Claude模型ID格式：anthropic.claude-3-sonnet-20240229-v1:0
    const claudePattern = /^anthropic\.claude-[0-9]+-[a-z]+-\d{8}-v\d+:\d+$/;
    return claudePattern.test(modelId);
  }

  /**
   * 获取配置摘要（用于调试）
   */
  public getConfigSummary(): object {
    try {
      const config = this.awsConfigManager.getConfig();
      return {
        aws: {
          region: config.region,
          modelId: config.bedrockModelId,
          hasCredentials: !!(config.accessKeyId && config.secretAccessKey)
        },
        environment: {
          nodeEnv: process.env.NODE_ENV || 'development',
          port: process.env.PORT || '3001'
        }
      };
    } catch (error) {
      return {
        error: `配置加载失败: ${(error as Error).message}`
      };
    }
  }
}
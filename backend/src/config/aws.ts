import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

export interface AWSConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bedrockModelId: string;
}

/**
 * AWS配置管理类
 */
export class AWSConfigManager {
  private static instance: AWSConfigManager;
  private config: AWSConfig;
  private bedrockClient: BedrockRuntimeClient | null = null;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): AWSConfigManager {
    if (!AWSConfigManager.instance) {
      AWSConfigManager.instance = new AWSConfigManager();
    }
    return AWSConfigManager.instance;
  }

  /**
   * 从环境变量加载AWS配置
   */
  private loadConfig(): AWSConfig {
    const requiredEnvVars = [
      'AWS_REGION',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'BEDROCK_MODEL_ID'
    ];

    // 检查必需的环境变量
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    return {
      region: process.env.AWS_REGION!,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      bedrockModelId: process.env.BEDROCK_MODEL_ID!
    };
  }

  /**
   * 获取AWS配置
   */
  public getConfig(): AWSConfig {
    return { ...this.config };
  }

  /**
   * 初始化并获取Bedrock客户端
   */
  public getBedrockClient(): BedrockRuntimeClient {
    if (!this.bedrockClient) {
      this.bedrockClient = new BedrockRuntimeClient({
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey
        }
      });
    }
    return this.bedrockClient;
  }

  /**
   * 验证AWS配置是否有效
   */
  public async validateConfig(): Promise<boolean> {
    try {
      const client = this.getBedrockClient();
      // 这里可以添加一个简单的API调用来验证配置
      // 例如列出可用的模型或进行健康检查
      return true;
    } catch (error) {
      console.error('AWS配置验证失败:', error);
      return false;
    }
  }

  /**
   * 重新加载配置（用于配置更新后）
   */
  public reloadConfig(): void {
    this.config = this.loadConfig();
    this.bedrockClient = null; // 重置客户端，下次使用时重新创建
  }
}
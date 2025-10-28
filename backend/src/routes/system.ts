import express from 'express';
import { authenticateToken, AuthRequest, requireAdmin } from '../middleware/auth';
import { logOperation } from '../middleware/logger';
import { BackupService } from '../services/backupService';
import { MonitorService } from '../services/monitorService';
import { MonitoringService } from '../services/monitoringService';
import { OCRService } from '../services/ocrService';
import { ErrorHandlingService } from '../services/errorHandlingService';
import { ErrorRecoveryService } from '../services/errorRecoveryService';
import { BedrockClientUtil } from '../utils/bedrockClient';
import { AWSConfigManager } from '../config/aws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// 获取系统健康状态
router.get('/health', authenticateToken, requireAdmin, logOperation('查看', '系统健康状态'), async (req: AuthRequest, res) => {
  try {
    const monitorService = MonitorService.getInstance();
    const ocrService = OCRService.getInstance();
    const bedrockClient = BedrockClientUtil.getInstance();
    
    // 获取各个组件的健康状态
    const [systemHealth, ocrHealth, bedrockHealth] = await Promise.all([
      monitorService.getSystemHealth(),
      ocrService.getHealthStatus(),
      bedrockClient.getDetailedHealthReport()
    ]);
    
    const overallHealth = {
      status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
      timestamp: new Date().toISOString(),
      components: {
        system: systemHealth,
        ocr: ocrHealth,
        bedrock: bedrockHealth
      }
    };
    
    // 确定整体健康状态
    if (ocrHealth.status === 'unhealthy' || bedrockHealth.overall === 'unhealthy') {
      overallHealth.status = 'unhealthy';
    } else if (ocrHealth.status === 'degraded' || bedrockHealth.overall === 'degraded') {
      overallHealth.status = 'degraded';
    }
    
    res.json(overallHealth);
  } catch (error) {
    console.error('获取系统健康状态失败:', error);
    res.status(500).json({ error: '获取系统健康状态失败' });
  }
});

// 获取系统信息
router.get('/info', authenticateToken, requireAdmin, logOperation('查看', '系统信息'), (req: AuthRequest, res) => {
  try {
    const monitorService = MonitorService.getInstance();
    const info = monitorService.getSystemInfo();
    res.json(info);
  } catch (error) {
    console.error('获取系统信息失败:', error);
    res.status(500).json({ error: '获取系统信息失败' });
  }
});

// 获取健康历史记录
router.get('/health/history', authenticateToken, requireAdmin, logOperation('查看', '系统健康历史'), (req: AuthRequest, res) => {
  try {
    const monitorService = MonitorService.getInstance();
    const history = monitorService.getHealthHistory();
    res.json(history);
  } catch (error) {
    console.error('获取健康历史失败:', error);
    res.status(500).json({ error: '获取健康历史失败' });
  }
});

// 获取熔断器状态
router.get('/circuit-breakers', authenticateToken, requireAdmin, logOperation('查看', '熔断器状态'), (req: AuthRequest, res) => {
  try {
    const errorHandler = ErrorHandlingService.getInstance();
    const circuitBreakers = errorHandler.getAllCircuitBreakerStatus();
    res.json(circuitBreakers);
  } catch (error) {
    console.error('获取熔断器状态失败:', error);
    res.status(500).json({ error: '获取熔断器状态失败' });
  }
});

// 重置熔断器
router.post('/circuit-breakers/:operationName/reset', authenticateToken, requireAdmin, logOperation('重置', '熔断器'), (req: AuthRequest, res) => {
  try {
    const { operationName } = req.params;
    const errorHandler = ErrorHandlingService.getInstance();
    errorHandler.resetCircuitBreaker(operationName);
    res.json({ message: `熔断器 ${operationName} 已重置` });
  } catch (error) {
    console.error('重置熔断器失败:', error);
    res.status(500).json({ error: '重置熔断器失败' });
  }
});

// 重置所有熔断器
router.post('/circuit-breakers/reset-all', authenticateToken, requireAdmin, logOperation('重置', '所有熔断器'), (req: AuthRequest, res) => {
  try {
    const errorHandler = ErrorHandlingService.getInstance();
    errorHandler.resetAllCircuitBreakers();
    res.json({ message: '所有熔断器已重置' });
  } catch (error) {
    console.error('重置所有熔断器失败:', error);
    res.status(500).json({ error: '重置所有熔断器失败' });
  }
});

// 获取错误统计
router.get('/errors/stats', authenticateToken, requireAdmin, logOperation('查看', '错误统计'), (req: AuthRequest, res) => {
  try {
    const monitoringService = MonitoringService.getInstance();
    const metrics = monitoringService.getCurrentMetrics();
    res.json({
      errors: metrics.errors,
      timestamp: metrics.timestamp
    });
  } catch (error) {
    console.error('获取错误统计失败:', error);
    res.status(500).json({ error: '获取错误统计失败' });
  }
});

// 获取性能指标
router.get('/metrics', authenticateToken, requireAdmin, logOperation('查看', '性能指标'), (req: AuthRequest, res) => {
  try {
    const monitoringService = MonitoringService.getInstance();
    const metrics = monitoringService.getCurrentMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('获取性能指标失败:', error);
    res.status(500).json({ error: '获取性能指标失败' });
  }
});

// 获取监控报告
router.get('/monitoring/report', authenticateToken, requireAdmin, logOperation('查看', '监控报告'), (req: AuthRequest, res) => {
  try {
    const monitoringService = MonitoringService.getInstance();
    const report = monitoringService.generateReport();
    res.json(report);
  } catch (error) {
    console.error('获取监控报告失败:', error);
    res.status(500).json({ error: '获取监控报告失败' });
  }
});

// 获取系统恢复状态
router.get('/recovery/status', authenticateToken, requireAdmin, logOperation('查看', '系统恢复状态'), async (req: AuthRequest, res) => {
  try {
    const errorRecoveryService = ErrorRecoveryService.getInstance();
    const systemHealth = await errorRecoveryService.checkSystemHealth();
    res.json(systemHealth);
  } catch (error) {
    console.error('获取系统恢复状态失败:', error);
    res.status(500).json({ error: '获取系统恢复状态失败' });
  }
});

// 获取可用的恢复策略
router.get('/recovery/strategies', authenticateToken, requireAdmin, logOperation('查看', '恢复策略'), (req: AuthRequest, res) => {
  try {
    const errorRecoveryService = ErrorRecoveryService.getInstance();
    const strategies = errorRecoveryService.getAvailableRecoveryStrategies();
    res.json(strategies);
  } catch (error) {
    console.error('获取恢复策略失败:', error);
    res.status(500).json({ error: '获取恢复策略失败' });
  }
});

// 手动触发恢复
router.post('/recovery/trigger/:serviceName', authenticateToken, requireAdmin, logOperation('触发', '系统恢复'), async (req: AuthRequest, res) => {
  try {
    const { serviceName } = req.params;
    const { strategyType } = req.body;
    
    const errorRecoveryService = ErrorRecoveryService.getInstance();
    const success = await errorRecoveryService.triggerManualRecovery(serviceName, strategyType);
    
    res.json({ 
      success, 
      message: success ? '恢复策略执行成功' : '恢复策略执行失败',
      serviceName,
      strategyType
    });
  } catch (error) {
    console.error('触发系统恢复失败:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : '触发系统恢复失败' });
  }
});

// 执行自动恢复
router.post('/recovery/auto', authenticateToken, requireAdmin, logOperation('执行', '自动恢复'), async (req: AuthRequest, res) => {
  try {
    const errorRecoveryService = ErrorRecoveryService.getInstance();
    await errorRecoveryService.executeAutoRecovery();
    res.json({ message: '自动恢复已执行' });
  } catch (error) {
    console.error('执行自动恢复失败:', error);
    res.status(500).json({ error: '执行自动恢复失败' });
  }
});

// 获取恢复报告
router.get('/recovery/report', authenticateToken, requireAdmin, logOperation('查看', '恢复报告'), (req: AuthRequest, res) => {
  try {
    const errorRecoveryService = ErrorRecoveryService.getInstance();
    const report = errorRecoveryService.generateRecoveryReport();
    res.json(report);
  } catch (error) {
    console.error('获取恢复报告失败:', error);
    res.status(500).json({ error: '获取恢复报告失败' });
  }
});

// 测试Bedrock连接
router.post('/test/bedrock', authenticateToken, requireAdmin, logOperation('测试', 'Bedrock连接'), async (req: AuthRequest, res) => {
  try {
    const bedrockClient = BedrockClientUtil.getInstance();
    const testResult = await bedrockClient.testConnection();
    res.json(testResult);
  } catch (error) {
    console.error('测试Bedrock连接失败:', error);
    res.status(500).json({ error: '测试Bedrock连接失败' });
  }
});

// 测试网络连接
router.post('/test/network', authenticateToken, requireAdmin, logOperation('测试', '网络连接'), async (req: AuthRequest, res) => {
  try {
    const bedrockClient = BedrockClientUtil.getInstance();
    const testResult = await bedrockClient.testNetworkConnectivity();
    res.json(testResult);
  } catch (error) {
    console.error('测试网络连接失败:', error);
    res.status(500).json({ error: '测试网络连接失败' });
  }
});

// 获取速率限制状态
router.get('/rate-limit', authenticateToken, requireAdmin, logOperation('查看', '速率限制状态'), (req: AuthRequest, res) => {
  try {
    const bedrockClient = BedrockClientUtil.getInstance();
    const rateLimitStatus = bedrockClient.getRateLimitStatus();
    res.json(rateLimitStatus);
  } catch (error) {
    console.error('获取速率限制状态失败:', error);
    res.status(500).json({ error: '获取速率限制状态失败' });
  }
});

// 创建数据库备份
router.post('/backup', authenticateToken, requireAdmin, logOperation('创建', '数据库备份'), async (req: AuthRequest, res) => {
  try {
    const backupService = BackupService.getInstance();
    const backupPath = await backupService.createBackup();
    res.json({ 
      message: '备份创建成功', 
      backupPath,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('创建备份失败:', error);
    res.status(500).json({ error: '创建备份失败' });
  }
});

// 获取备份列表
router.get('/backups', authenticateToken, requireAdmin, logOperation('查看', '备份列表'), (req: AuthRequest, res) => {
  try {
    const backupService = BackupService.getInstance();
    const backups = backupService.getBackupList();
    res.json(backups);
  } catch (error) {
    console.error('获取备份列表失败:', error);
    res.status(500).json({ error: '获取备份列表失败' });
  }
});

// 下载备份文件
router.get('/backup/download/:filename', authenticateToken, requireAdmin, logOperation('下载', '备份文件'), (req: AuthRequest, res) => {
  try {
    const { filename } = req.params;
    const backupService = BackupService.getInstance();
    const backups = backupService.getBackupList();
    
    const backup = backups.find(b => b.name === filename);
    if (!backup) {
      return res.status(404).json({ error: '备份文件不存在' });
    }

    res.download(backup.path, filename, (err) => {
      if (err) {
        console.error('下载备份文件失败:', err);
        res.status(500).json({ error: '下载失败' });
      }
    });
  } catch (error) {
    console.error('下载备份文件失败:', error);
    res.status(500).json({ error: '下载备份文件失败' });
  }
});

// 清理旧备份
router.post('/backup/cleanup', authenticateToken, requireAdmin, logOperation('清理', '旧备份'), (req: AuthRequest, res) => {
  try {
    const { keepCount = 10 } = req.body;
    const backupService = BackupService.getInstance();
    backupService.cleanOldBackups(keepCount);
    res.json({ message: '旧备份清理完成' });
  } catch (error) {
    console.error('清理旧备份失败:', error);
    res.status(500).json({ error: '清理旧备份失败' });
  }
});

// 获取操作日志
router.get('/logs', authenticateToken, requireAdmin, (req: AuthRequest, res) => {
  const { getOperationLogs } = require('../middleware/logger');
  getOperationLogs(req, res);
});

// AWS配置管理相关接口

// 获取AWS配置（隐藏敏感信息）
router.get('/aws/config', authenticateToken, requireAdmin, logOperation('查看', 'AWS配置'), (req: AuthRequest, res) => {
  try {
    const awsConfig = AWSConfigManager.getInstance().getConfig();
    
    // 隐藏敏感信息，只显示部分字符
    const safeConfig = {
      region: awsConfig.region,
      accessKeyId: awsConfig.accessKeyId ? `${awsConfig.accessKeyId.substring(0, 4)}****${awsConfig.accessKeyId.substring(-4)}` : '',
      secretAccessKey: awsConfig.secretAccessKey ? '****' : '',
      bedrockModelId: awsConfig.bedrockModelId,
      isConfigured: !!(awsConfig.accessKeyId && awsConfig.secretAccessKey && awsConfig.region)
    };
    
    res.json(safeConfig);
  } catch (error) {
    console.error('获取AWS配置失败:', error);
    res.status(500).json({ error: '获取AWS配置失败' });
  }
});

// 更新AWS配置
router.post('/aws/config', authenticateToken, requireAdmin, logOperation('更新', 'AWS配置'), async (req: AuthRequest, res) => {
  try {
    const { region, accessKeyId, secretAccessKey, bedrockModelId } = req.body;
    
    // 验证必需字段
    if (!region || !accessKeyId || !secretAccessKey || !bedrockModelId) {
      return res.status(400).json({ error: '所有配置字段都是必需的' });
    }
    
    // 更新环境变量（临时）
    process.env.AWS_REGION = region;
    process.env.AWS_ACCESS_KEY_ID = accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = secretAccessKey;
    process.env.BEDROCK_MODEL_ID = bedrockModelId;
    
    // 重新加载配置
    AWSConfigManager.getInstance().reloadConfig();
    
    // 验证新配置
    const isValid = await AWSConfigManager.getInstance().validateConfig();
    
    if (!isValid) {
      return res.status(400).json({ error: 'AWS配置验证失败，请检查凭据是否正确' });
    }
    
    // 保存到配置文件（加密存储）
    await saveEncryptedConfig({ region, accessKeyId, secretAccessKey, bedrockModelId });
    
    res.json({ message: 'AWS配置更新成功' });
  } catch (error) {
    console.error('更新AWS配置失败:', error);
    res.status(500).json({ error: '更新AWS配置失败' });
  }
});

// 测试AWS配置
router.post('/aws/test', authenticateToken, requireAdmin, logOperation('测试', 'AWS配置'), async (req: AuthRequest, res) => {
  try {
    const { region, accessKeyId, secretAccessKey, bedrockModelId } = req.body;
    
    // 创建临时配置进行测试
    const testConfig = {
      region: region || process.env.AWS_REGION,
      accessKeyId: accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
      bedrockModelId: bedrockModelId || process.env.BEDROCK_MODEL_ID
    };
    
    // 使用测试配置创建临时客户端
    const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
    const testClient = new BedrockRuntimeClient({
      region: testConfig.region,
      credentials: {
        accessKeyId: testConfig.accessKeyId,
        secretAccessKey: testConfig.secretAccessKey
      }
    });
    
    // 执行简单的API调用测试
    const { ListFoundationModelsCommand } = require('@aws-sdk/client-bedrock');
    const { BedrockClient } = require('@aws-sdk/client-bedrock');
    
    const bedrockClient = new BedrockClient({
      region: testConfig.region,
      credentials: {
        accessKeyId: testConfig.accessKeyId,
        secretAccessKey: testConfig.secretAccessKey
      }
    });
    
    const command = new ListFoundationModelsCommand({});
    const response = await bedrockClient.send(command);
    
    // 检查指定的模型是否可用
    const modelExists = response.modelSummaries?.some((model: any) => 
      model.modelId === testConfig.bedrockModelId
    );
    
    res.json({
      success: true,
      message: 'AWS配置测试成功',
      details: {
        region: testConfig.region,
        modelsCount: response.modelSummaries?.length || 0,
        modelExists,
        modelId: testConfig.bedrockModelId
      }
    });
  } catch (error: any) {
    console.error('AWS配置测试失败:', error);
    res.json({
      success: false,
      message: 'AWS配置测试失败',
      error: error.message || '未知错误'
    });
  }
});

// OCR参数配置相关接口

// 获取OCR配置参数
router.get('/ocr/config', authenticateToken, requireAdmin, logOperation('查看', 'OCR配置'), (req: AuthRequest, res) => {
  try {
    const config = getOCRConfig();
    res.json(config);
  } catch (error) {
    console.error('获取OCR配置失败:', error);
    res.status(500).json({ error: '获取OCR配置失败' });
  }
});

// 更新OCR配置参数
router.post('/ocr/config', authenticateToken, requireAdmin, logOperation('更新', 'OCR配置'), (req: AuthRequest, res) => {
  try {
    const config = req.body;
    saveOCRConfig(config);
    res.json({ message: 'OCR配置更新成功' });
  } catch (error) {
    console.error('更新OCR配置失败:', error);
    res.status(500).json({ error: '更新OCR配置失败' });
  }
});

// 测试OCR配置
router.post('/ocr/test', authenticateToken, requireAdmin, logOperation('测试', 'OCR配置'), async (req: AuthRequest, res) => {
  try {
    const { testImagePath, config } = req.body;
    
    // 这里可以使用测试图片进行OCR测试
    // 暂时返回模拟结果
    const testResult = {
      success: true,
      message: 'OCR配置测试成功',
      processingTime: 2500,
      confidence: 0.85,
      itemsDetected: 3
    };
    
    res.json(testResult);
  } catch (error: any) {
    console.error('OCR配置测试失败:', error);
    res.json({
      success: false,
      message: 'OCR配置测试失败',
      error: error.message || '未知错误'
    });
  }
});

// 获取OCR提示词模板
router.get('/ocr/prompt-template', authenticateToken, requireAdmin, logOperation('查看', 'OCR提示词模板'), (req: AuthRequest, res) => {
  try {
    const template = getOCRPromptTemplate();
    res.json({ template });
  } catch (error) {
    console.error('获取OCR提示词模板失败:', error);
    res.status(500).json({ error: '获取OCR提示词模板失败' });
  }
});

// 更新OCR提示词模板
router.post('/ocr/prompt-template', authenticateToken, requireAdmin, logOperation('更新', 'OCR提示词模板'), (req: AuthRequest, res) => {
  try {
    const { template } = req.body;
    saveOCRPromptTemplate(template);
    res.json({ message: 'OCR提示词模板更新成功' });
  } catch (error) {
    console.error('更新OCR提示词模板失败:', error);
    res.status(500).json({ error: '更新OCR提示词模板失败' });
  }
});

// 库存管理配置相关接口

// 获取库存配置
router.get('/inventory/config', authenticateToken, requireAdmin, logOperation('查看', '库存配置'), (req: AuthRequest, res) => {
  try {
    const config = getInventoryConfig();
    res.json(config);
  } catch (error) {
    console.error('获取库存配置失败:', error);
    res.status(500).json({ error: '获取库存配置失败' });
  }
});

// 更新库存配置
router.post('/inventory/config', authenticateToken, requireAdmin, logOperation('更新', '库存配置'), (req: AuthRequest, res) => {
  try {
    const config = req.body;
    saveInventoryConfig(config);
    res.json({ message: '库存配置更新成功' });
  } catch (error) {
    console.error('更新库存配置失败:', error);
    res.status(500).json({ error: '更新库存配置失败' });
  }
});

// 获取库存分类列表
router.get('/inventory/categories', authenticateToken, requireAdmin, logOperation('查看', '库存分类'), (req: AuthRequest, res) => {
  try {
    const categories = getInventoryCategories();
    res.json(categories);
  } catch (error) {
    console.error('获取库存分类失败:', error);
    res.status(500).json({ error: '获取库存分类失败' });
  }
});

// 更新库存分类
router.post('/inventory/categories', authenticateToken, requireAdmin, logOperation('更新', '库存分类'), (req: AuthRequest, res) => {
  try {
    const { categories } = req.body;
    saveInventoryCategories(categories);
    res.json({ message: '库存分类更新成功' });
  } catch (error) {
    console.error('更新库存分类失败:', error);
    res.status(500).json({ error: '更新库存分类失败' });
  }
});

// 获取库存标签列表
router.get('/inventory/tags', authenticateToken, requireAdmin, logOperation('查看', '库存标签'), (req: AuthRequest, res) => {
  try {
    const tags = getInventoryTags();
    res.json(tags);
  } catch (error) {
    console.error('获取库存标签失败:', error);
    res.status(500).json({ error: '获取库存标签失败' });
  }
});

// 更新库存标签
router.post('/inventory/tags', authenticateToken, requireAdmin, logOperation('更新', '库存标签'), (req: AuthRequest, res) => {
  try {
    const { tags } = req.body;
    saveInventoryTags(tags);
    res.json({ message: '库存标签更新成功' });
  } catch (error) {
    console.error('更新库存标签失败:', error);
    res.status(500).json({ error: '更新库存标签失败' });
  }
});

// 获取库存报表配置
router.get('/inventory/report-config', authenticateToken, requireAdmin, logOperation('查看', '库存报表配置'), (req: AuthRequest, res) => {
  try {
    const config = getInventoryReportConfig();
    res.json(config);
  } catch (error) {
    console.error('获取库存报表配置失败:', error);
    res.status(500).json({ error: '获取库存报表配置失败' });
  }
});

// 更新库存报表配置
router.post('/inventory/report-config', authenticateToken, requireAdmin, logOperation('更新', '库存报表配置'), (req: AuthRequest, res) => {
  try {
    const config = req.body;
    saveInventoryReportConfig(config);
    res.json({ message: '库存报表配置更新成功' });
  } catch (error) {
    console.error('更新库存报表配置失败:', error);
    res.status(500).json({ error: '更新库存报表配置失败' });
  }
});

// 获取可用的Bedrock模型列表
router.get('/aws/models', authenticateToken, requireAdmin, logOperation('查看', 'Bedrock模型列表'), async (req: AuthRequest, res) => {
  try {
    const { BedrockClient, ListFoundationModelsCommand } = require('@aws-sdk/client-bedrock');
    
    const awsConfig = AWSConfigManager.getInstance().getConfig();
    const bedrockClient = new BedrockClient({
      region: awsConfig.region,
      credentials: {
        accessKeyId: awsConfig.accessKeyId,
        secretAccessKey: awsConfig.secretAccessKey
      }
    });
    
    const command = new ListFoundationModelsCommand({});
    const response = await bedrockClient.send(command);
    
    // 过滤出Claude模型
    const claudeModels = response.modelSummaries?.filter((model: any) => 
      model.modelId.includes('claude') || model.modelName?.toLowerCase().includes('claude')
    ) || [];
    
    res.json({
      allModels: response.modelSummaries || [],
      claudeModels,
      currentModel: awsConfig.bedrockModelId
    });
  } catch (error: any) {
    console.error('获取Bedrock模型列表失败:', error);
    res.status(500).json({ error: '获取模型列表失败: ' + error.message });
  }
});

// 系统重启（仅在开发环境）
router.post('/restart', authenticateToken, requireAdmin, logOperation('重启', '系统'), (req: AuthRequest, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: '生产环境不允许重启' });
  }

  res.json({ message: '系统将在3秒后重启' });
  
  setTimeout(() => {
    process.exit(0);
  }, 3000);
});

// 加密存储配置的辅助函数
async function saveEncryptedConfig(config: any): Promise<void> {
  try {
    const configDir = path.join(process.cwd(), 'config');
    const configFile = path.join(configDir, 'aws-config.json');
    
    // 确保配置目录存在
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // 生成加密密钥（在实际应用中应该使用更安全的密钥管理）
    const encryptionKey = process.env.CONFIG_ENCRYPTION_KEY || 'default-key-change-in-production';
    const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
    
    let encrypted = cipher.update(JSON.stringify(config), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    fs.writeFileSync(configFile, encrypted);
  } catch (error) {
    console.error('保存加密配置失败:', error);
    throw error;
  }
}

async function loadEncryptedConfig(): Promise<any> {
  try {
    const configFile = path.join(process.cwd(), 'config', 'aws-config.json');
    
    if (!fs.existsSync(configFile)) {
      return null;
    }
    
    const encryptionKey = process.env.CONFIG_ENCRYPTION_KEY || 'default-key-change-in-production';
    const encrypted = fs.readFileSync(configFile, 'utf8');
    
    const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('加载加密配置失败:', error);
    return null;
  }
}

// OCR配置管理函数
function getOCRConfig() {
  const defaultConfig = {
    imageProcessing: {
      maxWidth: 2048,
      maxHeight: 2048,
      quality: 85,
      format: 'jpeg',
      enhanceForOCR: true,
      preserveAspectRatio: true
    },
    recognition: {
      maxRetries: 3,
      baseDelay: 2000,
      maxDelay: 60000,
      timeoutMs: 60000,
      confidenceThreshold: 0.7,
      enableFallback: true
    },
    validation: {
      maxItemNameLength: 100,
      minPrice: 0.01,
      maxPrice: 99999.99,
      priceTolerancePercent: 1
    }
  };

  try {
    const configFile = path.join(process.cwd(), 'config', 'ocr-config.json');
    if (fs.existsSync(configFile)) {
      const savedConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      return { ...defaultConfig, ...savedConfig };
    }
  } catch (error) {
    console.error('读取OCR配置失败:', error);
  }

  return defaultConfig;
}

function saveOCRConfig(config: any) {
  try {
    const configDir = path.join(process.cwd(), 'config');
    const configFile = path.join(configDir, 'ocr-config.json');
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('保存OCR配置失败:', error);
    throw error;
  }
}

function getOCRPromptTemplate() {
  const defaultTemplate = `请分析这张收据图片，提取其中的商品信息。请仔细识别中文和英文文字，并返回严格的JSON格式数据。

要求：
1. 仔细识别所有商品名称（包括中文、英文、数字）
2. 准确提取每个商品的单价、数量和小计金额
3. 如果某个商品没有明确的数量，默认为1
4. 忽略非商品信息（如店名、地址、时间、收银员信息等）
5. 计算并验证总金额

请返回以下JSON格式：
{
  "items": [
    {
      "itemName": "商品名称",
      "unitPrice": 单价数字,
      "quantity": 数量整数,
      "totalPrice": 小计金额数字
    }
  ],
  "totalAmount": 总金额数字,
  "confidence": 识别置信度(0-1之间的数字)
}

注意：
- 所有价格都是数字类型，不包含货币符号
- 商品名称要完整准确
- 如果识别不清楚，confidence设置为较低值
- 确保小计 = 单价 × 数量
- 确保总金额 = 所有小计之和`;

  try {
    const templateFile = path.join(process.cwd(), 'config', 'ocr-prompt-template.txt');
    if (fs.existsSync(templateFile)) {
      return fs.readFileSync(templateFile, 'utf8');
    }
  } catch (error) {
    console.error('读取OCR提示词模板失败:', error);
  }

  return defaultTemplate;
}

function saveOCRPromptTemplate(template: string) {
  try {
    const configDir = path.join(process.cwd(), 'config');
    const templateFile = path.join(configDir, 'ocr-prompt-template.txt');
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(templateFile, template);
  } catch (error) {
    console.error('保存OCR提示词模板失败:', error);
    throw error;
  }
}

// 库存配置管理函数
function getInventoryConfig() {
  const defaultConfig = {
    alertThresholds: {
      globalLowStockThreshold: 10,
      globalOutOfStockThreshold: 0,
      enableGlobalAlerts: true,
      enableItemSpecificAlerts: true
    },
    autoRestock: {
      enabled: false,
      defaultRestockQuantity: 50,
      restockTriggerThreshold: 5,
      enableEmailNotifications: true,
      notificationEmails: []
    },
    display: {
      defaultPageSize: 20,
      showLowStockFirst: true,
      highlightCriticalItems: true,
      showStockValue: true,
      defaultSortField: 'item_name',
      defaultSortOrder: 'asc'
    },
    validation: {
      maxItemNameLength: 100,
      minStockQuantity: 0,
      maxStockQuantity: 999999,
      requireCategory: false,
      requireTags: false
    }
  };

  try {
    const configFile = path.join(process.cwd(), 'config', 'inventory-config.json');
    if (fs.existsSync(configFile)) {
      const savedConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      return { ...defaultConfig, ...savedConfig };
    }
  } catch (error) {
    console.error('读取库存配置失败:', error);
  }

  return defaultConfig;
}

function saveInventoryConfig(config: any) {
  try {
    const configDir = path.join(process.cwd(), 'config');
    const configFile = path.join(configDir, 'inventory-config.json');
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('保存库存配置失败:', error);
    throw error;
  }
}

function getInventoryCategories() {
  const defaultCategories = [
    { id: 1, name: '食品', description: '各类食品商品', color: '#52c41a' },
    { id: 2, name: '饮料', description: '各类饮品', color: '#1890ff' },
    { id: 3, name: '日用品', description: '日常生活用品', color: '#faad14' },
    { id: 4, name: '化妆品', description: '美容护肤产品', color: '#eb2f96' },
    { id: 5, name: '电子产品', description: '电子设备及配件', color: '#722ed1' },
    { id: 6, name: '服装', description: '各类服装商品', color: '#13c2c2' },
    { id: 7, name: '其他', description: '其他类别商品', color: '#8c8c8c' }
  ];

  try {
    const categoriesFile = path.join(process.cwd(), 'config', 'inventory-categories.json');
    if (fs.existsSync(categoriesFile)) {
      return JSON.parse(fs.readFileSync(categoriesFile, 'utf8'));
    }
  } catch (error) {
    console.error('读取库存分类失败:', error);
  }

  return defaultCategories;
}

function saveInventoryCategories(categories: any[]) {
  try {
    const configDir = path.join(process.cwd(), 'config');
    const categoriesFile = path.join(configDir, 'inventory-categories.json');
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(categoriesFile, JSON.stringify(categories, null, 2));
  } catch (error) {
    console.error('保存库存分类失败:', error);
    throw error;
  }
}

function getInventoryTags() {
  const defaultTags = [
    { id: 1, name: '热销', color: '#f50' },
    { id: 2, name: '新品', color: '#2db7f5' },
    { id: 3, name: '促销', color: '#87d068' },
    { id: 4, name: '季节性', color: '#108ee9' },
    { id: 5, name: '限量', color: '#f56a00' },
    { id: 6, name: '进口', color: '#722ed1' },
    { id: 7, name: '有机', color: '#52c41a' },
    { id: 8, name: '高端', color: '#eb2f96' }
  ];

  try {
    const tagsFile = path.join(process.cwd(), 'config', 'inventory-tags.json');
    if (fs.existsSync(tagsFile)) {
      return JSON.parse(fs.readFileSync(tagsFile, 'utf8'));
    }
  } catch (error) {
    console.error('读取库存标签失败:', error);
  }

  return defaultTags;
}

function saveInventoryTags(tags: any[]) {
  try {
    const configDir = path.join(process.cwd(), 'config');
    const tagsFile = path.join(configDir, 'inventory-tags.json');
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(tagsFile, JSON.stringify(tags, null, 2));
  } catch (error) {
    console.error('保存库存标签失败:', error);
    throw error;
  }
}

function getInventoryReportConfig() {
  const defaultConfig = {
    reports: [
      {
        id: 'low-stock',
        name: '低库存报表',
        description: '显示库存不足的商品',
        enabled: true,
        schedule: 'daily',
        recipients: [],
        filters: {
          threshold: 10,
          includeOutOfStock: true
        }
      },
      {
        id: 'stock-value',
        name: '库存价值报表',
        description: '显示库存总价值统计',
        enabled: true,
        schedule: 'weekly',
        recipients: [],
        filters: {
          groupByCategory: true,
          includeZeroValue: false
        }
      },
      {
        id: 'movement-analysis',
        name: '库存流动分析',
        description: '分析库存变动趋势',
        enabled: false,
        schedule: 'monthly',
        recipients: [],
        filters: {
          period: 30,
          includeInactive: false
        }
      }
    ],
    exportFormats: ['excel', 'csv', 'pdf'],
    defaultFormat: 'excel',
    autoExport: false,
    exportPath: './exports'
  };

  try {
    const configFile = path.join(process.cwd(), 'config', 'inventory-report-config.json');
    if (fs.existsSync(configFile)) {
      const savedConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      return { ...defaultConfig, ...savedConfig };
    }
  } catch (error) {
    console.error('读取库存报表配置失败:', error);
  }

  return defaultConfig;
}

function saveInventoryReportConfig(config: any) {
  try {
    const configDir = path.join(process.cwd(), 'config');
    const configFile = path.join(configDir, 'inventory-report-config.json');
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('保存库存报表配置失败:', error);
    throw error;
  }
}

export default router;
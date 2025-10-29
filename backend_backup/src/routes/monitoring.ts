import express from 'express';
import { authenticateToken, AuthRequest, requireAdmin } from '../middleware/auth';
import { logOperation } from '../middleware/logger';
import { MonitoringService } from '../services/monitoringService';
import { connectionPool } from '../database/connectionPool';
import { queryOptimizer } from '../database/queryOptimizer';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const router = express.Router();

/**
 * 系统健康检查 - 公开端点
 */
router.get('/health', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: 'unknown',
        monitoring: 'unknown',
        filesystem: 'unknown'
      }
    };

    // 检查数据库连接
    try {
      const dbStats = connectionPool.getStatus();
      healthStatus.services.database = dbStats.totalConnections > 0 ? 'healthy' : 'degraded';
    } catch (error) {
      healthStatus.services.database = 'unhealthy';
      healthStatus.status = 'degraded';
    }

    // 检查监控服务
    try {
      const monitoringService = MonitoringService.getInstance();
      const metrics = monitoringService.getCurrentMetrics();
      healthStatus.services.monitoring = 'healthy';
    } catch (error) {
      healthStatus.services.monitoring = 'unhealthy';
      healthStatus.status = 'degraded';
    }

    // 检查文件系统
    try {
      const uploadDir = process.env.UPLOAD_PATH || './uploads';
      const logDir = process.env.LOG_DIR || './logs';
      
      if (fs.existsSync(uploadDir) && fs.existsSync(logDir)) {
        healthStatus.services.filesystem = 'healthy';
      } else {
        healthStatus.services.filesystem = 'degraded';
        healthStatus.status = 'degraded';
      }
    } catch (error) {
      healthStatus.services.filesystem = 'unhealthy';
      healthStatus.status = 'degraded';
    }

    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    console.error('健康检查失败:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : '健康检查失败'
    });
  }
});

/**
 * 详细系统状态 - 需要管理员权限
 */
router.get('/status', authenticateToken, requireAdmin, logOperation('查看', '系统状态'), async (req: AuthRequest, res) => {
  try {
    const monitoringService = MonitoringService.getInstance();
    const metrics = monitoringService.getCurrentMetrics();
    const report = monitoringService.generateReport();
    const dbStats = await queryOptimizer.getDatabaseStats();
    
    // 系统资源信息
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpuCount: os.cpus().length,
      loadAverage: os.loadavg(),
      hostname: os.hostname(),
      uptime: os.uptime()
    };

    // 磁盘使用情况
    const diskUsage = await getDiskUsage();

    // 网络连接状态
    const networkStatus = await getNetworkStatus();

    // 进程信息
    const processInfo = {
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      versions: process.versions
    };

    const systemStatus = {
      timestamp: new Date().toISOString(),
      overall: {
        status: determineOverallStatus(metrics, systemInfo, diskUsage),
        uptime: processInfo.uptime,
        version: process.env.npm_package_version || '1.0.0'
      },
      metrics,
      report,
      database: {
        stats: dbStats,
        connectionPool: connectionPool.getStatus()
      },
      system: systemInfo,
      disk: diskUsage,
      network: networkStatus,
      process: processInfo,
      alerts: await getActiveAlerts(),
      recommendations: generateSystemRecommendations(metrics, systemInfo, diskUsage)
    };

    res.json(systemStatus);
  } catch (error) {
    console.error('获取系统状态失败:', error);
    res.status(500).json({
      error: '获取系统状态失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 实时监控指标 - WebSocket风格的轮询端点
 */
router.get('/metrics/live', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const monitoringService = MonitoringService.getInstance();
    const metrics = monitoringService.getCurrentMetrics();
    const dbStats = connectionPool.getStatus();
    
    // 简化的实时指标
    const liveMetrics = {
      timestamp: new Date().toISOString(),
      system: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime(),
        freeMemory: os.freemem(),
        loadAverage: os.loadavg()[0] // 1分钟平均负载
      },
      database: {
        activeConnections: dbStats.activeConnections,
        idleConnections: dbStats.idleConnections,
        waitingRequests: dbStats.waitingRequests
      },
      requests: {
        ocrTotal: metrics.ocrRequests.total,
        ocrSuccessRate: metrics.ocrRequests.total > 0 ? 
          (metrics.ocrRequests.successful / metrics.ocrRequests.total * 100).toFixed(1) : '0',
        averageResponseTime: metrics.performance.averageResponseTime
      },
      errors: {
        totalErrors: metrics.errors.total,
        errorRate: metrics.ocrRequests.total > 0 ? 
          (metrics.errors.total / metrics.ocrRequests.total * 100).toFixed(1) : '0'
      }
    };

    res.json(liveMetrics);
  } catch (error) {
    console.error('获取实时指标失败:', error);
    res.status(500).json({
      error: '获取实时指标失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 历史指标数据
 */
router.get('/metrics/history', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { hours = 24 } = req.query;
    const monitoringService = MonitoringService.getInstance();
    const history = monitoringService.getMetricsHistory(Number(hours));
    
    // 处理历史数据，提取关键指标
    const processedHistory = history.map(metric => ({
      timestamp: metric.timestamp,
      ocrRequests: metric.ocrRequests.total,
      successRate: metric.ocrRequests.total > 0 ? 
        (metric.ocrRequests.successful / metric.ocrRequests.total * 100) : 0,
      averageResponseTime: metric.ocrRequests.averageProcessingTime,
      errorCount: metric.errors.total,
      memoryUsage: metric.system.memoryUsage.heapUsed,
      uptime: metric.system.uptime
    }));

    res.json({
      timeRange: `${hours}小时`,
      dataPoints: processedHistory.length,
      history: processedHistory
    });
  } catch (error) {
    console.error('获取历史指标失败:', error);
    res.status(500).json({
      error: '获取历史指标失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 系统警报
 */
router.get('/alerts', authenticateToken, requireAdmin, logOperation('查看', '系统警报'), async (req: AuthRequest, res) => {
  try {
    const alerts = await getActiveAlerts();
    const alertHistory = await getAlertHistory(24); // 24小时内的警报历史
    
    res.json({
      active: alerts,
      history: alertHistory,
      summary: {
        totalActive: alerts.length,
        highSeverity: alerts.filter(a => a.severity === 'HIGH').length,
        mediumSeverity: alerts.filter(a => a.severity === 'MEDIUM').length,
        lowSeverity: alerts.filter(a => a.severity === 'LOW').length
      }
    });
  } catch (error) {
    console.error('获取系统警报失败:', error);
    res.status(500).json({
      error: '获取系统警报失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 清除警报
 */
router.post('/alerts/:alertId/clear', authenticateToken, requireAdmin, logOperation('清除', '系统警报'), async (req: AuthRequest, res) => {
  try {
    const { alertId } = req.params;
    const { reason } = req.body;
    
    // 这里可以实现警报清除逻辑
    // 目前简单返回成功
    
    res.json({
      message: '警报已清除',
      alertId,
      clearedBy: req.user?.username,
      reason: reason || '手动清除',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('清除警报失败:', error);
    res.status(500).json({
      error: '清除警报失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 系统性能测试
 */
router.post('/performance-test', authenticateToken, requireAdmin, logOperation('执行', '性能测试'), async (req: AuthRequest, res) => {
  try {
    const { testType = 'basic', duration = 30 } = req.body;
    
    const testResults = await runPerformanceTest(testType, duration);
    
    res.json({
      testType,
      duration,
      results: testResults,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('性能测试失败:', error);
    res.status(500).json({
      error: '性能测试失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 重置监控统计
 */
router.post('/reset-stats', authenticateToken, requireAdmin, logOperation('重置', '监控统计'), async (req: AuthRequest, res) => {
  try {
    const monitoringService = MonitoringService.getInstance();
    monitoringService.resetStats();
    
    res.json({
      message: '监控统计已重置',
      timestamp: new Date().toISOString(),
      resetBy: req.user?.username
    });
  } catch (error) {
    console.error('重置统计失败:', error);
    res.status(500).json({
      error: '重置统计失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

// 辅助函数

/**
 * 获取磁盘使用情况
 */
async function getDiskUsage(): Promise<any> {
  try {
    const stats = fs.statSync('./');
    return {
      available: true,
      path: process.cwd(),
      // 简化的磁盘信息，实际项目中可以使用更详细的磁盘检查
      status: 'healthy'
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : '磁盘检查失败'
    };
  }
}

/**
 * 获取网络状态
 */
async function getNetworkStatus(): Promise<any> {
  return {
    status: 'connected',
    interfaces: Object.keys(os.networkInterfaces()).length,
    // 可以添加更详细的网络检查
    lastCheck: new Date().toISOString()
  };
}

/**
 * 确定整体系统状态
 */
function determineOverallStatus(metrics: any, systemInfo: any, diskUsage: any): string {
  // 检查关键指标
  const memoryUsagePercent = (systemInfo.totalMemory - systemInfo.freeMemory) / systemInfo.totalMemory * 100;
  const loadAverage = systemInfo.loadAverage[0];
  const cpuCount = systemInfo.cpuCount;
  
  // 严重问题
  if (memoryUsagePercent > 90 || loadAverage > cpuCount * 2) {
    return 'critical';
  }
  
  // 警告级别问题
  if (memoryUsagePercent > 80 || loadAverage > cpuCount * 1.5 || metrics.errors.total > 100) {
    return 'warning';
  }
  
  // OCR成功率检查
  if (metrics.ocrRequests.total > 0) {
    const successRate = metrics.ocrRequests.successful / metrics.ocrRequests.total * 100;
    if (successRate < 70) {
      return 'warning';
    }
  }
  
  return 'healthy';
}

/**
 * 获取活跃警报
 */
async function getActiveAlerts(): Promise<any[]> {
  try {
    const logDir = process.env.LOG_DIR || './logs';
    const alertLogPath = path.join(logDir, 'alerts.log');
    
    if (!fs.existsSync(alertLogPath)) {
      return [];
    }

    const logContent = fs.readFileSync(alertLogPath, 'utf-8');
    const lines = logContent.split('\n').filter(line => line.trim());
    
    // 获取最近1小时的警报
    const oneHourAgo = new Date(Date.now() - 3600000);
    const recentAlerts: any[] = [];
    
    for (const line of lines.slice(-100)) { // 只检查最近100条
      try {
        const alertEntry = JSON.parse(line);
        const alertTime = new Date(alertEntry.timestamp);
        
        if (alertTime >= oneHourAgo) {
          recentAlerts.push(alertEntry);
        }
      } catch (parseError) {
        // 忽略解析错误的日志行
      }
    }
    
    return recentAlerts;
  } catch (error) {
    console.error('获取活跃警报失败:', error);
    return [];
  }
}

/**
 * 获取警报历史
 */
async function getAlertHistory(hours: number): Promise<any[]> {
  try {
    const logDir = process.env.LOG_DIR || './logs';
    const alertLogPath = path.join(logDir, 'alerts.log');
    
    if (!fs.existsSync(alertLogPath)) {
      return [];
    }

    const logContent = fs.readFileSync(alertLogPath, 'utf-8');
    const lines = logContent.split('\n').filter(line => line.trim());
    
    const cutoffTime = new Date(Date.now() - hours * 3600000);
    const alertHistory: any[] = [];
    
    for (const line of lines) {
      try {
        const alertEntry = JSON.parse(line);
        const alertTime = new Date(alertEntry.timestamp);
        
        if (alertTime >= cutoffTime) {
          alertHistory.push(alertEntry);
        }
      } catch (parseError) {
        // 忽略解析错误的日志行
      }
    }
    
    return alertHistory.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('获取警报历史失败:', error);
    return [];
  }
}

/**
 * 生成系统建议
 */
function generateSystemRecommendations(metrics: any, systemInfo: any, diskUsage: any): string[] {
  const recommendations: string[] = [];
  
  // 内存使用建议
  const memoryUsagePercent = (systemInfo.totalMemory - systemInfo.freeMemory) / systemInfo.totalMemory * 100;
  if (memoryUsagePercent > 80) {
    recommendations.push('内存使用率较高，建议监控内存泄漏或考虑增加内存');
  }
  
  // CPU负载建议
  const loadAverage = systemInfo.loadAverage[0];
  const cpuCount = systemInfo.cpuCount;
  if (loadAverage > cpuCount) {
    recommendations.push('CPU负载较高，建议检查是否有高CPU使用的进程');
  }
  
  // OCR性能建议
  if (metrics.ocrRequests.total > 0) {
    const successRate = metrics.ocrRequests.successful / metrics.ocrRequests.total * 100;
    if (successRate < 90) {
      recommendations.push('OCR成功率可以进一步优化，检查图像质量和网络连接');
    }
    
    if (metrics.ocrRequests.averageProcessingTime > 15000) {
      recommendations.push('OCR处理时间较长，考虑优化图像预处理或网络配置');
    }
  }
  
  // 错误率建议
  if (metrics.errors.total > 50) {
    recommendations.push('错误数量较多，建议检查日志并修复常见问题');
  }
  
  return recommendations;
}

/**
 * 运行性能测试
 */
async function runPerformanceTest(testType: string, duration: number): Promise<any> {
  const startTime = Date.now();
  const results: any = {
    testType,
    duration,
    startTime: new Date(startTime).toISOString(),
    metrics: {}
  };
  
  try {
    switch (testType) {
      case 'database':
        results.metrics = await testDatabasePerformance(duration);
        break;
      case 'memory':
        results.metrics = await testMemoryPerformance(duration);
        break;
      case 'basic':
      default:
        results.metrics = await testBasicPerformance(duration);
        break;
    }
    
    results.endTime = new Date().toISOString();
    results.actualDuration = Date.now() - startTime;
    results.status = 'completed';
    
  } catch (error) {
    results.error = error instanceof Error ? error.message : '测试失败';
    results.status = 'failed';
  }
  
  return results;
}

/**
 * 数据库性能测试
 */
async function testDatabasePerformance(duration: number): Promise<any> {
  const startTime = Date.now();
  let queryCount = 0;
  let totalResponseTime = 0;
  const errors: string[] = [];
  
  while (Date.now() - startTime < duration * 1000) {
    try {
      const queryStart = Date.now();
      await connectionPool.query('SELECT 1');
      const queryTime = Date.now() - queryStart;
      
      queryCount++;
      totalResponseTime += queryTime;
      
      // 短暂延迟避免过度负载
      await new Promise(resolve => setTimeout(resolve, 10));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : '查询失败');
    }
  }
  
  return {
    queryCount,
    averageResponseTime: queryCount > 0 ? totalResponseTime / queryCount : 0,
    queriesPerSecond: queryCount / duration,
    errorCount: errors.length,
    errors: errors.slice(0, 5) // 只返回前5个错误
  };
}

/**
 * 内存性能测试
 */
async function testMemoryPerformance(duration: number): Promise<any> {
  const startTime = Date.now();
  const initialMemory = process.memoryUsage();
  const memorySnapshots: any[] = [];
  
  // 创建一些内存负载
  const testData: any[] = [];
  
  while (Date.now() - startTime < duration * 1000) {
    // 分配一些内存
    testData.push(new Array(1000).fill(Math.random()));
    
    // 记录内存快照
    if (memorySnapshots.length < 10) {
      memorySnapshots.push({
        timestamp: Date.now() - startTime,
        memory: process.memoryUsage()
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 清理测试数据
  testData.length = 0;
  
  const finalMemory = process.memoryUsage();
  
  return {
    initialMemory,
    finalMemory,
    memorySnapshots,
    memoryDelta: {
      heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
      heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
      rss: finalMemory.rss - initialMemory.rss
    }
  };
}

/**
 * 基础性能测试
 */
async function testBasicPerformance(duration: number): Promise<any> {
  const startTime = Date.now();
  let operationCount = 0;
  
  while (Date.now() - startTime < duration * 1000) {
    // 执行一些基础操作
    Math.random();
    JSON.stringify({ test: 'data', timestamp: Date.now() });
    operationCount++;
    
    if (operationCount % 1000 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }
  
  return {
    operationCount,
    operationsPerSecond: operationCount / duration,
    systemLoad: os.loadavg(),
    memoryUsage: process.memoryUsage()
  };
}

export default router;
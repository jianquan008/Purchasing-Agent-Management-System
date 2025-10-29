import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getDatabase, connectionPool } from '../database/init';
import { queryOptimizer } from '../database/queryOptimizer';
import { authenticateToken, AuthRequest, requireAdmin, checkAdminOptional } from '../middleware/auth';
import { logOperation } from '../middleware/logger';
import { OCRService } from '../services/ocrService';
import { ImageProcessingService } from '../services/imageProcessingService';

const router = express.Router();
const imageProcessingService = ImageProcessingService.getInstance();

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_PATH || './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'receipt-' + uniqueSuffix + ext);
  }
});

// 获取图像处理服务的限制配置
const processingLimits = imageProcessingService.getProcessingLimits();
const supportedFormats = imageProcessingService.getSupportedFormats();

const upload = multer({ 
  storage,
  limits: { 
    fileSize: processingLimits.maxFileSize, // 使用ImageProcessingService的限制
    files: 1 // 一次只允许上传一个文件
  },
  fileFilter: (req, file, cb) => {
    // 使用ImageProcessingService的格式验证
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const isValidExtension = supportedFormats.extensions.includes(ext);
    const isValidMimeType = supportedFormats.mimeTypes.includes(file.mimetype);
    
    if (isValidExtension && isValidMimeType) {
      return cb(null, true);
    } else {
      const supportedExts = supportedFormats.extensions.join(', ');
      cb(new Error(`不支持的文件格式。支持的格式: ${supportedExts}`));
    }
  }
});

// OCR识别收据
router.post('/ocr', authenticateToken, logOperation('OCR识别', '收据'), upload.single('receipt'), async (req: AuthRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ 
      error: '请上传收据图片',
      supportedFormats: supportedFormats.extensions,
      maxFileSize: `${processingLimits.maxFileSize / 1024 / 1024}MB`
    });
  }

  let tempFilesToCleanup: string[] = [req.file.path];

  try {
    const ocrService = OCRService.getInstance();
    
    // 先验证图像文件
    const validation = await imageProcessingService.validateImage(req.file.path);
    if (!validation.isValid) {
      // 清理上传的文件
      imageProcessingService.cleanupTempFiles(tempFilesToCleanup);
      
      return res.status(400).json({
        error: '图像文件验证失败',
        details: validation.errors,
        warnings: validation.warnings,
        suggestions: [
          '请确保图片文件完整且未损坏',
          `支持的格式: ${supportedFormats.extensions.join(', ')}`,
          `文件大小限制: ${processingLimits.minFileSize / 1024}KB - ${processingLimits.maxFileSize / 1024 / 1024}MB`,
          `图像尺寸建议: ${processingLimits.minDimension}x${processingLimits.minDimension} 到 ${processingLimits.maxDimension}x${processingLimits.maxDimension} 像素`
        ]
      });
    }

    // 如果有警告，记录但继续处理
    if (validation.warnings.length > 0) {
      console.warn('图像验证警告:', validation.warnings);
    }
    
    // 进行OCR识别（图像处理在recognizeReceipt内部完成）
    const ocrResult = await ocrService.recognizeReceipt(req.file.path, true);
    
    // 构建响应数据
    const response: any = {
      imagePath: req.file.filename,
      parsedItems: ocrResult.items,
      confidence: ocrResult.confidence,
      suggestedTotal: ocrResult.totalAmount,
      processingTime: ocrResult.processingTime
    };

    // 如果使用了降级服务，添加相关信息
    if (ocrResult.fallbackUsed) {
      response.fallbackUsed = true;
      response.message = '主要识别服务不可用，已使用备用方案。请手动检查和修正识别结果。';
    }

    // 添加图像质量分析结果和建议
    if (ocrResult.qualityAnalysis) {
      response.qualityAnalysis = {
        quality: ocrResult.qualityAnalysis.quality,
        score: ocrResult.qualityAnalysis.score,
        suggestions: ocrResult.qualityAnalysis.suggestions,
        issues: ocrResult.qualityAnalysis.issues,
        metadata: {
          originalSize: ocrResult.qualityAnalysis.metadata.size,
          dimensions: `${ocrResult.qualityAnalysis.metadata.width}x${ocrResult.qualityAnalysis.metadata.height}`,
          format: ocrResult.qualityAnalysis.metadata.format
        }
      };

      // 根据质量提供额外建议
      if (ocrResult.qualityAnalysis.quality === 'poor') {
        response.qualityWarning = '图像质量较差，建议重新拍摄或扫描以获得更好的识别效果';
      } else if (ocrResult.qualityAnalysis.quality === 'fair') {
        response.qualityWarning = '图像质量一般，请仔细检查识别结果';
      }
    }

    // 添加验证警告到响应
    if (validation.warnings.length > 0) {
      response.imageWarnings = validation.warnings;
    }
    
    res.json(response);
  } catch (error) {
    console.error('OCR识别失败:', error);
    
    // 清理上传的文件
    imageProcessingService.cleanupTempFiles(tempFilesToCleanup);
    
    // 返回用户友好的错误信息
    const errorMessage = error instanceof Error ? error.message : 'OCR识别失败，请检查图片质量或重新上传';
    
    // 根据错误类型提供不同的建议
    let suggestions = [
      '请确保图片清晰可读',
      `支持的格式: ${supportedFormats.extensions.join(', ')}`,
      `建议图片大小: 1MB - ${processingLimits.maxFileSize / 1024 / 1024}MB`,
      '确保收据内容完整且光线充足'
    ];

    if (errorMessage.includes('验证失败')) {
      suggestions = [
        '请检查图片文件是否完整',
        '确认文件格式正确',
        '检查文件大小是否在允许范围内',
        '尝试重新保存或转换图片格式'
      ];
    } else if (errorMessage.includes('处理失败')) {
      suggestions = [
        '图片可能损坏，请重新上传',
        '尝试使用其他图片编辑软件重新保存',
        '确保图片没有加密或特殊保护',
        '联系技术支持获取帮助'
      ];
    }

    res.status(500).json({ 
      error: errorMessage,
      suggestions,
      supportedFormats: supportedFormats.extensions,
      processingLimits: {
        maxFileSize: `${processingLimits.maxFileSize / 1024 / 1024}MB`,
        maxDimensions: `${processingLimits.maxDimension}x${processingLimits.maxDimension}`,
        minDimensions: `${processingLimits.minDimension}x${processingLimits.minDimension}`
      }
    });
  }
});

// 保存收据数据 - 使用连接池
router.post('/save', authenticateToken, logOperation('保存', '收据'), async (req: AuthRequest, res) => {
  const { imagePath, items, totalAmount } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '收据项目不能为空' });
  }

  const db = await connectionPool.acquire();
  
  try {
    await new Promise<void>((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // 插入收据记录
    const receiptResult = await new Promise<number>((resolve, reject) => {
      db.run(
        'INSERT INTO receipts (user_id, image_path, total_amount) VALUES (?, ?, ?)',
        [req.user!.id, imagePath, totalAmount],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    const receiptId = receiptResult;
    
    // 批量插入收据项目
    const stmt = db.prepare('INSERT INTO receipt_items (receipt_id, item_name, unit_price, quantity, total_price) VALUES (?, ?, ?, ?, ?)');
    const inventoryStmt = db.prepare(`
      INSERT INTO inventory (item_name, current_stock, unit_price) 
      VALUES (?, ?, ?)
      ON CONFLICT(item_name) DO UPDATE SET
        current_stock = current_stock + ?,
        unit_price = ?,
        last_updated = CURRENT_TIMESTAMP
    `);
    
    for (const item of items) {
      await new Promise<void>((resolve, reject) => {
        stmt.run([receiptId, item.itemName || item.name, item.unitPrice, item.quantity, item.totalPrice], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // 更新库存
      await new Promise<void>((resolve, reject) => {
        inventoryStmt.run([
          item.itemName || item.name, 
          item.quantity, 
          item.unitPrice, 
          item.quantity, 
          item.unitPrice
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    stmt.finalize();
    inventoryStmt.finalize();
    
    await new Promise<void>((resolve, reject) => {
      db.run('COMMIT', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    connectionPool.release(db);
    res.json({ message: '收据保存成功', receiptId });
    
  } catch (error) {
    await new Promise<void>((resolve) => {
      db.run('ROLLBACK', () => resolve());
    });
    connectionPool.release(db);
    
    console.error('保存收据失败:', error);
    res.status(500).json({ 
      error: '保存收据失败',
      message: error instanceof Error ? error.message : '数据库操作错误'
    });
  }
});

// 获取收据列表 - 使用优化查询
router.get('/list', authenticateToken, logOperation('查看', '收据列表'), async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate, search } = req.query;
    
    const result = await queryOptimizer.getReceiptsOptimized({
      page: Number(page),
      limit: Number(limit),
      startDate: startDate as string,
      endDate: endDate as string,
      itemName: search as string
    });
    
    res.json(result);
  } catch (error) {
    console.error('获取收据列表失败:', error);
    res.status(500).json({ 
      error: '获取收据列表失败',
      message: error instanceof Error ? error.message : '数据库查询错误'
    });
  }
});

// 获取收据详情
router.get('/:id', authenticateToken, logOperation('查看', '收据详情'), (req: AuthRequest, res) => {
  const receiptId = req.params.id;
  const db = getDatabase();
  
  db.get('SELECT * FROM receipts WHERE id = ?', [receiptId], (err, receipt) => {
    if (err) {
      db.close();
      return res.status(500).json({ error: '获取收据失败' });
    }
    
    if (!receipt) {
      db.close();
      return res.status(404).json({ error: '收据不存在' });
    }
    
    db.all('SELECT * FROM receipt_items WHERE receipt_id = ?', [receiptId], (err, items) => {
      db.close();
      if (err) {
        return res.status(500).json({ error: '获取收据项目失败' });
      }
      
      res.json({ ...receipt, items });
    });
  });
});

// 更新收据 (仅管理员)
router.put('/:id', authenticateToken, requireAdmin, logOperation('更新', '收据'), async (req: AuthRequest, res) => {
  const receiptId = req.params.id;
  const { items, totalAmount } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '收据项目不能为空' });
  }

  const db = getDatabase();
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // 更新收据总金额
    db.run(
      'UPDATE receipts SET total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [totalAmount, receiptId],
      function(err) {
        if (err) {
          db.run('ROLLBACK');
          db.close();
          return res.status(500).json({ error: '更新收据失败' });
        }
        
        if (this.changes === 0) {
          db.run('ROLLBACK');
          db.close();
          return res.status(404).json({ error: '收据不存在' });
        }
        
        // 删除原有的收据项目
        db.run('DELETE FROM receipt_items WHERE receipt_id = ?', [receiptId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            db.close();
            return res.status(500).json({ error: '删除原收据项目失败' });
          }
          
          // 插入新的收据项目
          const stmt = db.prepare('INSERT INTO receipt_items (receipt_id, item_name, unit_price, quantity, total_price) VALUES (?, ?, ?, ?, ?)');
          
          items.forEach((item: any) => {
            stmt.run([receiptId, item.itemName || item.name, item.unitPrice, item.quantity, item.totalPrice]);
          });
          
          stmt.finalize();
          
          db.run('COMMIT', (err) => {
            db.close();
            if (err) {
              return res.status(500).json({ error: '更新失败' });
            }
            res.json({ message: '收据更新成功' });
          });
        });
      }
    );
  });
});

// 删除收据 (仅管理员)
router.delete('/:id', authenticateToken, requireAdmin, logOperation('删除', '收据'), (req: AuthRequest, res) => {
  const receiptId = req.params.id;
  const db = getDatabase();
  
  // 先获取收据信息以删除关联的图片文件
  db.get('SELECT image_path FROM receipts WHERE id = ?', [receiptId], (err, receipt: any) => {
    if (err) {
      db.close();
      return res.status(500).json({ error: '获取收据信息失败' });
    }
    
    if (!receipt) {
      db.close();
      return res.status(404).json({ error: '收据不存在' });
    }
    
    // 删除收据记录（级联删除收据项目）
    db.run('DELETE FROM receipts WHERE id = ?', [receiptId], function(err) {
      db.close();
      if (err) {
        return res.status(500).json({ error: '删除收据失败' });
      }
      
      // 删除关联的图片文件
      if (receipt.image_path) {
        const imagePath = path.join(process.env.UPLOAD_PATH || './uploads', receipt.image_path);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      
      res.json({ message: '收据删除成功' });
    });
  });
});

// 重新识别收据 (管理员功能)
router.post('/:id/reprocess', authenticateToken, requireAdmin, logOperation('重新识别', '收据'), async (req: AuthRequest, res) => {
  const receiptId = req.params.id;
  const { enableFallback = true, enhanceImage = true } = req.body;
  const db = getDatabase();
  
  // 获取收据的图片路径
  db.get('SELECT image_path FROM receipts WHERE id = ?', [receiptId], async (err, receipt: any) => {
    db.close();
    if (err) {
      return res.status(500).json({ error: '获取收据信息失败' });
    }
    
    if (!receipt || !receipt.image_path) {
      return res.status(404).json({ error: '收据或图片不存在' });
    }
    
    try {
      const imagePath = path.join(process.env.UPLOAD_PATH || './uploads', receipt.image_path);
      
      // 验证图像文件是否仍然存在且有效
      const validation = await imageProcessingService.validateImage(imagePath);
      if (!validation.isValid) {
        return res.status(400).json({
          error: '原始图像文件无效或已损坏',
          details: validation.errors,
          suggestions: ['请重新上传收据图片']
        });
      }

      const ocrService = OCRService.getInstance();
      const ocrResult = await ocrService.recognizeReceipt(imagePath, enableFallback);
      
      const response: any = {
        parsedItems: ocrResult.items,
        confidence: ocrResult.confidence,
        suggestedTotal: ocrResult.totalAmount,
        processingTime: ocrResult.processingTime,
        reprocessed: true,
        timestamp: new Date().toISOString()
      };

      if (ocrResult.fallbackUsed) {
        response.fallbackUsed = true;
        response.message = '主要识别服务不可用，已使用备用方案';
      }

      if (ocrResult.qualityAnalysis) {
        response.qualityAnalysis = {
          quality: ocrResult.qualityAnalysis.quality,
          score: ocrResult.qualityAnalysis.score,
          suggestions: ocrResult.qualityAnalysis.suggestions,
          issues: ocrResult.qualityAnalysis.issues
        };
      }

      // 添加验证警告
      if (validation.warnings.length > 0) {
        response.imageWarnings = validation.warnings;
      }
      
      res.json(response);
    } catch (error) {
      console.error('重新识别失败:', error);
      const errorMessage = error instanceof Error ? error.message : '重新识别失败';
      res.status(500).json({ 
        error: errorMessage,
        suggestions: [
          '检查原始图片文件是否完整',
          '尝试重新上传收据图片',
          '联系技术支持获取帮助'
        ]
      });
    }
  });
});

// 批量图像处理测试 (管理员功能)
router.post('/batch-process', authenticateToken, requireAdmin, logOperation('批量处理', '图像'), upload.array('receipts', 10), async (req: AuthRequest, res) => {
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    return res.status(400).json({ 
      error: '请上传至少一个图像文件',
      maxFiles: 10
    });
  }

  const files = req.files as Express.Multer.File[];
  const tempFilesToCleanup: string[] = files.map(file => file.path);

  try {
    const imagePaths = files.map(file => file.path);
    
    // 批量处理图像
    const batchResult = await imageProcessingService.batchProcessImages(imagePaths, {
      maxWidth: 2048,
      maxHeight: 2048,
      quality: 85,
      format: 'jpeg',
      enhanceForOCR: true,
      preserveAspectRatio: true
    });

    // 构建响应
    const response = {
      summary: batchResult.summary,
      results: batchResult.results.map((result, index) => {
        const file = files[index];
        if ('error' in result) {
          return {
            filename: file.filename,
            originalName: file.originalname,
            error: result.error,
            success: false
          };
        } else {
          return {
            filename: file.filename,
            originalName: file.originalname,
            success: true,
            processing: {
              originalSize: result.metadata.originalSize,
              processedSize: result.metadata.processedSize,
              compressionRatio: result.metadata.compressionRatio,
              processingTime: result.metadata.processingTime
            },
            quality: {
              score: result.qualityAnalysis.score,
              quality: result.qualityAnalysis.quality,
              issues: result.qualityAnalysis.issues,
              suggestions: result.qualityAnalysis.suggestions
            }
          };
        }
      }),
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error) {
    console.error('批量处理失败:', error);
    const errorMessage = error instanceof Error ? error.message : '批量处理失败';
    res.status(500).json({ 
      error: errorMessage,
      suggestions: [
        '检查所有图片文件是否有效',
        '确保文件格式和大小符合要求',
        '减少批量处理的文件数量'
      ]
    });
  } finally {
    // 清理临时文件
    imageProcessingService.cleanupTempFiles(tempFilesToCleanup);
  }
});

// 获取图像处理配置信息
router.get('/image-config', authenticateToken, (req: AuthRequest, res) => {
  try {
    const limits = imageProcessingService.getProcessingLimits();
    const formats = imageProcessingService.getSupportedFormats();
    
    res.json({
      supportedFormats: formats,
      processingLimits: {
        maxFileSize: limits.maxFileSize,
        minFileSize: limits.minFileSize,
        maxDimension: limits.maxDimension,
        minDimension: limits.minDimension,
        maxFileSizeMB: Math.round(limits.maxFileSize / 1024 / 1024),
        minFileSizeKB: Math.round(limits.minFileSize / 1024)
      },
      recommendations: {
        optimalFileSize: '1MB - 5MB',
        optimalDimensions: '800x600 到 2048x2048 像素',
        optimalFormat: 'JPEG 或 PNG',
        optimalDPI: '300 DPI 或更高',
        tips: [
          '确保图片清晰，避免模糊',
          '保证充足的光线，避免阴影',
          '收据内容完整，避免裁剪重要信息',
          '避免反光和倾斜',
          '使用高质量的扫描或拍照设备'
        ]
      }
    });
  } catch (error) {
    console.error('获取图像配置失败:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : '获取图像配置失败'
    });
  }
});

// OCR服务健康检查
router.get('/health', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const ocrService = OCRService.getInstance();
    const healthStatus = await ocrService.getHealthStatus();
    
    // 添加图像处理服务状态
    const imageProcessingStatus = {
      available: true,
      supportedFormats: supportedFormats.extensions.length,
      processingLimits: processingLimits
    };
    
    res.json({
      ...healthStatus,
      imageProcessing: imageProcessingStatus
    });
  } catch (error) {
    console.error('健康检查失败:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : '健康检查失败'
    });
  }
});

// 系统监控指标
router.get('/metrics', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { MonitoringService } = await import('../services/monitoringService');
    const monitoringService = MonitoringService.getInstance();
    
    const metrics = monitoringService.getCurrentMetrics();
    const report = monitoringService.generateReport();
    
    res.json({
      metrics,
      report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('获取监控指标失败:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : '获取监控指标失败'
    });
  }
});

// 导出历史记录 (CSV格式)
router.get('/export/csv', authenticateToken, logOperation('导出', '历史记录CSV'), (req: AuthRequest, res) => {
  const { startDate, endDate, search } = req.query;
  
  let whereClause = '1=1';
  const params: any[] = [];
  
  if (startDate) {
    whereClause += ' AND r.created_at >= ?';
    params.push(startDate);
  }
  
  if (endDate) {
    whereClause += ' AND r.created_at <= ?';
    params.push(endDate);
  }
  
  if (search) {
    whereClause += ' AND (u.username LIKE ? OR r.id = ?)';
    params.push(`%${search}%`, search);
  }
  
  const db = getDatabase();
  
  db.all(`
    SELECT 
      r.id as receipt_id,
      u.username,
      r.total_amount,
      r.created_at,
      ri.item_name,
      ri.unit_price,
      ri.quantity,
      ri.total_price
    FROM receipts r 
    JOIN users u ON r.user_id = u.id 
    LEFT JOIN receipt_items ri ON r.id = ri.receipt_id
    WHERE ${whereClause}
    ORDER BY r.created_at DESC, ri.id
  `, params, (err, rows: any[]) => {
    db.close();
    if (err) {
      return res.status(500).json({ error: '导出数据失败' });
    }
    
    // 生成CSV内容
    const csvHeader = 'Receipt ID,Username,Item Name,Unit Price,Quantity,Item Total,Receipt Total,Created At\n';
    const csvRows = rows.map(row => {
      return [
        row.receipt_id,
        row.username,
        row.item_name || '',
        row.unit_price || '',
        row.quantity || '',
        row.total_price || '',
        row.total_amount,
        new Date(row.created_at).toLocaleString('zh-CN')
      ].map(field => `"${field}"`).join(',');
    }).join('\n');
    
    const csvContent = csvHeader + csvRows;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="receipts_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\uFEFF' + csvContent); // 添加BOM以支持中文
  });
});

// 获取历史记录统计
router.get('/stats', authenticateToken, logOperation('查看', '历史记录统计'), (req: AuthRequest, res) => {
  const { startDate, endDate } = req.query;
  
  let whereClause = '1=1';
  const params: any[] = [];
  
  if (startDate) {
    whereClause += ' AND created_at >= ?';
    params.push(startDate);
  }
  
  if (endDate) {
    whereClause += ' AND created_at <= ?';
    params.push(endDate);
  }
  
  const db = getDatabase();
  
  db.all(`
    SELECT 
      COUNT(*) as total_receipts,
      SUM(total_amount) as total_value,
      AVG(total_amount) as avg_value,
      MIN(total_amount) as min_value,
      MAX(total_amount) as max_value,
      COUNT(DISTINCT user_id) as unique_users
    FROM receipts 
    WHERE ${whereClause}
  `, params, (err, stats) => {
    if (err) {
      db.close();
      return res.status(500).json({ error: '获取统计数据失败' });
    }
    
    // 获取按日期分组的统计
    db.all(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        SUM(total_amount) as amount
      FROM receipts 
      WHERE ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `, params, (err, dailyStats) => {
      if (err) {
        db.close();
        return res.status(500).json({ error: '获取日统计失败' });
      }
      
      // 获取热门商品
      db.all(`
        SELECT 
          ri.item_name,
          COUNT(*) as frequency,
          SUM(ri.quantity) as total_quantity,
          SUM(ri.total_price) as total_value
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE ${whereClause}
        GROUP BY ri.item_name
        ORDER BY frequency DESC
        LIMIT 10
      `, params, (err, popularItems) => {
        db.close();
        if (err) {
          return res.status(500).json({ error: '获取热门商品失败' });
        }
        
        res.json({
          summary: stats[0],
          daily_stats: dailyStats,
          popular_items: popularItems
        });
      });
    });
  });
});

export default router;
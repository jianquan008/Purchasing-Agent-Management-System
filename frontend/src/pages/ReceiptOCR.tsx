import React, { useState } from 'react';
import {
  Card,
  Upload,
  Button,
  Table,
  Input,
  InputNumber,
  Typography,
  message,
  Space,
  Image,
  Spin,
  Progress,
  Alert,
  Tooltip,
  Tag
} from 'antd';
import { 
  UploadOutlined, 
  SaveOutlined, 
  PlusOutlined, 
  DeleteOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import axios from 'axios';
import { handleApiError, showSuccessMessage } from '../utils/errorHandler';
import OptimizedImage from '../components/OptimizedImage';
import ResponsiveMobileTable from '../components/ResponsiveMobileTable';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor';
import { useIsMobile, useHapticFeedback } from '../hooks/useMobileGestures';

const { Title, Text } = Typography;

interface ReceiptItem {
  key?: string;
  name: string;
  itemName?: string; // 兼容后端返回的字段
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

interface OCRResult {
  imagePath: string;
  parsedItems: ReceiptItem[];
  confidence: number;
  suggestedTotal?: number;
  fallbackUsed?: boolean;
  processingTime?: number;
  qualityAnalysis?: {
    quality: 'poor' | 'fair' | 'good' | 'excellent';
    score: number;
    suggestions: string[];
    issues: string[];
    metadata?: {
      originalSize: number;
      dimensions: string;
      format: string;
    };
  };
  qualityWarning?: string;
  imageWarnings?: string[];
  message?: string;
}

const ReceiptOCR: React.FC = () => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recognitionStatus, setRecognitionStatus] = useState<string>('');
  const [recognitionStage, setRecognitionStage] = useState<'upload' | 'processing' | 'analyzing' | 'complete' | 'error'>('upload');
  
  // 性能监控和移动端优化
  const { markStart, markEnd, recordInteraction } = usePerformanceMonitor('ReceiptOCR');
  const isMobile = useIsMobile();
  const { lightImpact, notificationSuccess } = useHapticFeedback();

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      // 检查文件类型
      const isImage = file.type.startsWith('image/');
      if (!isImage) {
        message.error('只能上传图片文件！');
        return false;
      }
      
      // 检查文件大小 (10MB)
      const isLt10M = file.size / 1024 / 1024 < 10;
      if (!isLt10M) {
        message.error('图片大小不能超过 10MB！');
        return false;
      }
      
      return false; // 阻止自动上传
    },
    fileList,
    onChange: ({ fileList: newFileList }) => {
      setFileList(newFileList);
      // 清除之前的识别结果
      if (newFileList.length === 0) {
        setOcrResult(null);
        setItems([]);
      }
    },
    maxCount: 1,
    accept: 'image/*',
    onDrop: (e) => {
      console.log('Dropped files', e.dataTransfer.files);
    },
  };

  const handleOCR = async () => {
    if (fileList.length === 0) {
      message.error('请先选择收据图片');
      return;
    }

    const interactionStart = performance.now();
    markStart('ocr-process');

    const formData = new FormData();
    formData.append('receipt', fileList[0].originFileObj as File);

    setLoading(true);
    setUploadProgress(0);
    setRecognitionStage('upload');
    setRecognitionStatus('正在上传图片...');
    
    try {
      const response = await axios.post('/api/receipts/ocr', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setUploadProgress(progress);
          
          if (progress < 100) {
            setRecognitionStatus(`正在上传图片... ${progress}%`);
          } else {
            setRecognitionStage('processing');
            setRecognitionStatus('正在使用 AWS Bedrock Claude 分析图片...');
          }
        }
      });

      setRecognitionStage('analyzing');
      setRecognitionStatus('正在解析识别结果...');

      const result = response.data;
      setOcrResult(result);
      
      // 为每个项目添加key
      const itemsWithKeys = result.parsedItems.map((item: ReceiptItem, index: number) => ({
        ...item,
        key: index.toString(),
        name: item.itemName || item.name // 兼容后端返回的itemName字段
      }));
      
      setItems(itemsWithKeys);
      setRecognitionStage('complete');
      setRecognitionStatus('识别完成');
      
      markEnd('ocr-process');
      recordInteraction('ocr-recognition', interactionStart);
      
      // 构建成功消息
      let successMessage = `Claude OCR识别完成，置信度: ${(result.confidence * 100).toFixed(1)}%`;
      if (result.processingTime) {
        successMessage += `，耗时: ${(result.processingTime / 1000).toFixed(1)}秒`;
      }
      
      showSuccessMessage(successMessage);
      
      // 显示降级服务提示
      if (result.fallbackUsed) {
        message.warning(result.message || '主要识别服务不可用，已使用备用方案。请仔细检查识别结果。');
      }
      
      // 显示图像质量警告
      if (result.qualityWarning) {
        message.warning(result.qualityWarning);
      }
      
      // 显示图像警告
      if (result.imageWarnings && result.imageWarnings.length > 0) {
        result.imageWarnings.forEach((warning: string) => {
          message.warning(warning);
        });
      }
      
      // 根据置信度给出不同的提示
      if (result.confidence < 0.5) {
        message.error('识别置信度很低，建议重新拍摄或手动输入');
      } else if (result.confidence < 0.7) {
        message.warning('识别置信度较低，请仔细检查识别结果');
      }
      
    } catch (error: any) {
      setRecognitionStage('error');
      setRecognitionStatus('识别失败');
      
      markEnd('ocr-process');
      recordInteraction('ocr-recognition-error', interactionStart);
      
      // 增强错误处理
      if (error.response?.data) {
        const errorData = error.response.data;
        
        // 显示详细错误信息
        if (errorData.suggestions && Array.isArray(errorData.suggestions)) {
          const suggestionText = errorData.suggestions.join('；');
          message.error(`${errorData.error || 'OCR识别失败'}。建议：${suggestionText}`);
        } else {
          message.error(errorData.error || 'OCR识别失败');
        }
        
        // 显示支持的格式信息
        if (errorData.supportedFormats) {
          console.log('支持的格式:', errorData.supportedFormats);
        }
      } else {
        handleApiError(error, 'OCR识别失败');
      }
    } finally {
      setLoading(false);
      setUploadProgress(0);
      
      // 3秒后清除状态信息
      setTimeout(() => {
        if (recognitionStage === 'complete' || recognitionStage === 'error') {
          setRecognitionStatus('');
        }
      }, 3000);
    }
  };

  const handleSave = async () => {
    if (items.length === 0) {
      message.error('没有可保存的项目');
      return;
    }

    // 验证所有项目都有有效的数据
    const invalidItems = items.filter(item => 
      !item.name.trim() || item.unitPrice <= 0 || item.quantity <= 0
    );
    
    if (invalidItems.length > 0) {
      message.error('请确保所有项目都有有效的名称、单价和数量');
      return;
    }

    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

    setSaving(true);
    try {
      const response = await axios.post('/api/receipts/save', {
        imagePath: ocrResult?.imagePath,
        items: items.map(item => ({
          itemName: item.name.trim(), // 使用itemName字段匹配后端
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          totalPrice: item.totalPrice
        })),
        totalAmount
      });

      showSuccessMessage(`收据保存成功！收据ID: ${response.data.receiptId}`);
      notificationSuccess();
      
      // 重置表单和状态
      setFileList([]);
      setOcrResult(null);
      setItems([]);
      setRecognitionStatus('');
      setRecognitionStage('upload');
      
    } catch (error: any) {
      // 增强保存错误处理
      if (error.response?.data?.error) {
        message.error(`保存失败: ${error.response.data.error}`);
      } else {
        handleApiError(error, '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleItemChange = (key: string, field: string, value: any) => {
    const newItems = items.map(item => {
      if (item.key === key) {
        const updatedItem = { ...item, [field]: value };
        // 自动计算总价
        if (field === 'unitPrice' || field === 'quantity') {
          updatedItem.totalPrice = updatedItem.unitPrice * updatedItem.quantity;
        }
        return updatedItem;
      }
      return item;
    });
    setItems(newItems);
  };

  const addItem = () => {
    const newItem: ReceiptItem = {
      key: Date.now().toString(),
      name: '',
      unitPrice: 0,
      quantity: 1,
      totalPrice: 0
    };
    setItems([...items, newItem]);
  };

  const removeItem = (key: string) => {
    if (items.length <= 1) {
      message.warning('至少需要保留一个项目');
      return;
    }
    setItems(items.filter(item => item.key !== key));
  };

  const resetForm = () => {
    setFileList([]);
    setOcrResult(null);
    setItems([]);
    setRecognitionStatus('');
    setRecognitionStage('upload');
    setUploadProgress(0);
    message.info('已重置表单');
  };

  const getConfidenceColor = (confidence: number) => {
    // Handle both 0-1 and 0-100 formats
    const normalizedConfidence = confidence > 1 ? confidence : confidence * 100;
    if (normalizedConfidence >= 80) return 'success';
    if (normalizedConfidence >= 60) return 'warning';
    return 'error';
  };

  const columns = [
    {
      title: '商品名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: ReceiptItem) => (
        <Input
          value={text}
          onChange={(e) => handleItemChange(record.key!, 'name', e.target.value)}
          placeholder="请输入商品名称"
          status={!text.trim() ? 'error' : ''}
        />
      ),
    },
    {
      title: '单价 (¥)',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 120,
      render: (value: number, record: ReceiptItem) => (
        <InputNumber
          value={value}
          onChange={(val) => handleItemChange(record.key!, 'unitPrice', val || 0)}
          min={0}
          precision={2}
          style={{ width: '100%' }}
          status={value <= 0 ? 'error' : ''}
        />
      ),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      render: (value: number, record: ReceiptItem) => (
        <InputNumber
          value={value}
          onChange={(val) => handleItemChange(record.key!, 'quantity', val || 1)}
          min={1}
          style={{ width: '100%' }}
          status={value <= 0 ? 'error' : ''}
        />
      ),
    },
    {
      title: '总价 (¥)',
      dataIndex: 'totalPrice',
      key: 'totalPrice',
      width: 120,
      render: (value: number) => (
        <span style={{ fontWeight: 'bold', color: value > 0 ? '#52c41a' : '#ff4d4f' }}>
          {value.toFixed(2)}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: ReceiptItem) => (
        <Tooltip title="删除此项目">
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeItem(record.key!)}
            disabled={items.length <= 1}
          />
        </Tooltip>
      ),
    },
  ];

  const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <div>
      <Title level={2}>收据识别</Title>

      <Card 
        title="上传收据图片" 
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <Button onClick={resetForm} disabled={loading || saving}>
              重置
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            message="Claude OCR 智能识别"
            description="使用 AWS Bedrock Claude 模型进行高精度收据识别。支持 JPG、PNG、GIF 格式图片，文件大小不超过 10MB。为获得最佳识别效果，请确保图片清晰、光线充足。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <Upload.Dragger {...uploadProps} style={{ padding: '20px' }}>
            <p className="ant-upload-drag-icon">
              <UploadOutlined style={{ fontSize: '48px', color: '#1890ff' }} />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">支持单个文件上传，仅支持图片格式</p>
          </Upload.Dragger>
          
          {loading && (
            <div>
              <Progress 
                percent={uploadProgress} 
                status={recognitionStage === 'error' ? 'exception' : 'active'}
                strokeColor={recognitionStage === 'error' ? '#ff4d4f' : '#1890ff'}
                showInfo={true}
              />
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <Spin spinning={recognitionStage !== 'error'} /> 
                <span style={{ marginLeft: 8, color: recognitionStage === 'error' ? '#ff4d4f' : '#1890ff' }}>
                  {recognitionStatus}
                </span>
              </div>
              {recognitionStage === 'processing' && (
                <Alert
                  message="正在使用 AWS Bedrock Claude 进行智能识别"
                  description="Claude 模型正在分析您的收据图片，这可能需要几秒钟时间。请耐心等待..."
                  type="info"
                  showIcon
                  style={{ marginTop: 12 }}
                />
              )}
            </div>
          )}
          
          <Button 
            type="primary" 
            size="large"
            onClick={handleOCR}
            loading={loading}
            disabled={fileList.length === 0}
            block
            icon={loading ? undefined : <CheckCircleOutlined />}
          >
            {loading ? 
              (recognitionStage === 'upload' ? '上传中...' :
               recognitionStage === 'processing' ? 'Claude 识别中...' :
               recognitionStage === 'analyzing' ? '解析结果中...' : '识别中...') 
              : '开始 Claude 智能识别'}
          </Button>
        </Space>
      </Card>

      {ocrResult && (
        <Card 
          title={
            <Space>
              <span>Claude OCR 识别结果</span>
              <Tag color={getConfidenceColor(ocrResult.confidence * 100)}>
                置信度: {(ocrResult.confidence * 100).toFixed(1)}%
              </Tag>
              {ocrResult.fallbackUsed && (
                <Tag color="orange">备用方案</Tag>
              )}
              {ocrResult.processingTime && (
                <Tag color="blue">
                  {(ocrResult.processingTime / 1000).toFixed(1)}秒
                </Tag>
              )}
            </Space>
          }
          style={{ marginBottom: 16 }}
          extra={
            <Space>
              {ocrResult.qualityAnalysis && (
                <Tag color={
                  ocrResult.qualityAnalysis.quality === 'excellent' ? 'green' :
                  ocrResult.qualityAnalysis.quality === 'good' ? 'blue' :
                  ocrResult.qualityAnalysis.quality === 'fair' ? 'orange' : 'red'
                }>
                  图像质量: {
                    ocrResult.qualityAnalysis.quality === 'excellent' ? '优秀' :
                    ocrResult.qualityAnalysis.quality === 'good' ? '良好' :
                    ocrResult.qualityAnalysis.quality === 'fair' ? '一般' : '较差'
                  }
                </Tag>
              )}
            </Space>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text strong>上传的图片:</Text>
              <div style={{ marginTop: 8 }}>
                <OptimizedImage
                  width={200}
                  src={`/uploads/${ocrResult.imagePath}`}
                  alt="收据图片"
                  maxWidth={400}
                  maxHeight={300}
                  quality={0.8}
                  lazy={false}
                  style={{ border: '1px solid #d9d9d9', borderRadius: 4 }}
                  onLoad={() => recordInteraction('image-loaded')}
                  onError={(error) => console.warn('图片加载失败:', error)}
                />
              </div>
            </div>
            
            {/* Claude 识别信息 */}
            <div>
              <Text strong>Claude 识别信息:</Text>
              <div style={{ marginTop: 8 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div>
                    <Text type="secondary">识别引擎: </Text>
                    <Text>{ocrResult.fallbackUsed ? 'Tesseract.js (备用方案)' : 'AWS Bedrock Claude'}</Text>
                  </div>
                  <div>
                    <Text type="secondary">识别置信度: </Text>
                    <Text strong style={{ color: getConfidenceColor(ocrResult.confidence * 100) === 'success' ? '#52c41a' : 
                                              getConfidenceColor(ocrResult.confidence * 100) === 'warning' ? '#faad14' : '#ff4d4f' }}>
                      {(ocrResult.confidence * 100).toFixed(1)}%
                    </Text>
                  </div>
                  {ocrResult.processingTime && (
                    <div>
                      <Text type="secondary">处理时间: </Text>
                      <Text>{(ocrResult.processingTime / 1000).toFixed(1)} 秒</Text>
                    </div>
                  )}
                  <div>
                    <Text type="secondary">识别项目数: </Text>
                    <Text>{ocrResult.parsedItems.length} 个</Text>
                  </div>
                </Space>
              </div>
            </div>

            {/* 图像质量分析 */}
            {ocrResult.qualityAnalysis && (
              <div>
                <Text strong>图像质量分析:</Text>
                <div style={{ marginTop: 8 }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Text type="secondary">质量评级: </Text>
                      <Tag color={
                        ocrResult.qualityAnalysis.quality === 'excellent' ? 'green' :
                        ocrResult.qualityAnalysis.quality === 'good' ? 'blue' :
                        ocrResult.qualityAnalysis.quality === 'fair' ? 'orange' : 'red'
                      }>
                        {ocrResult.qualityAnalysis.quality === 'excellent' ? '优秀' :
                         ocrResult.qualityAnalysis.quality === 'good' ? '良好' :
                         ocrResult.qualityAnalysis.quality === 'fair' ? '一般' : '较差'}
                      </Tag>
                      <Text type="secondary" style={{ marginLeft: 8 }}>
                        ({ocrResult.qualityAnalysis.score.toFixed(1)}/100)
                      </Text>
                    </div>
                    {ocrResult.qualityAnalysis.metadata && (
                      <div>
                        <Text type="secondary">图像信息: </Text>
                        <Text>{ocrResult.qualityAnalysis.metadata.dimensions}, {ocrResult.qualityAnalysis.metadata.format.toUpperCase()}</Text>
                      </div>
                    )}
                    {ocrResult.qualityAnalysis.suggestions.length > 0 && (
                      <div>
                        <Text type="secondary">优化建议: </Text>
                        <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                          {ocrResult.qualityAnalysis.suggestions.map((suggestion, index) => (
                            <li key={index}>
                              <Text type="secondary" style={{ fontSize: '12px' }}>{suggestion}</Text>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Space>
                </div>
              </div>
            )}

            {/* 警告信息 */}
            {ocrResult.fallbackUsed && (
              <Alert
                message="使用了备用识别方案"
                description={ocrResult.message || 'AWS Bedrock Claude 服务暂时不可用，已使用 Tesseract.js 进行识别。请仔细检查识别结果的准确性。'}
                type="warning"
                showIcon
              />
            )}

            {ocrResult.qualityWarning && (
              <Alert
                message="图像质量提醒"
                description={ocrResult.qualityWarning}
                type="warning"
                showIcon
              />
            )}

            {ocrResult.suggestedTotal && (
              <Alert
                message={`Claude 建议总金额: ¥${ocrResult.suggestedTotal.toFixed(2)}`}
                description="这是 Claude 模型根据识别结果计算的建议总金额，请与实际收据核对。"
                type="info"
                showIcon
              />
            )}
          </Space>
        </Card>
      )}

      {items.length > 0 && (
        <Card 
          title={
            <Space>
              <span>编辑识别结果</span>
              <Tag color="blue">{items.length} 个项目</Tag>
            </Space>
          }
          extra={
            <Space>
              <Tooltip title="添加新项目">
                <Button 
                  icon={<PlusOutlined />} 
                  onClick={addItem}
                  disabled={saving}
                >
                  添加项目
                </Button>
              </Tooltip>
              <Button 
                type="primary" 
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saving}
                disabled={items.some(item => !item.name.trim() || item.unitPrice <= 0 || item.quantity <= 0)}
              >
                {saving ? '保存中...' : '保存收据'}
              </Button>
            </Space>
          }
        >
          <Alert
            message="编辑提示"
            description="请仔细检查识别结果，确保商品名称、单价和数量正确。红色边框表示需要修正的字段。"
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <ResponsiveMobileTable
            columns={columns}
            dataSource={items}
            pagination={false}
            size={isMobile ? 'small' : 'middle'}
            bordered={!isMobile}
            footer={() => (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '8px 0',
                flexDirection: isMobile ? 'column' : 'row',
                gap: isMobile ? '8px' : '0'
              }}>
                <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ textAlign: isMobile ? 'center' : 'left' }}>
                  <Text>共 {items.length} 个项目</Text>
                  {ocrResult?.suggestedTotal && (
                    <Text type="secondary">
                      (建议总额: ¥{ocrResult.suggestedTotal.toFixed(2)})
                    </Text>
                  )}
                </Space>
                <Text strong style={{ fontSize: isMobile ? '18px' : '16px', color: '#1890ff' }}>
                  总计: ¥{totalAmount.toFixed(2)}
                </Text>
              </div>
            )}
            mobileCardRender={(record, index) => (
              <div key={record.key} className="mobile-card-item">
                <div className="mobile-card-header">
                  <div className="mobile-card-title">
                    <Input
                      value={record.name}
                      onChange={(e) => handleItemChange(record.key!, 'name', e.target.value)}
                      placeholder="请输入商品名称"
                      status={!record.name.trim() ? 'error' : ''}
                      style={{ fontWeight: 'bold' }}
                    />
                  </div>
                  <div className="mobile-card-actions">
                    <Tooltip title="删除此项目">
                      <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          removeItem(record.key!);
                          lightImpact();
                        }}
                        disabled={items.length <= 1}
                        size="small"
                      />
                    </Tooltip>
                  </div>
                </div>
                
                <div className="mobile-card-content">
                  <div className="mobile-card-field">
                    <div className="mobile-card-label">单价 (¥)</div>
                    <InputNumber
                      value={record.unitPrice}
                      onChange={(val) => handleItemChange(record.key!, 'unitPrice', val || 0)}
                      min={0}
                      precision={2}
                      style={{ width: '100%' }}
                      status={record.unitPrice <= 0 ? 'error' : ''}
                    />
                  </div>
                  
                  <div className="mobile-card-field">
                    <div className="mobile-card-label">数量</div>
                    <InputNumber
                      value={record.quantity}
                      onChange={(val) => handleItemChange(record.key!, 'quantity', val || 1)}
                      min={1}
                      style={{ width: '100%' }}
                      status={record.quantity <= 0 ? 'error' : ''}
                    />
                  </div>
                  
                  <div className="mobile-card-field" style={{ gridColumn: '1 / -1' }}>
                    <div className="mobile-card-label">总价 (¥)</div>
                    <div className="mobile-card-value">
                      <span style={{ 
                        fontWeight: 'bold', 
                        color: record.totalPrice > 0 ? '#52c41a' : '#ff4d4f',
                        fontSize: '18px'
                      }}>
                        {record.totalPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          />
        </Card>
      )}
    </div>
  );
};

export default ReceiptOCR;
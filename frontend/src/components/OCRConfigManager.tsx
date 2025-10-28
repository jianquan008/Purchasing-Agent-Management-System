import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Button,
  Select,
  Space,
  Alert,
  Divider,
  Typography,
  Spin,
  message,
  Row,
  Col,
  Switch,
  Slider,
  Tabs,
  Collapse,
  Tag,
  Tooltip
} from 'antd';
import {
  SettingOutlined,
  ExperimentOutlined,
  SaveOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  EditOutlined,
  CheckCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { handleApiError, showSuccessMessage } from '../utils/errorHandler';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { Panel } = Collapse;

interface OCRConfig {
  imageProcessing: {
    maxWidth: number;
    maxHeight: number;
    quality: number;
    format: 'jpeg' | 'png' | 'webp';
    enhanceForOCR: boolean;
    preserveAspectRatio: boolean;
  };
  recognition: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    timeoutMs: number;
    confidenceThreshold: number;
    enableFallback: boolean;
  };
  validation: {
    maxItemNameLength: number;
    minPrice: number;
    maxPrice: number;
    priceTolerancePercent: number;
  };
}

interface TestResult {
  success: boolean;
  message: string;
  processingTime?: number;
  confidence?: number;
  itemsDetected?: number;
  error?: string;
}

const OCRConfigManager: React.FC = () => {
  const [form] = Form.useForm();
  const [promptForm] = Form.useForm();
  const [config, setConfig] = useState<OCRConfig | null>(null);
  const [promptTemplate, setPromptTemplate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [activeTab, setActiveTab] = useState('parameters');

  useEffect(() => {
    fetchConfig();
    fetchPromptTemplate();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/system/ocr/config');
      setConfig(response.data);
      form.setFieldsValue(response.data);
    } catch (error: any) {
      handleApiError(error, '获取OCR配置失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchPromptTemplate = async () => {
    try {
      const response = await axios.get('/api/system/ocr/prompt-template');
      setPromptTemplate(response.data.template);
      promptForm.setFieldsValue({ template: response.data.template });
    } catch (error: any) {
      handleApiError(error, '获取OCR提示词模板失败');
    }
  };

  const handleSaveConfig = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      
      await axios.post('/api/system/ocr/config', values);
      showSuccessMessage('OCR配置保存成功');
      setConfig(values);
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查配置参数');
        return;
      }
      handleApiError(error, '保存OCR配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrompt = async () => {
    try {
      const values = await promptForm.validateFields();
      setSaving(true);
      
      await axios.post('/api/system/ocr/prompt-template', values);
      showSuccessMessage('OCR提示词模板保存成功');
      setPromptTemplate(values.template);
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查提示词模板');
        return;
      }
      handleApiError(error, '保存OCR提示词模板失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const configValues = form.getFieldsValue();
      const response = await axios.post('/api/system/ocr/test', {
        config: configValues
      });
      
      setTestResult(response.data);
      
      if (response.data.success) {
        message.success('OCR配置测试成功');
      } else {
        message.error('OCR配置测试失败');
      }
    } catch (error: any) {
      const errorResult: TestResult = {
        success: false,
        message: 'OCR配置测试失败',
        error: error.response?.data?.error || error.message
      };
      setTestResult(errorResult);
      handleApiError(error, '测试OCR配置失败');
    } finally {
      setTesting(false);
    }
  };

  const renderTestResult = () => {
    if (!testResult) return null;

    return (
      <Alert
        type={testResult.success ? 'success' : 'error'}
        message={testResult.message}
        description={
          testResult.success ? (
            <div>
              <p>处理时间: {testResult.processingTime}ms</p>
              <p>识别置信度: {(testResult.confidence || 0) * 100}%</p>
              <p>检测到商品数量: {testResult.itemsDetected}</p>
            </div>
          ) : (
            testResult.error
          )
        }
        style={{ marginTop: 16 }}
        showIcon
      />
    );
  };

  const renderParametersTab = () => (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSaveConfig}
    >
      <Collapse defaultActiveKey={['imageProcessing', 'recognition']}>
        <Panel 
          header="图像处理参数" 
          key="imageProcessing"
          extra={<SettingOutlined />}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label={
                  <Space>
                    最大宽度 (像素)
                    <Tooltip title="图像处理时的最大宽度，过大会影响处理速度">
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                name={['imageProcessing', 'maxWidth']}
                rules={[{ required: true, message: '请输入最大宽度' }]}
              >
                <InputNumber min={512} max={4096} step={256} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label={
                  <Space>
                    最大高度 (像素)
                    <Tooltip title="图像处理时的最大高度，过大会影响处理速度">
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                name={['imageProcessing', 'maxHeight']}
                rules={[{ required: true, message: '请输入最大高度' }]}
              >
                <InputNumber min={512} max={4096} step={256} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="图像质量"
                name={['imageProcessing', 'quality']}
                rules={[{ required: true, message: '请设置图像质量' }]}
              >
                <Slider
                  min={60}
                  max={100}
                  marks={{
                    60: '60%',
                    75: '75%',
                    85: '85%',
                    95: '95%',
                    100: '100%'
                  }}
                  tooltip={{ formatter: (value) => `${value}%` }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="输出格式"
                name={['imageProcessing', 'format']}
                rules={[{ required: true, message: '请选择输出格式' }]}
              >
                <Select>
                  <Option value="jpeg">JPEG (推荐)</Option>
                  <Option value="png">PNG</Option>
                  <Option value="webp">WebP</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="OCR增强"
                name={['imageProcessing', 'enhanceForOCR']}
                valuePropName="checked"
              >
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="保持宽高比"
                name={['imageProcessing', 'preserveAspectRatio']}
                valuePropName="checked"
              >
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        <Panel 
          header="识别参数" 
          key="recognition"
          extra={<ExperimentOutlined />}
        >
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label={
                  <Space>
                    最大重试次数
                    <Tooltip title="API调用失败时的最大重试次数">
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                name={['recognition', 'maxRetries']}
                rules={[{ required: true, message: '请输入最大重试次数' }]}
              >
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label={
                  <Space>
                    基础延迟 (毫秒)
                    <Tooltip title="重试之间的基础延迟时间">
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                name={['recognition', 'baseDelay']}
                rules={[{ required: true, message: '请输入基础延迟' }]}
              >
                <InputNumber min={1000} max={10000} step={500} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label={
                  <Space>
                    超时时间 (毫秒)
                    <Tooltip title="单次API调用的超时时间">
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                name={['recognition', 'timeoutMs']}
                rules={[{ required: true, message: '请输入超时时间' }]}
              >
                <InputNumber min={30000} max={300000} step={10000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="置信度阈值"
                name={['recognition', 'confidenceThreshold']}
                rules={[{ required: true, message: '请设置置信度阈值' }]}
              >
                <Slider
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  marks={{
                    0.1: '10%',
                    0.5: '50%',
                    0.7: '70%',
                    0.9: '90%',
                    1.0: '100%'
                  }}
                  tooltip={{ formatter: (value) => `${(value! * 100).toFixed(0)}%` }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="启用降级服务"
                name={['recognition', 'enableFallback']}
                valuePropName="checked"
              >
                <Switch 
                  checkedChildren="开启" 
                  unCheckedChildren="关闭"
                />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        <Panel 
          header="数据验证参数" 
          key="validation"
          extra={<CheckCircleOutlined />}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="商品名称最大长度"
                name={['validation', 'maxItemNameLength']}
                rules={[{ required: true, message: '请输入最大长度' }]}
              >
                <InputNumber min={10} max={200} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="价格容差百分比"
                name={['validation', 'priceTolerancePercent']}
                rules={[{ required: true, message: '请输入价格容差' }]}
              >
                <InputNumber min={0.1} max={10} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="最小价格"
                name={['validation', 'minPrice']}
                rules={[{ required: true, message: '请输入最小价格' }]}
              >
                <InputNumber min={0.01} max={1} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="最大价格"
                name={['validation', 'maxPrice']}
                rules={[{ required: true, message: '请输入最大价格' }]}
              >
                <InputNumber min={1000} max={999999} step={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Panel>
      </Collapse>

      <div style={{ marginTop: 24 }}>
        <Space>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveConfig}
            loading={saving}
          >
            保存配置
          </Button>
          <Button
            icon={<ExperimentOutlined />}
            onClick={handleTest}
            loading={testing}
          >
            测试配置
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchConfig}
            loading={loading}
          >
            重置配置
          </Button>
        </Space>
      </div>

      {renderTestResult()}
    </Form>
  );

  const renderPromptTab = () => (
    <Form
      form={promptForm}
      layout="vertical"
      onFinish={handleSavePrompt}
    >
      <Alert
        message="提示词模板说明"
        description="这是发送给Claude模型的提示词模板，用于指导模型如何识别和解析收据图片。请谨慎修改，错误的提示词可能导致识别准确率下降。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Form.Item
        label={
          <Space>
            <EditOutlined />
            Claude提示词模板
          </Space>
        }
        name="template"
        rules={[{ required: true, message: '请输入提示词模板' }]}
      >
        <TextArea
          rows={20}
          placeholder="输入Claude提示词模板..."
          style={{ fontFamily: 'monospace' }}
        />
      </Form.Item>

      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSavePrompt}
            loading={saving}
          >
            保存模板
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchPromptTemplate}
          >
            重置模板
          </Button>
        </Space>
      </div>

      <Card title="模板变量说明" size="small">
        <Row gutter={[16, 8]}>
          <Col span={8}>
            <Tag color="blue">itemName</Tag>
            <Text type="secondary">商品名称</Text>
          </Col>
          <Col span={8}>
            <Tag color="green">unitPrice</Tag>
            <Text type="secondary">单价</Text>
          </Col>
          <Col span={8}>
            <Tag color="orange">quantity</Tag>
            <Text type="secondary">数量</Text>
          </Col>
          <Col span={8}>
            <Tag color="red">totalPrice</Tag>
            <Text type="secondary">小计金额</Text>
          </Col>
          <Col span={8}>
            <Tag color="purple">totalAmount</Tag>
            <Text type="secondary">总金额</Text>
          </Col>
          <Col span={8}>
            <Tag color="cyan">confidence</Tag>
            <Text type="secondary">置信度</Text>
          </Col>
        </Row>
      </Card>
    </Form>
  );

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>加载OCR配置...</div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <SettingOutlined />
          OCR参数配置
        </Space>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'parameters',
            label: '参数配置',
            children: renderParametersTab()
          },
          {
            key: 'prompt',
            label: '提示词模板',
            children: renderPromptTab()
          }
        ]}
      />
    </Card>
  );
};

export default OCRConfigManager;
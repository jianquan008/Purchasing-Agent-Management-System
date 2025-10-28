import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Select,
  Space,
  Alert,
  Divider,
  Typography,
  Spin,
  message,
  Modal,
  Descriptions,
  Tag,
  Row,
  Col
} from 'antd';
import {
  CloudOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  ExperimentOutlined,
  SaveOutlined,
  EyeInvisibleOutlined,
  EyeOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { handleApiError, showSuccessMessage } from '../utils/errorHandler';

const { Title, Text } = Typography;
const { Option } = Select;

interface AWSConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bedrockModelId: string;
  isConfigured: boolean;
}

interface ModelInfo {
  modelId: string;
  modelName?: string;
  providerName?: string;
  inputModalities?: string[];
  outputModalities?: string[];
}

interface TestResult {
  success: boolean;
  message: string;
  error?: string;
  details?: {
    region: string;
    modelsCount: number;
    modelExists: boolean;
    modelId: string;
  };
}

const AWSConfigManager: React.FC = () => {
  const [form] = Form.useForm();
  const [config, setConfig] = useState<AWSConfig | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [claudeModels, setClaudeModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // AWS区域选项
  const awsRegions = [
    { value: 'us-east-1', label: 'US East (N. Virginia)' },
    { value: 'us-west-2', label: 'US West (Oregon)' },
    { value: 'eu-west-1', label: 'Europe (Ireland)' },
    { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
    { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' }
  ];

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/system/aws/config');
      setConfig(response.data);
      
      // 设置表单初始值
      form.setFieldsValue({
        region: response.data.region,
        bedrockModelId: response.data.bedrockModelId
      });
      
      // 如果已配置，尝试加载模型列表
      if (response.data.isConfigured) {
        fetchModels();
      }
    } catch (error: any) {
      handleApiError(error, '获取AWS配置失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const response = await axios.get('/api/system/aws/models');
      setModels(response.data.allModels || []);
      setClaudeModels(response.data.claudeModels || []);
    } catch (error: any) {
      handleApiError(error, '获取模型列表失败');
    } finally {
      setLoadingModels(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const values = form.getFieldsValue();
      const response = await axios.post('/api/system/aws/test', values);
      setTestResult(response.data);
      
      if (response.data.success) {
        message.success('AWS配置测试成功');
        // 测试成功后重新获取模型列表
        fetchModels();
      } else {
        message.error('AWS配置测试失败');
      }
    } catch (error: any) {
      const errorResult: TestResult = {
        success: false,
        message: 'AWS配置测试失败',
        error: error.response?.data?.error || error.message
      };
      setTestResult(errorResult);
      handleApiError(error, '测试AWS配置失败');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      
      await axios.post('/api/system/aws/config', values);
      showSuccessMessage('AWS配置保存成功');
      
      // 重新获取配置
      fetchConfig();
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请填写所有必需字段');
        return;
      }
      handleApiError(error, '保存AWS配置失败');
    } finally {
      setSaving(false);
    }
  };

  const renderTestResult = () => {
    if (!testResult) return null;

    return (
      <Alert
        type={testResult.success ? 'success' : 'error'}
        message={testResult.message}
        description={
          testResult.success && testResult.details ? (
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="区域">
                {testResult.details.region}
              </Descriptions.Item>
              <Descriptions.Item label="可用模型数量">
                {testResult.details.modelsCount}
              </Descriptions.Item>
              <Descriptions.Item label="指定模型状态">
                <Tag color={testResult.details.modelExists ? 'green' : 'red'}>
                  {testResult.details.modelExists ? '可用' : '不可用'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="模型ID">
                {testResult.details.modelId}
              </Descriptions.Item>
            </Descriptions>
          ) : (
            testResult.error
          )
        }
        style={{ marginTop: 16 }}
        showIcon
      />
    );
  };

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>加载AWS配置...</div>
        </div>
      </Card>
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card
        title={
          <Space>
            <CloudOutlined />
            AWS Bedrock 配置
          </Space>
        }
        extra={
          config?.isConfigured ? (
            <Tag color="green" icon={<CheckCircleOutlined />}>
              已配置
            </Tag>
          ) : (
            <Tag color="red" icon={<ExclamationCircleOutlined />}>
              未配置
            </Tag>
          )
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="AWS区域"
                name="region"
                rules={[{ required: true, message: '请选择AWS区域' }]}
              >
                <Select placeholder="选择AWS区域">
                  {awsRegions.map(region => (
                    <Option key={region.value} value={region.value}>
                      {region.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Bedrock模型ID"
                name="bedrockModelId"
                rules={[{ required: true, message: '请输入Bedrock模型ID' }]}
              >
                <Select
                  placeholder="选择或输入模型ID"
                  showSearch
                  allowClear
                  loading={loadingModels}
                  dropdownRender={menu => (
                    <div>
                      {menu}
                      <Divider style={{ margin: '8px 0' }} />
                      <div style={{ padding: '8px', color: '#666' }}>
                        <Text type="secondary">
                          推荐使用Claude模型进行OCR识别
                        </Text>
                      </div>
                    </div>
                  )}
                >
                  <Option value="anthropic.claude-3-sonnet-20240229-v1:0">
                    Claude 3 Sonnet (推荐)
                  </Option>
                  <Option value="anthropic.claude-3-haiku-20240307-v1:0">
                    Claude 3 Haiku (快速)
                  </Option>
                  <Option value="anthropic.claude-3-opus-20240229-v1:0">
                    Claude 3 Opus (高精度)
                  </Option>
                  {claudeModels.map(model => (
                    <Option key={model.modelId} value={model.modelId}>
                      {model.modelName || model.modelId}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Access Key ID"
                name="accessKeyId"
                rules={[{ required: true, message: '请输入Access Key ID' }]}
              >
                <Input.Password
                  placeholder="输入AWS Access Key ID"
                  visibilityToggle={{
                    visible: showSecrets,
                    onVisibleChange: setShowSecrets
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Secret Access Key"
                name="secretAccessKey"
                rules={[{ required: true, message: '请输入Secret Access Key' }]}
              >
                <Input.Password
                  placeholder="输入AWS Secret Access Key"
                  visibilityToggle={{
                    visible: showSecrets,
                    onVisibleChange: setShowSecrets
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saving}
              >
                保存配置
              </Button>
              <Button
                icon={<ExperimentOutlined />}
                onClick={handleTest}
                loading={testing}
              >
                测试连接
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchModels}
                loading={loadingModels}
                disabled={!config?.isConfigured}
              >
                刷新模型列表
              </Button>
              <Button
                type="text"
                icon={showSecrets ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                onClick={() => setShowSecrets(!showSecrets)}
              >
                {showSecrets ? '隐藏' : '显示'}密钥
              </Button>
            </Space>
          </Form.Item>
        </Form>

        {renderTestResult()}
      </Card>

      {/* 模型信息卡片 */}
      {claudeModels.length > 0 && (
        <Card title="可用的Claude模型" size="small">
          <Row gutter={[16, 16]}>
            {claudeModels.slice(0, 6).map(model => (
              <Col span={8} key={model.modelId}>
                <Card size="small" hoverable>
                  <div style={{ marginBottom: 8 }}>
                    <Text strong>{model.modelName || model.modelId}</Text>
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {model.modelId}
                    </Text>
                  </div>
                  {model.providerName && (
                    <Tag>{model.providerName}</Tag>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
          {claudeModels.length > 6 && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Text type="secondary">
                还有 {claudeModels.length - 6} 个模型...
              </Text>
            </div>
          )}
        </Card>
      )}

      {/* 配置说明 */}
      <Card title="配置说明" size="small">
        <Space direction="vertical">
          <div>
            <Text strong>1. AWS区域：</Text>
            <Text>选择离您最近的AWS区域以获得最佳性能</Text>
          </div>
          <div>
            <Text strong>2. 访问密钥：</Text>
            <Text>需要具有Bedrock服务访问权限的IAM用户密钥</Text>
          </div>
          <div>
            <Text strong>3. 模型选择：</Text>
            <Text>推荐使用Claude 3 Sonnet，在准确性和速度之间取得良好平衡</Text>
          </div>
          <div>
            <Text strong>4. 安全提示：</Text>
            <Text type="warning">配置信息将加密存储，请妥善保管您的AWS凭据</Text>
          </div>
        </Space>
      </Card>
    </Space>
  );
};

export default AWSConfigManager;
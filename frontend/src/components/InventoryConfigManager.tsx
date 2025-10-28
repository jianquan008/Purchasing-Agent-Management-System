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
  Tabs,
  Table,
  Tag,
  Modal,
  ColorPicker,
  Popconfirm,
  Tooltip,
  List
} from 'antd';
import {
  ShopOutlined,
  SettingOutlined,
  SaveOutlined,
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TagOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  BellOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';
import { handleApiError, showSuccessMessage } from '../utils/errorHandler';

const { Title, Text } = Typography;
const { Option } = Select;

interface InventoryConfig {
  alertThresholds: {
    globalLowStockThreshold: number;
    globalOutOfStockThreshold: number;
    enableGlobalAlerts: boolean;
    enableItemSpecificAlerts: boolean;
  };
  autoRestock: {
    enabled: boolean;
    defaultRestockQuantity: number;
    restockTriggerThreshold: number;
    enableEmailNotifications: boolean;
    notificationEmails: string[];
  };
  display: {
    defaultPageSize: number;
    showLowStockFirst: boolean;
    highlightCriticalItems: boolean;
    showStockValue: boolean;
    defaultSortField: string;
    defaultSortOrder: 'asc' | 'desc';
  };
  validation: {
    maxItemNameLength: number;
    minStockQuantity: number;
    maxStockQuantity: number;
    requireCategory: boolean;
    requireTags: boolean;
  };
}

interface Category {
  id: number;
  name: string;
  description: string;
  color: string;
}

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface ReportConfig {
  reports: Array<{
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    schedule: string;
    recipients: string[];
    filters: any;
  }>;
  exportFormats: string[];
  defaultFormat: string;
  autoExport: boolean;
  exportPath: string;
}

const InventoryConfigManager: React.FC = () => {
  const [configForm] = Form.useForm();
  const [categoryForm] = Form.useForm();
  const [tagForm] = Form.useForm();
  const [reportForm] = Form.useForm();
  
  const [config, setConfig] = useState<InventoryConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [reportConfig, setReportConfig] = useState<ReportConfig | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

  useEffect(() => {
    fetchAllConfigs();
  }, []);

  const fetchAllConfigs = async () => {
    setLoading(true);
    try {
      const [configRes, categoriesRes, tagsRes, reportRes] = await Promise.all([
        axios.get('/api/system/inventory/config'),
        axios.get('/api/system/inventory/categories'),
        axios.get('/api/system/inventory/tags'),
        axios.get('/api/system/inventory/report-config')
      ]);
      
      setConfig(configRes.data);
      setCategories(categoriesRes.data);
      setTags(tagsRes.data);
      setReportConfig(reportRes.data);
      
      configForm.setFieldsValue(configRes.data);
      reportForm.setFieldsValue(reportRes.data);
    } catch (error: any) {
      handleApiError(error, '获取库存配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      const values = await configForm.validateFields();
      setSaving(true);
      
      await axios.post('/api/system/inventory/config', values);
      showSuccessMessage('库存配置保存成功');
      setConfig(values);
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查配置参数');
        return;
      }
      handleApiError(error, '保存库存配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCategories = async () => {
    try {
      setSaving(true);
      await axios.post('/api/system/inventory/categories', { categories });
      showSuccessMessage('库存分类保存成功');
    } catch (error: any) {
      handleApiError(error, '保存库存分类失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTags = async () => {
    try {
      setSaving(true);
      await axios.post('/api/system/inventory/tags', { tags });
      showSuccessMessage('库存标签保存成功');
    } catch (error: any) {
      handleApiError(error, '保存库存标签失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveReportConfig = async () => {
    try {
      const values = await reportForm.validateFields();
      setSaving(true);
      
      await axios.post('/api/system/inventory/report-config', values);
      showSuccessMessage('库存报表配置保存成功');
      setReportConfig(values);
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查报表配置');
        return;
      }
      handleApiError(error, '保存库存报表配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async () => {
    try {
      const values = await categoryForm.validateFields();
      const newCategory: Category = {
        id: Date.now(),
        name: values.name,
        description: values.description,
        color: values.color
      };
      
      setCategories([...categories, newCategory]);
      setCategoryModalVisible(false);
      categoryForm.resetFields();
      message.success('分类添加成功');
    } catch (error) {
      message.error('请填写完整的分类信息');
    }
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    categoryForm.setFieldsValue(category);
    setCategoryModalVisible(true);
  };

  const handleUpdateCategory = async () => {
    try {
      const values = await categoryForm.validateFields();
      const updatedCategories = categories.map(cat =>
        cat.id === editingCategory?.id ? { ...cat, ...values } : cat
      );
      
      setCategories(updatedCategories);
      setCategoryModalVisible(false);
      setEditingCategory(null);
      categoryForm.resetFields();
      message.success('分类更新成功');
    } catch (error) {
      message.error('请填写完整的分类信息');
    }
  };

  const handleDeleteCategory = (id: number) => {
    setCategories(categories.filter(cat => cat.id !== id));
    message.success('分类删除成功');
  };

  const handleAddTag = async () => {
    try {
      const values = await tagForm.validateFields();
      const newTag: Tag = {
        id: Date.now(),
        name: values.name,
        color: values.color
      };
      
      setTags([...tags, newTag]);
      setTagModalVisible(false);
      tagForm.resetFields();
      message.success('标签添加成功');
    } catch (error) {
      message.error('请填写完整的标签信息');
    }
  };

  const handleEditTag = (tag: Tag) => {
    setEditingTag(tag);
    tagForm.setFieldsValue(tag);
    setTagModalVisible(true);
  };

  const handleUpdateTag = async () => {
    try {
      const values = await tagForm.validateFields();
      const updatedTags = tags.map(tag =>
        tag.id === editingTag?.id ? { ...tag, ...values } : tag
      );
      
      setTags(updatedTags);
      setTagModalVisible(false);
      setEditingTag(null);
      tagForm.resetFields();
      message.success('标签更新成功');
    } catch (error) {
      message.error('请填写完整的标签信息');
    }
  };

  const handleDeleteTag = (id: number) => {
    setTags(tags.filter(tag => tag.id !== id));
    message.success('标签删除成功');
  };

  const categoryColumns: ColumnsType<Category> = [
    {
      title: '分类名称',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          <div
            style={{
              width: 16,
              height: 16,
              backgroundColor: record.color,
              borderRadius: 2
            }}
          />
          {text}
        </Space>
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description'
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditCategory(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个分类吗？"
            onConfirm={() => handleDeleteCategory(record.id)}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const renderGeneralTab = () => (
    <Form
      form={configForm}
      layout="vertical"
      onFinish={handleSaveConfig}
    >
      <Card title="库存警告设置" size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label={
                <Space>
                  全局低库存阈值
                  <Tooltip title="当库存数量低于此值时显示警告">
                    <InfoCircleOutlined />
                  </Tooltip>
                </Space>
              }
              name={['alertThresholds', 'globalLowStockThreshold']}
              rules={[{ required: true, message: '请输入低库存阈值' }]}
            >
              <InputNumber min={0} max={1000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="缺货阈值"
              name={['alertThresholds', 'globalOutOfStockThreshold']}
              rules={[{ required: true, message: '请输入缺货阈值' }]}
            >
              <InputNumber min={0} max={10} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="启用全局警告"
              name={['alertThresholds', 'enableGlobalAlerts']}
              valuePropName="checked"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="启用单品警告"
              name={['alertThresholds', 'enableItemSpecificAlerts']}
              valuePropName="checked"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <Card title="自动补货设置" size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label="启用自动补货"
              name={['autoRestock', 'enabled']}
              valuePropName="checked"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="默认补货数量"
              name={['autoRestock', 'defaultRestockQuantity']}
              rules={[{ required: true, message: '请输入默认补货数量' }]}
            >
              <InputNumber min={1} max={10000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="补货触发阈值"
              name={['autoRestock', 'restockTriggerThreshold']}
              rules={[{ required: true, message: '请输入补货触发阈值' }]}
            >
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="启用邮件通知"
          name={['autoRestock', 'enableEmailNotifications']}
          valuePropName="checked"
        >
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
      </Card>

      <Card title="显示设置" size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label="默认页面大小"
              name={['display', 'defaultPageSize']}
              rules={[{ required: true, message: '请选择页面大小' }]}
            >
              <Select>
                <Option value={10}>10条/页</Option>
                <Option value={20}>20条/页</Option>
                <Option value={50}>50条/页</Option>
                <Option value={100}>100条/页</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="默认排序字段"
              name={['display', 'defaultSortField']}
              rules={[{ required: true, message: '请选择排序字段' }]}
            >
              <Select>
                <Option value="item_name">商品名称</Option>
                <Option value="current_stock">库存数量</Option>
                <Option value="unit_price">单价</Option>
                <Option value="last_updated">更新时间</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="排序方向"
              name={['display', 'defaultSortOrder']}
              rules={[{ required: true, message: '请选择排序方向' }]}
            >
              <Select>
                <Option value="asc">升序</Option>
                <Option value="desc">降序</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label="优先显示低库存"
              name={['display', 'showLowStockFirst']}
              valuePropName="checked"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="高亮关键商品"
              name={['display', 'highlightCriticalItems']}
              valuePropName="checked"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="显示库存价值"
              name={['display', 'showStockValue']}
              valuePropName="checked"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <div style={{ textAlign: 'right' }}>
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
            icon={<ReloadOutlined />}
            onClick={fetchAllConfigs}
            loading={loading}
          >
            重置配置
          </Button>
        </Space>
      </div>
    </Form>
  );

  const renderCategoriesTab = () => (
    <div>
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingCategory(null);
              categoryForm.resetFields();
              setCategoryModalVisible(true);
            }}
          >
            添加分类
          </Button>
          <Button
            icon={<SaveOutlined />}
            onClick={handleSaveCategories}
            loading={saving}
          >
            保存分类
          </Button>
        </Space>
      </div>

      <Table
        columns={categoryColumns}
        dataSource={categories}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingCategory ? '编辑分类' : '添加分类'}
        open={categoryModalVisible}
        onOk={editingCategory ? handleUpdateCategory : handleAddCategory}
        onCancel={() => {
          setCategoryModalVisible(false);
          setEditingCategory(null);
          categoryForm.resetFields();
        }}
      >
        <Form form={categoryForm} layout="vertical">
          <Form.Item
            label="分类名称"
            name="name"
            rules={[{ required: true, message: '请输入分类名称' }]}
          >
            <Input placeholder="输入分类名称" />
          </Form.Item>
          <Form.Item
            label="分类描述"
            name="description"
            rules={[{ required: true, message: '请输入分类描述' }]}
          >
            <Input placeholder="输入分类描述" />
          </Form.Item>
          <Form.Item
            label="分类颜色"
            name="color"
            rules={[{ required: true, message: '请选择分类颜色' }]}
          >
            <ColorPicker showText />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );

  const renderTagsTab = () => (
    <div>
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingTag(null);
              tagForm.resetFields();
              setTagModalVisible(true);
            }}
          >
            添加标签
          </Button>
          <Button
            icon={<SaveOutlined />}
            onClick={handleSaveTags}
            loading={saving}
          >
            保存标签
          </Button>
        </Space>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tags.map(tag => (
          <Tag
            key={tag.id}
            color={tag.color}
            style={{ 
              marginBottom: 8,
              padding: '4px 8px',
              cursor: 'pointer',
              position: 'relative'
            }}
            onClick={() => handleEditTag(tag)}
          >
            {tag.name}
            <Popconfirm
              title="确定要删除这个标签吗？"
              onConfirm={(e) => {
                e?.stopPropagation();
                handleDeleteTag(tag.id);
              }}
              onCancel={(e) => e?.stopPropagation()}
            >
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                style={{ 
                  marginLeft: 4,
                  padding: 0,
                  width: 16,
                  height: 16,
                  minWidth: 16
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </Popconfirm>
          </Tag>
        ))}
      </div>

      <Modal
        title={editingTag ? '编辑标签' : '添加标签'}
        open={tagModalVisible}
        onOk={editingTag ? handleUpdateTag : handleAddTag}
        onCancel={() => {
          setTagModalVisible(false);
          setEditingTag(null);
          tagForm.resetFields();
        }}
      >
        <Form form={tagForm} layout="vertical">
          <Form.Item
            label="标签名称"
            name="name"
            rules={[{ required: true, message: '请输入标签名称' }]}
          >
            <Input placeholder="输入标签名称" />
          </Form.Item>
          <Form.Item
            label="标签颜色"
            name="color"
            rules={[{ required: true, message: '请选择标签颜色' }]}
          >
            <ColorPicker showText />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );

  const renderReportsTab = () => (
    <Form
      form={reportForm}
      layout="vertical"
      onFinish={handleSaveReportConfig}
    >
      <Alert
        message="库存报表配置"
        description="配置自动生成的库存报表类型、频率和接收人员。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card title="报表设置" size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label="默认导出格式"
              name="defaultFormat"
              rules={[{ required: true, message: '请选择默认格式' }]}
            >
              <Select>
                <Option value="excel">Excel</Option>
                <Option value="csv">CSV</Option>
                <Option value="pdf">PDF</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="自动导出"
              name="autoExport"
              valuePropName="checked"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="导出路径"
              name="exportPath"
              rules={[{ required: true, message: '请输入导出路径' }]}
            >
              <Input placeholder="./exports" />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <div style={{ textAlign: 'right' }}>
        <Space>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveReportConfig}
            loading={saving}
          >
            保存报表配置
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchAllConfigs}
            loading={loading}
          >
            重置配置
          </Button>
        </Space>
      </div>
    </Form>
  );

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>加载库存配置...</div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <ShopOutlined />
          库存管理配置
        </Space>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'general',
            label: (
              <Space>
                <SettingOutlined />
                常规设置
              </Space>
            ),
            children: renderGeneralTab()
          },
          {
            key: 'categories',
            label: (
              <Space>
                <AppstoreOutlined />
                分类管理
              </Space>
            ),
            children: renderCategoriesTab()
          },
          {
            key: 'tags',
            label: (
              <Space>
                <TagOutlined />
                标签管理
              </Space>
            ),
            children: renderTagsTab()
          },
          {
            key: 'reports',
            label: (
              <Space>
                <BarChartOutlined />
                报表配置
              </Space>
            ),
            children: renderReportsTab()
          }
        ]}
      />
    </Card>
  );
};

export default InventoryConfigManager;
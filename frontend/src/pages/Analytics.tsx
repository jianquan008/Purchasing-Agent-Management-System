import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  DatePicker,
  Select,
  Spin,
  Typography,
  Statistic,
  Table,
  Space,
  Button,
  Alert,
  Tabs,
  Empty,
  Tag
} from 'antd';
import {
  LineChartOutlined,
  BarChartOutlined,
  PieChartOutlined,
  RiseOutlined,
  ShoppingOutlined,
  UserOutlined,
  CalendarOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { handleApiError } from '../utils/errorHandler';
import TrendChart from '../components/charts/TrendChart';
import PieChart from '../components/charts/PieChart';
import BarChart from '../components/charts/BarChart';
import HeatmapChart from '../components/charts/HeatmapChart';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;
const { TabPane } = Tabs;

interface TrendData {
  period: string;
  receiptCount: number;
  totalAmount: number;
  avgAmount: number;
  uniqueUsers: number;
}

interface ItemFrequencyData {
  itemName: string;
  purchaseFrequency: number;
  totalQuantity: number;
  totalValue: number;
  avgUnitPrice: number;
  minUnitPrice: number;
  maxUnitPrice: number;
  purchasedByUsers: number;
  firstPurchase: string;
  lastPurchase: string;
  priceVariation: number;
}

interface SeasonalData {
  monthly: Array<{
    month: number;
    monthName: string;
    receiptCount: number;
    totalAmount: number;
    avgAmount: number;
    totalQuantity: number;
    uniqueItems: number;
  }>;
  quarterly: Array<{
    quarter: number;
    quarterName: string;
    receiptCount: number;
    totalAmount: number;
    avgAmount: number;
    totalQuantity: number;
  }>;
  weekday: Array<{
    weekday: number;
    weekdayName: string;
    receiptCount: number;
    totalAmount: number;
    avgAmount: number;
  }>;
}

interface UserBehaviorData {
  username: string;
  role: string;
  totalReceipts: number;
  totalSpent: number;
  avgPerReceipt: number;
  minReceipt: number;
  maxReceipt: number;
  totalItemsPurchased: number;
  uniqueItems: number;
  firstPurchase: string;
  lastPurchase: string;
  activeDays: number;
  avgItemsPerReceipt: string;
}

interface SummaryData {
  period: {
    startDate: string;
    endDate: string;
  };
  basicStats: {
    totalReceipts: number;
    activeUsers: number;
    uniqueItems: number;
    totalAmount: number;
    avgReceiptAmount: number;
    totalQuantity: number;
    avgUnitPrice: number;
  };
  topItems: Array<{
    itemName: string;
    frequency: number;
    totalQuantity: number;
    totalValue: number;
  }>;
  topUsers: Array<{
    username: string;
    receiptCount: number;
    totalSpent: number;
  }>;
  recentTrends: Array<{
    date: string;
    receiptCount: number;
    dailyAmount: number;
  }>;
}

const Analytics: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [period, setPeriod] = useState<string>('month');
  const [activeTab, setActiveTab] = useState<string>('summary');
  
  // 数据状态
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [trendsData, setTrendsData] = useState<{
    amountTrends: TrendData[];
    quantityTrends: any[];
  } | null>(null);
  const [itemFrequencyData, setItemFrequencyData] = useState<ItemFrequencyData[]>([]);
  const [seasonalData, setSeasonalData] = useState<SeasonalData | null>(null);
  const [userBehaviorData, setUserBehaviorData] = useState<UserBehaviorData[]>([]);

  useEffect(() => {
    if (activeTab === 'summary') {
      fetchSummaryData();
    } else if (activeTab === 'trends') {
      fetchTrendsData();
    } else if (activeTab === 'items') {
      fetchItemFrequencyData();
    } else if (activeTab === 'seasonal') {
      fetchSeasonalData();
    } else if (activeTab === 'users') {
      fetchUserBehaviorData();
    }
  }, [activeTab, dateRange, period]);

  const getDateRangeParams = () => {
    if (!dateRange) return {};
    return {
      startDate: dateRange[0].format('YYYY-MM-DD'),
      endDate: dateRange[1].format('YYYY-MM-DD')
    };
  };

  const fetchSummaryData = async () => {
    setLoading(true);
    try {
      const params = getDateRangeParams();
      const response = await axios.get('/api/analytics/summary', { params });
      setSummaryData(response.data);
    } catch (error) {
      handleApiError(error as any, '获取综合分析数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrendsData = async () => {
    setLoading(true);
    try {
      const params = { ...getDateRangeParams(), period };
      const response = await axios.get('/api/analytics/trends', { params });
      setTrendsData(response.data);
    } catch (error) {
      handleApiError(error as any, '获取趋势分析数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchItemFrequencyData = async () => {
    setLoading(true);
    try {
      const params = { ...getDateRangeParams(), limit: 20 };
      const response = await axios.get('/api/analytics/item-frequency', { params });
      setItemFrequencyData(response.data.items || []);
    } catch (error) {
      handleApiError(error as any, '获取商品频率数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchSeasonalData = async () => {
    setLoading(true);
    try {
      const params = dateRange ? { year: dateRange[0].year() } : {};
      const response = await axios.get('/api/analytics/seasonal-patterns', { params });
      setSeasonalData(response.data);
    } catch (error) {
      handleApiError(error as any, '获取季节性数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserBehaviorData = async () => {
    setLoading(true);
    try {
      const params = { ...getDateRangeParams(), limit: 10 };
      const response = await axios.get('/api/analytics/user-behavior', { params });
      setUserBehaviorData(response.data.users || []);
    } catch (error) {
      handleApiError(error as any, '获取用户行为数据失败');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = () => {
    if (activeTab === 'summary') {
      fetchSummaryData();
    } else if (activeTab === 'trends') {
      fetchTrendsData();
    } else if (activeTab === 'items') {
      fetchItemFrequencyData();
    } else if (activeTab === 'seasonal') {
      fetchSeasonalData();
    } else if (activeTab === 'users') {
      fetchUserBehaviorData();
    }
  };

  // 表格列定义
  const itemFrequencyColumns = [
    {
      title: '商品名称',
      dataIndex: 'itemName',
      key: 'itemName',
      width: 200,
    },
    {
      title: '采购次数',
      dataIndex: 'purchaseFrequency',
      key: 'purchaseFrequency',
      sorter: (a: ItemFrequencyData, b: ItemFrequencyData) => a.purchaseFrequency - b.purchaseFrequency,
      render: (value: number) => <Tag color="blue">{value}</Tag>
    },
    {
      title: '总数量',
      dataIndex: 'totalQuantity',
      key: 'totalQuantity',
      sorter: (a: ItemFrequencyData, b: ItemFrequencyData) => a.totalQuantity - b.totalQuantity,
    },
    {
      title: '总价值',
      dataIndex: 'totalValue',
      key: 'totalValue',
      sorter: (a: ItemFrequencyData, b: ItemFrequencyData) => a.totalValue - b.totalValue,
      render: (value: number) => `¥${value.toFixed(2)}`
    },
    {
      title: '平均单价',
      dataIndex: 'avgUnitPrice',
      key: 'avgUnitPrice',
      render: (value: number) => `¥${value.toFixed(2)}`
    },
    {
      title: '价格区间',
      key: 'priceRange',
      render: (record: ItemFrequencyData) => (
        <span>
          ¥{record.minUnitPrice.toFixed(2)} - ¥{record.maxUnitPrice.toFixed(2)}
          {record.priceVariation > 0 && (
            <Tag color="orange" style={{ marginLeft: 8 }}>
              波动 ¥{record.priceVariation.toFixed(2)}
            </Tag>
          )}
        </span>
      )
    },
    {
      title: '采购用户数',
      dataIndex: 'purchasedByUsers',
      key: 'purchasedByUsers',
    }
  ];

  const userBehaviorColumns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'red' : 'blue'}>
          {role === 'admin' ? '管理员' : '普通用户'}
        </Tag>
      )
    },
    {
      title: '收据数量',
      dataIndex: 'totalReceipts',
      key: 'totalReceipts',
      sorter: (a: UserBehaviorData, b: UserBehaviorData) => a.totalReceipts - b.totalReceipts,
    },
    {
      title: '总消费',
      dataIndex: 'totalSpent',
      key: 'totalSpent',
      sorter: (a: UserBehaviorData, b: UserBehaviorData) => a.totalSpent - b.totalSpent,
      render: (value: number) => `¥${value.toFixed(2)}`
    },
    {
      title: '平均每单',
      dataIndex: 'avgPerReceipt',
      key: 'avgPerReceipt',
      render: (value: number) => `¥${value.toFixed(2)}`
    },
    {
      title: '购买商品种类',
      dataIndex: 'uniqueItems',
      key: 'uniqueItems',
    },
    {
      title: '活跃天数',
      dataIndex: 'activeDays',
      key: 'activeDays',
    },
    {
      title: '平均每单商品数',
      dataIndex: 'avgItemsPerReceipt',
      key: 'avgItemsPerReceipt',
    }
  ];

  const renderSummaryTab = () => (
    <div>
      {summaryData && (
        <>
          {/* 基础统计卡片 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="总收据数"
                  value={summaryData.basicStats.totalReceipts}
                  prefix={<ShoppingOutlined style={{ color: '#1890ff' }} />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="活跃用户"
                  value={summaryData.basicStats.activeUsers}
                  prefix={<UserOutlined style={{ color: '#52c41a' }} />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="商品种类"
                  value={summaryData.basicStats.uniqueItems}
                  prefix={<BarChartOutlined style={{ color: '#722ed1' }} />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="总金额"
                  value={summaryData.basicStats.totalAmount}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: '#fa541c' }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            {/* 热门商品饼图 */}
            <Col xs={24} lg={12}>
              <Card title="热门商品分布" extra={<PieChartOutlined />}>
                {summaryData.topItems.length > 0 ? (
                  <PieChart
                    data={summaryData.topItems.map(item => ({
                      name: item.itemName,
                      value: item.frequency
                    }))}
                    title="商品采购频率分布"
                    height={300}
                  />
                ) : (
                  <Empty description="暂无数据" />
                )}
              </Card>
            </Col>

            {/* 活跃用户柱状图 */}
            <Col xs={24} lg={12}>
              <Card title="用户消费排行" extra={<BarChartOutlined />}>
                {summaryData.topUsers.length > 0 ? (
                  <BarChart
                    data={summaryData.topUsers.map(user => ({
                      name: user.username,
                      value: user.totalSpent
                    }))}
                    title="用户消费金额排行"
                    height={300}
                    color="#52c41a"
                    yAxisName="消费金额 (¥)"
                  />
                ) : (
                  <Empty description="暂无数据" />
                )}
              </Card>
            </Col>
          </Row>

          {/* 热门商品详细列表 */}
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={12}>
              <Card title="热门商品详情" extra={<PieChartOutlined />}>
                {summaryData.topItems.length > 0 ? (
                  <div>
                    {summaryData.topItems.map((item, index) => (
                      <div key={item.itemName} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>
                            <Tag color="blue">{index + 1}</Tag>
                            {item.itemName}
                          </span>
                          <span>
                            <Text type="secondary">{item.frequency}次</Text>
                            <Text style={{ marginLeft: 8 }}>¥{item.totalValue.toFixed(2)}</Text>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty description="暂无数据" />
                )}
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card title="活跃用户详情" extra={<UserOutlined />}>
                {summaryData.topUsers.length > 0 ? (
                  <div>
                    {summaryData.topUsers.map((user, index) => (
                      <div key={user.username} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>
                            <Tag color="green">{index + 1}</Tag>
                            {user.username}
                          </span>
                          <span>
                            <Text type="secondary">{user.receiptCount}单</Text>
                            <Text style={{ marginLeft: 8 }}>¥{user.totalSpent.toFixed(2)}</Text>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty description="暂无数据" />
                )}
              </Card>
            </Col>
          </Row>

          {/* 最近趋势 */}
          {summaryData.recentTrends.length > 0 && (
            <Card title="最近7天趋势" style={{ marginTop: 16 }} extra={<RiseOutlined />}>
              <Row gutter={16}>
                {summaryData.recentTrends.map(trend => (
                  <Col key={trend.date} xs={24} sm={12} md={8} lg={6} xl={3}>
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        {dayjs(trend.date).format('MM-DD')}
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                        {trend.receiptCount}单
                      </div>
                      <div style={{ fontSize: '12px', color: '#1890ff' }}>
                        ¥{trend.dailyAmount.toFixed(0)}
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            </Card>
          )}
        </>
      )}
    </div>
  );

  const renderTrendsTab = () => (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col>
          <Select value={period} onChange={setPeriod} style={{ width: 120 }}>
            <Option value="day">按天</Option>
            <Option value="week">按周</Option>
            <Option value="month">按月</Option>
            <Option value="year">按年</Option>
          </Select>
        </Col>
      </Row>

      {trendsData && (
        <Row gutter={[16, 16]}>
          {/* 金额趋势图表 */}
          <Col span={24}>
            <Card title="采购金额趋势" extra={<LineChartOutlined />}>
              <TrendChart 
                data={trendsData.amountTrends}
                type="amount"
                title="采购金额趋势"
                height={400}
              />
            </Card>
          </Col>

          {/* 收据数量趋势图表 */}
          <Col span={12}>
            <Card title="收据数量趋势" extra={<BarChartOutlined />}>
              <TrendChart 
                data={trendsData.amountTrends}
                type="count"
                title="收据数量趋势"
                height={300}
              />
            </Card>
          </Col>

          {/* 活跃用户趋势图表 */}
          <Col span={12}>
            <Card title="活跃用户趋势" extra={<UserOutlined />}>
              <TrendChart 
                data={trendsData.amountTrends}
                type="users"
                title="活跃用户趋势"
                height={300}
              />
            </Card>
          </Col>

          {/* 数据表格 */}
          <Col span={24}>
            <Card title="详细数据" extra={<LineChartOutlined />}>
              {trendsData.amountTrends.length > 0 ? (
                <Table
                  dataSource={trendsData.amountTrends}
                  rowKey="period"
                  pagination={false}
                  size="small"
                  columns={[
                    { title: '时间段', dataIndex: 'period', key: 'period' },
                    { title: '收据数量', dataIndex: 'receiptCount', key: 'receiptCount' },
                    { 
                      title: '总金额', 
                      dataIndex: 'totalAmount', 
                      key: 'totalAmount',
                      render: (value: number) => `¥${value.toFixed(2)}`
                    },
                    { 
                      title: '平均金额', 
                      dataIndex: 'avgAmount', 
                      key: 'avgAmount',
                      render: (value: number) => `¥${value.toFixed(2)}`
                    },
                    { title: '活跃用户', dataIndex: 'uniqueUsers', key: 'uniqueUsers' }
                  ]}
                />
              ) : (
                <Empty description="暂无趋势数据" />
              )}
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );

  return (
    <div>
      {/* 页面标题和控制区域 */}
      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              <LineChartOutlined style={{ marginRight: 8 }} />
              数据分析
            </Title>
            <Text type="secondary">采购趋势分析和商品统计</Text>
          </Col>
          <Col>
            <Space>
              <RangePicker
                value={dateRange}
                onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                placeholder={['开始日期', '结束日期']}
                allowClear
              />
              <Button 
                icon={<ReloadOutlined />} 
                onClick={refreshData}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 主要内容区域 */}
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane 
            tab={
              <span>
                <BarChartOutlined />
                综合概览
              </span>
            } 
            key="summary"
          >
            <Spin spinning={loading}>
              {renderSummaryTab()}
            </Spin>
          </TabPane>

          <TabPane 
            tab={
              <span>
                <RiseOutlined />
                趋势分析
              </span>
            } 
            key="trends"
          >
            <Spin spinning={loading}>
              {renderTrendsTab()}
            </Spin>
          </TabPane>

          <TabPane 
            tab={
              <span>
                <ShoppingOutlined />
                商品分析
              </span>
            } 
            key="items"
          >
            <Spin spinning={loading}>
              <Row gutter={[16, 16]}>
                {/* 商品采购频率柱状图 */}
                <Col span={24}>
                  <Card title="商品采购频率排行" extra={<BarChartOutlined />}>
                    {itemFrequencyData.length > 0 ? (
                      <BarChart
                        data={itemFrequencyData.slice(0, 10).map(item => ({
                          name: item.itemName.length > 8 ? item.itemName.substring(0, 8) + '...' : item.itemName,
                          value: item.purchaseFrequency
                        }))}
                        title="商品采购频率 TOP 10"
                        height={400}
                        color="#722ed1"
                        yAxisName="采购次数"
                        horizontal={true}
                      />
                    ) : (
                      <Empty description="暂无商品数据" />
                    )}
                  </Card>
                </Col>

                {/* 商品价值分布饼图 */}
                <Col xs={24} lg={12}>
                  <Card title="商品价值分布" extra={<PieChartOutlined />}>
                    {itemFrequencyData.length > 0 ? (
                      <PieChart
                        data={itemFrequencyData.slice(0, 8).map(item => ({
                          name: item.itemName.length > 10 ? item.itemName.substring(0, 10) + '...' : item.itemName,
                          value: item.totalValue
                        }))}
                        title="商品总价值分布 TOP 8"
                        height={350}
                        showLegend={true}
                      />
                    ) : (
                      <Empty description="暂无商品数据" />
                    )}
                  </Card>
                </Col>

                {/* 商品数量分布柱状图 */}
                <Col xs={24} lg={12}>
                  <Card title="商品数量分布" extra={<BarChartOutlined />}>
                    {itemFrequencyData.length > 0 ? (
                      <BarChart
                        data={itemFrequencyData.slice(0, 8).map(item => ({
                          name: item.itemName.length > 6 ? item.itemName.substring(0, 6) + '...' : item.itemName,
                          value: item.totalQuantity
                        }))}
                        title="商品总数量 TOP 8"
                        height={350}
                        color="#fa541c"
                        yAxisName="总数量"
                      />
                    ) : (
                      <Empty description="暂无商品数据" />
                    )}
                  </Card>
                </Col>

                {/* 详细数据表格 */}
                <Col span={24}>
                  <Card title="商品详细数据" extra={<BarChartOutlined />}>
                    {itemFrequencyData.length > 0 ? (
                      <Table
                        dataSource={itemFrequencyData}
                        columns={itemFrequencyColumns}
                        rowKey="itemName"
                        pagination={{ pageSize: 10 }}
                        scroll={{ x: 800 }}
                      />
                    ) : (
                      <Empty description="暂无商品数据" />
                    )}
                  </Card>
                </Col>
              </Row>
            </Spin>
          </TabPane>

          <TabPane 
            tab={
              <span>
                <CalendarOutlined />
                季节性分析
              </span>
            } 
            key="seasonal"
          >
            <Spin spinning={loading}>
              {seasonalData && (
                <Row gutter={[16, 16]}>
                  {/* 月度采购金额趋势 */}
                  <Col span={24}>
                    <Card title="月度采购金额趋势" extra={<LineChartOutlined />}>
                      {seasonalData.monthly.length > 0 ? (
                        <TrendChart 
                          data={seasonalData.monthly.map(item => ({
                            period: item.monthName,
                            receiptCount: item.receiptCount,
                            totalAmount: item.totalAmount,
                            avgAmount: item.avgAmount,
                            uniqueUsers: 0 // 月度数据中没有用户信息
                          }))}
                          type="amount"
                          title="月度采购金额变化"
                          height={400}
                        />
                      ) : (
                        <Empty description="暂无月度数据" />
                      )}
                    </Card>
                  </Col>

                  {/* 季度对比柱状图 */}
                  <Col xs={24} lg={12}>
                    <Card title="季度采购对比" extra={<BarChartOutlined />}>
                      {seasonalData.quarterly.length > 0 ? (
                        <BarChart
                          data={seasonalData.quarterly.map(item => ({
                            name: item.quarterName,
                            value: item.totalAmount
                          }))}
                          title="季度采购金额对比"
                          height={350}
                          color="#1890ff"
                          yAxisName="采购金额 (¥)"
                        />
                      ) : (
                        <Empty description="暂无季度数据" />
                      )}
                    </Card>
                  </Col>

                  {/* 星期采购模式雷达图 */}
                  <Col xs={24} lg={12}>
                    <Card title="星期采购模式" extra={<BarChartOutlined />}>
                      {seasonalData.weekday.length > 0 ? (
                        <BarChart
                          data={seasonalData.weekday.map(item => ({
                            name: item.weekdayName,
                            value: item.totalAmount
                          }))}
                          title="星期采购金额分布"
                          height={350}
                          color="#52c41a"
                          yAxisName="采购金额 (¥)"
                        />
                      ) : (
                        <Empty description="暂无星期数据" />
                      )}
                    </Card>
                  </Col>

                  {/* 月度详细数据表格 */}
                  <Col span={24}>
                    <Card title="月度详细数据" extra={<LineChartOutlined />}>
                      {seasonalData.monthly.length > 0 ? (
                        <Table
                          dataSource={seasonalData.monthly}
                          rowKey="month"
                          pagination={false}
                          size="small"
                          columns={[
                            { title: '月份', dataIndex: 'monthName', key: 'monthName' },
                            { title: '收据数量', dataIndex: 'receiptCount', key: 'receiptCount' },
                            { 
                              title: '总金额', 
                              dataIndex: 'totalAmount', 
                              key: 'totalAmount',
                              render: (value: number) => `¥${value.toFixed(2)}`
                            },
                            { 
                              title: '平均金额', 
                              dataIndex: 'avgAmount', 
                              key: 'avgAmount',
                              render: (value: number) => `¥${value.toFixed(2)}`
                            },
                            { title: '商品种类', dataIndex: 'uniqueItems', key: 'uniqueItems' },
                            { title: '总数量', dataIndex: 'totalQuantity', key: 'totalQuantity' }
                          ]}
                        />
                      ) : (
                        <Empty description="暂无月度数据" />
                      )}
                    </Card>
                  </Col>

                  {/* 星期详细数据表格 */}
                  <Col span={24}>
                    <Card title="星期详细数据" extra={<BarChartOutlined />}>
                      {seasonalData.weekday.length > 0 ? (
                        <Table
                          dataSource={seasonalData.weekday}
                          rowKey="weekday"
                          pagination={false}
                          size="small"
                          columns={[
                            { title: '星期', dataIndex: 'weekdayName', key: 'weekdayName' },
                            { title: '收据数量', dataIndex: 'receiptCount', key: 'receiptCount' },
                            { 
                              title: '总金额', 
                              dataIndex: 'totalAmount', 
                              key: 'totalAmount',
                              render: (value: number) => `¥${value.toFixed(2)}`
                            },
                            { 
                              title: '平均金额', 
                              dataIndex: 'avgAmount', 
                              key: 'avgAmount',
                              render: (value: number) => `¥${value.toFixed(2)}`
                            }
                          ]}
                        />
                      ) : (
                        <Empty description="暂无星期数据" />
                      )}
                    </Card>
                  </Col>
                </Row>
              )}
            </Spin>
          </TabPane>

          <TabPane 
            tab={
              <span>
                <UserOutlined />
                用户行为
              </span>
            } 
            key="users"
          >
            <Spin spinning={loading}>
              <Row gutter={[16, 16]}>
                {/* 用户消费排行柱状图 */}
                <Col xs={24} lg={12}>
                  <Card title="用户消费排行" extra={<BarChartOutlined />}>
                    {userBehaviorData.length > 0 ? (
                      <BarChart
                        data={userBehaviorData.slice(0, 8).map(user => ({
                          name: user.username,
                          value: user.totalSpent
                        }))}
                        title="用户总消费排行 TOP 8"
                        height={350}
                        color="#1890ff"
                        yAxisName="消费金额 (¥)"
                        horizontal={true}
                      />
                    ) : (
                      <Empty description="暂无用户数据" />
                    )}
                  </Card>
                </Col>

                {/* 用户收据数量分布饼图 */}
                <Col xs={24} lg={12}>
                  <Card title="用户活跃度分布" extra={<PieChartOutlined />}>
                    {userBehaviorData.length > 0 ? (
                      <PieChart
                        data={userBehaviorData.slice(0, 8).map(user => ({
                          name: user.username,
                          value: user.totalReceipts
                        }))}
                        title="用户收据数量分布 TOP 8"
                        height={350}
                        showLegend={true}
                      />
                    ) : (
                      <Empty description="暂无用户数据" />
                    )}
                  </Card>
                </Col>

                {/* 用户平均消费柱状图 */}
                <Col xs={24} lg={12}>
                  <Card title="用户平均消费" extra={<BarChartOutlined />}>
                    {userBehaviorData.length > 0 ? (
                      <BarChart
                        data={userBehaviorData.slice(0, 8).map(user => ({
                          name: user.username,
                          value: user.avgPerReceipt
                        }))}
                        title="用户平均每单消费 TOP 8"
                        height={350}
                        color="#52c41a"
                        yAxisName="平均消费 (¥)"
                      />
                    ) : (
                      <Empty description="暂无用户数据" />
                    )}
                  </Card>
                </Col>

                {/* 用户商品种类多样性 */}
                <Col xs={24} lg={12}>
                  <Card title="用户购买多样性" extra={<BarChartOutlined />}>
                    {userBehaviorData.length > 0 ? (
                      <BarChart
                        data={userBehaviorData.slice(0, 8).map(user => ({
                          name: user.username,
                          value: user.uniqueItems
                        }))}
                        title="用户购买商品种类数 TOP 8"
                        height={350}
                        color="#722ed1"
                        yAxisName="商品种类数"
                      />
                    ) : (
                      <Empty description="暂无用户数据" />
                    )}
                  </Card>
                </Col>

                {/* 详细数据表格 */}
                <Col span={24}>
                  <Card title="用户详细行为数据" extra={<UserOutlined />}>
                    {userBehaviorData.length > 0 ? (
                      <Table
                        dataSource={userBehaviorData}
                        columns={userBehaviorColumns}
                        rowKey="username"
                        pagination={{ pageSize: 10 }}
                        scroll={{ x: 1000 }}
                      />
                    ) : (
                      <Empty description="暂无用户数据" />
                    )}
                  </Card>
                </Col>
              </Row>
            </Spin>
          </TabPane>
        </Tabs>
      </Card>

      {/* 提示信息 */}
      <Alert
        message="数据分析说明"
        description="数据分析功能提供采购趋势、商品频率、季节性模式和用户行为等多维度分析，帮助您更好地了解采购模式和优化决策。"
        type="info"
        showIcon
        style={{ marginTop: 16 }}
      />
    </div>
  );
};

export default Analytics;
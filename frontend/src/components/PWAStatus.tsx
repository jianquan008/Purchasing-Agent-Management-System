import React, { useState } from 'react';
import { 
  Button, 
  Badge, 
  Tooltip, 
  Modal, 
  Space, 
  Typography, 
  Alert,
  Switch,
  Divider,
  Card,
  Row,
  Col,
  Statistic
} from 'antd';
import {
  WifiOutlined,
  DownloadOutlined,
  SyncOutlined,
  BellOutlined,
  MobileOutlined,
  CloudDownloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { usePWA, useOfflineData, useInstallPrompt } from '../hooks/usePWA';

const { Text, Title } = Typography;

const PWAStatus: React.FC = () => {
  const [modalVisible, setModalVisible] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    Notification.permission === 'granted'
  );

  const {
    isOnline,
    canInstall,
    hasUpdate,
    isInstalled,
    isStandalone,
    installApp,
    updateApp,
    requestNotificationPermission,
    sendNotification
  } = usePWA();

  const {
    offlineQueue,
    syncOfflineData,
    clearOfflineQueue
  } = useOfflineData();

  const {
    showPrompt,
    install,
    dismissPrompt
  } = useInstallPrompt();

  const handleNotificationToggle = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      setNotificationsEnabled(granted);
      if (granted) {
        sendNotification('通知已启用', {
          body: '您将收到重要的应用通知',
          icon: '/favicon.ico'
        });
      }
    } else {
      setNotificationsEnabled(false);
    }
  };

  const getStatusColor = () => {
    if (!isOnline) return 'red';
    if (hasUpdate) return 'orange';
    if (offlineQueue.length > 0) return 'blue';
    return 'green';
  };

  const getStatusText = () => {
    if (!isOnline) return '离线模式';
    if (hasUpdate) return '有更新';
    if (offlineQueue.length > 0) return '同步中';
    return '在线';
  };

  return (
    <>
      {/* PWA状态指示器 */}
      <Tooltip title={`应用状态: ${getStatusText()}`}>
        <Badge 
          status={getStatusColor() as any} 
          dot
          onClick={() => setModalVisible(true)}
          style={{ cursor: 'pointer' }}
        >
          <Button 
            type="text" 
            icon={isOnline ? <WifiOutlined /> : <ExclamationCircleOutlined />}
            size="small"
          />
        </Badge>
      </Tooltip>

      {/* 安装提示 */}
      {showPrompt && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          left: 20,
          right: 20,
          background: '#1890ff',
          color: 'white',
          padding: 16,
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
              <MobileOutlined style={{ marginRight: 8 }} />
              安装代购管理系统
            </div>
            <div style={{ opacity: 0.9, fontSize: 12 }}>
              添加到主屏幕，获得更好的使用体验
            </div>
          </div>
          <Space>
            <Button 
              size="small"
              style={{ 
                background: 'rgba(255,255,255,0.2)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: 'white'
              }}
              onClick={install}
            >
              安装
            </Button>
            <Button 
              size="small"
              type="text"
              style={{ color: 'white' }}
              onClick={dismissPrompt}
            >
              ×
            </Button>
          </Space>
        </div>
      )}

      {/* PWA状态详情模态框 */}
      <Modal
        title={
          <Space>
            <MobileOutlined />
            应用状态
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={500}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* 连接状态 */}
          <Card size="small">
            <Row gutter={16} align="middle">
              <Col flex="auto">
                <Space>
                  {isOnline ? (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                  )}
                  <div>
                    <Text strong>网络状态</Text>
                    <br />
                    <Text type="secondary">
                      {isOnline ? '在线' : '离线'}
                    </Text>
                  </div>
                </Space>
              </Col>
              <Col>
                <Badge 
                  status={isOnline ? 'success' : 'error'} 
                  text={isOnline ? '已连接' : '已断开'}
                />
              </Col>
            </Row>
          </Card>

          {/* 安装状态 */}
          <Card size="small">
            <Row gutter={16} align="middle">
              <Col flex="auto">
                <Space>
                  <DownloadOutlined style={{ 
                    color: isInstalled ? '#52c41a' : '#1890ff' 
                  }} />
                  <div>
                    <Text strong>安装状态</Text>
                    <br />
                    <Text type="secondary">
                      {isInstalled ? '已安装' : '未安装'}
                      {isStandalone && ' (独立模式)'}
                    </Text>
                  </div>
                </Space>
              </Col>
              <Col>
                {canInstall && !isInstalled && (
                  <Button 
                    type="primary" 
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={async () => {
                      await installApp();
                      setModalVisible(false);
                    }}
                  >
                    安装应用
                  </Button>
                )}
                {isInstalled && (
                  <Badge status="success" text="已安装" />
                )}
              </Col>
            </Row>
          </Card>

          {/* 更新状态 */}
          {hasUpdate && (
            <Card size="small">
              <Row gutter={16} align="middle">
                <Col flex="auto">
                  <Space>
                    <CloudDownloadOutlined style={{ color: '#faad14' }} />
                    <div>
                      <Text strong>应用更新</Text>
                      <br />
                      <Text type="secondary">发现新版本</Text>
                    </div>
                  </Space>
                </Col>
                <Col>
                  <Button 
                    type="primary" 
                    size="small"
                    icon={<SyncOutlined />}
                    onClick={() => {
                      updateApp();
                      setModalVisible(false);
                    }}
                  >
                    立即更新
                  </Button>
                </Col>
              </Row>
            </Card>
          )}

          {/* 离线队列 */}
          {offlineQueue.length > 0 && (
            <Card size="small">
              <Row gutter={16} align="middle">
                <Col flex="auto">
                  <Space>
                    <SyncOutlined style={{ color: '#1890ff' }} />
                    <div>
                      <Text strong>离线数据</Text>
                      <br />
                      <Text type="secondary">
                        {offlineQueue.length} 项待同步
                      </Text>
                    </div>
                  </Space>
                </Col>
                <Col>
                  <Space>
                    <Button 
                      size="small"
                      onClick={syncOfflineData}
                      disabled={!isOnline}
                    >
                      同步
                    </Button>
                    <Button 
                      size="small"
                      danger
                      onClick={clearOfflineQueue}
                    >
                      清空
                    </Button>
                  </Space>
                </Col>
              </Row>
            </Card>
          )}

          <Divider />

          {/* 通知设置 */}
          <Card size="small">
            <Row gutter={16} align="middle">
              <Col flex="auto">
                <Space>
                  <BellOutlined style={{ 
                    color: notificationsEnabled ? '#52c41a' : '#d9d9d9' 
                  }} />
                  <div>
                    <Text strong>推送通知</Text>
                    <br />
                    <Text type="secondary">
                      接收重要消息和更新提醒
                    </Text>
                  </div>
                </Space>
              </Col>
              <Col>
                <Switch
                  checked={notificationsEnabled}
                  onChange={handleNotificationToggle}
                  checkedChildren="开启"
                  unCheckedChildren="关闭"
                />
              </Col>
            </Row>
          </Card>

          {/* PWA功能说明 */}
          <Alert
            message="PWA功能"
            description={
              <div>
                <p>• <strong>离线访问</strong>：无网络时仍可使用基本功能</p>
                <p>• <strong>自动更新</strong>：后台自动检查并提示更新</p>
                <p>• <strong>推送通知</strong>：接收重要消息提醒</p>
                <p>• <strong>快速启动</strong>：从主屏幕直接启动应用</p>
              </div>
            }
            type="info"
            showIcon
          />
        </Space>
      </Modal>
    </>
  );
};

export default PWAStatus;
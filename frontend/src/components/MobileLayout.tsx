import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout,
  Button,
  Avatar,
  Dropdown,
  Space,
  Typography,
  message,
  Drawer,
  Menu,
  Badge
} from 'antd';
import {
  DashboardOutlined,
  ScanOutlined,
  InboxOutlined,
  HistoryOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuOutlined,
  SettingOutlined,
  LineChartOutlined,
  BellOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import NetworkStatus from './NetworkStatus';
import HelpModal from './HelpModal';
import PWAStatus from './PWAStatus';

const { Header, Content } = Layout;
const { Title } = Typography;

interface MobileLayoutProps {
  children?: React.ReactNode;
}

const MobileLayout: React.FC<MobileLayoutProps> = () => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // 模拟通知数量
    setNotificationCount(2);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setDrawerVisible(false);
  };

  const handleMenuClick = (path: string) => {
    navigate(path);
    setDrawerVisible(false);
  };

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表板',
    },
    {
      key: '/receipt-ocr',
      icon: <ScanOutlined />,
      label: '收据识别',
    },
    {
      key: '/inventory',
      icon: <InboxOutlined />,
      label: '库存管理',
    },
    {
      key: '/history',
      icon: <HistoryOutlined />,
      label: '历史单据',
    },
    {
      key: '/analytics',
      icon: <LineChartOutlined />,
      label: '数据分析',
    },
  ];

  if (isAdmin()) {
    menuItems.push(
      {
        key: '/users',
        icon: <UserOutlined />,
        label: '用户管理',
      },
      {
        key: '/system',
        icon: <SettingOutlined />,
        label: '系统管理',
      }
    );
  }

  const userMenuItems = [
    {
      key: 'help',
      icon: <BellOutlined />,
      label: '帮助中心',
      onClick: () => setHelpVisible(true),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  const getCurrentPageTitle = () => {
    const currentItem = menuItems.find(item => item.key === location.pathname);
    return currentItem?.label || '代购管理系统';
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <NetworkStatus />
      
      {/* 移动端顶部导航 */}
      <Header 
        style={{ 
          padding: '0 16px', 
          background: '#fff', 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <Space>
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setDrawerVisible(true)}
            style={{ fontSize: '18px' }}
          />
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>
            {getCurrentPageTitle()}
          </Title>
        </Space>
        
        <Space>
          <PWAStatus />
          <Badge count={notificationCount} size="small">
            <Button
              type="text"
              icon={<BellOutlined />}
              style={{ fontSize: '18px' }}
            />
          </Badge>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Avatar 
              icon={<UserOutlined />} 
              style={{ cursor: 'pointer' }}
              size="small"
            />
          </Dropdown>
        </Space>
      </Header>

      {/* 主内容区域 */}
      <Content style={{ 
        padding: '16px 12px', 
        background: '#f5f5f5',
        minHeight: 'calc(100vh - 64px - 60px)' // 减去header和底部导航高度
      }}>
        <Outlet />
      </Content>

      {/* 底部导航 */}
      <div className="mobile-nav">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-around',
          alignItems: 'center',
          height: '60px'
        }}>
          {menuItems.slice(0, 5).map(item => (
            <div
              key={item.key}
              className={`mobile-nav-item ${location.pathname === item.key ? 'active' : ''}`}
              onClick={() => handleMenuClick(item.key)}
              style={{ cursor: 'pointer' }}
            >
              <div className="mobile-nav-icon">
                {item.icon}
              </div>
              <div style={{ fontSize: '10px' }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 侧边抽屉菜单 */}
      <Drawer
        title={
          <Space>
            <Avatar icon={<UserOutlined />} size="small" />
            <span>{user?.username}</span>
          </Space>
        }
        placement="left"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width={280}
        styles={{
          body: { padding: 0 }
        }}
      >
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={[
            ...menuItems.map(item => ({
              ...item,
              onClick: () => handleMenuClick(item.key)
            })),
            { type: 'divider' },
            {
              key: 'help',
              icon: <BellOutlined />,
              label: '帮助中心',
              onClick: () => {
                setHelpVisible(true);
                setDrawerVisible(false);
              }
            },
            {
              key: 'logout',
              icon: <LogoutOutlined />,
              label: '退出登录',
              onClick: handleLogout,
              danger: true
            }
          ]}
          style={{ border: 'none' }}
        />
      </Drawer>

      {/* 帮助模态框 */}
      <HelpModal
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
      />
    </Layout>
  );
};

export default MobileLayout;
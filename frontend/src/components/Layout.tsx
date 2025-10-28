import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout,
  Menu,
  Button,
  Avatar,
  Dropdown,
  Space,
  Typography,
  FloatButton,
  message
} from 'antd';
import {
  DashboardOutlined,
  ScanOutlined,
  InboxOutlined,
  HistoryOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import NetworkStatus from './NetworkStatus';
import HelpModal from './HelpModal';
import MobileLayout from './MobileLayout';
import PWAStatus from './PWAStatus';
import { useKeyboardShortcuts, commonShortcuts } from '../hooks/useKeyboardShortcuts';
import { useIsMobile } from '../hooks/useMobileGestures';
import { 
  componentPreloader, 
  preloadByUserRole, 
  createPreloadingNavigationHandler,
  PAGE_COMPONENTS 
} from '../utils/componentPreloader';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile(768);

  // 根据用户角色预加载组件
  useEffect(() => {
    const timer = setTimeout(() => {
      preloadByUserRole(isAdmin()).catch(console.warn);
    }, 1000); // 延迟1秒后开始预加载，避免影响初始页面加载

    return () => clearTimeout(timer);
  }, [isAdmin]);

  // 快捷键支持
  useKeyboardShortcuts([
    {
      ...commonShortcuts.help,
      callback: () => setHelpVisible(true)
    },
    {
      ...commonShortcuts.refresh,
      callback: () => {
        window.location.reload();
      }
    },
    {
      key: '1',
      altKey: true,
      callback: () => navigate('/dashboard'),
      description: 'Alt+1 仪表板'
    },
    {
      key: '2',
      altKey: true,
      callback: () => navigate('/receipt-ocr'),
      description: 'Alt+2 收据识别'
    },
    {
      key: '3',
      altKey: true,
      callback: () => navigate('/inventory'),
      description: 'Alt+3 库存管理'
    },
    {
      key: '4',
      altKey: true,
      callback: () => navigate('/history'),
      description: 'Alt+4 历史单据'
    }
  ]);

  // 创建带预加载功能的菜单项
  const createMenuItem = (key: string, icon: React.ReactNode, label: string, componentName?: keyof typeof PAGE_COMPONENTS) => ({
    key,
    icon,
    label,
    onMouseEnter: componentName ? () => {
      componentPreloader.preload(componentName, PAGE_COMPONENTS[componentName]);
    } : undefined,
  });

  const menuItems = [
    createMenuItem('/dashboard', <DashboardOutlined />, '仪表板', 'Dashboard'),
    createMenuItem('/receipt-ocr', <ScanOutlined />, '收据识别', 'ReceiptOCR'),
    createMenuItem('/inventory', <InboxOutlined />, '库存管理', 'Inventory'),
    createMenuItem('/history', <HistoryOutlined />, '历史单据', 'History'),
    createMenuItem('/analytics', <LineChartOutlined />, '数据分析', 'Analytics'),
  ];

  if (isAdmin()) {
    menuItems.push(
      createMenuItem('/users', <UserOutlined />, '用户管理', 'UserManagement'),
      createMenuItem('/system', <SettingOutlined />, '系统管理', 'SystemManagement')
    );
  }

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userMenuItems = [
    {
      key: 'help',
      icon: <QuestionCircleOutlined />,
      label: '帮助中心',
      onClick: () => setHelpVisible(true),
    },
    {
      key: 'shortcuts',
      icon: <QuestionCircleOutlined />,
      label: '快捷键',
      onClick: () => {
        message.info('按 Ctrl+H 查看完整帮助信息');
      },
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

  // 在移动端使用移动端布局
  if (isMobile) {
    return <MobileLayout />;
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <NetworkStatus />
      <Sider trigger={null} collapsible collapsed={collapsed}>
        <div className="logo">
          {collapsed ? '代购' : '代购管理系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header style={{ 
          padding: '0 16px', 
          background: '#fff', 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '16px', width: 64, height: 64 }}
          />
          
          <Space>
            <PWAStatus />
            <span>欢迎，{user?.username}</span>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Avatar icon={<UserOutlined />} style={{ cursor: 'pointer' }} />
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: '24px 16px', padding: 24, background: '#fff', minHeight: 'calc(100vh - 112px)' }}>
          <Outlet />
        </Content>
      </Layout>

      {/* 浮动按钮 */}
      <FloatButton.Group
        trigger="hover"
        type="primary"
        style={{ right: 24 }}
        icon={<QuestionCircleOutlined />}
      >
        <FloatButton
          icon={<QuestionCircleOutlined />}
          tooltip="帮助中心 (Ctrl+H)"
          onClick={() => setHelpVisible(true)}
        />
        <FloatButton
          icon={<QuestionCircleOutlined />}
          tooltip="快捷键"
          onClick={() => message.info('按 Ctrl+H 查看完整快捷键列表')}
        />
      </FloatButton.Group>

      {/* 帮助模态框 */}
      <HelpModal
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
      />
    </Layout>
  );
};

export default AppLayout;
import React, { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import GlobalLoading from './components/GlobalLoading';
import { createLazyComponent } from './components/LazyWrapper';
import './services/pwaService'; // 初始化PWA服务

// 使用优化的懒加载组件创建函数
const Login = createLazyComponent(
  () => import('./pages/Login'),
  '登录页面加载中...',
  '登录页面加载失败，请检查网络连接'
);

const Dashboard = createLazyComponent(
  () => import('./pages/Dashboard'),
  '仪表板加载中...',
  '仪表板加载失败'
);

const ReceiptOCR = createLazyComponent(
  () => import('./pages/ReceiptOCR'),
  '收据识别页面加载中...',
  '收据识别页面加载失败'
);

const Inventory = createLazyComponent(
  () => import('./pages/Inventory'),
  '库存管理页面加载中...',
  '库存管理页面加载失败'
);

const History = createLazyComponent(
  () => import('./pages/History'),
  '历史记录页面加载中...',
  '历史记录页面加载失败'
);

const UserManagement = createLazyComponent(
  () => import('./pages/UserManagement'),
  '用户管理页面加载中...',
  '用户管理页面加载失败'
);

const SystemManagement = createLazyComponent(
  () => import('./pages/SystemManagement'),
  '系统管理页面加载中...',
  '系统管理页面加载失败'
);

const Analytics = createLazyComponent(
  () => import('./pages/Analytics'),
  '数据分析页面加载中...',
  '数据分析页面加载失败'
);

const AppContent: React.FC = () => {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Suspense fallback={<GlobalLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={
            <Suspense fallback={<GlobalLoading />}>
              <Dashboard />
            </Suspense>
          } />
          <Route path="receipt-ocr" element={
            <Suspense fallback={<GlobalLoading />}>
              <ReceiptOCR />
            </Suspense>
          } />
          <Route path="inventory" element={
            <Suspense fallback={<GlobalLoading />}>
              <Inventory />
            </Suspense>
          } />
          <Route path="history" element={
            <Suspense fallback={<GlobalLoading />}>
              <History />
            </Suspense>
          } />
          <Route path="users" element={
            <ProtectedRoute requireAdmin>
              <Suspense fallback={<GlobalLoading />}>
                <UserManagement />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="system" element={
            <ProtectedRoute requireAdmin>
              <Suspense fallback={<GlobalLoading />}>
                <SystemManagement />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="analytics" element={
            <Suspense fallback={<GlobalLoading />}>
              <Analytics />
            </Suspense>
          } />
        </Route>
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
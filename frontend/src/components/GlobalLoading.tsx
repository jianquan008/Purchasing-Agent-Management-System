import React from 'react';
import { Spin } from 'antd';

interface GlobalLoadingProps {
  loading?: boolean;
  tip?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

const GlobalLoading: React.FC<GlobalLoadingProps> = ({ 
  loading = true, 
  tip = '加载中...', 
  children,
  style
}) => {
  // 如果没有children，显示全屏加载
  if (!children) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '200px',
        width: '100%',
        ...style
      }}>
        <Spin size="large" tip={tip} />
      </div>
    );
  }

  // 如果有children，包装加载状态
  return (
    <Spin 
      spinning={loading} 
      tip={tip}
      size="large"
      style={{
        minHeight: '200px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style
      }}
    >
      {children}
    </Spin>
  );
};

export default GlobalLoading;
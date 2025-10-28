import React, { Suspense, ComponentType } from 'react';
import { Result, Button } from 'antd';
import GlobalLoading from './GlobalLoading';

interface LazyWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
}

interface LazyLoadErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class LazyLoadErrorBoundary extends React.Component<
  { children: React.ReactNode; errorFallback?: React.ReactNode },
  LazyLoadErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; errorFallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): LazyLoadErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('LazyLoad Error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.errorFallback) {
        return this.props.errorFallback;
      }

      return (
        <Result
          status="error"
          title="页面加载失败"
          subTitle="页面组件加载时出现错误，请重试"
          extra={
            <Button type="primary" onClick={this.handleRetry}>
              重新加载
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}

const LazyWrapper: React.FC<LazyWrapperProps> = ({ 
  children, 
  fallback = <GlobalLoading tip="页面加载中..." />,
  errorFallback 
}) => {
  return (
    <LazyLoadErrorBoundary errorFallback={errorFallback}>
      <Suspense fallback={fallback}>
        {children}
      </Suspense>
    </LazyLoadErrorBoundary>
  );
};

// 高阶组件：为懒加载组件提供统一的加载和错误处理
export const withLazyLoading = <P extends Record<string, any>>(
  Component: ComponentType<P>,
  loadingTip?: string,
  errorFallback?: React.ReactNode
) => {
  const LazyComponent = React.lazy(() => Promise.resolve({ default: Component }));
  
  return (props: P) => (
    <LazyWrapper 
      fallback={<GlobalLoading tip={loadingTip || '加载中...'} />}
      errorFallback={errorFallback}
    >
      <LazyComponent {...(props as any)} />
    </LazyWrapper>
  );
};

// 创建懒加载组件的工厂函数
export const createLazyComponent = (
  importFn: () => Promise<{ default: ComponentType<any> }>,
  loadingTip?: string,
  errorMessage?: string
) => {
  return React.lazy(() => 
    importFn().catch((error) => {
      console.error('Component import failed:', error);
      return {
        default: () => (
          <Result
            status="error"
            title="组件加载失败"
            subTitle={errorMessage || '页面组件加载时出现网络错误'}
            extra={
              <Button type="primary" onClick={() => window.location.reload()}>
                刷新页面
              </Button>
            }
          />
        )
      };
    })
  );
};

export default LazyWrapper;
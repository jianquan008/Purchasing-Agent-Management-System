import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Space, Tag, Tooltip, Empty, Spin } from 'antd';
import { EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import type { TableProps, TableColumnsType } from 'antd';

interface ResponsiveMobileTableProps<T = any> extends Omit<TableProps<T>, 'columns'> {
  columns: TableColumnsType<T>;
  mobileCardRender?: (record: T, index: number) => React.ReactNode;
  mobileBreakpoint?: number;
  showMobileCards?: boolean;
}

const ResponsiveMobileTable = <T extends Record<string, any>>({
  columns,
  dataSource = [],
  loading = false,
  mobileCardRender,
  mobileBreakpoint = 768,
  showMobileCards,
  ...tableProps
}: ResponsiveMobileTableProps<T>) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= mobileBreakpoint);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, [mobileBreakpoint]);

  const shouldShowMobileCards = showMobileCards !== undefined ? showMobileCards : isMobile;

  // 默认的移动端卡片渲染函数
  const defaultMobileCardRender = (record: T, index: number) => {
    const actionColumn = columns.find(col => col.key === 'action' || ('dataIndex' in col && col.dataIndex === 'action'));
    const otherColumns = columns.filter(col => col.key !== 'action' && !('dataIndex' in col && col.dataIndex === 'action'));

    return (
      <div key={record.key || record.id || index} className="mobile-card-item">
        <div className="mobile-card-header">
          <div className="mobile-card-title">
            {record.name || record.item_name || record.title || `项目 ${index + 1}`}
          </div>
          {actionColumn && (
            <div className="mobile-card-actions">
              {'render' in actionColumn && actionColumn.render ? actionColumn.render('', record, index) as React.ReactNode : null}
            </div>
          )}
        </div>
        
        <div className="mobile-card-content">
          {otherColumns.map((column, colIndex) => {
            if (!('dataIndex' in column) && !('render' in column)) return null;
            
            let value = '';
            let displayValue: React.ReactNode = '';
            
            if ('dataIndex' in column && column.dataIndex) {
              value = record[column.dataIndex as string];
              displayValue = value;
            }
            
            if ('render' in column && column.render) {
              displayValue = column.render(value, record, index) as React.ReactNode;
            }

            // 跳过标题字段，因为已经在header中显示
            if (('dataIndex' in column && column.dataIndex === 'name') || 
                ('dataIndex' in column && column.dataIndex === 'item_name') || 
                ('dataIndex' in column && column.dataIndex === 'title')) {
              return null;
            }

            return (
              <div key={colIndex} className="mobile-card-field">
                <div className="mobile-card-label">
                  {'title' in column ? column.title as string : ''}
                </div>
                <div className="mobile-card-value">
                  {displayValue}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="mobile-loading">
        <Spin size="large" />
        <div className="mobile-loading-text">加载中...</div>
      </div>
    );
  }

  if (!dataSource || dataSource.length === 0) {
    return (
      <div className="mobile-empty">
        <div className="mobile-empty-icon">📋</div>
        <div className="mobile-empty-text">暂无数据</div>
      </div>
    );
  }

  if (shouldShowMobileCards) {
    return (
      <div className="mobile-table-card">
        {dataSource.map((record, index) => 
          mobileCardRender ? 
            mobileCardRender(record, index) : 
            defaultMobileCardRender(record, index)
        )}
        
        {/* 移动端分页 */}
        {tableProps.pagination && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            marginTop: 16,
            padding: '0 16px'
          }}>
            {/* 这里可以添加移动端优化的分页组件 */}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="desktop-table">
      <Table
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        scroll={{ x: 'max-content' }}
        {...tableProps}
      />
    </div>
  );
};

export default ResponsiveMobileTable;
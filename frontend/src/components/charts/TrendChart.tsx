import React from 'react';
import ReactECharts from 'echarts-for-react';
import { Empty } from 'antd';

interface TrendData {
  period: string;
  receiptCount: number;
  totalAmount: number;
  avgAmount: number;
  uniqueUsers: number;
}

interface TrendChartProps {
  data: TrendData[];
  type: 'amount' | 'count' | 'users';
  title?: string;
  height?: number;
}

const TrendChart: React.FC<TrendChartProps> = ({ 
  data, 
  type, 
  title = '趋势图表',
  height = 300 
}) => {
  if (!data || data.length === 0) {
    return <Empty description="暂无数据" />;
  }

  const getOption = () => {
    const periods = data.map(item => item.period);
    
    let series: any[] = [];
    let yAxisConfig: any = {};
    
    switch (type) {
      case 'amount':
        series = [
          {
            name: '总金额',
            type: 'line',
            data: data.map(item => item.totalAmount.toFixed(2)),
            smooth: true,
            itemStyle: { color: '#1890ff' },
            areaStyle: { opacity: 0.3 }
          },
          {
            name: '平均金额',
            type: 'line',
            data: data.map(item => item.avgAmount.toFixed(2)),
            smooth: true,
            itemStyle: { color: '#52c41a' }
          }
        ];
        yAxisConfig = {
          name: '金额 (¥)',
          axisLabel: {
            formatter: '¥{value}'
          }
        };
        break;
        
      case 'count':
        series = [
          {
            name: '收据数量',
            type: 'bar',
            data: data.map(item => item.receiptCount),
            itemStyle: { color: '#722ed1' }
          }
        ];
        yAxisConfig = {
          name: '数量',
          axisLabel: {
            formatter: '{value}'
          }
        };
        break;
        
      case 'users':
        series = [
          {
            name: '活跃用户',
            type: 'line',
            data: data.map(item => item.uniqueUsers),
            smooth: true,
            itemStyle: { color: '#fa541c' },
            symbol: 'circle',
            symbolSize: 6
          }
        ];
        yAxisConfig = {
          name: '用户数',
          axisLabel: {
            formatter: '{value}'
          }
        };
        break;
    }

    return {
      title: {
        text: title,
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'normal'
        }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross'
        },
        formatter: (params: any) => {
          let result = `${params[0].axisValue}<br/>`;
          params.forEach((param: any) => {
            const value = type === 'amount' ? `¥${param.value}` : param.value;
            result += `${param.marker}${param.seriesName}: ${value}<br/>`;
          });
          return result;
        }
      },
      legend: {
        top: 30,
        data: series.map(s => s.name)
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: type === 'count',
        data: periods,
        axisLabel: {
          rotate: periods.length > 10 ? 45 : 0
        }
      },
      yAxis: {
        type: 'value',
        ...yAxisConfig
      },
      series: series,
      animation: true,
      animationDuration: 1000
    };
  };

  return (
    <ReactECharts
      option={getOption()}
      style={{ height: `${height}px`, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
};

export default TrendChart;
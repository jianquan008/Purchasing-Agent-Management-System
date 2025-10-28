import React from 'react';
import ReactECharts from 'echarts-for-react';
import { Empty } from 'antd';

interface BarData {
  name: string;
  value: number;
  itemStyle?: {
    color?: string;
  };
}

interface BarChartProps {
  data: BarData[];
  title?: string;
  height?: number;
  horizontal?: boolean;
  showValues?: boolean;
  color?: string;
  yAxisName?: string;
  xAxisName?: string;
}

const BarChart: React.FC<BarChartProps> = ({ 
  data, 
  title = '柱状图',
  height = 300,
  horizontal = false,
  showValues = true,
  color = '#1890ff',
  yAxisName,
  xAxisName
}) => {
  if (!data || data.length === 0) {
    return <Empty description="暂无数据" />;
  }

  const getOption = () => {
    const names = data.map(item => item.name);
    const values = data.map(item => item.value);

    const baseConfig = {
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
          type: 'shadow'
        },
        formatter: (params: any) => {
          const param = params[0];
          return `${param.name}<br/>${param.seriesName}: ${param.value}`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '15%',
        containLabel: true
      },
      series: [
        {
          name: title,
          type: 'bar',
          data: data.map(item => ({
            value: item.value,
            itemStyle: {
              color: item.itemStyle?.color || color
            }
          })),
          label: showValues ? {
            show: true,
            position: horizontal ? 'right' : 'top',
            formatter: '{c}'
          } : undefined,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ],
      animation: true,
      animationDuration: 1000,
      animationDelay: (idx: number) => idx * 100
    };

    if (horizontal) {
      return {
        ...baseConfig,
        xAxis: {
          type: 'value',
          name: xAxisName,
          axisLabel: {
            formatter: '{value}'
          }
        },
        yAxis: {
          type: 'category',
          name: yAxisName,
          data: names,
          axisLabel: {
            interval: 0,
            rotate: names.some(name => name.length > 6) ? 30 : 0
          }
        }
      };
    } else {
      return {
        ...baseConfig,
        xAxis: {
          type: 'category',
          name: xAxisName,
          data: names,
          axisLabel: {
            interval: 0,
            rotate: names.some(name => name.length > 6) ? 30 : 0
          }
        },
        yAxis: {
          type: 'value',
          name: yAxisName,
          axisLabel: {
            formatter: '{value}'
          }
        }
      };
    }
  };

  return (
    <ReactECharts
      option={getOption()}
      style={{ height: `${height}px`, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
};

export default BarChart;
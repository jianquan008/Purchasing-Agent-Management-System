import React from 'react';
import ReactECharts from 'echarts-for-react';
import { Empty } from 'antd';

interface PieData {
  name: string;
  value: number;
  itemStyle?: {
    color?: string;
  };
}

interface PieChartProps {
  data: PieData[];
  title?: string;
  height?: number;
  showLegend?: boolean;
  radius?: string | [string, string];
}

const PieChart: React.FC<PieChartProps> = ({ 
  data, 
  title = '饼图',
  height = 300,
  showLegend = true,
  radius = ['40%', '70%']
}) => {
  if (!data || data.length === 0) {
    return <Empty description="暂无数据" />;
  }

  // 生成颜色
  const colors = [
    '#1890ff', '#52c41a', '#722ed1', '#fa541c', '#faad14',
    '#13c2c2', '#eb2f96', '#f5222d', '#a0d911', '#2f54eb'
  ];

  const processedData = data.map((item, index) => ({
    ...item,
    itemStyle: {
      color: item.itemStyle?.color || colors[index % colors.length]
    }
  }));

  const getOption = () => {
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
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c} ({d}%)'
      },
      legend: showLegend ? {
        type: 'scroll',
        orient: 'vertical',
        right: 10,
        top: 20,
        bottom: 20,
        data: processedData.map(item => item.name),
        textStyle: {
          fontSize: 12
        }
      } : undefined,
      series: [
        {
          name: title,
          type: 'pie',
          radius: radius,
          center: showLegend ? ['40%', '50%'] : ['50%', '50%'],
          data: processedData,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          label: {
            show: !showLegend,
            position: 'outside',
            formatter: '{b}: {d}%'
          },
          labelLine: {
            show: !showLegend
          }
        }
      ],
      animation: true,
      animationType: 'scale',
      animationEasing: 'elasticOut',
      animationDelay: (idx: number) => Math.random() * 200
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

export default PieChart;
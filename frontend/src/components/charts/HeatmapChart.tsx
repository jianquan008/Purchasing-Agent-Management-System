import React from 'react';
import ReactECharts from 'echarts-for-react';
import { Empty } from 'antd';

interface HeatmapData {
  x: string;
  y: string;
  value: number;
}

interface HeatmapChartProps {
  data: HeatmapData[];
  title?: string;
  height?: number;
  xAxisData: string[];
  yAxisData: string[];
  colorRange?: [string, string];
}

const HeatmapChart: React.FC<HeatmapChartProps> = ({ 
  data, 
  title = '热力图',
  height = 300,
  xAxisData,
  yAxisData,
  colorRange = ['#ffffff', '#1890ff']
}) => {
  if (!data || data.length === 0) {
    return <Empty description="暂无数据" />;
  }

  // 转换数据格式为 ECharts 需要的格式 [x_index, y_index, value]
  const processedData = data.map(item => {
    const xIndex = xAxisData.indexOf(item.x);
    const yIndex = yAxisData.indexOf(item.y);
    return [xIndex, yIndex, item.value];
  });

  // 计算最大值和最小值用于颜色映射
  const values = data.map(item => item.value);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);

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
        position: 'top',
        formatter: (params: any) => {
          const xLabel = xAxisData[params.data[0]];
          const yLabel = yAxisData[params.data[1]];
          const value = params.data[2];
          return `${xLabel} - ${yLabel}<br/>数值: ${value}`;
        }
      },
      grid: {
        height: '50%',
        top: '15%',
        left: '10%',
        right: '10%'
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        splitArea: {
          show: true
        },
        axisLabel: {
          rotate: xAxisData.some(label => label.length > 4) ? 45 : 0
        }
      },
      yAxis: {
        type: 'category',
        data: yAxisData,
        splitArea: {
          show: true
        }
      },
      visualMap: {
        min: minValue,
        max: maxValue,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '5%',
        inRange: {
          color: colorRange
        },
        text: ['高', '低'],
        textStyle: {
          color: '#333'
        }
      },
      series: [
        {
          name: title,
          type: 'heatmap',
          data: processedData,
          label: {
            show: true,
            formatter: (params: any) => params.data[2]
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ],
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

export default HeatmapChart;
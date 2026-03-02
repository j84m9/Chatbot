'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface ChartConfig {
  chartType: 'bar' | 'line' | 'scatter' | 'pie';
  title: string;
  xColumn: string;
  yColumn: string;
  xLabel?: string;
  yLabel?: string;
}

interface PlotlyChartProps {
  chartConfig: ChartConfig;
  rows: Record<string, any>[];
  darkMode: boolean;
}

export default function PlotlyChart({ chartConfig, rows, darkMode }: PlotlyChartProps) {
  const { data, layout } = useMemo(() => {
    const xValues = rows.map(r => r[chartConfig.xColumn]);
    const yValues = rows.map(r => r[chartConfig.yColumn]);

    const colors = {
      primary: '#6366f1',
      secondary: '#8b5cf6',
      bg: darkMode ? '#161718' : '#ffffff',
      text: darkMode ? '#d1d5db' : '#374151',
      grid: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
      paper: darkMode ? '#161718' : '#ffffff',
    };

    let trace: any;

    switch (chartConfig.chartType) {
      case 'pie':
        trace = {
          type: 'pie',
          labels: xValues,
          values: yValues,
          marker: {
            colors: ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#7c3aed', '#5b21b6'],
          },
          textfont: { color: colors.text },
        };
        break;
      case 'scatter':
        trace = {
          type: 'scatter',
          mode: 'markers',
          x: xValues,
          y: yValues,
          marker: { color: colors.primary, size: 8, opacity: 0.7 },
        };
        break;
      case 'line':
        trace = {
          type: 'scatter',
          mode: 'lines+markers',
          x: xValues,
          y: yValues,
          line: { color: colors.primary, width: 2 },
          marker: { color: colors.primary, size: 5 },
        };
        break;
      case 'bar':
      default:
        trace = {
          type: 'bar',
          x: xValues,
          y: yValues,
          marker: {
            color: colors.primary,
            borderRadius: 4,
          },
        };
        break;
    }

    const plotLayout: any = {
      title: {
        text: chartConfig.title,
        font: { color: colors.text, size: 14 },
      },
      paper_bgcolor: colors.paper,
      plot_bgcolor: colors.bg,
      font: { color: colors.text },
      margin: { l: 60, r: 30, t: 50, b: 60 },
      xaxis: {
        title: chartConfig.xLabel || chartConfig.xColumn,
        gridcolor: colors.grid,
        tickfont: { color: colors.text },
      },
      yaxis: {
        title: chartConfig.yLabel || chartConfig.yColumn,
        gridcolor: colors.grid,
        tickfont: { color: colors.text },
      },
      autosize: true,
    };

    return { data: [trace], layout: plotLayout };
  }, [chartConfig, rows, darkMode]);

  return (
    <div className="w-full h-full min-h-[300px]">
      <Plot
        data={data}
        layout={layout}
        config={{ responsive: true, displayModeBar: true, displaylogo: false }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

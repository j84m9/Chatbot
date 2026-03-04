declare module 'react-plotly.js/factory' {
  import { Component } from 'react';

  interface PlotParams {
    data: any[];
    layout?: any;
    config?: any;
    frames?: any[];
    useResizeHandler?: boolean;
    style?: React.CSSProperties;
    className?: string;
    onInitialized?: (figure: any, graphDiv: HTMLElement) => void;
    onUpdate?: (figure: any, graphDiv: HTMLElement) => void;
    onPurge?: (figure: any, graphDiv: HTMLElement) => void;
    onError?: (err: Error) => void;
    onClick?: (event: any) => void;
  }

  function createPlotlyComponent(plotly: any): React.ComponentType<PlotParams>;
  export default createPlotlyComponent;
}

declare module 'plotly.js-dist-min' {
  const Plotly: any;
  export default Plotly;
}

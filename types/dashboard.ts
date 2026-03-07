import type { PinnedChart } from '@/app/components/data-explorer/Dashboard';

export interface DrillDownLevel {
  column: string;
  value: string | number;
  label: string;
}

export interface DrillDownState {
  levels: DrillDownLevel[];
  originalSnapshot: PinnedChart['results_snapshot'];
}

export interface CrossFilter {
  sourceChartId: string;
  column: string;
  value: string | number;
}

export interface GlobalFilter {
  column: string;
  type: 'date_range' | 'select';
  from?: string;
  to?: string;
  values?: (string | number)[];
}

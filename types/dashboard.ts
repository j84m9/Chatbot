import type { PinnedChart } from '@/app/components/data-explorer/Dashboard';

export interface CrossFilter {
  sourceChartId: string;
  column: string;
  value: string | number;
}

/** Multi-dimensional cross-filter set — multiple filters applied with AND logic */
export type CrossFilterSet = CrossFilter[];

export interface GlobalFilter {
  column: string;
  type: 'date_range' | 'select';
  from?: string;
  to?: string;
  values?: (string | number)[];
}

export interface SlicerConfig {
  column: string;
  filterType: 'multi_select' | 'date_range';
}

export interface DashboardTab {
  id: string;
  user_id: string;
  connection_id: string;
  title: string;
  tab_order: number;
  is_default: boolean;
  global_filters: GlobalFilter[];
  created_at: string;
  updated_at: string;
}

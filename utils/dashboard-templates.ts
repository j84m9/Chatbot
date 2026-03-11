/**
 * Dashboard Templates — pre-built layouts for common dashboard patterns.
 * Referenced by the dashboard builder agent to create well-structured dashboards.
 */

export interface TemplateSlot {
  purpose: 'kpi' | 'trend' | 'breakdown' | 'ranking' | 'detail' | 'scorecard' | 'text';
  label: string;
  layout: { x: number; y: number; w: number; h: number };
  chartType?: string;
  description: string;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  slots: TemplateSlot[];
}

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: 'executive_summary',
    name: 'Executive Summary',
    description: '4 KPI cards at top, primary trend chart, two breakdown charts side-by-side',
    slots: [
      { purpose: 'kpi', label: 'KPI 1', layout: { x: 0, y: 0, w: 3, h: 2 }, chartType: 'gauge', description: 'Primary metric (e.g. Total Revenue)' },
      { purpose: 'kpi', label: 'KPI 2', layout: { x: 3, y: 0, w: 3, h: 2 }, chartType: 'gauge', description: 'Secondary metric (e.g. Total Orders)' },
      { purpose: 'kpi', label: 'KPI 3', layout: { x: 6, y: 0, w: 3, h: 2 }, chartType: 'gauge', description: 'Growth metric (e.g. YoY Growth)' },
      { purpose: 'kpi', label: 'KPI 4', layout: { x: 9, y: 0, w: 3, h: 2 }, chartType: 'gauge', description: 'Efficiency metric (e.g. Avg Order Value)' },
      { purpose: 'trend', label: 'Primary Trend', layout: { x: 0, y: 2, w: 12, h: 4 }, chartType: 'line', description: 'Main time-series metric over time' },
      { purpose: 'breakdown', label: 'Category Breakdown', layout: { x: 0, y: 6, w: 6, h: 4 }, chartType: 'bar', description: 'Metric by primary dimension (e.g. by category)' },
      { purpose: 'ranking', label: 'Top N Ranking', layout: { x: 6, y: 6, w: 6, h: 4 }, chartType: 'bar', description: 'Top items by metric (horizontal bar)' },
    ],
  },
  {
    id: 'operational',
    name: 'Operational Dashboard',
    description: '6 KPI scorecards, trend with comparison, detail tables',
    slots: [
      { purpose: 'scorecard', label: 'Scorecard 1', layout: { x: 0, y: 0, w: 2, h: 2 }, description: 'Primary operational KPI' },
      { purpose: 'scorecard', label: 'Scorecard 2', layout: { x: 2, y: 0, w: 2, h: 2 }, description: 'Secondary operational KPI' },
      { purpose: 'scorecard', label: 'Scorecard 3', layout: { x: 4, y: 0, w: 2, h: 2 }, description: 'Efficiency KPI' },
      { purpose: 'scorecard', label: 'Scorecard 4', layout: { x: 6, y: 0, w: 2, h: 2 }, description: 'Quality KPI' },
      { purpose: 'scorecard', label: 'Scorecard 5', layout: { x: 8, y: 0, w: 2, h: 2 }, description: 'Volume KPI' },
      { purpose: 'scorecard', label: 'Scorecard 6', layout: { x: 10, y: 0, w: 2, h: 2 }, description: 'Performance KPI' },
      { purpose: 'trend', label: 'Trend Comparison', layout: { x: 0, y: 2, w: 8, h: 4 }, chartType: 'area', description: 'Primary metric trend with period comparison' },
      { purpose: 'breakdown', label: 'Status Breakdown', layout: { x: 8, y: 2, w: 4, h: 4 }, chartType: 'pie', description: 'Distribution by status/category' },
      { purpose: 'detail', label: 'Detail Analysis', layout: { x: 0, y: 6, w: 12, h: 4 }, chartType: 'bar', description: 'Detailed breakdown or heatmap' },
    ],
  },
  {
    id: 'analysis',
    name: 'Analysis Dashboard',
    description: 'Large primary chart with sidebar KPIs and insights section',
    slots: [
      { purpose: 'kpi', label: 'Summary KPI 1', layout: { x: 0, y: 0, w: 3, h: 2 }, chartType: 'gauge', description: 'Key summary metric' },
      { purpose: 'kpi', label: 'Summary KPI 2', layout: { x: 3, y: 0, w: 3, h: 2 }, chartType: 'gauge', description: 'Comparison metric' },
      { purpose: 'text', label: 'Analysis Notes', layout: { x: 6, y: 0, w: 6, h: 2 }, description: 'Key findings or methodology notes' },
      { purpose: 'detail', label: 'Primary Analysis', layout: { x: 0, y: 2, w: 8, h: 5 }, chartType: 'scatter', description: 'Main analytical visualization (scatter, heatmap, etc.)' },
      { purpose: 'breakdown', label: 'Supporting View', layout: { x: 8, y: 2, w: 4, h: 5 }, chartType: 'bar', description: 'Supporting breakdown chart' },
      { purpose: 'trend', label: 'Trend Context', layout: { x: 0, y: 7, w: 12, h: 3 }, chartType: 'line', description: 'Time context for the analysis' },
    ],
  },
];

/** Get a template by ID */
export function getTemplate(id: string): DashboardTemplate | undefined {
  return DASHBOARD_TEMPLATES.find(t => t.id === id);
}

/** Get template descriptions for inclusion in agent prompts */
export function getTemplateDescriptions(): string {
  return DASHBOARD_TEMPLATES.map(t => {
    const slotList = t.slots.map(s => `  - ${s.label} (${s.purpose}): ${s.description}`).join('\n');
    return `### ${t.name} (id: "${t.id}")
${t.description}
Slots:
${slotList}`;
  }).join('\n\n');
}

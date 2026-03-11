/**
 * Deterministic chart type detection — no LLM needed.
 * Used as a fast path for simple queries and as a fallback when LLM chart gen fails.
 */

export interface DetectedChart {
  chartType: 'bar' | 'line' | 'scatter' | 'pie' | 'histogram' | 'gauge' | 'area';
  xColumn: string;
  yColumn: string;
  xLabel: string;
  yLabel: string;
  orientation?: 'v' | 'h';
  title: string;
}

/** Reuse the same date detection logic as PlotlyChart */
function isDateColumn(colName: string, sampleValues: any[]): boolean {
  if (/^(date|time|created|updated|timestamp|month|year|day|week|quarter|period)/i.test(colName)) return true;
  if (/(date|time|timestamp|_at|_on|month|year|quarter|period)$/i.test(colName)) return true;
  const nonNull = sampleValues.filter(v => v != null).slice(0, 10);
  if (nonNull.length === 0) return false;
  const datePattern = /^\d{4}[-/]\d{2}([-/]\d{2})?/;
  const matchCount = nonNull.filter(v => typeof v === 'string' && datePattern.test(v)).length;
  return matchCount >= nonNull.length * 0.7;
}

function isNumericType(type: string): boolean {
  const t = type.toLowerCase();
  return ['int', 'integer', 'float', 'double', 'real', 'decimal', 'numeric', 'bigint', 'smallint', 'tinyint', 'money', 'number'].some(n => t.includes(n));
}

function cleanLabel(col: string): string {
  return col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Deterministic chart type detection based on column types, data shape, and row count.
 */
export function detectChartType(
  columns: string[],
  types: Record<string, string>,
  rows: Record<string, any>[],
  rowCount: number,
): DetectedChart {
  if (columns.length === 0) {
    return { chartType: 'bar', xColumn: '', yColumn: '', xLabel: '', yLabel: '', title: 'Results' };
  }

  const numericCols = columns.filter(c => {
    if (isNumericType(types[c] || '')) return true;
    // Check actual values
    const vals = rows.slice(0, 10).map(r => r[c]).filter(v => v != null);
    return vals.length > 0 && vals.every(v => typeof v === 'number' || !isNaN(Number(v)));
  });

  const dateCols = columns.filter(c => isDateColumn(c, rows.map(r => r[c])));

  const categoricalCols = columns.filter(c => !numericCols.includes(c) && !dateCols.includes(c));

  // 1. Single row + numeric → gauge
  if (rowCount === 1 && numericCols.length >= 1) {
    const yCol = numericCols[0];
    const label = columns.length > 1 && categoricalCols.length > 0
      ? String(rows[0][categoricalCols[0]] || '')
      : cleanLabel(yCol);
    return {
      chartType: 'gauge',
      xColumn: columns[0],
      yColumn: yCol,
      xLabel: cleanLabel(columns[0]),
      yLabel: cleanLabel(yCol),
      title: label ? `${label}: ${rows[0][yCol]}` : cleanLabel(yCol),
    };
  }

  // 2. Date + numeric → line
  if (dateCols.length > 0 && numericCols.length > 0) {
    const xCol = dateCols[0];
    const yCol = numericCols[0];
    return {
      chartType: 'line',
      xColumn: xCol,
      yColumn: yCol,
      xLabel: cleanLabel(xCol),
      yLabel: cleanLabel(yCol),
      title: `${cleanLabel(yCol)} over ${cleanLabel(xCol)}`,
    };
  }

  // 3. Categorical (<=20 unique) + numeric → bar
  if (categoricalCols.length > 0 && numericCols.length > 0) {
    const xCol = categoricalCols[0];
    const yCol = numericCols[0];
    const uniqueX = new Set(rows.map(r => r[xCol]));

    if (uniqueX.size <= 20) {
      // Check average label length for orientation
      const avgLen = [...uniqueX].reduce((sum, v) => sum + String(v ?? '').length, 0) / (uniqueX.size || 1);
      const horizontal = avgLen > 15 || uniqueX.size > 10;

      return {
        chartType: 'bar',
        xColumn: xCol,
        yColumn: yCol,
        xLabel: cleanLabel(xCol),
        yLabel: cleanLabel(yCol),
        orientation: horizontal ? 'h' : 'v',
        title: `${cleanLabel(yCol)} by ${cleanLabel(xCol)}`,
      };
    }
  }

  // 4. Two numeric columns → scatter
  if (numericCols.length >= 2 && categoricalCols.length === 0 && dateCols.length === 0) {
    return {
      chartType: 'scatter',
      xColumn: numericCols[0],
      yColumn: numericCols[1],
      xLabel: cleanLabel(numericCols[0]),
      yLabel: cleanLabel(numericCols[1]),
      title: `${cleanLabel(numericCols[1])} vs ${cleanLabel(numericCols[0])}`,
    };
  }

  // 5. Single numeric column, >10 rows → histogram
  if (numericCols.length === 1 && categoricalCols.length === 0 && rowCount > 10) {
    return {
      chartType: 'histogram',
      xColumn: numericCols[0],
      yColumn: numericCols[0],
      xLabel: cleanLabel(numericCols[0]),
      yLabel: 'Count',
      title: `Distribution of ${cleanLabel(numericCols[0])}`,
    };
  }

  // 6. Default → bar with first two columns
  const xCol = columns[0];
  const yCol = columns.length > 1 ? columns[1] : columns[0];
  return {
    chartType: 'bar',
    xColumn: xCol,
    yColumn: yCol,
    xLabel: cleanLabel(xCol),
    yLabel: cleanLabel(yCol),
    title: `${cleanLabel(yCol)} by ${cleanLabel(xCol)}`,
  };
}

// ═══════════════════════════════════════════════════
// Drill Hierarchy Detection
// ═══════════════════════════════════════════════════

export interface DrillLevel {
  column: string;
  label: string;
}

/** Auto-detect drill hierarchies from column names */
export function detectDrillHierarchy(columns: string[], rows: Record<string, any>[]): DrillLevel[] | null {
  // Date hierarchies: Year > Quarter > Month > Day
  const datePatterns = [
    { pattern: /^year$/i, label: 'Year' },
    { pattern: /^quarter$/i, label: 'Quarter' },
    { pattern: /^month$/i, label: 'Month' },
    { pattern: /^(week|week_number)$/i, label: 'Week' },
    { pattern: /^(day|date)$/i, label: 'Day' },
  ];

  const dateLevels: DrillLevel[] = [];
  for (const { pattern, label } of datePatterns) {
    const col = columns.find(c => pattern.test(c));
    if (col) dateLevels.push({ column: col, label });
  }
  if (dateLevels.length >= 2) return dateLevels;

  // Geographic hierarchies: Country > State > City
  const geoPatterns = [
    { pattern: /^(country|country_name|nation)$/i, label: 'Country' },
    { pattern: /^(state|region|province|state_name)$/i, label: 'State' },
    { pattern: /^(city|city_name|metro)$/i, label: 'City' },
    { pattern: /^(zip|zipcode|postal_code|zip_code)$/i, label: 'ZIP' },
  ];

  const geoLevels: DrillLevel[] = [];
  for (const { pattern, label } of geoPatterns) {
    const col = columns.find(c => pattern.test(c));
    if (col) geoLevels.push({ column: col, label });
  }
  if (geoLevels.length >= 2) return geoLevels;

  // Product hierarchies: Category > Subcategory > Product
  const prodPatterns = [
    { pattern: /^(category|product_category|dept|department)$/i, label: 'Category' },
    { pattern: /^(subcategory|sub_category|product_type|type)$/i, label: 'Subcategory' },
    { pattern: /^(product|product_name|item|sku)$/i, label: 'Product' },
  ];

  const prodLevels: DrillLevel[] = [];
  for (const { pattern, label } of prodPatterns) {
    const col = columns.find(c => pattern.test(c));
    if (col) prodLevels.push({ column: col, label });
  }
  if (prodLevels.length >= 2) return prodLevels;

  return null;
}

/**
 * Check if a query result is simple enough to skip the LLM chart generation.
 * Simple = <=3 columns with a clear type split (date/categorical + numeric).
 */
export function isSimpleQuery(
  columns: string[],
  types: Record<string, string>,
  rows: Record<string, any>[],
): boolean {
  if (columns.length > 3 || columns.length === 0) return false;
  if (rows.length === 0) return false;

  const numericCols = columns.filter(c => {
    if (isNumericType(types[c] || '')) return true;
    const vals = rows.slice(0, 10).map(r => r[c]).filter(v => v != null);
    return vals.length > 0 && vals.every(v => typeof v === 'number' || !isNaN(Number(v)));
  });

  const nonNumericCols = columns.filter(c => !numericCols.includes(c));

  // 1 row + numeric → gauge (simple)
  if (rows.length === 1 && numericCols.length >= 1) return true;

  // 1 categorical/date + 1 numeric → simple bar/line
  if (nonNumericCols.length === 1 && numericCols.length >= 1) return true;

  // 2 numeric, no categories → scatter
  if (numericCols.length === 2 && nonNumericCols.length === 0) return true;

  // Single numeric column → histogram
  if (numericCols.length === 1 && nonNumericCols.length === 0 && rows.length > 10) return true;

  return false;
}

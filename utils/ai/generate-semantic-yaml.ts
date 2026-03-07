import yaml from 'js-yaml';

interface ColumnInfo {
  name: string;
  type: string;
}

interface TableSchema {
  name: string;
  columns: ColumnInfo[];
}

interface SampleData {
  tableName: string;
  rows: Record<string, any>[];
}

/**
 * Auto-generate a skeleton semantic YAML from schema and sample data.
 * Detects enum-like columns (string type with ≤10 distinct values),
 * infers descriptions from column names, and outputs YAML.
 */
export function generateSemanticYaml(
  schema: TableSchema[],
  sampleData: SampleData[],
): string {
  const sampleMap = new Map<string, Record<string, any>[]>();
  for (const s of sampleData) {
    sampleMap.set(s.tableName, s.rows);
  }

  const tables: Record<string, any> = {};

  for (const table of schema) {
    const rows = sampleMap.get(table.name) || [];
    const columns: Record<string, any> = {};

    for (const col of table.columns) {
      const distinctValues = getDistinctValues(rows, col.name);
      const isEnum = isEnumLike(col, distinctValues);
      const description = inferDescription(col.name, table.name);

      if (isEnum && distinctValues.length > 0) {
        columns[col.name] = {
          description,
          values: distinctValues,
        };
      } else {
        columns[col.name] = description;
      }
    }

    tables[table.name] = {
      description: inferTableDescription(table.name),
      columns,
    };
  }

  const doc = {
    database: {
      name: 'Database',
      description: 'Auto-generated metadata. Review and enrich with business context.',
    },
    key_metrics: [
      {
        name: 'TODO',
        formula: 'Define key business metrics here',
        description: 'Add domain-specific metric definitions',
      },
    ],
    tables,
  };

  return yaml.dump(doc, { lineWidth: 120, noRefs: true, sortKeys: false });
}

function getDistinctValues(rows: Record<string, any>[], column: string): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const val = row[column];
    if (val != null) {
      seen.add(String(val));
    }
  }
  return [...seen].sort();
}

function isEnumLike(col: ColumnInfo, distinctValues: string[]): boolean {
  const type = col.type.toLowerCase();
  const isStringType = type.includes('text') || type.includes('varchar') || type.includes('char') || type.includes('nvarchar');
  return isStringType && distinctValues.length > 0 && distinctValues.length <= 10;
}

function inferDescription(colName: string, tableName: string): string {
  const lower = colName.toLowerCase();

  if (lower === 'id') return 'Primary key';
  if (lower.endsWith('_id')) {
    const ref = lower.replace(/_id$/, '');
    return `FK → ${ref}s table`;
  }
  if (lower.includes('date') || lower.includes('time') || lower === 'created_at' || lower === 'updated_at') {
    return 'Date/timestamp field';
  }
  if (lower.includes('email')) return 'Email address';
  if (lower.includes('name') && lower.includes('first')) return 'First name';
  if (lower.includes('name') && lower.includes('last')) return 'Last name';
  if (lower.includes('name')) return 'Name';
  if (lower.includes('price') || lower.includes('cost') || lower.includes('amount') || lower.includes('salary') || lower.includes('budget')) {
    return 'Monetary value (USD)';
  }
  if (lower.includes('quantity') || lower.includes('count') || lower.includes('stock')) return 'Numeric count';
  if (lower.includes('status')) return 'Status field';
  if (lower.includes('active')) return 'Active/inactive flag';
  if (lower.includes('rating') || lower.includes('score')) return 'Rating/score value';
  if (lower.includes('percent') || lower.includes('pct') || lower.includes('rate')) return 'Percentage/rate value';
  if (lower.includes('description') || lower.includes('comment') || lower.includes('text') || lower.includes('note')) return 'Free-text field';

  return `${colName} field`;
}

function inferTableDescription(tableName: string): string {
  const lower = tableName.toLowerCase();
  const words = lower.replace(/_/g, ' ');
  return `${words.charAt(0).toUpperCase() + words.slice(1)} table`;
}

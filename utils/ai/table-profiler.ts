/**
 * Database table profiling — generates per-column statistics via SQL queries.
 * Used to enrich LLM prompts with real data distributions.
 */

export interface ColumnProfile {
  null_rate: number;
  distinct_count: number;
  min?: string | number | null;
  max?: string | number | null;
  avg?: number | null;
  sample_values?: string[];
  date_range?: { min: string; max: string } | null;
}

interface ColumnDef {
  name: string;
  type: string;
}

type ExecuteFn = (sql: string) => Promise<{ rows: Record<string, any>[]; columns: string[] }>;

function isNumericType(type: string): boolean {
  const t = type.toLowerCase();
  return ['int', 'integer', 'float', 'double', 'real', 'decimal', 'numeric', 'bigint', 'smallint', 'tinyint', 'money', 'number', 'bit'].some(n => t.includes(n));
}

function isDateType(type: string): boolean {
  const t = type.toLowerCase();
  return ['date', 'time', 'datetime', 'timestamp'].some(n => t.includes(n));
}

/**
 * Profile a single table by running aggregate queries.
 * Returns column-level statistics for prompt enrichment.
 */
export async function profileTable(
  execute: ExecuteFn,
  tableName: string,
  columns: ColumnDef[],
  dialect: 'tsql' | 'sqlite',
): Promise<Record<string, ColumnProfile>> {
  const profiles: Record<string, ColumnProfile> = {};

  // Limit columns to profile (avoid huge queries)
  const colsToProfile = columns.slice(0, 50);

  // Build main aggregate query: COUNT(*), COUNT(col), COUNT(DISTINCT col), MIN/MAX/AVG for numeric
  const selectParts: string[] = [];
  const sampleLimit = dialect === 'tsql' ? 'TOP 10000' : '';
  const sampleSuffix = dialect === 'sqlite' ? 'LIMIT 10000' : '';

  // Total row count
  selectParts.push('COUNT(*) AS _total_rows');

  for (const col of colsToProfile) {
    const quotedCol = dialect === 'tsql' ? `[${col.name}]` : `"${col.name}"`;

    selectParts.push(`COUNT(${quotedCol}) AS "cnt_${col.name}"`);
    selectParts.push(`COUNT(DISTINCT ${quotedCol}) AS "dist_${col.name}"`);

    if (isNumericType(col.type)) {
      selectParts.push(`MIN(${quotedCol}) AS "min_${col.name}"`);
      selectParts.push(`MAX(${quotedCol}) AS "max_${col.name}"`);
      selectParts.push(`AVG(CAST(${quotedCol} AS FLOAT)) AS "avg_${col.name}"`);
    } else if (isDateType(col.type)) {
      selectParts.push(`MIN(${quotedCol}) AS "min_${col.name}"`);
      selectParts.push(`MAX(${quotedCol}) AS "max_${col.name}"`);
    }
  }

  const quotedTable = dialect === 'tsql' ? `[${tableName}]` : `"${tableName}"`;
  const mainSql = dialect === 'tsql'
    ? `SELECT ${sampleLimit} ${selectParts.join(', ')} FROM (SELECT ${sampleLimit} * FROM ${quotedTable}) AS _sample`
    : `SELECT ${selectParts.join(', ')} FROM (SELECT * FROM ${quotedTable} ${sampleSuffix}) AS _sample`;

  try {
    const result = await execute(mainSql);
    const row = result.rows[0] || {};
    const totalRows = Number(row._total_rows) || 0;

    for (const col of colsToProfile) {
      const cnt = Number(row[`cnt_${col.name}`]) || 0;
      const dist = Number(row[`dist_${col.name}`]) || 0;
      const nullRate = totalRows > 0 ? Math.round(((totalRows - cnt) / totalRows) * 100) / 100 : 0;

      const profile: ColumnProfile = {
        null_rate: nullRate,
        distinct_count: dist,
      };

      if (isNumericType(col.type)) {
        profile.min = row[`min_${col.name}`] ?? null;
        profile.max = row[`max_${col.name}`] ?? null;
        profile.avg = row[`avg_${col.name}`] != null ? Math.round(Number(row[`avg_${col.name}`]) * 100) / 100 : null;
      }

      if (isDateType(col.type)) {
        const minDate = row[`min_${col.name}`];
        const maxDate = row[`max_${col.name}`];
        if (minDate && maxDate) {
          profile.date_range = { min: String(minDate), max: String(maxDate) };
        }
      }

      profiles[col.name] = profile;
    }
  } catch {
    // Main query failed — return empty profiles
    for (const col of colsToProfile) {
      profiles[col.name] = { null_rate: 0, distinct_count: 0 };
    }
    return profiles;
  }

  // Separate queries for categorical columns with <=20 distinct values
  for (const col of colsToProfile) {
    if (isNumericType(col.type) || isDateType(col.type)) continue;
    const profile = profiles[col.name];
    if (!profile || profile.distinct_count > 20 || profile.distinct_count === 0) continue;

    const quotedCol = dialect === 'tsql' ? `[${col.name}]` : `"${col.name}"`;
    const limitClause = dialect === 'tsql' ? 'TOP 20' : '';
    const limitSuffix = dialect === 'sqlite' ? 'LIMIT 20' : '';

    try {
      const sampleSql = `SELECT ${limitClause} DISTINCT ${quotedCol} FROM ${quotedTable} WHERE ${quotedCol} IS NOT NULL ${limitSuffix}`;
      const sampleResult = await execute(sampleSql);
      profile.sample_values = sampleResult.rows.map(r => String(r[col.name])).slice(0, 20);
    } catch {
      // Skip sample values on error
    }
  }

  return profiles;
}

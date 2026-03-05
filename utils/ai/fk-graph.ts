import { SchemaTable } from '../mssql/connection';

export interface FKEdge {
  fromTable: string;
  fromSchema: string;
  fromColumn: string;
  toTable: string;
  toSchema: string;
  toColumn: string;
}

export interface FKGraph {
  /** adjacency list: qualifiedTableName -> list of edges */
  edges: Map<string, FKEdge[]>;
  /** all known table names (qualified) */
  tables: Set<string>;
}

export interface JoinStep {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

function qualify(schema: string, name: string): string {
  return `[${schema}].[${name}]`;
}

/**
 * Build a bidirectional FK adjacency graph from schema tables.
 */
export function buildFKGraph(schema: SchemaTable[]): FKGraph {
  const edges = new Map<string, FKEdge[]>();
  const tables = new Set<string>();

  for (const table of schema) {
    const qualifiedName = qualify(table.schema, table.name);
    tables.add(qualifiedName);
    if (!edges.has(qualifiedName)) {
      edges.set(qualifiedName, []);
    }

    if (!table.foreignKeys) continue;

    for (const fk of table.foreignKeys) {
      // Determine the target table's schema — find it in the schema array
      const targetTable = schema.find(
        (t) => t.name.toLowerCase() === fk.toTable.toLowerCase()
      );
      const targetSchema = targetTable?.schema ?? table.schema;
      const targetQualified = qualify(targetSchema, fk.toTable);

      // Forward edge: this table -> referenced table
      const forwardEdge: FKEdge = {
        fromTable: qualifiedName,
        fromSchema: table.schema,
        fromColumn: fk.fromColumn,
        toTable: targetQualified,
        toSchema: targetSchema,
        toColumn: fk.toColumn,
      };
      edges.get(qualifiedName)!.push(forwardEdge);

      // Reverse edge: referenced table -> this table
      if (!edges.has(targetQualified)) {
        edges.set(targetQualified, []);
      }
      const reverseEdge: FKEdge = {
        fromTable: targetQualified,
        fromSchema: targetSchema,
        fromColumn: fk.toColumn,
        toTable: qualifiedName,
        toSchema: table.schema,
        toColumn: fk.fromColumn,
      };
      edges.get(targetQualified)!.push(reverseEdge);
    }
  }

  return { edges, tables };
}

/**
 * BFS to find the shortest join path between two tables.
 * Returns null if no path exists within maxDepth.
 */
export function findJoinPath(
  graph: FKGraph,
  from: string,
  to: string,
  maxDepth: number = 5
): JoinStep[] | null {
  const fromNorm = normalizeTableName(graph, from);
  const toNorm = normalizeTableName(graph, to);
  if (!fromNorm || !toNorm) return null;
  if (fromNorm === toNorm) return [];

  const visited = new Set<string>([fromNorm]);
  const queue: { node: string; path: JoinStep[] }[] = [
    { node: fromNorm, path: [] },
  ];

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;
    if (path.length >= maxDepth) continue;

    const neighbors = graph.edges.get(node) || [];
    for (const edge of neighbors) {
      if (visited.has(edge.toTable)) continue;
      visited.add(edge.toTable);

      const newPath = [
        ...path,
        {
          fromTable: edge.fromTable,
          fromColumn: edge.fromColumn,
          toTable: edge.toTable,
          toColumn: edge.toColumn,
        },
      ];

      if (edge.toTable === toNorm) return newPath;
      queue.push({ node: edge.toTable, path: newPath });
    }
  }

  return null;
}

/**
 * Find all tables reachable from a starting table within maxDepth hops.
 */
export function findReachableTables(
  graph: FKGraph,
  from: string,
  maxDepth: number = 3
): Map<string, number> {
  const fromNorm = normalizeTableName(graph, from);
  if (!fromNorm) return new Map();

  const reachable = new Map<string, number>();
  const visited = new Set<string>([fromNorm]);
  const queue: { node: string; depth: number }[] = [
    { node: fromNorm, depth: 0 },
  ];

  while (queue.length > 0) {
    const { node, depth } = queue.shift()!;
    if (depth > 0) reachable.set(node, depth);
    if (depth >= maxDepth) continue;

    const neighbors = graph.edges.get(node) || [];
    for (const edge of neighbors) {
      if (visited.has(edge.toTable)) continue;
      visited.add(edge.toTable);
      queue.push({ node: edge.toTable, depth: depth + 1 });
    }
  }

  return reachable;
}

/**
 * Normalize a table name input to match a key in the graph.
 * Accepts: "tableName", "[schema].[tableName]", "schema.tableName"
 */
function normalizeTableName(graph: FKGraph, input: string): string | null {
  // Try exact match first
  if (graph.tables.has(input)) return input;

  // Try case-insensitive match
  const lower = input.toLowerCase();
  for (const t of graph.tables) {
    if (t.toLowerCase() === lower) return t;
  }

  // Try matching just the table name part (without schema)
  const namePart = input.replace(/^\[?\w+\]?\.\[?/, '').replace(/\]$/, '');
  for (const t of graph.tables) {
    const tName = t.replace(/^\[?\w+\]?\.\[?/, '').replace(/\]$/, '');
    if (tName.toLowerCase() === namePart.toLowerCase()) return t;
  }

  return null;
}

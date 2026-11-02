import neo4j, { type Driver } from 'neo4j-driver';
import type { EvidenceGraphSnapshot } from '../domain/evidence-graph.js';
import {
  graphConstraintCypher,
  graphFindEvidenceCypher,
  graphGetSourceCypher,
  planNeo4jGraphSeed,
  type GraphReadExecutor,
} from './neo4j-graph-queries.js';

const allowedReads = new Set([graphFindEvidenceCypher, graphGetSourceCypher]);

export interface Neo4jConnectionOptions {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

/** Only maintenance and disposable CI processes may instantiate this adapter. */
export function createNeo4jConnection(options: Neo4jConnectionOptions): Neo4jGraphStore {
  if (options.uri !== 'bolt://neo4j:7687') {
    throw new Error('GRAPH_INVALID_INTERNAL_BOLT_URI');
  }
  if (!options.username || !options.password) {
    throw new Error('GRAPH_MISSING_AUTH');
  }
  const driver = neo4j.driver(options.uri, neo4j.auth.basic(options.username, options.password), {
    connectionTimeout: 5000,
    maxTransactionRetryTime: 3000,
    maxConnectionPoolSize: 5,
  });
  return new Neo4jGraphStore(driver, options.database ?? 'neo4j');
}

export interface GraphSeedResult {
  readonly snapshot: string;
  readonly nodes: number;
  readonly relations: number;
}

/** Neo4j is a rebuildable PPKS projection; never a conversational system of record. */
export class Neo4jGraphStore implements GraphReadExecutor {
  constructor(
    private readonly driver: Driver,
    private readonly database = 'neo4j',
  ) {}

  async verifyConnectivity(): Promise<void> {
    await this.driver.verifyConnectivity();
  }

  async read(query: string, params: Readonly<Record<string, unknown>>): Promise<readonly unknown[]> {
    if (!allowedReads.has(query)) throw new Error('GRAPH_UNAPPROVED_CYPHER');
    const session = this.driver.session({
      database: this.database,
      defaultAccessMode: neo4j.session.READ,
    });
    try {
      return await session.executeRead(
        async (tx) => {
          const result = await tx.run(query, { ...params });
          return result.records.map((record) => record.toObject());
        },
        { timeout: 5000 },
      );
    } finally {
      await session.close();
    }
  }

  /** Constraint DDL runs separately; all data updates share one atomic transaction. */
  async seed(input: EvidenceGraphSnapshot): Promise<GraphSeedResult> {
    const plan = planNeo4jGraphSeed(input);
    const session = this.driver.session({
      database: this.database,
      defaultAccessMode: neo4j.session.WRITE,
    });
    try {
      await session.executeWrite(
        async (tx) => {
          await tx.run(graphConstraintCypher);
        },
        { timeout: 30000 },
      );
      await session.executeWrite(
        async (tx) => {
          for (const operation of plan.operations) {
            await tx.run(operation.query, { ...operation.params });
          }
        },
        { timeout: 60000 },
      );
      return { snapshot: plan.snapshot, nodes: plan.nodes, relations: plan.relations };
    } finally {
      await session.close();
    }
  }

  async count(): Promise<{ nodes: number; relations: number }> {
    const session = this.driver.session({
      database: this.database,
      defaultAccessMode: neo4j.session.READ,
    });
    try {
      return await session.executeRead(
        async (tx) => {
          const nodeResult = await tx.run('MATCH (n:OrbeEvidence) RETURN count(n) AS total');
          const edgeResult = await tx.run(
            'MATCH (:OrbeEvidence)-[r:ORBE_RELATION]->(:OrbeEvidence) RETURN count(r) AS total',
          );
          const amount = (value: unknown): number => {
            if (!neo4j.isInt(value)) throw new Error('GRAPH_INVALID_COUNT');
            return value.toNumber();
          };
          return {
            nodes: amount(nodeResult.records[0]?.get('total')),
            relations: amount(edgeResult.records[0]?.get('total')),
          };
        },
        { timeout: 5000 },
      );
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

/** Fail closed to canonical PPKS instead of inventing unsupported graph evidence. */
export async function graphOrCanonical<T>(
  queryGraph: () => Promise<T>,
  canonicalFallback: () => T | Promise<T>,
): Promise<T> {
  try {
    return await queryGraph();
  } catch {
    return await canonicalFallback();
  }
}

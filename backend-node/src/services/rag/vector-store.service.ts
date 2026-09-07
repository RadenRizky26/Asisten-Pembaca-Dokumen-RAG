import { Pool } from 'pg';

type DocRow = { document: string; cmetadata: any; collection_id?: string; distance?: number };
type AddDoc = { text: string; embedding: number[]; metadata: Record<string, any>; collection_id?: string };

export class VectorStoreService {
  private pool: Pool | null = null;
  private mem: { embedding: number[]; document: string; cmetadata: any; collection_id: string }[] = [];
  private useMem = false;

  constructor(pool?: Pool) {
    const hasDb = !!process.env.DATABASE_URL;
    if (pool) this.pool = pool;
    else if (hasDb) {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
      this.pool.on('error', () => { this.useMem = true; });
    } else {
      this.useMem = true;
    }
  }

  private toVectorLiteral(v: number[]): string { return `[${v.join(',')}]`; }

  async addDocuments(docs: AddDoc[]): Promise<void> {
    if (this.useMem || !this.pool) { for (const d of docs) this.mem.push({ embedding: d.embedding, document: d.text, cmetadata: d.metadata, collection_id: d.collection_id ?? 'default' }); return; }
    try {
      for (const d of docs) {
        await this.pool.query(
          `INSERT INTO langchain_pg_embedding (uuid, embedding, document, cmetadata, collection_id) VALUES (gen_random_uuid(), $1::vector, $2, $3::jsonb, $4)`,
          [this.toVectorLiteral(d.embedding), d.text, JSON.stringify(d.metadata), d.collection_id ?? 'default']
        );
      }
    } catch { this.useMem = true; for (const d of docs) this.mem.push({ embedding: d.embedding, document: d.text, cmetadata: d.metadata, collection_id: d.collection_id ?? 'default' }); }
  }

  async similaritySearch(embedding: number[], k = 4, collectionId = 'default', filter?: Record<string, any>): Promise<DocRow[]> {
    if (this.useMem || !this.pool) return this.memSearch(embedding, k, collectionId, filter);
    try {
      let where = `collection_id = $2`;
      const vals: any[] = [this.toVectorLiteral(embedding), collectionId];
      if (filter?.source) { vals.push(filter.source); where += ` AND cmetadata->>'source' = $${vals.length}`; }
      const sql = `SELECT document, cmetadata, embedding <-> $1::vector AS distance FROM langchain_pg_embedding WHERE ${where} ORDER BY embedding <-> $1::vector LIMIT $${vals.length + 1}`;
      vals.push(k);
      const r = await this.pool.query(sql, vals);
      return r.rows;
    } catch { return this.memSearch(embedding, k, collectionId, filter); }
  }

  private memSearch(embedding: number[], k: number, collectionId: string, filter?: Record<string, any>): DocRow[] {
    const cos = (a: number[], b: number[]) => { let dot=0, na=0, nb=0; for(let i=0;i<a.length;i++){dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i];} return dot/(Math.sqrt(na)*Math.sqrt(nb)||1); };
    return this.mem
      .filter(m => m.collection_id === collectionId && (!filter?.source || m.cmetadata?.source === filter.source))
      .map(m => ({ document: m.document, cmetadata: m.cmetadata, distance: 1 - cos(embedding, m.embedding) }))
      .sort((a,b) => (a.distance! - b.distance!))
      .slice(0, k);
  }

  async deleteBySource(source: string, collectionId?: string): Promise<void> {
    this.mem = this.mem.filter(m => !(m.cmetadata?.source === source && (!collectionId || m.collection_id === collectionId)));
    if (this.pool && !this.useMem) {
      try {
        if (collectionId) await this.pool.query(`DELETE FROM langchain_pg_embedding WHERE cmetadata->>'source' = $1 AND collection_id = $2`, [source, collectionId]);
        else await this.pool.query(`DELETE FROM langchain_pg_embedding WHERE cmetadata->>'source' = $1`, [source]);
      } catch {}
    }
  }

  async listSources(collectionId = 'default'): Promise<string[]> {
    const memSources = [...new Set(this.mem.filter(m => m.collection_id === collectionId).map(m => m.cmetadata?.source).filter(Boolean))];
    if (this.useMem || !this.pool) return memSources;
    try {
      const r = await this.pool.query(`SELECT DISTINCT cmetadata->>'source' AS source FROM langchain_pg_embedding WHERE collection_id = $1`, [collectionId]);
      return r.rows.map((x: any) => x.source).filter(Boolean);
    } catch { return memSources; }
  }
}

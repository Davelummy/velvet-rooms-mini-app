import { Pool } from "pg";

let pool;

function getDatabaseUrl() {
  const raw = process.env.DATABASE_URL || "";
  if (!raw) {
    throw new Error("DATABASE_URL missing");
  }
  let normalized = raw;
  if (normalized.startsWith("postgresql+asyncpg://")) {
    normalized = normalized.replace("postgresql+asyncpg://", "postgresql://");
  }
  if (normalized.startsWith("postgres+asyncpg://")) {
    normalized = normalized.replace("postgres+asyncpg://", "postgresql://");
  }
  const url = new URL(normalized);
  url.searchParams.delete("ssl");
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslrootcert");
  url.searchParams.delete("sslcert");
  url.searchParams.delete("sslkey");
  return url.toString();
}

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      ssl: { rejectUnauthorized: false },
    });
    if (typeof pool.options.ssl === "string") {
      pool.options.ssl = { rejectUnauthorized: false };
    }
  }
  return pool;
}

export async function getClient() {
  const poolInstance = getPool();
  return poolInstance.connect();
}

export async function query(text, params = []) {
  const client = await getPool().connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

export async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

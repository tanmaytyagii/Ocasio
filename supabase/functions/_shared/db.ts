/**
 * The database, as the payment functions see it.
 *
 * Three operations, and the distinction between them is the security model:
 *
 *   userFor(token)     who the bearer token belongs to — checked by Supabase
 *                      Auth, not by decoding the token here
 *   rpcAsUser(token)   a database function called AS that user. auth.uid(),
 *                      RLS and every ownership rule in SQL apply.
 *   rpcAsService()     a database function called with the service role.
 *                      Used only for the steps no browser may take: attaching
 *                      an order, recording a provider refund, applying a
 *                      webhook.
 *
 * Built from a `createClient` passed in, so the same code runs with the jsr
 * client on Deno and the npm client in the test suite.
 */

export interface DbError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface DbResult<T> {
  data: T | null;
  error: DbError | null;
}

export interface Db {
  userFor(authorization: string): Promise<{ id: string; email: string | null } | null>;
  rpcAsUser<T>(authorization: string, fn: string, args: Record<string, unknown>): Promise<DbResult<T>>;
  rpcAsService<T>(fn: string, args: Record<string, unknown>): Promise<DbResult<T>>;
}

export interface ClientOptions {
  auth: { persistSession: boolean; autoRefreshToken: boolean };
  global?: { headers: Record<string, string> };
}

export type CreateClient = (url: string, key: string, options: ClientOptions) => unknown;

/** The slice of supabase-js used here. */
interface MinimalClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError | null }>;
  auth: {
    getUser(jwt?: string): Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: unknown;
    }>;
  };
}

export function supabaseDb(
  createClient: CreateClient,
  config: { url: string; anonKey: string; serviceRoleKey: string },
): Db {
  const options: ClientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
  const anon = createClient(config.url, config.anonKey, options) as MinimalClient;
  const service = createClient(config.url, config.serviceRoleKey, options) as MinimalClient;

  const asUser = (authorization: string) =>
    createClient(config.url, config.anonKey, {
      ...options,
      global: { headers: { Authorization: authorization } },
    }) as MinimalClient;

  return {
    async userFor(authorization) {
      const token = authorization.replace(/^Bearer\s+/i, '').trim();
      if (!token) return null;
      const { data, error } = await anon.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },

    async rpcAsUser<T>(authorization: string, fn: string, args: Record<string, unknown>) {
      const { data, error } = await asUser(authorization).rpc(fn, args);
      return { data: data as T | null, error };
    },

    async rpcAsService<T>(fn: string, args: Record<string, unknown>) {
      const { data, error } = await service.rpc(fn, args);
      return { data: data as T | null, error };
    },
  };
}

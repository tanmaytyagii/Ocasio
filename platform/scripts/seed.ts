import { createPool, environment, transaction } from '@ocasio/database';

async function main() {
  if (environment().NODE_ENV === 'production') throw new Error('Local seed is not allowed in production');
  const pool = createPool();
  try {
    await transaction(pool, async (client) => {
      const markets = [
        ['00000000-0000-4000-8000-000000000001','delhi-ncr','Delhi NCR'],
        ['00000000-0000-4000-8000-000000000002','karnal','Karnal'],
        ['00000000-0000-4000-8000-000000000003','muzaffarnagar','Muzaffarnagar'],
      ];
      for (const [order, market] of markets.entries()) {
        await client.query(`INSERT INTO coverage_markets(id,slug,name,sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT (slug) DO NOTHING`, [...market,order]);
      }
    });
    console.log('Intended markets seeded as research only. No vendors, reviews, bookings or availability invented.');
  } finally { await pool.end(); }
}
main().catch(() => { console.error('Local seed failed. Check database configuration and migrations.'); process.exitCode=1; });

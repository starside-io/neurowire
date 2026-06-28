import type { Theme } from '../types'

// Databases and data platforms. Every source here ships a verified RSS/Atom
// feed, so none needs a tap. The opt-in live test (NEUROWIRE_LIVE) flags drift.
const data: Theme = {
  key: 'data',
  title: 'Databases & Data',
  sources: [
    { name: 'PlanetScale Blog', url: 'https://planetscale.com/blog/rss.xml' },
    { name: 'Supabase Blog', url: 'https://supabase.com/rss.xml' },
    { name: 'Neon Blog', url: 'https://neon.tech/blog/rss.xml' },
    { name: 'DuckDB News', url: 'https://duckdb.org/feed.xml' },
    { name: 'Databricks Blog', url: 'https://www.databricks.com/feed' },
    { name: 'dbt Blog', url: 'https://www.getdbt.com/blog/atom.xml' },
    { name: 'Snowflake Blog', url: 'https://www.snowflake.com/feed/' },
    { name: 'MongoDB Blog', url: 'https://www.mongodb.com/blog/rss' },
    { name: 'Confluent Blog', url: 'https://www.confluent.io/feed/' },
    { name: 'Redis Blog', url: 'https://redis.io/blog/feed/' },
    { name: 'Elastic Blog', url: 'https://www.elastic.co/blog/feed' },
    { name: 'Timescale Blog', url: 'https://www.timescale.com/blog/rss/' },
  ],
}

export default data
export { data }

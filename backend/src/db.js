import pg from 'pg';

// DATE (type id 1082) -> keep as plain 'YYYY-MM-DD' text instead of a JS Date,
// otherwise the server's timezone can shift the day by one.
pg.types.setTypeParser(1082, (value) => value);

// One pool = a set of reusable connections shared by all requests.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Run with: npm run db:check   (from the project root)
// Prints what the backend is trying to connect to, then tests the connection.
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('X DATABASE_URL is empty. Does backend/.env exist?');
  process.exit(1);
}

let u;
try { u = new URL(url); } catch {
  console.log('X DATABASE_URL is not a valid URL. Special characters in the password must be URL-encoded.');
  process.exit(1);
}

console.log('Trying to connect with:');
console.log('  host     :', u.hostname);
console.log('  port     :', u.port || '5432');
console.log('  database :', u.pathname.slice(1));
console.log('  user     :', decodeURIComponent(u.username));
console.log('  password :', '*'.repeat(decodeURIComponent(u.password).length), `(${decodeURIComponent(u.password).length} characters)`);

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const who = await client.query('SELECT current_user, current_database(), inet_server_port() AS port');
  console.log('\nOK connected:', who.rows[0]);
  const t = await client.query("SELECT to_regclass('public.employees') AS employees_table");
  console.log(t.rows[0].employees_table ? 'OK employees table exists' : 'X employees table is MISSING (init.sql did not run; run: npm run db:reset)');
} catch (err) {
  console.log('\nX FAILED:', err.code || '', err.message);
  const hints = {
    ECONNREFUSED: 'Nothing is listening on that host/port. Is the DB container running (docker ps)? Is the port right (5439 in npm mode)?',
    ENOTFOUND: 'The host name is not found. In npm mode the host must be localhost or 127.0.0.1, not "db".',
    ETIMEDOUT: 'Connection timed out. Check the port and that Docker is running.',
    '28P01': 'Wrong password for this user. Another Postgres may own this port, or the volume was created with a different password: run npm run db:reset.',
    '3D000': 'The database name does not exist. Check POSTGRES_DB vs the name in DATABASE_URL, then npm run db:reset.',
  };
  if (hints[err.code]) console.log('Hint:', hints[err.code]);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

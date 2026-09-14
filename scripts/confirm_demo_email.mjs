import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hwwivzsdepzdgonfbkxq@aws-1-eu-west-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL');

  // Confirme l'email du compte démo
  const res = await client.query(
    `UPDATE auth.users 
     SET email_confirmed_at = NOW(), updated_at = NOW() 
     WHERE email = 'demo@wifizone.app' 
     RETURNING id, email, email_confirmed_at`
  );

  if (res.rows.length > 0) {
    console.log('✅ Email confirmed:', JSON.stringify(res.rows[0]));
  } else {
    console.log('⚠️  No user found or already confirmed, checking...');
    const check = await client.query(
      `SELECT id, email, email_confirmed_at, created_at FROM auth.users WHERE email = 'demo@wifizone.app'`
    );
    console.log('User state:', JSON.stringify(check.rows[0]));
  }
} catch (err) {
  console.error('❌ Error:', err.message);
} finally {
  await client.end();
}

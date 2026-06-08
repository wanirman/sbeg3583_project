const mysql = require('mysql2/promise');

// Single shared connection pool used across the whole app.
const pool = mysql.createPool({
  host:               process.env.DB_HOST     || '127.0.0.1',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'biodiversity_pwa',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  decimalNumbers:     true,  // return DECIMAL (lat/lng) columns as JS numbers, not strings
  charset:            'utf8mb4',
});

async function connectDB() {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
  console.log(`MySQL connected: ${process.env.DB_NAME || 'biodiversity_pwa'} @ ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3306}`);
}

module.exports = { pool, connectDB };

const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.POSTGRES_USER || "career_admin",
  password: process.env.POSTGRES_PASSWORD || "your_secure_password_here",
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "career_companion",
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("Unexpected database error:", err);
});

module.exports = pool;

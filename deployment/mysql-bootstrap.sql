-- One-time bootstrap: create the database and app user.
-- Run as MySQL root:  sudo mysql < deployment/mysql-bootstrap.sql
-- (Password here must match DB_PASSWORD in backend/.env)

CREATE DATABASE IF NOT EXISTS biodiversity_pwa
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'biodiversity_user'@'localhost'
  IDENTIFIED BY 'biodiv_pass_2026';

GRANT ALL PRIVILEGES ON biodiversity_pwa.* TO 'biodiversity_user'@'localhost';
FLUSH PRIVILEGES;

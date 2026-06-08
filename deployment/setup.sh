#!/bin/bash
# VPS Setup Script for BioReport PWA
# Run as root on Ubuntu 22.04 LTS

set -e
echo "=== BioReport VPS Setup ==="

# 1. Update system
apt-get update && apt-get upgrade -y

# 2. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 3. Install MySQL 8.0 (the single datastore for the whole app)
apt-get install -y mysql-server
systemctl enable --now mysql

# 4. Install PM2 (process manager)
npm install -g pm2

# 5. Create MySQL database and user
mysql -u root <<SQL
CREATE DATABASE IF NOT EXISTS biodiversity_pwa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'biodiversity_user'@'localhost' IDENTIFIED BY 'CHANGE_THIS_PASSWORD';
GRANT ALL PRIVILEGES ON biodiversity_pwa.* TO 'biodiversity_user'@'localhost';
FLUSH PRIVILEGES;
SQL

echo ""
echo "=== Setup complete ==="
echo "Next steps:"
echo "  1. Copy your .env file:  cp backend/.env.example backend/.env && nano backend/.env"
echo "  2. Install dependencies: cd backend && npm install"
echo "  3. Init database:        npm run db:init"
echo "  4. Start with PM2:       pm2 start src/server.js --name biodiversity && pm2 save"
echo "  5. Configure OLS vhost with deployment/ols/vhost.conf"
echo "  6. Promote an account to admin: cd backend && node scripts/make-admin.js you@example.com"

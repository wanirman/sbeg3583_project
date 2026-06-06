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

# 3. Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-7.0.list
apt-get update && apt-get install -y mongodb-org
systemctl enable --now mongod

# 4. Install MySQL 8.0
apt-get install -y mysql-server
systemctl enable --now mysql

# 5. Install Python dependencies
apt-get install -y python3 python3-pip
pip3 install -r /var/www/biodiversity/analytics/requirements.txt

# 6. Install PM2 (process manager)
npm install -g pm2

# 7. Create MySQL database and user
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
echo "  6. Create admin user in MySQL: INSERT INTO USER (user_name,email,password_hash,user_type) VALUES ('admin','admin@example.com','\$2b\$12\$...','admin');"

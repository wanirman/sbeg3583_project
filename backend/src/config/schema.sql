-- Biodiversity Reporting PWA — MySQL schema
-- Mirrors the former Mongoose models. Run via `npm run db:init`.

CREATE TABLE IF NOT EXISTS users (
  user_id       INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_name     VARCHAR(100) NOT NULL,
  user_type     ENUM('villager','tourist','admin') NOT NULL DEFAULT 'villager',
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  points        INT NOT NULL DEFAULT 0,
  join_date     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_verified          TINYINT(1) NOT NULL DEFAULT 0,  -- email verified? (new users start unverified)
  verification_code    VARCHAR(10) NULL,               -- 6-digit code, cleared once verified
  verification_expires DATETIME NULL,
  UNIQUE KEY uq_users_user_name (user_name),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS badges (
  badge_id    INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  badge_name  VARCHAR(100) NOT NULL,
  description TEXT NULL,
  icon_url    VARCHAR(500) NOT NULL DEFAULT '',
  threshold   INT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_badges_name (badge_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Junction table replacing the embedded `badges` array on the User document.
CREATE TABLE IF NOT EXISTS user_badges (
  user_id    INT UNSIGNED NOT NULL,
  badge_id   INT UNSIGNED NOT NULL,
  awarded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, badge_id),
  CONSTRAINT fk_ub_user  FOREIGN KEY (user_id)  REFERENCES users(user_id)   ON DELETE CASCADE,
  CONSTRAINT fk_ub_badge FOREIGN KEY (badge_id) REFERENCES badges(badge_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  category_id   INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL,
  description   TEXT NULL,
  icon          VARCHAR(255) NOT NULL DEFAULT '',
  sdg_goal      VARCHAR(255) NOT NULL DEFAULT '',
  UNIQUE KEY uq_categories_name (category_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS species (
  species_id        INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  species_name      VARCHAR(255) NOT NULL,
  scientific_name   VARCHAR(255) NOT NULL DEFAULT '',
  category_id       INT UNSIGNED NOT NULL,
  description       TEXT NULL,
  inat_taxon_id     INT UNSIGNED NULL,
  default_photo_url VARCHAR(500) NOT NULL DEFAULT '',
  KEY idx_species_sci (scientific_name),
  KEY idx_species_inat (inat_taxon_id),
  CONSTRAINT fk_species_category FOREIGN KEY (category_id) REFERENCES categories(category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS biodiversity_reports (
  report_id     INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  species_id    INT UNSIGNED NOT NULL,
  category_id   INT UNSIGNED NOT NULL,
  latitude      DECIMAL(10,7) NOT NULL,   -- replaces GeoJSON location.coordinates[1]
  longitude     DECIMAL(10,7) NOT NULL,   -- replaces GeoJSON location.coordinates[0]
  photo_url     VARCHAR(500) NULL,
  notes         TEXT NULL,
  report_status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  timestamp     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by   INT UNSIGNED NULL,
  reviewed_at   DATETIME NULL,
  admin_comment TEXT NULL,
  sync_status   ENUM('synced','pending','failed') NOT NULL DEFAULT 'synced',
  KEY idx_reports_status (report_status),
  KEY idx_reports_user (user_id),
  KEY idx_reports_category (category_id),
  KEY idx_reports_timestamp (timestamp),
  CONSTRAINT fk_report_user     FOREIGN KEY (user_id)     REFERENCES users(user_id),
  CONSTRAINT fk_report_species  FOREIGN KEY (species_id)  REFERENCES species(species_id),
  CONSTRAINT fk_report_category FOREIGN KEY (category_id) REFERENCES categories(category_id),
  CONSTRAINT fk_report_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  message_id      INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sender_id       INT UNSIGNED NOT NULL,
  sender_name     VARCHAR(100) NOT NULL,
  message_text    VARCHAR(1000) NOT NULL,
  timestamp       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sighting_ref_id INT UNSIGNED NULL,
  KEY idx_chat_timestamp (timestamp),
  CONSTRAINT fk_chat_sender   FOREIGN KEY (sender_id)       REFERENCES users(user_id),
  CONSTRAINT fk_chat_sighting FOREIGN KEY (sighting_ref_id) REFERENCES biodiversity_reports(report_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Editable app settings (key/value). Holds the iNaturalist token pasted by an
-- admin so it can be changed from the panel without editing .env / restarting.
CREATE TABLE IF NOT EXISTS settings (
  setting_key   VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value TEXT NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

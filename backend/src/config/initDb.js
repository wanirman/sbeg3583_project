require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs   = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const categories = [
  { category_name: 'Birds',    description: 'Avian species observed in the area' },
  { category_name: 'Reptiles', description: 'Reptilian species including lizards, snakes, and turtles' },
  { category_name: 'Plants',   description: 'Flora including trees, shrubs, and aquatic plants' },
  { category_name: 'Aquatic',  description: 'Aquatic fauna including fish, crustaceans, and amphibians' },
];

const speciesByCategory = {
  Birds:    [{ species_name: 'White-bellied Sea Eagle', scientific_name: 'Haliaeetus leucogaster' }, { species_name: 'Blue-throated Bee-eater', scientific_name: 'Merops viridis' }],
  Reptiles: [{ species_name: 'Monitor Lizard',          scientific_name: 'Varanus salvator' },        { species_name: 'Mangrove Pit Viper',      scientific_name: 'Trimeresurus purpureomaculatus' }],
  Plants:   [{ species_name: 'Mangrove Tree',           scientific_name: 'Rhizophora apiculata' },    { species_name: 'Nipah Palm',              scientific_name: 'Nypa fruticans' }],
  Aquatic:  [{ species_name: 'Archer Fish',             scientific_name: 'Toxotes jaculatrix' },      { species_name: 'Fiddler Crab',            scientific_name: 'Uca vocans' }],
};

const badges = [
  { badge_name: 'First Sighting',        description: 'Submitted your first biodiversity report', threshold: 1  },
  { badge_name: 'Nature Explorer',       description: 'Submitted 10 verified reports',            threshold: 10 },
  { badge_name: 'Biodiversity Champion', description: 'Submitted 50 verified reports',            threshold: 50 },
  { badge_name: 'Species Diversity',     description: 'Reported species from all 4 categories',   threshold: 4  },
];

async function seed() {
  const conn = await mysql.createConnection({
    host:               process.env.DB_HOST     || '127.0.0.1',
    port:               parseInt(process.env.DB_PORT) || 3306,
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'biodiversity_pwa',
    multipleStatements: true,
  });
  console.log('Connected. Creating schema...');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schema);
  console.log('Schema ready.');

  // Categories — idempotent upsert keyed on the unique category_name.
  for (const c of categories) {
    await conn.query(
      `INSERT INTO categories (category_name, description) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      [c.category_name, c.description]
    );
  }
  console.log('Categories seeded.');

  for (const [catName, speciesList] of Object.entries(speciesByCategory)) {
    const [[cat]] = await conn.query('SELECT category_id FROM categories WHERE category_name = ?', [catName]);
    for (const s of speciesList) {
      // No natural unique key on species_name, so guard against duplicates manually.
      const [[existing]] = await conn.query('SELECT species_id FROM species WHERE species_name = ?', [s.species_name]);
      if (existing) {
        await conn.query('UPDATE species SET scientific_name = ?, category_id = ? WHERE species_id = ?', [s.scientific_name, cat.category_id, existing.species_id]);
      } else {
        await conn.query('INSERT INTO species (species_name, scientific_name, category_id) VALUES (?, ?, ?)', [s.species_name, s.scientific_name, cat.category_id]);
      }
    }
  }
  console.log('Species seeded.');

  for (const b of badges) {
    await conn.query(
      `INSERT INTO badges (badge_name, description, threshold) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description), threshold = VALUES(threshold)`,
      [b.badge_name, b.description, b.threshold]
    );
  }
  console.log('Badges seeded.');

  console.log('Database initialised successfully.');
  await conn.end();
}

seed().catch(err => { console.error(err); process.exit(1); });

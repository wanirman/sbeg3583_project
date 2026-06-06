require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Species  = require('../models/Species');
const Badge    = require('../models/Badge');

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
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/biodiversity_pwa');
  console.log('Connected. Seeding...');

  for (const c of categories) {
    await Category.findOneAndUpdate({ category_name: c.category_name }, c, { upsert: true, new: true });
  }
  console.log('Categories seeded.');

  for (const [catName, speciesList] of Object.entries(speciesByCategory)) {
    const cat = await Category.findOne({ category_name: catName });
    for (const s of speciesList) {
      await Species.findOneAndUpdate({ species_name: s.species_name }, { ...s, category_id: cat._id }, { upsert: true, new: true });
    }
  }
  console.log('Species seeded.');

  for (const b of badges) {
    await Badge.findOneAndUpdate({ badge_name: b.badge_name }, b, { upsert: true, new: true });
  }
  console.log('Badges seeded.');

  console.log('Database initialised successfully.');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });

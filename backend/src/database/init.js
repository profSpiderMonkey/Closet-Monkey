const Database = require('./Database');

const createTables = async () => {
  await Database.run(`
    CREATE TABLE IF NOT EXISTS wardrobe_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      color TEXT,
      brand TEXT,
      material TEXT,
      size TEXT,
      rfid_tag TEXT UNIQUE,
      image TEXT,
      description TEXT,
      status TEXT DEFAULT 'in_closet',
      laundry_status TEXT DEFAULT 'clean',
      purchase_date DATE,
      price DECIMAL(10,2),
      last_worn DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await Database.run(`
    CREATE TABLE IF NOT EXISTS outfits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date_worn DATE,
      weather_temp INTEGER,
      weather_condition TEXT,
      occasion TEXT,
      location TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await Database.run(`
    CREATE TABLE IF NOT EXISTS outfit_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outfit_id INTEGER,
      item_id INTEGER,
      FOREIGN KEY (outfit_id) REFERENCES outfits (id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES wardrobe_items (id) ON DELETE CASCADE
    )
  `);

  await Database.run(`
    CREATE TABLE IF NOT EXISTS rfid_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfid_tag TEXT NOT NULL,
      event_type TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      location TEXT DEFAULT 'main_door'
    )
  `);

  console.log('Database tables created successfully');
};

const initializeDatabase = async () => {
  try {
    await createTables();
    console.log('Database initialized');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
};

module.exports = { initializeDatabase, createTables };

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const vision = require('@google-cloud/vision');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files (for uploaded images) with cache control
app.use('/uploads', express.static('uploads', {
  maxAge: '1h', // Cache for 1 hour
  etag: true,   // Enable ETag for cache validation
  setHeaders: (res, path) => {
    // Add cache headers for images
    if (path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png')) {
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }
}));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Google Vision client setup
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account-key.json'
});

// Database setup
const db = new sqlite3.Database('./closet_monkey.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initDB();
  }
});

// Database initialization
const initDB = () => {
  db.serialize(() => {
    // Users table (basic user management)
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Wardrobe items table
    db.run(`
      CREATE TABLE IF NOT EXISTS wardrobe_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT,
        color TEXT,
        material TEXT,
        brand TEXT,
        size TEXT,
        rfid_tag TEXT UNIQUE,
        image_url TEXT,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_worn_date DATETIME,
        status TEXT DEFAULT 'in_closet',
        laundry_status TEXT DEFAULT 'clean',
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Outfits table
    db.run(`
      CREATE TABLE IF NOT EXISTS outfits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        image_url TEXT,
        occasion TEXT,
        weather TEXT,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_worn_date DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Outfit items relationship table
    db.run(`
      CREATE TABLE IF NOT EXISTS outfit_items (
        outfit_id TEXT,
        item_id TEXT,
        item_name TEXT,
        item_type TEXT,
        item_color TEXT,
        item_category TEXT,
        confidence REAL DEFAULT 100,
        FOREIGN KEY (outfit_id) REFERENCES outfits (id),
        FOREIGN KEY (item_id) REFERENCES wardrobe_items (id),
        PRIMARY KEY (outfit_id, item_id)
      )
    `);

    // RFID scan logs table
    db.run(`
      CREATE TABLE IF NOT EXISTS rfid_scans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        rfid_tag TEXT NOT NULL,
        scan_type TEXT, -- 'entry' or 'exit'
        scan_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        location TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Add missing columns to outfit_items table if they don't exist
    db.run(`
      ALTER TABLE outfit_items ADD COLUMN item_name TEXT
    `, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Error adding item_name column:', err);
      }
    });
    
    db.run(`
      ALTER TABLE outfit_items ADD COLUMN item_type TEXT
    `, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Error adding item_type column:', err);
      }
    });
    
    db.run(`
      ALTER TABLE outfit_items ADD COLUMN item_color TEXT
    `, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Error adding item_color column:', err);
      }
    });
    
    db.run(`
      ALTER TABLE outfit_items ADD COLUMN item_category TEXT
    `, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Error adding item_category column:', err);
      }
    });
    
    db.run(`
      ALTER TABLE outfit_items ADD COLUMN item_image_url TEXT
    `, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Error adding item_image_url column:', err);
      }
    });

    console.log('Database tables initialized');
  });
};

// Helper Functions

// Helper function to convert RGB to HSL
const rgbToHsl = (r, g, b) => {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  
  return [h * 360, s, l];
};

// Simple, direct color detection function
const simpleColorDetection = (r, g, b) => {
  console.log(`🔍 Simple color detection for RGB(${r}, ${g}, ${b})`);
  
  // Check for grayscale first
  const diff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
  if (diff < 30) {
    const brightness = (r + g + b) / 3;
    if (brightness < 50) return 'black';
    if (brightness < 100) return 'dark gray';
    if (brightness < 150) return 'gray';
    if (brightness < 200) return 'light gray';
    return 'white';
  }
  
  // Find dominant channel
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  
  // Blue dominance
  if (b === max && b > 100) {
    if (r > 100 && g > 100) return 'light blue';
    if (b > 150) return 'blue';
    return 'navy';
  }
  
  // Red dominance with some green (browns/tans)
  if (r === max && r > g && r > b) {
    if (g > 100 && r > 150) return 'tan';
    if (g > 50 && r > 100) return 'brown';
    return 'red';
  }
  
  // Green dominance
  if (g === max && g > 100) {
    return 'green';
  }
  
  // Mixed red/green (yellows/oranges)
  if (r > 150 && g > 150 && b < 100) {
    return 'yellow';
  }
  
  return 'unknown';
};

// Helper function to convert RGB to color name
const rgbToColorName = (r, g, b) => {
  // Comprehensive color palette with clothing-relevant colors
  const colors = [
    // Neutrals - More accurate grays and blacks
    { name: 'black', rgb: [0, 0, 0] },
    { name: 'off-black', rgb: [25, 25, 25] },
    { name: 'charcoal', rgb: [54, 69, 79] },
    { name: 'dark gray', rgb: [64, 64, 64] },
    { name: 'gray', rgb: [128, 128, 128] },
    { name: 'medium gray', rgb: [160, 160, 160] },
    { name: 'light gray', rgb: [211, 211, 211] },
    { name: 'silver', rgb: [192, 192, 192] },
    { name: 'off-white', rgb: [250, 250, 250] },
    { name: 'white', rgb: [255, 255, 255] },
    
    // Browns/Tans/Beiges - Expanded and more accurate
    { name: 'cream', rgb: [255, 253, 208] },
    { name: 'ivory', rgb: [255, 255, 240] },
    { name: 'beige', rgb: [245, 245, 220] },
    { name: 'light beige', rgb: [245, 232, 210] },
    { name: 'sand', rgb: [244, 223, 187] },
    { name: 'tan', rgb: [210, 180, 140] },
    { name: 'light tan', rgb: [222, 196, 165] },
    { name: 'khaki', rgb: [195, 176, 145] },
    { name: 'dark khaki', rgb: [189, 183, 107] },
    { name: 'taupe', rgb: [183, 173, 168] },
    { name: 'camel', rgb: [193, 154, 107] },
    { name: 'wheat', rgb: [245, 222, 179] },
    { name: 'biscuit', rgb: [226, 196, 162] },
    { name: 'light brown', rgb: [181, 134, 84] },
    { name: 'brown', rgb: [150, 75, 0] },
    { name: 'medium brown', rgb: [139, 90, 43] },
    { name: 'dark brown', rgb: [101, 67, 33] },
    { name: 'chocolate', rgb: [123, 63, 0] },
    { name: 'coffee', rgb: [111, 78, 55] },
    { name: 'espresso', rgb: [76, 57, 48] },
    { name: 'cognac', rgb: [159, 69, 19] },
    { name: 'chestnut', rgb: [149, 69, 53] },
    { name: 'mahogany', rgb: [192, 64, 0] },
    { name: 'rust', rgb: [183, 65, 14] },
    { name: 'sienna', rgb: [160, 82, 45] },
    { name: 'burnt sienna', rgb: [138, 54, 15] },
    { name: 'saddle brown', rgb: [139, 69, 19] },
    { name: 'mocha', rgb: [129, 97, 82] },
    
    // Blues - Enhanced navy and light blue detection
    { name: 'navy', rgb: [0, 0, 128] },
    { name: 'dark navy', rgb: [0, 0, 80] },
    { name: 'midnight blue', rgb: [25, 25, 112] },
    { name: 'oxford blue', rgb: [0, 33, 71] },
    { name: 'prussian blue', rgb: [0, 49, 83] },
    { name: 'indigo', rgb: [75, 0, 130] },
    { name: 'royal blue', rgb: [65, 105, 225] },
    { name: 'cobalt blue', rgb: [0, 71, 171] },
    { name: 'blue', rgb: [0, 0, 255] },
    { name: 'medium blue', rgb: [0, 123, 255] },
    { name: 'steel blue', rgb: [70, 130, 180] },
    { name: 'slate blue', rgb: [106, 90, 205] },
    { name: 'cornflower blue', rgb: [100, 149, 237] },
    { name: 'sky blue', rgb: [135, 206, 235] },
    { name: 'light blue', rgb: [173, 216, 230] },
    { name: 'powder blue', rgb: [176, 224, 230] },
    { name: 'baby blue', rgb: [137, 207, 240] },
    { name: 'pale blue', rgb: [175, 238, 238] },
    { name: 'ice blue', rgb: [197, 231, 240] },
    { name: 'periwinkle', rgb: [204, 204, 255] },
    { name: 'denim blue', rgb: [21, 96, 189] },
    { name: 'teal', rgb: [0, 128, 128] },
    { name: 'turquoise', rgb: [64, 224, 208] },
    { name: 'aqua', rgb: [0, 255, 255] },
    
    // Reds - Better burgundy/wine detection
    { name: 'burgundy', rgb: [128, 0, 32] },
    { name: 'wine', rgb: [114, 47, 55] },
    { name: 'maroon', rgb: [128, 0, 0] },
    { name: 'bordeaux', rgb: [76, 0, 28] },
    { name: 'dark red', rgb: [139, 0, 0] },
    { name: 'brick red', rgb: [178, 34, 34] },
    { name: 'crimson', rgb: [220, 20, 60] },
    { name: 'red', rgb: [255, 0, 0] },
    { name: 'scarlet', rgb: [255, 36, 0] },
    { name: 'cherry red', rgb: [222, 49, 99] },
    
    // Greens
    { name: 'dark green', rgb: [0, 100, 0] },
    { name: 'forest green', rgb: [34, 139, 34] },
    { name: 'hunter green', rgb: [53, 94, 59] },
    { name: 'bottle green', rgb: [0, 106, 78] },
    { name: 'emerald', rgb: [80, 200, 120] },
    { name: 'green', rgb: [0, 128, 0] },
    { name: 'kelly green', rgb: [76, 187, 23] },
    { name: 'olive', rgb: [128, 128, 0] },
    { name: 'olive green', rgb: [85, 107, 47] },
    { name: 'army green', rgb: [75, 83, 32] },
    { name: 'sage', rgb: [157, 187, 123] },
    { name: 'mint green', rgb: [152, 251, 152] },
    { name: 'sea green', rgb: [46, 139, 87] },
    
    // Purples
    { name: 'eggplant', rgb: [97, 64, 81] },
    { name: 'dark purple', rgb: [75, 0, 130] },
    { name: 'purple', rgb: [128, 0, 128] },
    { name: 'royal purple', rgb: [120, 81, 169] },
    { name: 'violet', rgb: [238, 130, 238] },
    { name: 'orchid', rgb: [218, 112, 214] },
    { name: 'plum', rgb: [221, 160, 221] },
    { name: 'mauve', rgb: [224, 176, 255] },
    { name: 'lavender', rgb: [230, 230, 250] },
    { name: 'lilac', rgb: [200, 162, 200] },
    
    // Pinks
    { name: 'raspberry', rgb: [227, 11, 93] },
    { name: 'hot pink', rgb: [255, 105, 180] },
    { name: 'fuchsia', rgb: [255, 0, 255] },
    { name: 'pink', rgb: [255, 192, 203] },
    { name: 'rose', rgb: [255, 228, 225] },
    { name: 'dusty rose', rgb: [220, 152, 163] },
    { name: 'blush', rgb: [222, 93, 131] },
    { name: 'coral', rgb: [255, 127, 80] },
    { name: 'salmon', rgb: [250, 128, 114] },
    { name: 'peach', rgb: [255, 218, 185] },
    
    // Yellows/Oranges
    { name: 'yellow', rgb: [255, 255, 0] },
    { name: 'lemon', rgb: [255, 244, 79] },
    { name: 'gold', rgb: [255, 215, 0] },
    { name: 'mustard', rgb: [255, 219, 88] },
    { name: 'amber', rgb: [255, 191, 0] },
    { name: 'honey', rgb: [251, 218, 117] },
    { name: 'orange', rgb: [255, 165, 0] },
    { name: 'burnt orange', rgb: [204, 85, 0] },
    { name: 'tangerine', rgb: [242, 133, 0] },
    { name: 'apricot', rgb: [251, 206, 177] }
  ];

  console.log(`🎨 Color analysis for RGB(${r}, ${g}, ${b}):`);
  
  // Convert RGB to HSL for better color analysis
  const hsl = rgbToHsl(r, g, b);
  const [h, s, l] = hsl;
  console.log(`   HSL: (${h.toFixed(1)}°, ${(s * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%)`);
  
  // Special case: Check for beige/tan/khaki colors first
  // These colors have specific RGB characteristics
  const isWarmNeutral = (r > g && g > b) && // Red > Green > Blue pattern
                        (r - b < 100) && // Not too much difference
                        (Math.abs(r - g) < 50); // Red and green are close
  
  if (isWarmNeutral && s < 0.35) {
    // Warm neutrals (beige, tan, khaki, etc.)
    if (l > 0.85) return 'cream';
    if (l > 0.8) return 'beige';
    if (l > 0.7) return 'light beige';
    if (l > 0.6) return 'tan';
    if (l > 0.5) return 'khaki';
    if (l > 0.4) return 'camel';
    return 'light brown';
  }
  
  // Check for true browns (not reds)
  const isBrown = (r > g && g > b) && // Brown pattern
                  (r - g > 20) && // More red than green
                  (g - b > 10) && // More green than blue
                  (h >= 10 && h <= 40); // Orange-ish hue
  
  if (isBrown && s > 0.15) {
    if (l < 0.2) return 'dark brown';
    if (l < 0.3) return 'chocolate';
    if (l < 0.4) return 'brown';
    if (l < 0.5) return 'medium brown';
    if (l < 0.6) return 'light brown';
    return 'tan';
  }
  
  // Check for olive green BEFORE grayscale detection
  // Olive greens often have low saturation but specific hue range
  if (h >= 50 && h <= 90 && s >= 0.03 && s <= 0.5) {
    // This is likely an olive/khaki color family
    if (l < 0.25) return 'dark olive';
    if (l < 0.35) return 'olive green';
    if (l < 0.45) return 'olive';
    if (l < 0.55) return 'light olive';
    if (s < 0.15) return 'khaki';
    return 'olive';
  }
  
  // Very low saturation = grayscale (but higher threshold to not catch olives)
  if (s < 0.05) {  // Reduced from 0.1 to be more strict about grayscale
    if (l < 0.15) return 'black';
    if (l < 0.25) return 'off-black';
    if (l < 0.35) return 'charcoal';
    if (l < 0.45) return 'dark gray';
    if (l < 0.55) return 'gray';
    if (l < 0.65) return 'medium gray';
    if (l < 0.75) return 'light gray';
    if (l < 0.85) return 'silver';
    if (l < 0.95) return 'off-white';
    return 'white';
  }
  
  // Navy detection - dark blues with low brightness
  if (h >= 200 && h <= 250 && l < 0.3 && s > 0.5) {
    if (l < 0.15) return 'midnight blue';
    if (l < 0.25) return 'navy';
    return 'dark navy';
  }
  
  // Light blue detection
  if (h >= 180 && h <= 240 && l > 0.5) {
    if (l > 0.85 && s > 0.15) return 'ice blue';
    if (l > 0.8 && s > 0.2) return 'baby blue';
    if (l > 0.7 && s > 0.15) return 'powder blue';
    if (l > 0.6 && s > 0.2) return 'light blue';
    if (l > 0.5 && s > 0.3) return 'sky blue';
  }
  
  // Color detection based on hue ranges
  if (s > 0.1) {
    // Reds (0-10, 350-360)
    if ((h >= 0 && h < 10) || (h >= 350 && h <= 360)) {
      if (s < 0.5 && l < 0.3) return 'maroon';
      if (s < 0.6 && l < 0.4) return 'burgundy';
      if (l > 0.8) return 'pink';
      if (l > 0.6) return 'rose';
      if (l < 0.5) return 'dark red';
      return 'red';
    }
    
    // Orange-browns (10-40)
    if (h >= 10 && h < 40) {
      if (s < 0.3) {
        if (l < 0.4) return 'brown';
        if (l < 0.6) return 'light brown';
        return 'tan';
      }
      if (l > 0.7) return 'peach';
      if (l > 0.5) return 'coral';
      if (s > 0.7) return 'orange';
      return 'burnt orange';
    }
    
    // Yellows (40-70)
    if (h >= 40 && h < 70) {
      if (s < 0.3 && l > 0.6) return 'beige';
      if (l > 0.8) return 'cream';
      if (l > 0.6) return 'yellow';
      if (s > 0.5) return 'gold';
      return 'mustard';
    }
    
    // Yellow-greens (70-90)
    if (h >= 70 && h < 90) {
      if (s < 0.2 && l > 0.5) return 'khaki';
      if (s < 0.3 && l < 0.5) return 'olive';
      if (l > 0.6) return 'lime';
      return 'olive green';
    }
    
    // Greens (90-150)
    if (h >= 90 && h < 150) {
      if (s < 0.3 && l > 0.5) return 'sage';
      if (s < 0.4 && l < 0.4) return 'forest green';
      if (l > 0.7) return 'mint green';
      if (l < 0.3) return 'dark green';
      if (l < 0.4) return 'forest green';
      if (s > 0.6) return 'bright green';
      return 'green';
    }
    
    // Cyan/Teal (150-180)
    if (h >= 150 && h < 180) {
      if (l > 0.6) return 'aqua';
      if (l > 0.4) return 'turquoise';
      return 'teal';
    }
    
    // Blues (180-240)
    if (h >= 180 && h < 240) {
      if (l > 0.8) return 'baby blue';
      if (l > 0.6) return 'light blue';
      if (l > 0.4) return 'blue';
      if (l > 0.2) return 'navy';
      return 'midnight blue';
    }
    
    // Blue-purples (240-270)
    if (h >= 240 && h < 270) {
      if (l > 0.7) return 'periwinkle';
      if (l > 0.5) return 'slate blue';
      if (s > 0.5) return 'indigo';
      return 'dark purple';
    }
    
    // Purples (270-300)
    if (h >= 270 && h < 300) {
      if (l > 0.8) return 'lavender';
      if (l > 0.6) return 'violet';
      if (l > 0.4) return 'purple';
      return 'dark purple';
    }
    
    // Red-purples (300-350)
    if (h >= 300 && h < 350) {
      if (l > 0.7) return 'pink';
      if (l > 0.5) return 'hot pink';
      if (s < 0.5 && l < 0.4) return 'wine';
      return 'magenta';
    }
  }
  
  // Fallback to closest color match using improved distance calculation
  let closestColor = colors[0];
  let minDistance = Infinity;

  colors.forEach(color => {
    // Use CIE76 color difference formula for better perceptual accuracy
    const distance = Math.sqrt(
      Math.pow((r - color.rgb[0]) * 2, 2) +
      Math.pow((g - color.rgb[1]) * 4, 2) +
      Math.pow((b - color.rgb[2]) * 3, 2)
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = color;
    }
  });

  console.log(`   Closest match: ${closestColor.name} (distance: ${minDistance.toFixed(2)})`);
  
  // Only return closest match if it's really close
  return minDistance < 50 ? closestColor.name : 'unknown';
};

// Helper function to merge similar detected items (especially shoes)
const mergeDetectedItems = (items) => {
  console.log('🔗 Starting merge process with items:', items.map(i => ({ type: i.type, name: i.name })));
  const merged = [];
  const processed = new Set();
  
  items.forEach((item, index) => {
    if (processed.has(index)) return;
    
    const itemType = item.type.toLowerCase();
    console.log(`   Checking item ${index}: ${item.type} (${itemType})`);
    
    // For shoes, merge all shoe detections into one "shoes" item
    if (itemType.includes('shoe') || itemType.includes('footwear')) {
      // Find all other shoe items
      const shoeItems = items.filter((otherItem, otherIndex) => {
        const otherType = otherItem.type.toLowerCase();
        return (otherType.includes('shoe') || otherType.includes('footwear')) && !processed.has(otherIndex);
      });
      
      console.log(`   👟 Found ${shoeItems.length} shoe items to merge`);
      
      if (shoeItems.length > 0) {
        // Mark all shoe items as processed
        items.forEach((otherItem, otherIndex) => {
          const otherType = otherItem.type.toLowerCase();
          if (otherType.includes('shoe') || otherType.includes('footwear')) {
            processed.add(otherIndex);
          }
        });
        
        // Create a merged shoes item with highest confidence
        const bestShoe = shoeItems.reduce((best, current) => 
          current.confidence > best.confidence ? current : best
        );
        
        // Store all bounding boxes for combined cropping
        const allBoundingBoxes = shoeItems.map(shoe => shoe.boundingBox).filter(box => box);
        console.log(`   📦 Collected ${allBoundingBoxes.length} bounding boxes for shoes`);
        
        merged.push({
          ...bestShoe,
          type: 'shoes', // Plural form
          confidence: Math.max(...shoeItems.map(s => s.confidence)),
          allBoundingBoxes: allBoundingBoxes // Store all shoe bounding boxes for cropping
        });
        
        console.log(`   🔗 Merged ${shoeItems.length} shoe detections into single "shoes" item with ${allBoundingBoxes.length} bounding boxes`);
      }
    }
    // For other items, check for exact duplicates
    else {
      // Find items of the same type
      const sameTypeItems = items.filter((otherItem, otherIndex) => {
        return otherItem.type.toLowerCase() === itemType && !processed.has(otherIndex);
      });
      
      if (sameTypeItems.length > 1) {
        // Mark all as processed
        items.forEach((otherItem, otherIndex) => {
          if (otherItem.type.toLowerCase() === itemType) {
            processed.add(otherIndex);
          }
        });
        
        // Keep the one with highest confidence
        const bestItem = sameTypeItems.reduce((best, current) => 
          current.confidence > best.confidence ? current : best
        );
        
        merged.push(bestItem);
        console.log(`   🔗 Merged ${sameTypeItems.length} ${itemType} detections into single item`);
      } else {
        processed.add(index);
        merged.push(item);
      }
    }
  });
  
  return merged;
};

// Helper function to create cropped images from multiple bounding boxes (for shoes)
const createCombinedCroppedImage = (imageBuffer, boundingBoxes, itemName) => {
  const sharp = require('sharp');
  const path = require('path');
  const fs = require('fs');
  
  // Ensure crops directory exists
  const cropsDir = path.join(__dirname, 'uploads', 'crops');
  if (!fs.existsSync(cropsDir)) {
    fs.mkdirSync(cropsDir, { recursive: true });
  }
  
  // First, create a rotated buffer to ensure consistent dimensions
  return sharp(imageBuffer)
    .rotate() // Auto-rotate based on EXIF orientation
    .toBuffer({ resolveWithObject: true })
    .then(({ data: rotatedBuffer, info }) => {
      const { width, height } = info;
      
      console.log(`   🎯 Processing combined crop for ${itemName} - Image dimensions: ${width}x${height}`);
      
      // Calculate combined bounding box that encompasses all individual boxes
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      boundingBoxes.forEach((boundingBox, index) => {
        const vertices = boundingBox;
        if (vertices && vertices.length >= 4) {
          const xCoords = vertices.map(v => (v.x || 0) * width);
          const yCoords = vertices.map(v => (v.y || 0) * height);
          
          minX = Math.min(minX, ...xCoords);
          minY = Math.min(minY, ...yCoords);
          maxX = Math.max(maxX, ...xCoords);
          maxY = Math.max(maxY, ...yCoords);
          
          console.log(`      Box ${index + 1}: X[${Math.floor(Math.min(...xCoords))}-${Math.ceil(Math.max(...xCoords))}], Y[${Math.floor(Math.min(...yCoords))}-${Math.ceil(Math.max(...yCoords))}]`);
        }
      });
      
      // Add padding for combined crops
      const PADDING_PERCENT = 0.1; // 10% padding
      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;
      const xPadding = boxWidth * PADDING_PERCENT;
      const yPadding = boxHeight * PADDING_PERCENT;
      
      // Apply padding to the bounds
      minX = Math.max(0, minX - xPadding);
      minY = Math.max(0, minY - yPadding);
      maxX = Math.min(width - 1, maxX + xPadding);
      maxY = Math.min(height - 1, maxY + yPadding);
      
      // Calculate final crop bounds
      const left = Math.max(0, Math.floor(minX));
      const top = Math.max(0, Math.floor(minY));
      const right = Math.min(width - 1, Math.ceil(maxX));
      const bottom = Math.min(height - 1, Math.ceil(maxY));
      
      const cropWidth = Math.max(1, right - left);
      const cropHeight = Math.max(1, bottom - top);
      
      console.log(`   📐 Combined crop area: left=${left}, top=${top}, width=${cropWidth}, height=${cropHeight}`);
      console.log(`      Applied ${PADDING_PERCENT * 100}% padding to combined box`);
      
      if (cropWidth <= 0 || cropHeight <= 0 || left + cropWidth > width || top + cropHeight > height) {
        console.error(`   ❌ Invalid crop dimensions: ${cropWidth}x${cropHeight} at (${left},${top}) for image ${width}x${height}`);
        throw new Error(`Invalid combined crop dimensions: ${cropWidth}x${cropHeight} at position (${left},${top})`);
      }
      
      // Generate unique filename
      const filename = `${itemName}_${Date.now()}.jpg`;
      const outputPath = path.join(cropsDir, filename);
      
      // Crop and save the combined image from the rotated buffer
      return sharp(rotatedBuffer)
        .extract({
          left: left,
          top: top,
          width: cropWidth,
          height: cropHeight
        })
        .jpeg({ quality: 85 })
        .toFile(outputPath)
        .then(() => {
          console.log(`   ✅ Saved combined crop: ${filename}`);
          return `/uploads/crops/${filename}`;
        })
        .catch(err => {
          console.error(`   ❌ Sharp extract error:`, err.message);
          throw err;
        });
    });
};

// Helper function to create cropped images from bounding boxes
const createCroppedImage = (imageBuffer, boundingBox, itemName) => {
  const sharp = require('sharp');
  const path = require('path');
  const fs = require('fs');
  
  // Ensure crops directory exists
  const cropsDir = path.join(__dirname, 'uploads', 'crops');
  if (!fs.existsSync(cropsDir)) {
    fs.mkdirSync(cropsDir, { recursive: true });
  }
  
  // First, create a rotated buffer to ensure consistent dimensions
  return sharp(imageBuffer)
    .rotate() // Auto-rotate based on EXIF orientation
    .toBuffer({ resolveWithObject: true })
    .then(({ data: rotatedBuffer, info }) => {
      const { width, height } = info;
      
      console.log(`   🎯 Processing crop for ${itemName} - Image dimensions: ${width}x${height}`);
      
      // Convert normalized coordinates to pixel coordinates
      const vertices = boundingBox;
      if (!vertices || vertices.length < 4) {
        throw new Error('Invalid bounding box: missing vertices');
      }
      
      // Find bounding rectangle from normalized vertices
      const xCoords = vertices.map(v => (v.x || 0) * width);
      const yCoords = vertices.map(v => (v.y || 0) * height);
      
      console.log(`      Normalized coords: X[${Math.min(...vertices.map(v => v.x || 0)).toFixed(3)}-${Math.max(...vertices.map(v => v.x || 0)).toFixed(3)}], Y[${Math.min(...vertices.map(v => v.y || 0)).toFixed(3)}-${Math.max(...vertices.map(v => v.y || 0)).toFixed(3)}]`);
      console.log(`      Pixel coords: X[${Math.floor(Math.min(...xCoords))}-${Math.ceil(Math.max(...xCoords))}], Y[${Math.floor(Math.min(...yCoords))}-${Math.ceil(Math.max(...yCoords))}]`);
      
      // Add padding to the bounding box to ensure we capture the full item
      // This helps when Vision API detection is too tight
      const PADDING_PERCENT = 0.1; // 10% padding on each side
      const boxWidth = Math.max(...xCoords) - Math.min(...xCoords);
      const boxHeight = Math.max(...yCoords) - Math.min(...yCoords);
      const xPadding = boxWidth * PADDING_PERCENT;
      const yPadding = boxHeight * PADDING_PERCENT;
      
      // Calculate bounds with padding and safety checks
      const left = Math.max(0, Math.floor(Math.min(...xCoords) - xPadding));
      const top = Math.max(0, Math.floor(Math.min(...yCoords) - yPadding));
      const right = Math.min(width - 1, Math.ceil(Math.max(...xCoords) + xPadding));
      const bottom = Math.min(height - 1, Math.ceil(Math.max(...yCoords) + yPadding));
      
      const cropWidth = Math.max(1, right - left);
      const cropHeight = Math.max(1, bottom - top);
      
      console.log(`      Applied ${PADDING_PERCENT * 100}% padding - Final crop: left=${left}, top=${top}, width=${cropWidth}, height=${cropHeight}`);
      
      console.log(`   📐 Crop area: left=${left}, top=${top}, width=${cropWidth}, height=${cropHeight}`);
      
      // Validate crop dimensions
      if (cropWidth <= 0 || cropHeight <= 0 || left + cropWidth > width || top + cropHeight > height) {
        console.error(`   ❌ Invalid crop dimensions: ${cropWidth}x${cropHeight} at (${left},${top}) for image ${width}x${height}`);
        throw new Error(`Invalid crop dimensions: ${cropWidth}x${cropHeight} at position (${left},${top})`);
      }
      
      // Generate unique filename
      const filename = `${itemName}_${Date.now()}.jpg`;
      const outputPath = path.join(cropsDir, filename);
      
      // Crop and save the image from the rotated buffer
      return sharp(rotatedBuffer)
        .extract({
          left: left,
          top: top,
          width: cropWidth,
          height: cropHeight
        })
        .jpeg({ quality: 85 })
        .toFile(outputPath)
        .then(() => {
          console.log(`   ✅ Saved crop: ${filename}`);
          return `/uploads/crops/${filename}`;
        })
        .catch(err => {
          console.error(`   ❌ Sharp extract error:`, err.message);
          throw err;
        });
    });
};

// Analyze image with Google Vision API
const analyzeImageWithVision = async (imageData) => {
  try {
    let imageBuffer;
    
    // Handle base64 image data
    if (imageData.startsWith('data:image')) {
      const base64Data = imageData.split(',')[1];
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      imageBuffer = Buffer.from(imageData, 'base64');
    }

    // Perform multiple Vision API calls
    const [objectResult] = await visionClient.objectLocalization({
      image: { content: imageBuffer }
    });

    const [labelResult] = await visionClient.labelDetection({
      image: { content: imageBuffer }
    });

    const [textResult] = await visionClient.textDetection({
      image: { content: imageBuffer }
    });

    const [propertiesResult] = await visionClient.imageProperties({
      image: { content: imageBuffer }
    });

    // Try web detection for better clothing recognition
    const [webResult] = await visionClient.webDetection({
      image: { content: imageBuffer }
    });

    const detectedItems = [];
    const colors = [];
    const clothingTerms = [
      'shirt', 'pants', 'dress', 'jacket', 'shoe', 'tie', 'hat', 'sock', 
      'suit', 'jeans', 'sweater', 'coat', 'blazer', 'skirt', 'blouse',
      'trouser', 'sneaker', 'boot', 'sandal', 'heel', 'belt', 'scarf',
      'vest', 'cardigan', 'hoodie', 'polo', 't-shirt', 'tank top',
      'shorts', 'leggings', 'sweatpants', 'sweatshirt', 'footwear',
      'clothing', 'apparel', 'garment', 'outfit', 'top', 'bottom',
      'crop top', 'turtleneck', 'collar', 'sleeve', 'pocket'
    ];
    
    console.log('🔍 Processing detected objects first...');
    
    // Extract actual colors from Vision API FIRST
    console.log('🎨 Extracting colors from Vision API...');
    // Don't log entire properties result as it's too verbose
    const detectedColors = [];
    
    // Track all detections for debugging summary
    const debugSummary = {
      totalObjectsDetected: 0,
      objectsAccepted: [],
      objectsRejected: [],
      objectsFiltered: [],
      labelsDetected: [],
      webEntitiesDetected: [],
      colorsDetected: [],
      finalItemsCount: 0
    };
    
    // Check multiple possible response structures from Vision API
    let dominantColors = null;
    
    // Try different possible paths for the dominant colors
    if (propertiesResult.dominantColors && propertiesResult.dominantColors.colors) {
      dominantColors = propertiesResult.dominantColors.colors;
    } else if (propertiesResult.imagePropertiesAnnotation && propertiesResult.imagePropertiesAnnotation.dominantColors) {
      dominantColors = propertiesResult.imagePropertiesAnnotation.dominantColors.colors;
    } else if (propertiesResult.imageProperties && propertiesResult.imageProperties.dominantColors) {
      dominantColors = propertiesResult.imageProperties.dominantColors.colors;
    }
    
    if (dominantColors && dominantColors.length > 0) {
      console.log(`   Found ${dominantColors.length} dominant colors`);
      
      dominantColors.slice(0, 5).forEach((colorInfo, index) => {
        const { red, green, blue } = colorInfo.color;
        const r = Math.round(red || 0);
        const g = Math.round(green || 0); 
        const b = Math.round(blue || 0);
        const colorName = rgbToColorName(r, g, b);
        const pixelFraction = colorInfo.pixelFraction || 0;
        
        console.log(`   🎨 Color ${index + 1}: RGB(${r}, ${g}, ${b}) = ${colorName} (${(pixelFraction * 100).toFixed(1)}%)`);
        
        // Additional debug for olive/green colors or low saturation colors
        const [h, s, l] = rgbToHsl(r, g, b);
        if ((h >= 50 && h <= 150) || s < 0.1 || colorName.includes('olive') || colorName.includes('green')) {
          console.log(`      🔍 Color analysis: HSL(${h.toFixed(1)}°, ${(s*100).toFixed(1)}%, ${(l*100).toFixed(1)}%)`);
        }
        
        // Only add valid color names
        if (colorName && colorName !== 'unknown') {
          detectedColors.push(colorName);
        }
      });
    } else {
      console.log('⚠️  No dominant colors found in Vision API response');
      console.log('   Direct dominantColors exists:', !!propertiesResult.dominantColors);
      console.log('   imagePropertiesAnnotation exists:', !!propertiesResult.imagePropertiesAnnotation);
      console.log('   imageProperties exists:', !!propertiesResult.imageProperties);
      
      // Log the actual structure for debugging
      console.log('   Available keys in propertiesResult:', Object.keys(propertiesResult));
    }
    
    // Helper function to calculate IoU (Intersection over Union) for bounding boxes
    // This helps detect overlapping items to prevent duplicates
    const calculateIoU = (box1, box2) => {
      if (!box1 || !box2 || box1.length < 4 || box2.length < 4) return 0;
      
      // Get min/max coordinates for each box
      const getMinMax = (vertices) => {
        const xs = vertices.map(v => v.x || 0);
        const ys = vertices.map(v => v.y || 0);
        return {
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys)
        };
      };
      
      const bounds1 = getMinMax(box1);
      const bounds2 = getMinMax(box2);
      
      // Calculate intersection
      const xOverlap = Math.max(0, Math.min(bounds1.maxX, bounds2.maxX) - Math.max(bounds1.minX, bounds2.minX));
      const yOverlap = Math.max(0, Math.min(bounds1.maxY, bounds2.maxY) - Math.max(bounds1.minY, bounds2.minY));
      const intersectionArea = xOverlap * yOverlap;
      
      // Calculate union
      const area1 = (bounds1.maxX - bounds1.minX) * (bounds1.maxY - bounds1.minY);
      const area2 = (bounds2.maxX - bounds2.minX) * (bounds2.maxY - bounds2.minY);
      const unionArea = area1 + area2 - intersectionArea;
      
      return unionArea > 0 ? intersectionArea / unionArea : 0;
    };

    // Process detected objects AFTER color detection
    if (objectResult.localizedObjectAnnotations) {
      debugSummary.totalObjectsDetected = objectResult.localizedObjectAnnotations.length;
      console.log(`\n📦 OBJECT DETECTION RESULTS: ${debugSummary.totalObjectsDetected} objects found`);
      console.log('══════════════════════════════════════════════════════════════');
      
      objectResult.localizedObjectAnnotations.forEach((obj, idx) => {
        const bbox = obj.boundingPoly?.normalizedVertices;
        console.log(`\n  [${idx + 1}] Object: "${obj.name}" (Confidence: ${(obj.score * 100).toFixed(1)}%)`);
        if (bbox && bbox.length >= 4) {
          console.log(`      📍 Bounding Box:`);
          console.log(`         Top-Left:     (${(bbox[0]?.x || 0).toFixed(3)}, ${(bbox[0]?.y || 0).toFixed(3)})`);
          console.log(`         Top-Right:    (${(bbox[1]?.x || 0).toFixed(3)}, ${(bbox[1]?.y || 0).toFixed(3)})`);
          console.log(`         Bottom-Right: (${(bbox[2]?.x || 0).toFixed(3)}, ${(bbox[2]?.y || 0).toFixed(3)})`);
          console.log(`         Bottom-Left:  (${(bbox[3]?.x || 0).toFixed(3)}, ${(bbox[3]?.y || 0).toFixed(3)})`);
          console.log(`         Width:  ${((bbox[1]?.x - bbox[0]?.x) || 0).toFixed(3)}`);
          console.log(`         Height: ${((bbox[2]?.y - bbox[0]?.y) || 0).toFixed(3)}`);
        } else {
          console.log(`      ⚠️  No bounding box data`);
        }
      });
      console.log('\n══════════════════════════════════════════════════════════════');
      
      // Filter and process objects with confidence threshold
      const MIN_CONFIDENCE = 0.4; // 40% minimum confidence (lowered to catch more items)
      const IOU_THRESHOLD = 0.3; // 30% overlap threshold for considering duplicates
      
      const candidateItems = [];
      
      // First, collect all valid clothing items with sufficient confidence
      objectResult.localizedObjectAnnotations.forEach(obj => {
        const objectName = obj.name.toLowerCase();
        const isClothingItem = clothingTerms.some(term => 
          objectName.includes(term) || term.includes(objectName) ||
          // Also check for partial matches
          (term.includes(' ') && term.split(' ').some(part => objectName.includes(part)))
        );
        
        if (obj.score >= MIN_CONFIDENCE && isClothingItem) {
          console.log(`\n   ✅ ACCEPTED: "${obj.name}" (${(obj.score * 100).toFixed(1)}%)`);
          console.log(`      Reason: Matches clothing terms and confidence >= ${(MIN_CONFIDENCE * 100).toFixed(0)}%`);
          debugSummary.objectsAccepted.push(`${obj.name} (${(obj.score * 100).toFixed(1)}%)`);
          candidateItems.push({
            type: objectName,
            confidence: Math.round(obj.score * 100),
            boundingBox: obj.boundingPoly.normalizedVertices,
            source: 'object_detection',
            score: obj.score
          });
        } else if (isClothingItem) {
          console.log(`\n   ❌ REJECTED: "${obj.name}" (${(obj.score * 100).toFixed(1)}%)`);
          console.log(`      Reason: Confidence below ${(MIN_CONFIDENCE * 100).toFixed(0)}% threshold`);
          debugSummary.objectsRejected.push(`${obj.name} (${(obj.score * 100).toFixed(1)}%) - low confidence`);
        } else if (obj.score >= MIN_CONFIDENCE) {
          console.log(`\n   ❌ REJECTED: "${obj.name}" (${(obj.score * 100).toFixed(1)}%)`);
          console.log(`      Reason: Not a clothing item`);
          debugSummary.objectsRejected.push(`${obj.name} (${(obj.score * 100).toFixed(1)}%) - not clothing`);
        }
      });
      
      // Sort by confidence score (highest first)
      candidateItems.sort((a, b) => b.score - a.score);
      
      // Remove duplicates based on bounding box overlap
      const filteredItems = [];
      candidateItems.forEach(item => {
        let isDuplicate = false;
        
        // Check if this item overlaps significantly with any already accepted item
        for (const acceptedItem of filteredItems) {
          // Check if same type or similar type
          const sameType = item.type === acceptedItem.type || 
                          (item.type.includes(acceptedItem.type) || acceptedItem.type.includes(item.type));
          
          if (sameType && item.boundingBox && acceptedItem.boundingBox) {
            const iou = calculateIoU(item.boundingBox, acceptedItem.boundingBox);
            if (iou > IOU_THRESHOLD) {
              isDuplicate = true;
              console.log(`\n   🔄 FILTERED DUPLICATE: "${item.type}" (${item.confidence}%)`);
              console.log(`      Overlaps with: "${acceptedItem.type}" (${acceptedItem.confidence}%)`);
              console.log(`      IoU (Intersection over Union): ${(iou * 100).toFixed(1)}%`);
              debugSummary.objectsFiltered.push(`${item.type} overlaps ${acceptedItem.type} (IoU: ${(iou * 100).toFixed(1)}%)`);
              break;
            }
          }
        }
        
        if (!isDuplicate) {
          filteredItems.push(item);
        }
      });
      
      // Add filtered items to detectedItems
      filteredItems.forEach(item => {
        delete item.score; // Remove temporary score field
        detectedItems.push(item);
      });
      
      console.log(`\n📊 OBJECT FILTERING SUMMARY:`);
      console.log(`   Total candidates: ${candidateItems.length}`);
      console.log(`   After duplicate removal: ${filteredItems.length}`);
      console.log(`   Duplicates filtered: ${candidateItems.length - filteredItems.length}`);
    }

    // Log raw label results
    if (labelResult.labelAnnotations) {
      console.log(`\n🏷️  LABEL DETECTION RESULTS: ${labelResult.labelAnnotations.length} labels found`);
      console.log('══════════════════════════════════════════════════════════════');
      labelResult.labelAnnotations.slice(0, 15).forEach((label, idx) => {
        console.log(`  [${idx + 1}] "${label.description}" (${(label.score * 100).toFixed(1)}%)`);
        debugSummary.labelsDetected.push(`${label.description} (${(label.score * 100).toFixed(1)}%)`);
      });
      if (labelResult.labelAnnotations.length > 15) {
        console.log(`  ... and ${labelResult.labelAnnotations.length - 15} more labels`);
      }
    }

    // If no objects detected, try to infer from labels
    if (detectedItems.length === 0 && labelResult.labelAnnotations) {
      console.log(`\n⚠️  No objects detected via object localization, falling back to labels...`);
      const clothingLabels = labelResult.labelAnnotations.filter(label => {
        const description = label.description.toLowerCase();
        return clothingTerms.some(term => description.includes(term)) ||
               ['clothing', 'apparel', 'fashion', 'garment', 'outfit', 'collar', 'formal wear', 'blazer', 'suit trousers'].some(term => description.includes(term));
      });

      console.log(`   Found ${clothingLabels.length} clothing-related labels`);
      clothingLabels.slice(0, 5).forEach(label => {
        console.log(`   ➕ Adding from label: "${label.description}" (${(label.score * 100).toFixed(1)}%)`);
        // For label-based detection without bounding boxes, we'll use the full image
        // but flag it so the UI knows this is a full-image detection
        detectedItems.push({
          type: label.description.toLowerCase(),
          confidence: Math.round(label.score * 100),
          boundingBox: null,
          source: 'label_detection',
          useFullImage: true
        });
      });
    }

    // Use web detection to improve clothing item detection
    if (webResult.webEntities && webResult.webEntities.length > 0) {
      console.log(`\n🌐 WEB DETECTION RESULTS: ${webResult.webEntities.length} entities found`);
      console.log('══════════════════════════════════════════════════════════════');
      webResult.webEntities.slice(0, 10).forEach((entity, idx) => {
        if (entity.description && entity.score > 0.5) {
          const desc = entity.description.toLowerCase();
          console.log(`  [${idx + 1}] "${entity.description}" (${(entity.score * 100).toFixed(1)}%)`);
          debugSummary.webEntitiesDetected.push(`${entity.description} (${(entity.score * 100).toFixed(1)}%)`);
          
          // Check if this is a clothing item we haven't detected
          const isClothing = clothingTerms.some(term => desc.includes(term));
          if (isClothing && !detectedItems.some(item => item.type === desc)) {
            detectedItems.push({
              type: desc,
              confidence: Math.round(entity.score * 100),
              boundingBox: null,
              source: 'web_detection',
              useFullImage: true
            });
            console.log(`   ➕ Added clothing item from web: "${desc}"`);
          }
        }
      });
    }

    // Extract brand information from text detection
    const brands = [];
    if (textResult.textAnnotations && textResult.textAnnotations.length > 0) {
      const detectedText = textResult.textAnnotations[0].description;
      const commonBrands = ['nike', 'adidas', 'gucci', 'prada', 'versace', 'armani', 'hugo boss', 'calvin klein'];
      commonBrands.forEach(brand => {
        if (detectedText.toLowerCase().includes(brand)) {
          brands.push(brand);
        }
      });
    }

    console.log('\n🎯 Final detected colors:', detectedColors);
    debugSummary.colorsDetected = detectedColors;
    
    // If no colors detected, add a warning and try to extract from labels
    if (detectedColors.length === 0) {
      console.log('⚠️  WARNING: No colors detected from Vision API!');
      console.log('   This may indicate an issue with the Vision API response or image quality.');
      
      // Try to extract colors from labels as a fallback
      if (labelResult.labelAnnotations) {
        const colorKeywords = ['black', 'white', 'gray', 'grey', 'navy', 'blue', 'brown', 'tan', 'beige', 'red', 'green', 'purple', 'pink', 'yellow', 'orange'];
        labelResult.labelAnnotations.forEach(label => {
          const description = label.description.toLowerCase();
          colorKeywords.forEach(color => {
            if (description.includes(color) && !detectedColors.includes(color)) {
              console.log(`   Found color "${color}" in label: ${description}`);
              detectedColors.push(color);
            }
          });
        });
      }
    }
    
    // Final debugging summary
    debugSummary.finalItemsCount = detectedItems.length;
    console.log(`\n\n📋 VISION API ANALYSIS SUMMARY`);
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`🔍 Total objects detected: ${debugSummary.totalObjectsDetected}`);
    console.log(`✅ Objects accepted: ${debugSummary.objectsAccepted.length}`);
    if (debugSummary.objectsAccepted.length > 0) {
      debugSummary.objectsAccepted.forEach(item => console.log(`   - ${item}`));
    }
    console.log(`❌ Objects rejected: ${debugSummary.objectsRejected.length}`);
    if (debugSummary.objectsRejected.length > 0) {
      debugSummary.objectsRejected.forEach(item => console.log(`   - ${item}`));
    }
    console.log(`🔄 Objects filtered (duplicates): ${debugSummary.objectsFiltered.length}`);
    if (debugSummary.objectsFiltered.length > 0) {
      debugSummary.objectsFiltered.forEach(item => console.log(`   - ${item}`));
    }
    console.log(`🏷️  Labels detected: ${debugSummary.labelsDetected.length}`);
    console.log(`🌐 Web entities detected: ${debugSummary.webEntitiesDetected.length}`);
    console.log(`🎨 Colors detected: ${debugSummary.colorsDetected.length}`);
    if (debugSummary.colorsDetected.length > 0) {
      console.log(`   Colors: ${debugSummary.colorsDetected.join(', ')}`);
    }
    console.log(`\n📦 FINAL RESULT: ${debugSummary.finalItemsCount} clothing items`);
    console.log('══════════════════════════════════════════════════════════════\n');

    return { detectedItems, brands, colors: detectedColors };
  } catch (error) {
    console.error('Vision API error:', error);
    return { detectedItems: [], brands: [], colors: [] };
  }
};
// Match detected items with existing wardrobe
const matchWithWardrobe = (detectedItems, userId) => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM wardrobe_items WHERE user_id = ?', [userId], (err, wardrobeItems) => {
      if (err) {
        reject(err);
        return;
      }

      const catalogedItems = [];
      const uncatalogedItems = [];

      detectedItems.forEach(detectedItem => {
        let matched = false;
        let bestMatch = null;
        let bestScore = 0;

        // Find best matching item in wardrobe
        for (const wardrobeItem of wardrobeItems) {
          const itemType = (wardrobeItem.type || '').toLowerCase();
          const itemName = (wardrobeItem.name || '').toLowerCase();
          const itemBrand = (wardrobeItem.brand || '').toLowerCase();
          const detectedType = detectedItem.type.toLowerCase();

          let matchScore = 0;

          // Type matching
          if (detectedType.includes(itemType) || itemType.includes(detectedType)) {
            matchScore += 50;
          }

          // Name matching
          if (itemName.includes(detectedType) || detectedType.includes(itemName)) {
            matchScore += 30;
          }

          // Brand matching (if available)
          if (itemBrand && detectedItem.brands) {
            if (detectedItem.brands.some(brand => itemBrand.includes(brand.toLowerCase()))) {
              matchScore += 20;
            }
          }

          if (matchScore > bestScore && matchScore >= 50) {
            bestScore = matchScore;
            bestMatch = wardrobeItem;
          }
        }

        if (bestMatch) {
          catalogedItems.push({
            id: bestMatch.id,
            name: bestMatch.name,
            type: bestMatch.type,
            brand: bestMatch.brand,
            rfidTag: bestMatch.rfid_tag,
            confidence: Math.min(detectedItem.confidence * (bestScore / 100), 95),
            matchScore: bestScore
          });
          matched = true;
        }

        if (!matched && detectedItem.confidence > 60) {
          // Generate suggested name
          const suggestedName = detectedItem.type
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          uncatalogedItems.push({
            id: uuidv4(),
            suggestedName,
            type: detectedItem.type,
            confidence: detectedItem.confidence,
            source: detectedItem.source,
            brands: detectedItem.brands || []
          });
        }
      });

      resolve({ catalogedItems, uncatalogedItems });
    });
  });
};

// Generate RFID tag
const generateRFIDTag = (itemType, itemId) => {
  const typePrefix = itemType.substring(0, 2).toUpperCase();
  const idSuffix = itemId.slice(-6).toUpperCase();
  return `CM${typePrefix}${idSuffix}`;
};

// Routes

// Add additional image to wardrobe item
app.post('/api/wardrobe/items/:itemId/images', upload.single('image'), (req, res) => {
  const { itemId } = req.params;
  const { v4: uuidv4 } = require('uuid');
  
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }
  
  const imageId = uuidv4();
  const imageUrl = `/uploads/${req.file.filename}`;
  
  const stmt = db.prepare(`
    INSERT INTO item_images (id, item_id, image_url, is_primary)
    VALUES (?, ?, ?, 0)
  `);
  
  stmt.run([imageId, itemId, imageUrl], function(err) {
    if (err) {
      console.error('Error saving additional image:', err);
      return res.status(500).json({ error: 'Failed to save image' });
    }
    
    res.json({ 
      id: imageId,
      imageUrl: imageUrl,
      isPrimary: false
    });
  });
  
  stmt.finalize();
});

// Get all images for a wardrobe item
app.get('/api/wardrobe/items/:itemId/images', (req, res) => {
  const { itemId } = req.params;
  
  db.all(`
    SELECT id, image_url as imageUrl, is_primary as isPrimary, created_date as createdDate
    FROM item_images 
    WHERE item_id = ? 
    ORDER BY is_primary DESC, created_date ASC
  `, [itemId], (err, images) => {
    if (err) {
      console.error('Error getting item images:', err);
      return res.status(500).json({ error: 'Failed to get images' });
    }
    
    res.json(images);
  });
});

// Save outfit despite duplicates
app.post('/api/analyze-outfit/save-anyway', upload.single('outfitImage'), async (req, res) => {
  console.log('🔄 Saving outfit despite duplicates...');
  try {
    if (!req.file) {
      console.error('❌ No file uploaded');
      return res.status(400).json({ error: 'No outfit image provided' });
    }

    const { detectedItems, outfitName } = req.body;
    const userId = req.body.userId || '7eb88885-3bc3-4c09-af20-7fbd0bf6fa07';
    
    const parsedItems = JSON.parse(detectedItems);
    const finalOutfitName = outfitName || generateOutfitName(parsedItems);

    // Save the outfit
    const savedOutfit = await saveDetectedOutfit(finalOutfitName, parsedItems, req.file.path, userId);
    
    // Save items to wardrobe
    const savedWardrobeItems = await saveDetectedItemsToWardrobe(parsedItems, userId);
    
    // Clean up uploaded file
    require('fs').unlinkSync(req.file.path);

    res.json({
      success: true,
      savedOutfit: savedOutfit,
      savedWardrobeItems: savedWardrobeItems
    });

  } catch (error) {
    console.error('❌ Error saving outfit anyway:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && require('fs').existsSync(req.file.path)) {
      require('fs').unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Failed to save outfit',
      details: error.message
    });
  }
});

// Delete additional image
app.delete('/api/wardrobe/items/:itemId/images/:imageId', (req, res) => {
  const { imageId } = req.params;
  
  // Get image info first
  db.get('SELECT image_url FROM item_images WHERE id = ?', [imageId], (err, image) => {
    if (err) {
      console.error('Error finding image:', err);
      return res.status(500).json({ error: 'Failed to find image' });
    }
    
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Delete from database
    db.run('DELETE FROM item_images WHERE id = ?', [imageId], function(err) {
      if (err) {
        console.error('Error deleting image:', err);
        return res.status(500).json({ error: 'Failed to delete image' });
      }
      
      // Delete file from filesystem
      const fs = require('fs');
      const imagePath = path.join(__dirname, image.image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      
      res.json({ message: 'Image deleted successfully' });
    });
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'ClosetMonkey API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Test Vision API configuration
app.get('/api/test-vision', async (req, res) => {
  try {
    const hasCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const credentialsExist = credentialsPath ? fs.existsSync(credentialsPath) : false;
    
    res.json({ 
      status: 'Vision API configured',
      hasCredentials,
      credentialsPath: credentialsPath || 'not set',
      credentialsExist,
      ready: hasCredentials && credentialsExist
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Vision API not configured', 
      details: error.message 
    });
  }
});

// User routes
app.post('/api/users', (req, res) => {
  const { username, email } = req.body;
  
  if (!username || !email) {
    return res.status(400).json({ error: 'Username and email are required' });
  }

  const userId = uuidv4();
  
  const stmt = db.prepare('INSERT INTO users (id, username, email) VALUES (?, ?, ?)');
  stmt.run([userId, username, email], function(err) {
    if (err) {
      if (err.code === 'SQLITE_CONSTRAINT') {
        return res.status(409).json({ error: 'Username or email already exists' });
      }
      return res.status(500).json({ error: 'Failed to create user' });
    }
    
    res.status(201).json({
      id: userId,
      username,
      email,
      message: 'User created successfully'
    });
  });
  stmt.finalize();
});

app.get('/api/users/:userId', (req, res) => {
  const { userId } = req.params;
  
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to get user' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      createdDate: user.created_date
    });
  });
});

// Outfit analysis endpoint (for OutfitScanner component)
app.post('/api/analyze-outfit', upload.single('outfitImage'), async (req, res) => {
  console.log('🔍 Starting outfit analysis...');
  try {
    if (!req.file) {
      console.error('❌ No file uploaded');
      return res.status(400).json({ error: 'No outfit image provided' });
    }

    console.log(`📷 Received image: ${req.file.filename} (${req.file.size} bytes)`);
    console.log('📝 Request body:', req.body);
    console.log('📝 userId from body:', req.body.userId);

    const wardrobeItems = req.body.wardrobeItems ? JSON.parse(req.body.wardrobeItems) : [];
    const userId = req.body.userId || '7eb88885-3bc3-4c09-af20-7fbd0bf6fa07';

    console.log(`Analyzing outfit for user: ${userId}`);
    console.log(`Wardrobe items count: ${wardrobeItems.length}`);
    
    // Convert uploaded image to base64 for Vision API
    const imageBuffer = require('fs').readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');

    // Analyze the outfit image
    const { detectedItems, brands, colors } = await analyzeImageWithVision(`data:image/jpeg;base64,${base64Image}`);
    
    console.log('\n🔍 ANALYZE OUTFIT - VISION API RESULTS');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`🎯 Total items detected: ${detectedItems.length}`);
    console.log(`🔖 Brands detected: ${brands.length > 0 ? brands.join(', ') : 'None'}`);
    console.log(`🎨 Colors detected: ${colors.length > 0 ? colors.join(', ') : 'None'}`);
    
    console.log('\n📦 Detailed item breakdown:');
    detectedItems.forEach((item, idx) => {
      console.log(`\n  [${idx + 1}] ${item.type.toUpperCase()}`);
      console.log(`      Confidence: ${item.confidence}%`);
      console.log(`      Source: ${item.source}`);
      if (item.boundingBox) {
        const bbox = item.boundingBox;
        console.log(`      Bounding Box: YES`);
        console.log(`         Coordinates: [${bbox[0]?.x?.toFixed(3)},${bbox[0]?.y?.toFixed(3)}] to [${bbox[2]?.x?.toFixed(3)},${bbox[2]?.y?.toFixed(3)}]`);
      } else {
        console.log(`      Bounding Box: NO (will use full image)`);
      }
    });

    // Process detected items and create proper item objects
    const processedItems = detectedItems.map((item, index) => {
      const categoryMap = {
        'shirt': 'Shirts',
        'pants': 'Pants',
        'trouser': 'Pants',
        'jeans': 'Pants',
        'dress': 'Dresses',
        'jacket': 'Outerwear',
        'coat': 'Outerwear',
        'blazer': 'Outerwear',
        'shoe': 'Shoes',
        'sneaker': 'Shoes',
        'boot': 'Shoes',
        'sandal': 'Shoes',
        'skirt': 'Skirts',
        'sweater': 'Sweaters',
        'hoodie': 'Sweaters',
        'cardigan': 'Sweaters',
        'blouse': 'Shirts',
        'tie': 'Accessories',
        'hat': 'Accessories',
        'belt': 'Accessories',
        'scarf': 'Accessories'
      };

      const itemType = item.type.toLowerCase();
      const category = categoryMap[itemType] || 'Other';
      
      // Use intelligent color assignment based on Vision API results
      let primaryColor = null;
      
      // First, check if this item has a bounding box to extract color from that region
      if (colors.length > 0) {
        if (item.boundingBox) {
          // For now, use the first detected color from Vision API
          // In a more sophisticated implementation, we could analyze the specific region
          primaryColor = colors[index % colors.length] || colors[0];
          console.log(`\n  🎨 COLOR ASSIGNMENT for ${item.type}:`);
          console.log(`     Assigned color: "${primaryColor}" (from detected color ${(index % colors.length) + 1}/${colors.length})`);
          console.log(`     Method: Using bounding box region`);
        } else {
          // If no bounding box, distribute colors across items
          primaryColor = colors[index % colors.length];
          console.log(`\n  🎨 COLOR ASSIGNMENT for ${item.type}:`);
          console.log(`     Assigned color: "${primaryColor}" (from detected color ${(index % colors.length) + 1}/${colors.length})`);
          console.log(`     Method: Distributed assignment (no bounding box)`);
        }
      } else {
        console.log(`\n  ⚠️  COLOR ASSIGNMENT for ${item.type}:`);
        console.log(`     No colors detected by Vision API, will use fallback`);
      }
      
      // Fallback color palettes if Vision API didn't detect colors well
      if (!primaryColor || primaryColor === 'Unknown' || primaryColor === 'unknown') {
        const itemColorDefaults = {
          'suit': 'navy',
          'pants': 'navy', 
          'coat': 'navy',
          'blazer': 'navy',
          'jacket': 'black',
          'shirt': 'white',
          'tie': 'navy',
          'shoe': 'brown',
          'shoes': 'brown',
          'dress': 'black',
          'skirt': 'black',
          'sweater': 'gray',
          'blouse': 'white'
        };
        
        primaryColor = itemColorDefaults[itemType] || 'gray';
        console.log(`     Fallback color: "${primaryColor}"`);
        console.log(`     Reason: Vision API returned no/unknown color`);
      }
      
      // Create item name
      const itemName = `${primaryColor} ${item.type}`.replace(/\b\w/g, l => l.toUpperCase());

      // We'll generate cropped images after processing all items
      let croppedImageUrl = null;

      return {
        name: itemName,
        category: category,
        color: primaryColor,
        type: itemType,
        confidence: item.confidence / 100,
        boundingBox: item.boundingBox,
        croppedImageUrl: croppedImageUrl,
        brand: brands.length > 0 ? brands[0] : '',
        status: 'new',
        matchedItem: null
      };
    });

    // Helper function to analyze shirt color from visible areas when blazer/coat is detected
    const analyzeShirtColorFromVisibleAreas = async (imageBuffer, blazerBoundingBox, globalDetectedColors) => {
      try {
        const sharp = require('sharp');
        
        // Get image metadata
        const metadata = await sharp(imageBuffer).metadata();
        const { width, height } = metadata;
        
        if (!blazerBoundingBox || blazerBoundingBox.length < 4) {
          return null;
        }
        
        // Convert normalized coordinates to pixel coordinates
        const blazerXCoords = blazerBoundingBox.map(v => (v.x || 0) * width);
        const blazerYCoords = blazerBoundingBox.map(v => (v.y || 0) * height);
        
        const blazerTop = Math.min(...blazerYCoords);
        const blazerBottom = Math.max(...blazerYCoords);
        const blazerLeft = Math.min(...blazerXCoords);
        const blazerRight = Math.max(...blazerXCoords);
        const blazerWidth = blazerRight - blazerLeft;
        
        // Define regions where shirt might be visible
        const regions = [];
        
        // 1. Collar/neck area (above blazer top)
        if (blazerTop > height * 0.1) { // Only if there's space above
          regions.push({
            left: Math.max(0, Math.floor(blazerLeft + blazerWidth * 0.3)),
            top: Math.max(0, Math.floor(blazerTop - height * 0.05)),
            width: Math.floor(blazerWidth * 0.4),
            height: Math.floor(height * 0.05),
            name: 'collar'
          });
        }
        
        // 2. Chest area (center of blazer, where shirt might show)
        regions.push({
          left: Math.max(0, Math.floor(blazerLeft + blazerWidth * 0.4)),
          top: Math.max(0, Math.floor(blazerTop + (blazerBottom - blazerTop) * 0.2)),
          width: Math.floor(blazerWidth * 0.2),
          height: Math.floor((blazerBottom - blazerTop) * 0.3),
          name: 'chest'
        });
        
        // 3. Cuff areas (if arms visible at bottom sides)
        if (blazerBottom < height * 0.9) {
          // Left cuff
          regions.push({
            left: Math.max(0, Math.floor(blazerLeft)),
            top: Math.max(0, Math.floor(blazerBottom - height * 0.05)),
            width: Math.floor(blazerWidth * 0.15),
            height: Math.floor(height * 0.1),
            name: 'left_cuff'
          });
          
          // Right cuff
          regions.push({
            left: Math.max(0, Math.floor(blazerRight - blazerWidth * 0.15)),
            top: Math.max(0, Math.floor(blazerBottom - height * 0.05)),
            width: Math.floor(blazerWidth * 0.15),
            height: Math.floor(height * 0.1),
            name: 'right_cuff'
          });
        }
        
        // Analyze colors in each region
        const colorCounts = {};
        
        for (const region of regions) {
          try {
            // Ensure region is within image bounds
            region.width = Math.min(region.width, width - region.left);
            region.height = Math.min(region.height, height - region.top);
            
            if (region.width <= 0 || region.height <= 0) continue;
            
            console.log(`    Analyzing ${region.name} region: ${region.width}x${region.height} at (${region.left}, ${region.top})`);
            
            // Extract and analyze the region
            const regionBuffer = await sharp(imageBuffer)
              .extract(region)
              .raw()
              .toBuffer({ resolveWithObject: true });
            
            const { data, info } = regionBuffer;
            const pixelCount = info.width * info.height;
            
            // Sample pixels to determine dominant colors
            const sampledColors = {};
            const sampleRate = Math.max(1, Math.floor(pixelCount / 100)); // Sample ~100 pixels
            
            for (let i = 0; i < data.length; i += info.channels * sampleRate) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              
              // Convert to color name
              const colorName = rgbToColorName(r, g, b);
              
              // Filter out non-shirt colors (skin tones, very dark colors, etc.)
              if (colorName && 
                  colorName !== 'unknown' && 
                  !colorName.includes('black') && 
                  !colorName.includes('dark') &&
                  !colorName.includes('brown') &&
                  !colorName.includes('tan') &&
                  !colorName.includes('beige')) {
                sampledColors[colorName] = (sampledColors[colorName] || 0) + 1;
              }
            }
            
            // Add sampled colors to overall count
            Object.entries(sampledColors).forEach(([color, count]) => {
              colorCounts[color] = (colorCounts[color] || 0) + count;
            });
            
          } catch (regionError) {
            console.log(`    Warning: Could not analyze ${region.name} region:`, regionError.message);
          }
        }
        
        // Find the most common shirt color
        let mostCommonColor = null;
        let maxCount = 0;
        
        Object.entries(colorCounts).forEach(([color, count]) => {
          console.log(`    Color candidate: ${color} (${count} samples)`);
          if (count > maxCount) {
            maxCount = count;
            mostCommonColor = color;
          }
        });
        
        // If no color detected from regions, check global detected colors for shirt-like colors
        if (!mostCommonColor && globalDetectedColors && globalDetectedColors.length > 0) {
          const shirtLikeColors = globalDetectedColors.filter(color => 
            color && 
            (color.includes('white') || 
             color.includes('blue') || 
             color.includes('pink') || 
             color.includes('gray') || 
             color.includes('grey') ||
             color.includes('lavender') ||
             color.includes('cream'))
          );
          
          if (shirtLikeColors.length > 0) {
            mostCommonColor = shirtLikeColors[0];
            console.log(`    Using global detected color: ${mostCommonColor}`);
          }
        }
        
        return mostCommonColor;
        
      } catch (error) {
        console.log('    Error in analyzeShirtColorFromVisibleAreas:', error.message);
        return null;
      }
    };
    
    // Helper function to analyze shirt color around tie
    const analyzeShirtColorAroundTie = async (imageBuffer, tieBoundingBox, globalDetectedColors) => {
      try {
        const sharp = require('sharp');
        
        // Get image metadata
        const metadata = await sharp(imageBuffer).metadata();
        const { width, height } = metadata;
        
        if (!tieBoundingBox || tieBoundingBox.length < 4) {
          return null;
        }
        
        // Convert normalized coordinates to pixel coordinates
        const tieXCoords = tieBoundingBox.map(v => (v.x || 0) * width);
        const tieYCoords = tieBoundingBox.map(v => (v.y || 0) * height);
        
        const tieTop = Math.min(...tieYCoords);
        const tieBottom = Math.max(...tieYCoords);
        const tieLeft = Math.min(...tieXCoords);
        const tieRight = Math.max(...tieXCoords);
        const tieWidth = tieRight - tieLeft;
        const tieHeight = tieBottom - tieTop;
        
        // Define regions around the tie where shirt is visible
        const regions = [];
        
        // 1. Left side of tie
        regions.push({
          left: Math.max(0, Math.floor(tieLeft - tieWidth * 0.5)),
          top: Math.max(0, Math.floor(tieTop)),
          width: Math.floor(tieWidth * 0.4),
          height: Math.floor(tieHeight * 0.5),
          name: 'left_side'
        });
        
        // 2. Right side of tie
        regions.push({
          left: Math.max(0, Math.floor(tieRight + tieWidth * 0.1)),
          top: Math.max(0, Math.floor(tieTop)),
          width: Math.floor(tieWidth * 0.4),
          height: Math.floor(tieHeight * 0.5),
          name: 'right_side'
        });
        
        // 3. Above tie (collar area)
        if (tieTop > height * 0.1) {
          regions.push({
            left: Math.max(0, Math.floor(tieLeft - tieWidth * 0.2)),
            top: Math.max(0, Math.floor(tieTop - height * 0.05)),
            width: Math.floor(tieWidth * 1.4),
            height: Math.floor(height * 0.05),
            name: 'collar'
          });
        }
        
        // Analyze colors in each region
        const colorCounts = {};
        
        for (const region of regions) {
          try {
            // Ensure region is within image bounds
            region.width = Math.min(region.width, width - region.left);
            region.height = Math.min(region.height, height - region.top);
            
            if (region.width <= 0 || region.height <= 0) continue;
            
            console.log(`    Analyzing ${region.name} region around tie: ${region.width}x${region.height} at (${region.left}, ${region.top})`);
            
            // Extract and analyze the region
            const regionBuffer = await sharp(imageBuffer)
              .extract(region)
              .raw()
              .toBuffer({ resolveWithObject: true });
            
            const { data, info } = regionBuffer;
            const pixelCount = info.width * info.height;
            
            // Sample pixels to determine dominant colors
            const sampledColors = {};
            const sampleRate = Math.max(1, Math.floor(pixelCount / 50)); // Sample ~50 pixels
            
            for (let i = 0; i < data.length; i += info.channels * sampleRate) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              
              // Convert to color name
              const colorName = rgbToColorName(r, g, b);
              
              // Filter out non-shirt colors
              if (colorName && 
                  colorName !== 'unknown' && 
                  !colorName.includes('black') && 
                  !colorName.includes('dark') &&
                  !colorName.includes('brown') &&
                  !colorName.includes('tan') &&
                  !colorName.includes('beige')) {
                sampledColors[colorName] = (sampledColors[colorName] || 0) + 1;
              }
            }
            
            // Add sampled colors to overall count
            Object.entries(sampledColors).forEach(([color, count]) => {
              colorCounts[color] = (colorCounts[color] || 0) + count;
            });
            
          } catch (regionError) {
            console.log(`    Warning: Could not analyze ${region.name} region:`, regionError.message);
          }
        }
        
        // Find the most common shirt color
        let mostCommonColor = null;
        let maxCount = 0;
        
        Object.entries(colorCounts).forEach(([color, count]) => {
          console.log(`    Color candidate: ${color} (${count} samples)`);
          if (count > maxCount) {
            maxCount = count;
            mostCommonColor = color;
          }
        });
        
        // If no color detected from regions, check global detected colors
        if (!mostCommonColor && globalDetectedColors && globalDetectedColors.length > 0) {
          const shirtLikeColors = globalDetectedColors.filter(color => 
            color && 
            (color.includes('white') || 
             color.includes('blue') || 
             color.includes('pink') || 
             color.includes('gray') || 
             color.includes('grey') ||
             color.includes('lavender') ||
             color.includes('cream'))
          );
          
          if (shirtLikeColors.length > 0) {
            mostCommonColor = shirtLikeColors[0];
            console.log(`    Using global detected color: ${mostCommonColor}`);
          }
        }
        
        return mostCommonColor;
        
      } catch (error) {
        console.log('    Error in analyzeShirtColorAroundTie:', error.message);
        return null;
      }
    };

    // Infer complementary items (like dress shirt with suit)
    console.log('\n🔍 COMPLEMENTARY ITEM DETECTION');
    console.log('══════════════════════════════════════════════════════════════');
    const complementaryItems = [];
    
    // Check if we have a suit/blazer but no shirt
    const hasSuitOrBlazer = processedItems.some(item => 
      ['suit', 'blazer', 'jacket', 'coat'].includes(item.type.toLowerCase())
    );
    const hasShirt = processedItems.some(item => 
      ['shirt', 'blouse', 't-shirt', 'dress shirt', 'crop top', 'tank top', 'turtleneck'].includes(item.type.toLowerCase())
    );
    
    // Also check labels for shirt detection
    const hasShirtInLabels = detectedItems.some(item => 
      item.source === 'label_detection' && 
      ['shirt', 'dress shirt', 'collar'].some(term => item.type.toLowerCase().includes(term))
    );
    
    // Check if we have a tie
    const hasTie = processedItems.some(item => 
      item.type.toLowerCase() === 'tie'
    );
    
    console.log(`  Suit/Blazer detected: ${hasSuitOrBlazer}`);
    console.log(`  Shirt detected: ${hasShirt}`);
    console.log(`  Shirt in labels: ${hasShirtInLabels}`);
    console.log(`  Tie detected: ${hasTie}`);
    
    // Don't infer a shirt if we already detected one in labels
    if (hasSuitOrBlazer && !hasShirt && !hasShirtInLabels) {
      console.log('\n  → INFERENCE: Adding dress shirt (suit/blazer without shirt)');
      
      // Try to detect shirt color from visible areas
      let shirtColor = 'white'; // Default fallback
      
      try {
        // Find the blazer/coat item to get its bounding box
        const blazerItem = processedItems.find(item => 
          ['suit', 'blazer', 'jacket', 'coat'].includes(item.type.toLowerCase())
        );
        
        if (blazerItem && blazerItem.boundingBox && imageBuffer) {
          console.log('  → Analyzing visible shirt areas for color detection...');
          
          // Analyze specific regions where shirt might be visible
          const detectedShirtColor = await analyzeShirtColorFromVisibleAreas(
            imageBuffer, 
            blazerItem.boundingBox,
            colors || []
          );
          
          if (detectedShirtColor) {
            shirtColor = detectedShirtColor;
            console.log(`  → Detected shirt color: ${shirtColor}`);
          } else {
            console.log('  → No clear shirt color detected, using default: white');
          }
        }
      } catch (error) {
        console.log('  → Error detecting shirt color:', error.message);
        console.log('  → Using default color: white');
      }
      
      complementaryItems.push({
        name: `${shirtColor.charAt(0).toUpperCase() + shirtColor.slice(1)} Dress Shirt`,
        category: 'Shirts',
        color: shirtColor,
        type: 'dress shirt',
        confidence: 0.85, // High confidence as this is a common pairing
        boundingBox: null, // No specific bounding box
        croppedImageUrl: null,
        brand: '',
        status: 'new',
        matchedItem: null,
        inferred: true // Mark as inferred
      });
    }
    
    if (hasTie && !hasShirt && complementaryItems.length === 0) {
      console.log('\n  → INFERENCE: Adding dress shirt (tie without shirt)');
      
      // Try to detect shirt color from visible areas around tie
      let shirtColor = 'white'; // Default fallback
      
      try {
        // Find the tie item to get its bounding box
        const tieItem = processedItems.find(item => 
          item.type.toLowerCase() === 'tie'
        );
        
        if (tieItem && tieItem.boundingBox && imageBuffer) {
          console.log('  → Analyzing visible shirt areas around tie for color detection...');
          
          // Analyze regions around the tie where shirt might be visible
          const detectedShirtColor = await analyzeShirtColorAroundTie(
            imageBuffer, 
            tieItem.boundingBox,
            colors || []
          );
          
          if (detectedShirtColor) {
            shirtColor = detectedShirtColor;
            console.log(`  → Detected shirt color: ${shirtColor}`);
          } else {
            console.log('  → No clear shirt color detected, using default: white');
          }
        }
      } catch (error) {
        console.log('  → Error detecting shirt color:', error.message);
        console.log('  → Using default color: white');
      }
      
      complementaryItems.push({
        name: `${shirtColor.charAt(0).toUpperCase() + shirtColor.slice(1)} Dress Shirt`,
        category: 'Shirts', 
        color: shirtColor,
        type: 'dress shirt',
        confidence: 0.90, // Very high confidence with tie
        boundingBox: null,
        croppedImageUrl: null,
        brand: '',
        status: 'new',
        matchedItem: null,
        inferred: true
      });
    }
    
    // Add complementary items to processed items
    const allItems = [...processedItems, ...complementaryItems];
    console.log(`\n  Total inferred items: ${complementaryItems.length}`);
    console.log(`  Total items after inference: ${allItems.length}`);

    // Merge similar detected items (especially shoes) before matching with wardrobe
    console.log('\n🔗 ITEM MERGING PROCESS');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`  Items before merge: ${allItems.length}`);
    const mergedItems = mergeDetectedItems(allItems);
    console.log(`  Items after merge: ${mergedItems.length}`);
    console.log(`  Items merged: ${allItems.length - mergedItems.length}`);

    // Check against existing wardrobe items first
    const matchedItems = matchItemsWithWardrobe(mergedItems, wardrobeItems);

    // Generate cropped images for each matched item (after merging)
    console.log('🖼️  Generating cropped images for matched items...');
    for (let i = 0; i < matchedItems.length; i++) {
      const item = matchedItems[i];
      
      try {
        let croppedUrl;
        
        // Special handling for shoes with multiple bounding boxes
        if (item.type === 'shoes' && item.allBoundingBoxes && item.allBoundingBoxes.length > 1) {
          console.log(`   🖼️  Creating combined crop for ${item.allBoundingBoxes.length} shoes`);
          croppedUrl = await createCombinedCroppedImage(
            imageBuffer, 
            item.allBoundingBoxes, 
            `${item.type}_${i}`
          );
        } else if (item.boundingBox && item.boundingBox.length >= 4) {
          // Validate bounding box before cropping
          const isValidBox = item.boundingBox.every(vertex => 
            vertex.hasOwnProperty('x') && vertex.hasOwnProperty('y') &&
            vertex.x >= 0 && vertex.x <= 1 && vertex.y >= 0 && vertex.y <= 1
          );
          
          if (isValidBox) {
            croppedUrl = await createCroppedImage(
              imageBuffer, 
              item.boundingBox, 
              `${item.type}_${i}`
            );
          } else {
            console.log(`   ⚠️  Invalid bounding box for ${item.type}, skipping crop`);
            croppedUrl = null;
          }
        } else if (item.useFullImage) {
          console.log(`   📷  Using full image for ${item.type} (label-based detection)`);
          croppedUrl = null; // Will use full image in frontend
        } else {
          console.log(`   ⚠️  No bounding box available for ${item.type}`);
          croppedUrl = null;
        }
        
        if (croppedUrl) {
          matchedItems[i].croppedImageUrl = croppedUrl;
          console.log(`   ✓ Generated crop for ${item.type}: ${croppedUrl}`);
        }
      } catch (error) {
        console.error(`   ✗ Failed to crop ${item.type}:`, error.message);
      }
    }

    // Check for duplicate outfits before saving
    let duplicateOutfits = [];
    try {
      duplicateOutfits = await checkForDuplicateOutfits(matchedItems, userId);
      console.log(`🔍 Found ${duplicateOutfits.length} similar outfits`);
    } catch (dupError) {
      console.error('⚠️  Error checking for duplicates:', dupError.message);
    }

    // DON'T automatically save - just return the detected items for user review
    // The frontend will call a separate endpoint to save after user confirmation
    console.log('\n📋 FINAL PROCESSING SUMMARY');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`  Status: Returning items for user review (not saving)`);
    console.log(`  Total matched items: ${matchedItems.length}`);
    console.log(`  New items: ${matchedItems.filter(item => item.status === 'new').length}`);
    console.log(`  Existing items: ${matchedItems.filter(item => item.status === 'existing').length}`);
    
    // Generate a suggested outfit name for the frontend to use
    const suggestedOutfitName = generateOutfitName(matchedItems);
    console.log(`  Suggested outfit name: "${suggestedOutfitName}"`);

    // Store the uploaded image path temporarily for later saving
    const tempImagePath = req.file.path;
    
    // DON'T clean up the uploaded file yet - we'll need it for saving later
    // Store the temp path in the response so frontend can reference it
    console.log(`📁 Keeping temp image at: ${tempImagePath}`);

    res.json({
      success: true,
      detectedItems: matchedItems,
      totalItems: matchedItems.length,
      newItems: matchedItems.filter(item => item.status === 'new').length,
      existingItems: matchedItems.filter(item => item.status === 'existing').length,
      suggestedOutfitName: suggestedOutfitName,
      tempImagePath: tempImagePath, // Frontend will need this for the save request
      duplicateOutfits: duplicateOutfits,
      hasDuplicates: duplicateOutfits.length > 0,
      // Remove these as we're not saving yet
      savedOutfit: null,
      savedWardrobeItems: []
    });

  } catch (error) {
    console.error('❌ Error analyzing outfit:', error);
    console.error('❌ Stack trace:', error.stack);
    
    // Clean up uploaded file if it exists
    if (req.file && require('fs').existsSync(req.file.path)) {
      require('fs').unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Failed to analyze outfit',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Rename outfit endpoint
app.put('/api/outfits/:outfitId/rename', (req, res) => {
  const { outfitId } = req.params;
  const { newName } = req.body;
  
  if (!newName || !newName.trim()) {
    return res.status(400).json({ error: 'New outfit name is required' });
  }
  
  const stmt = db.prepare('UPDATE outfits SET name = ? WHERE id = ?');
  stmt.run([newName.trim(), outfitId], function(err) {
    if (err) {
      console.error('Error renaming outfit:', err);
      return res.status(500).json({ error: 'Failed to rename outfit' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Outfit not found' });
    }
    
    console.log(`✏️  Renamed outfit ${outfitId} to "${newName}"`);
    res.json({ 
      success: true, 
      message: `Outfit renamed to "${newName}"`,
      outfitId: outfitId,
      newName: newName.trim()
    });
  });
  stmt.finalize();
});

// Add photo to existing outfit endpoint
app.post('/api/outfits/:outfitId/add-photo', upload.single('outfitImage'), async (req, res) => {
  const { outfitId } = req.params;
  const { userId } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    // First, verify the outfit exists and belongs to the user
    const outfit = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM outfits WHERE id = ? AND user_id = ?', [outfitId, userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!outfit) {
      return res.status(404).json({ error: 'Outfit not found or access denied' });
    }

    // Generate unique filename for the new photo
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(req.file.originalname);
    const newImageFileName = `outfit_${outfitId}_${uniqueSuffix}${fileExtension}`;
    const newImagePath = path.join('uploads/outfits', newImageFileName);
    
    // Ensure outfits directory exists
    const outfitsDir = 'uploads/outfits';
    if (!fs.existsSync(outfitsDir)) {
      fs.mkdirSync(outfitsDir, { recursive: true });
    }

    // Move uploaded file to outfits directory
    fs.renameSync(req.file.path, newImagePath);

    // For now, we'll just update the main image. In the future, you could store multiple images in a separate table
    const updateQuery = 'UPDATE outfits SET image_url = ?, updated_date = CURRENT_TIMESTAMP WHERE id = ?';
    await new Promise((resolve, reject) => {
      db.run(updateQuery, [`/${newImagePath}`, outfitId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`📸 Added new photo to outfit ${outfitId}: ${newImageFileName}`);
    
    res.json({
      success: true,
      message: 'Photo added to outfit successfully',
      outfitId: outfitId,
      outfitName: outfit.name,
      newImageUrl: `/${newImagePath}`
    });

  } catch (error) {
    console.error('Error adding photo to outfit:', error);
    
    // Clean up uploaded file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Failed to add photo to outfit',
      details: error.message 
    });
  }
});

// New endpoint to save outfit after user confirmation
app.post('/api/analyze-outfit/confirm-save', upload.none(), async (req, res) => {
  console.log('✅ Confirming and saving outfit after user review...');
  try {
    const { 
      tempImagePath, 
      detectedItems, 
      outfitName,
      userId 
    } = req.body;

    if (!tempImagePath || !detectedItems || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        required: ['tempImagePath', 'detectedItems', 'userId'] 
      });
    }

    // Parse detected items if it's a string
    const items = typeof detectedItems === 'string' ? JSON.parse(detectedItems) : detectedItems;
    
    // Check if the temp image still exists
    if (!fs.existsSync(tempImagePath)) {
      return res.status(400).json({ 
        error: 'Temporary image file not found. Please re-analyze the outfit.' 
      });
    }

    console.log(`📸 Using temp image: ${tempImagePath}`);
    console.log(`👔 Saving ${items.length} confirmed items`);

    // Check for duplicates again (in case user took time to confirm)
    let duplicateOutfits = [];
    try {
      duplicateOutfits = await checkForDuplicateOutfits(items, userId);
      console.log(`🔍 Found ${duplicateOutfits.length} similar outfits`);
    } catch (dupError) {
      console.error('⚠️  Error checking for duplicates:', dupError.message);
    }

    // Save the outfit with user-confirmed name and items
    let savedOutfit = null;
    if (duplicateOutfits.length === 0) {
      try {
        const finalOutfitName = outfitName || generateOutfitName(items);
        console.log(`🎯 Saving confirmed outfit: "${finalOutfitName}" with ${items.length} items`);
        savedOutfit = await saveDetectedOutfit(finalOutfitName, items, tempImagePath, userId);
        console.log(`✓ Successfully saved outfit: ${finalOutfitName}`, savedOutfit);
      } catch (outfitError) {
        console.error('⚠️  Failed to save outfit:', outfitError.message);
        throw outfitError; // Re-throw as this is critical
      }
    }

    // Save detected items as individual wardrobe items
    let savedWardrobeItems = [];
    try {
      console.log(`👕 Saving ${items.length} items to wardrobe...`);
      savedWardrobeItems = await saveDetectedItemsToWardrobe(items, userId);
      console.log(`✓ Successfully saved ${savedWardrobeItems.length} items to wardrobe`);
    } catch (wardrobeError) {
      console.error('⚠️  Failed to save items to wardrobe:', wardrobeError.message);
      // Continue even if wardrobe save fails
    }

    // Clean up the temporary file now that we're done
    try {
      fs.unlinkSync(tempImagePath);
      console.log(`🗑️  Cleaned up temp file: ${tempImagePath}`);
    } catch (cleanupError) {
      console.error('⚠️  Failed to clean up temp file:', cleanupError.message);
    }

    res.json({
      success: true,
      savedOutfit: savedOutfit,
      savedWardrobeItems: savedWardrobeItems,
      duplicateOutfits: duplicateOutfits,
      hasDuplicates: duplicateOutfits.length > 0
    });

  } catch (error) {
    console.error('❌ Error saving confirmed outfit:', error);
    res.status(500).json({ 
      error: 'Failed to save outfit',
      details: error.message 
    });
  }
});

// Endpoint to force save outfit even with duplicates
app.post('/api/analyze-outfit/save-anyway', upload.none(), async (req, res) => {
  console.log('✅ Force saving outfit despite duplicates...');
  try {
    const { 
      tempImagePath, 
      detectedItems, 
      outfitName,
      userId 
    } = req.body;

    if (!tempImagePath || !detectedItems || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        required: ['tempImagePath', 'detectedItems', 'userId'] 
      });
    }

    // Parse detected items if it's a string
    const items = typeof detectedItems === 'string' ? JSON.parse(detectedItems) : detectedItems;
    
    // Check if the temp image still exists
    if (!fs.existsSync(tempImagePath)) {
      return res.status(400).json({ 
        error: 'Temporary image file not found. Please re-analyze the outfit.' 
      });
    }

    console.log(`📸 Using temp image: ${tempImagePath}`);
    console.log(`👔 Force saving ${items.length} items`);

    // Save the outfit without checking for duplicates
    let savedOutfit = null;
    try {
      const finalOutfitName = outfitName || generateOutfitName(items);
      console.log(`🎯 Force saving outfit: "${finalOutfitName}" with ${items.length} items`);
      savedOutfit = await saveDetectedOutfit(finalOutfitName, items, tempImagePath, userId);
      console.log(`✓ Successfully saved outfit: ${finalOutfitName}`, savedOutfit);
    } catch (outfitError) {
      console.error('⚠️  Failed to save outfit:', outfitError.message);
      throw outfitError;
    }

    // Save detected items as individual wardrobe items
    let savedWardrobeItems = [];
    try {
      console.log(`👕 Saving ${items.length} items to wardrobe...`);
      savedWardrobeItems = await saveDetectedItemsToWardrobe(items, userId);
      console.log(`✓ Successfully saved ${savedWardrobeItems.length} items to wardrobe`);
    } catch (wardrobeError) {
      console.error('⚠️  Failed to save items to wardrobe:', wardrobeError.message);
    }

    // Clean up the temporary file
    try {
      fs.unlinkSync(tempImagePath);
      console.log(`🗑️  Cleaned up temp file: ${tempImagePath}`);
    } catch (cleanupError) {
      console.error('⚠️  Failed to clean up temp file:', cleanupError.message);
    }

    res.json({
      success: true,
      savedOutfit: savedOutfit,
      savedWardrobeItems: savedWardrobeItems
    });

  } catch (error) {
    console.error('❌ Error force saving outfit:', error);
    res.status(500).json({ 
      error: 'Failed to save outfit',
      details: error.message 
    });
  }
});

// Test endpoint to check saved outfits
app.get('/api/outfits-test', (req, res) => {
  db.all(`SELECT * FROM outfits ORDER BY created_date DESC LIMIT 10`, [], (err, rows) => {
    if (err) {
      console.error('Error fetching outfits:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    console.log(`📋 Found ${rows.length} outfits in database`);
    res.json({ 
      count: rows.length,
      outfits: rows 
    });
  });
});

// Helper function to generate smart outfit names
const generateOutfitName = (items) => {
  const occasions = [
    'Business Meeting', 'Office Day', 'Casual Friday', 'Date Night', 'Weekend Brunch',
    'Networking Event', 'Conference Call', 'Client Presentation', 'After Work Drinks',
    'Smart Casual', 'Professional Look', 'Classic Style', 'Modern Ensemble'
  ];
  
  const styles = [
    'Professional', 'Sophisticated', 'Polished', 'Sharp', 'Elegant', 'Classic',
    'Modern', 'Refined', 'Tailored', 'Distinguished', 'Stylish', 'Contemporary'
  ];
  
  // Analyze the outfit composition
  const itemTypes = items.map(item => item.type.toLowerCase());
  const hassuit = itemTypes.some(type => type.includes('suit') || type.includes('blazer') || type.includes('coat'));
  const hastie = itemTypes.some(type => type.includes('tie'));
  const hasshoes = itemTypes.some(type => type.includes('shoe'));
  
  // Get primary colors
  const colors = items.map(item => item.color).filter(color => color && color !== 'Unknown');
  const primaryColor = colors[0] || '';
  
  let name = '';
  
  if (hassuit && hastie) {
    // Formal business outfit
    const occasion = occasions[Math.floor(Math.random() * 3)]; // First 3 are most formal
    name = `${occasion} - ${primaryColor} Suit`;
  } else if (hassuit) {
    // Business casual
    const style = styles[Math.floor(Math.random() * styles.length)];
    name = `${style} ${primaryColor} Look`;
  } else {
    // Casual or mixed
    const occasion = occasions[Math.floor(Math.random() * occasions.length)];
    name = `${occasion} Ensemble`;
  }
  
  // Add date for uniqueness
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${name} (${date})`;
};

// Helper function to save detected outfit
const saveDetectedOutfit = async (name, items, imagePath, userId = '7eb88885-3bc3-4c09-af20-7fbd0bf6fa07') => {
  const { v4: uuidv4 } = require('uuid');
  const fs = require('fs');
  const path = require('path');
  
  const outfitId = uuidv4();
  
  // Copy image to outfits directory with new name
  const originalExt = path.extname(imagePath);
  const newImageName = `outfit_${outfitId}${originalExt}`;
  const newImagePath = path.join(__dirname, 'uploads', 'outfits', newImageName);
  
  try {
    fs.copyFileSync(imagePath, newImagePath);
    const imageUrl = `/uploads/outfits/${newImageName}`;
    
    // Save outfit to database
    return new Promise((resolve, reject) => {
      const occasion = 'Scanned Outfit';
      const weather = 'Any';
      const description = `Auto-detected outfit with ${items.length} items: ${items.map(item => item.name).join(', ')}`;
      
      const stmt = db.prepare(`
        INSERT INTO outfits (id, user_id, name, description, image_url, occasion, weather, created_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      
      console.log('💾 Inserting outfit:', { outfitId, userId, name, description, imageUrl, occasion, weather });
      
      stmt.run([outfitId, userId, name, description, imageUrl, occasion, weather], function(err) {
        if (err) {
          console.error('❌ Error saving outfit:', err);
          reject(err);
          return;
        }
        
        console.log('✅ Outfit saved to database, rowID:', this.lastID, 'changes:', this.changes);
        
        // Save outfit items relationships
        const itemStmt = db.prepare(`
          INSERT INTO outfit_items (outfit_id, item_id, item_name, item_type, item_color, item_category, item_image_url)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        console.log('💾 Saving outfit items:', items.map(item => ({
          id: item.id || null,
          name: item.name,
          type: item.type,
          color: item.color,
          category: item.category,
          croppedImageUrl: item.croppedImageUrl
        })));
        
        items.forEach(item => {
          // Use the matched item's ID if available, otherwise use a generated ID
          let itemId = null;
          if (item.matchedItem && item.matchedItem.id) {
            itemId = item.matchedItem.id;
          } else if (item.id) {
            itemId = item.id;
          } else {
            // Generate a new ID for items that don't have one
            const { v4: uuidv4 } = require('uuid');
            itemId = uuidv4();
          }
          
          // Get image URL from matched item or use cropped image URL
          let imageUrl = null;
          if (item.matchedItem && item.matchedItem.image_url) {
            imageUrl = item.matchedItem.image_url;
          } else if (item.croppedImageUrl) {
            imageUrl = item.croppedImageUrl;
          } else if (item.imageUrl) {
            imageUrl = item.imageUrl;
          }
          
          itemStmt.run([outfitId, itemId, item.name, item.type, item.color, item.category, imageUrl], function(err) {
            if (err) {
              console.error('❌ Error saving outfit item:', err);
              console.error('   Item data:', { outfitId, itemId, name: item.name, type: item.type, imageUrl });
            } else {
              console.log('✅ Saved outfit item:', item.name, 'with ID:', itemId, 'and image:', imageUrl);
            }
          });
        });
        
        itemStmt.finalize();
        
        console.log(`💾 Saved outfit: "${name}" with ${items.length} items`);
        
        resolve({
          id: outfitId,
          name: name,
          description: description,
          imageUrl: imageUrl,
          items: items
        });
      });
      
      stmt.finalize();
    });
  } catch (error) {
    console.error('Error copying outfit image:', error);
    throw error;
  }
};

// Helper function to save detected items as individual wardrobe items
const saveDetectedItemsToWardrobe = async (detectedItems, userId) => {
  const { v4: uuidv4 } = require('uuid');
  const savedItems = [];
  
  for (const item of detectedItems) {
    // Skip if item already exists in wardrobe (status === 'existing')
    if (item.status === 'existing') {
      console.log(`   ⏭️  Skipping ${item.name} - already in wardrobe`);
      continue;
    }
    
    try {
      const itemId = uuidv4();
      const categoryMap = {
        'shirts': 'Shirts',
        'pants': 'Pants', 
        'trouser': 'Pants',
        'jeans': 'Pants',
        'outerwear': 'Jackets',
        'jacket': 'Jackets',
        'coat': 'Jackets',
        'blazer': 'Jackets',
        'shoes': 'Shoes',
        'shoe': 'Shoes',
        'sneaker': 'Shoes',
        'boot': 'Shoes',
        'sandal': 'Shoes',
        'dresses': 'Dresses',
        'dress': 'Dresses',
        'skirts': 'Skirts',
        'skirt': 'Skirts',
        'sweaters': 'Sweaters',
        'sweater': 'Sweaters',
        'hoodie': 'Sweaters',
        'cardigan': 'Sweaters',
        'accessories': 'Accessories',
        'tie': 'Accessories',
        'belt': 'Accessories',
        'hat': 'Accessories',
        'scarf': 'Accessories'
      };
      
      const category = categoryMap[item.category?.toLowerCase()] || 
                      categoryMap[item.type?.toLowerCase()] || 
                      'Other';
      
      const wardrobeItem = {
        id: itemId,
        user_id: userId,
        name: item.name,
        description: `Auto-detected from outfit scan with ${Math.round((item.confidence || 0) * 100)}% confidence`,
        type: category,
        color: item.color,
        material: null,
        brand: item.brand || null,
        size: null,
        rfid_tag: null,
        image_url: item.croppedImageUrl || null,
        status: 'in_closet',
        laundry_status: 'clean'
      };
      
      // Save to database
      await new Promise((resolve, reject) => {
        const stmt = db.prepare(`
          INSERT INTO wardrobe_items (
            id, user_id, name, description, type, color, material, brand, size, 
            rfid_tag, image_url, status, laundry_status, created_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        
        stmt.run([
          wardrobeItem.id,
          wardrobeItem.user_id,
          wardrobeItem.name,
          wardrobeItem.description,
          wardrobeItem.type,
          wardrobeItem.color,
          wardrobeItem.material,
          wardrobeItem.brand,
          wardrobeItem.size,
          wardrobeItem.rfid_tag,
          wardrobeItem.image_url,
          wardrobeItem.status,
          wardrobeItem.laundry_status
        ], function(err) {
          if (err) {
            console.error(`   ❌ Error saving ${item.name} to wardrobe:`, err);
            reject(err);
          } else {
            console.log(`   ✅ Saved ${item.name} to wardrobe`);
            savedItems.push(wardrobeItem);
            resolve();
          }
        });
        
        stmt.finalize();
      });
      
    } catch (error) {
      console.error(`   ❌ Failed to save ${item.name} to wardrobe:`, error);
    }
  }
  
  return savedItems;
};

// Helper function to check for duplicate outfits
const checkForDuplicateOutfits = async (detectedItems, userId) => {
  return new Promise((resolve, reject) => {
    // Get all existing outfits for this user
    db.all(`
      SELECT o.*, 
             GROUP_CONCAT(oi.item_name, '|') as item_names,
             GROUP_CONCAT(oi.item_type, '|') as item_types,
             GROUP_CONCAT(oi.item_color, '|') as item_colors
      FROM outfits o
      LEFT JOIN outfit_items oi ON o.id = oi.outfit_id
      WHERE o.user_id = ?
      GROUP BY o.id
    `, [userId], (err, existingOutfits) => {
      if (err) {
        reject(err);
        return;
      }
      
      const duplicates = [];
      const detectedItemsStr = detectedItems.map(item => `${item.type}:${item.color}`).sort().join(',');
      
      existingOutfits.forEach(outfit => {
        if (!outfit.item_names) return;
        
        const existingItems = outfit.item_names.split('|');
        const existingTypes = outfit.item_types ? outfit.item_types.split('|') : [];
        const existingColors = outfit.item_colors ? outfit.item_colors.split('|') : [];
        
        const existingItemsStr = existingTypes.map((type, i) => 
          `${type}:${existingColors[i] || 'unknown'}`
        ).sort().join(',');
        
        // Calculate similarity (simple string comparison for now)
        const similarity = calculateSimilarity(detectedItemsStr, existingItemsStr);
        
        if (similarity > 0.7) { // 70% similar
          duplicates.push({
            id: outfit.id,
            name: outfit.name,
            similarity: Math.round(similarity * 100),
            imageUrl: outfit.image_url,
            itemNames: existingItems
          });
        }
      });
      
      resolve(duplicates);
    });
  });
};

// Simple similarity calculation
const calculateSimilarity = (str1, str2) => {
  if (str1 === str2) return 1.0;
  
  const set1 = new Set(str1.split(','));
  const set2 = new Set(str2.split(','));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
};

// Helper function to match detected items with wardrobe
function matchItemsWithWardrobe(detectedItems, wardrobeItems) {
  return detectedItems.map(detectedItem => {
    let bestMatch = null;
    let bestScore = 0;

    // Find best matching item in wardrobe
    for (const wardrobeItem of wardrobeItems) {
      let matchScore = 0;

      // Category matching (most important)
      if (detectedItem.category === wardrobeItem.category) {
        matchScore += 40;
      }

      // Color matching
      if (detectedItem.color.toLowerCase() === wardrobeItem.color.toLowerCase()) {
        matchScore += 30;
      }

      // Type matching
      if (detectedItem.type === wardrobeItem.type) {
        matchScore += 20;
      }

      // Brand matching (if available)
      if (detectedItem.brand && wardrobeItem.brand && 
          detectedItem.brand.toLowerCase() === wardrobeItem.brand.toLowerCase()) {
        matchScore += 10;
      }

      if (matchScore > bestScore && matchScore >= 60) { // Threshold for match
        bestScore = matchScore;
        bestMatch = wardrobeItem;
      }
    }

    // Return item with match status
    if (bestMatch) {
      return {
        ...detectedItem,
        status: 'existing',
        matchedItem: bestMatch,
        matchScore: bestScore
      };
    } else {
      return {
        ...detectedItem,
        status: 'new'
      };
    }
  });
}

// Outfit scanning endpoint
app.post('/api/outfits/scan', async (req, res) => {
  try {
    const { image, userId } = req.body;

    if (!image || !userId) {
      return res.status(400).json({ error: 'Missing image or user ID' });
    }

    console.log(`Analyzing outfit for user: ${userId}`);
    
    // Analyze image with Google Vision
 const { detectedItems, brands, colors } = await analyzeImageWithVision(image);
    console.log('Detected colors:', colors);
    console.log('Raw Vision API results:');
    console.log(`Detected ${detectedItems.length} items:`, detectedItems);
    console.log('Detected brands:', brands);

    // Match with existing wardrobe
    const { catalogedItems, uncatalogedItems } = await matchWithWardrobe(detectedItems, userId);
    console.log(`Cataloged: ${catalogedItems.length}, Uncataloged: ${uncatalogedItems.length}`);

    res.json({
      catalogedItems,
      uncatalogedItems,
      detectedItemsCount: detectedItems.length,
      detectedBrands: brands,
      detectedColors: colors, // Add this
      analysisTimestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in scan outfit:', error);
    res.status(500).json({ 
      error: 'Failed to analyze outfit', 
      details: error.message 
    });
  }
});

// Wardrobe management routes
app.post('/api/wardrobe/items', (req, res) => {
  const { 
    userId, name, type, description, color, material, brand, size, image_url, rfid_tag
  } = req.body;

  if (!userId || !name || !type) {
    return res.status(400).json({ error: 'Missing required fields: userId, name, type' });
  }

  const itemId = uuidv4();
  const finalRfidTag = rfid_tag || generateRFIDTag(type, itemId);

  const stmt = db.prepare(`
    INSERT INTO wardrobe_items 
    (id, user_id, name, description, type, color, material, brand, size, rfid_tag, image_url, created_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  stmt.run([
    itemId, userId, name, description, type, color, material, brand, size, finalRfidTag, image_url
  ], function(err) {
    if (err) {
      console.error('Error adding wardrobe item:', err);
      return res.status(500).json({ error: 'Failed to add item' });
    }

    res.status(201).json({
      id: itemId,
      name,
      type,
      rfidTag: finalRfidTag,
      imageUrl: image_url,
      message: 'Item added successfully'
    });
  });

  stmt.finalize();
});

app.get('/api/wardrobe/items/:userId', (req, res) => {
  const { userId } = req.params;
  const { type, status, search } = req.query;

  let query = 'SELECT * FROM wardrobe_items WHERE user_id = ?';
  const params = [userId];

  // Add filters
  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (search) {
    query += ' AND (name LIKE ? OR description LIKE ? OR brand LIKE ?)';
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  query += ' ORDER BY created_date DESC';

  db.all(query, params, (err, items) => {
    if (err) {
      console.error('Error getting wardrobe items:', err);
      return res.status(500).json({ error: 'Failed to get wardrobe items' });
    }

    const wardrobeItems = items.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      type: item.type,
      color: item.color,
      material: item.material,
      brand: item.brand,
      size: item.size,
      rfidTag: item.rfid_tag,
      imageUrl: item.image_url,
      createdDate: item.created_date,
      lastWornDate: item.last_worn_date,
      status: item.status,
      laundryStatus: item.laundry_status
    }));

    res.json(wardrobeItems);
  });
});

app.put('/api/wardrobe/items/:itemId', (req, res) => {
  const { itemId } = req.params;
  const { name, description, type, color, material, brand, size, status, laundryStatus } = req.body;

  const stmt = db.prepare(`
    UPDATE wardrobe_items 
    SET name = ?, description = ?, type = ?, color = ?, material = ?, 
        brand = ?, size = ?, status = ?, laundry_status = ?
    WHERE id = ?
  `);

  stmt.run([
    name, description, type, color, material, brand, size, status, laundryStatus, itemId
  ], function(err) {
    if (err) {
      console.error('Error updating wardrobe item:', err);
      return res.status(500).json({ error: 'Failed to update item' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ message: 'Item updated successfully' });
  });

  stmt.finalize();
});

app.delete('/api/wardrobe/items/:itemId', (req, res) => {
  const { itemId } = req.params;

  db.serialize(() => {
    // Remove from outfit_items first
    db.run('DELETE FROM outfit_items WHERE item_id = ?', [itemId]);
    
    // Remove the item
    const stmt = db.prepare('DELETE FROM wardrobe_items WHERE id = ?');
    stmt.run([itemId], function(err) {
      if (err) {
        console.error('Error deleting wardrobe item:', err);
        return res.status(500).json({ error: 'Failed to delete item' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      res.json({ message: 'Item deleted successfully' });
    });
    stmt.finalize();
  });
});

// Outfit management routes
app.post('/api/outfits', (req, res) => {
  const { userId, name, description, catalogedItems = [], image, occasion, weather } = req.body;

  if (!userId || !name) {
    return res.status(400).json({ error: 'Missing required fields: userId, name' });
  }

  const outfitId = uuidv4();

  db.serialize(() => {
    // Save outfit
    const outfitStmt = db.prepare(`
      INSERT INTO outfits (id, user_id, name, description, image_url, occasion, weather, created_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    outfitStmt.run([outfitId, userId, name, description, image, occasion, weather], function(err) {
      if (err) {
        console.error('Error saving outfit:', err);
        return res.status(500).json({ error: 'Failed to save outfit' });
      }

      // Save outfit items relationships
      if (catalogedItems.length > 0) {
        const itemStmt = db.prepare(`
          INSERT INTO outfit_items (outfit_id, item_id, confidence)
          VALUES (?, ?, ?)
        `);

        catalogedItems.forEach(item => {
          const itemId = item.itemId || item.id;
          const confidence = item.confidence || 100;
          itemStmt.run([outfitId, itemId, confidence]);
        });

        itemStmt.finalize();
      }

      res.status(201).json({
        id: outfitId,
        message: 'Outfit saved successfully'
      });
    });

    outfitStmt.finalize();
  });
});

app.get('/api/outfits/:userId', (req, res) => {
  const { userId } = req.params;
  const { occasion, weather } = req.query;

  let query = `
    SELECT o.*, 
           GROUP_CONCAT(COALESCE(wi.name, oi.item_name), '|') as item_names,
           GROUP_CONCAT(COALESCE(wi.id, oi.item_id), '|') as item_ids,
           GROUP_CONCAT(COALESCE(wi.type, oi.item_type), '|') as item_types,
           GROUP_CONCAT(COALESCE(wi.image_url, oi.item_image_url), '|') as item_image_urls,
           COUNT(oi.outfit_id) as item_count
    FROM outfits o
    LEFT JOIN outfit_items oi ON o.id = oi.outfit_id
    LEFT JOIN wardrobe_items wi ON oi.item_id = wi.id
    WHERE o.user_id = ?
  `;
  
  const params = [userId];

  if (occasion) {
    query += ' AND o.occasion = ?';
    params.push(occasion);
  }

  if (weather) {
    query += ' AND o.weather = ?';
    params.push(weather);
  }

  query += ' GROUP BY o.id ORDER BY o.created_date DESC';

  db.all(query, params, (err, outfits) => {
    if (err) {
      console.error('Error getting outfits:', err);
      return res.status(500).json({ error: 'Failed to get outfits' });
    }

    const formattedOutfits = outfits.map(outfit => ({
      id: outfit.id,
      name: outfit.name,
      description: outfit.description,
      imageUrl: outfit.image_url,
      occasion: outfit.occasion,
      weather: outfit.weather,
      createdDate: outfit.created_date,
      lastWornDate: outfit.last_worn_date,
      itemCount: outfit.item_count,
      itemNames: outfit.item_names ? outfit.item_names.split('|').filter(Boolean) : [],
      itemIds: outfit.item_ids ? outfit.item_ids.split('|').filter(Boolean) : [],
      itemTypes: outfit.item_types ? outfit.item_types.split('|').filter(Boolean) : [],
      itemImageUrls: outfit.item_image_urls ? outfit.item_image_urls.split('|').filter(Boolean) : [],
      // Add items array for frontend compatibility
      items: outfit.item_ids ? outfit.item_ids.split('|').filter(Boolean) : [],
      // Also add date in the format frontend expects
      date: outfit.created_date ? outfit.created_date.split(' ')[0] : new Date().toISOString().split('T')[0]
    }));

    res.json(formattedOutfits);
  });
});

app.delete('/api/outfits/:outfitId', (req, res) => {
  const { outfitId } = req.params;

  db.serialize(() => {
    // Remove outfit items first
    db.run('DELETE FROM outfit_items WHERE outfit_id = ?', [outfitId]);
    
    // Remove the outfit
    const stmt = db.prepare('DELETE FROM outfits WHERE id = ?');
    stmt.run([outfitId], function(err) {
      if (err) {
        console.error('Error deleting outfit:', err);
        return res.status(500).json({ error: 'Failed to delete outfit' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Outfit not found' });
      }

      res.json({ message: 'Outfit deleted successfully' });
    });
    stmt.finalize();
  });
});

// RFID tracking routes
app.post('/api/rfid/scan', (req, res) => {
  const { userId, rfidTag, scanType, location } = req.body;

  if (!userId || !rfidTag || !scanType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const scanId = uuidv4();

  const stmt = db.prepare(`
    INSERT INTO rfid_scans (id, user_id, rfid_tag, scan_type, location, scan_time)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  stmt.run([scanId, userId, rfidTag, scanType, location], function(err) {
    if (err) {
      console.error('Error logging RFID scan:', err);
      return res.status(500).json({ error: 'Failed to log scan' });
    }

    // Update item status based on scan type
    const itemStatus = scanType === 'exit' ? 'worn' : 'in_closet';
    const lastWornDate = scanType === 'exit' ? "datetime('now')" : null;

    const updateQuery = lastWornDate 
      ? 'UPDATE wardrobe_items SET status = ?, last_worn_date = datetime(\'now\') WHERE rfid_tag = ?'
      : 'UPDATE wardrobe_items SET status = ? WHERE rfid_tag = ?';

    db.run(updateQuery, [itemStatus, rfidTag], (updateErr) => {
      if (updateErr) {
        console.error('Error updating item status:', updateErr);
      }
    });

    res.status(201).json({
      id: scanId,
      message: 'RFID scan logged successfully'
    });
  });

  stmt.finalize();
});

app.get('/api/rfid/scans/:userId', (req, res) => {
  const { userId } = req.params;
  const { limit = 50 } = req.query;

  const query = `
    SELECT rs.*, wi.name as item_name, wi.type as item_type
    FROM rfid_scans rs
    LEFT JOIN wardrobe_items wi ON rs.rfid_tag = wi.rfid_tag
    WHERE rs.user_id = ?
    ORDER BY rs.scan_time DESC
    LIMIT ?
  `;

  db.all(query, [userId, parseInt(limit)], (err, scans) => {
    if (err) {
      console.error('Error getting RFID scans:', err);
      return res.status(500).json({ error: 'Failed to get scans' });
    }

    res.json(scans);
  });
});

// Image upload endpoint
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  
  res.json({
    message: 'Image uploaded successfully',
    imageUrl: imageUrl,
    filename: req.file.filename
  });
});

// Statistics endpoints
app.get('/api/stats/:userId', (req, res) => {
  const { userId } = req.params;

  db.serialize(() => {
    const stats = {};

    // Get wardrobe count
    db.get('SELECT COUNT(*) as count FROM wardrobe_items WHERE user_id = ?', [userId], (err, result) => {
      if (!err) stats.wardrobeCount = result.count;
    });

    // Get outfit count
    db.get('SELECT COUNT(*) as count FROM outfits WHERE user_id = ?', [userId], (err, result) => {
      if (!err) stats.outfitCount = result.count;
    });

    // Get most worn items
    db.all(`
      SELECT wi.name, wi.type, COUNT(rs.id) as wear_count
      FROM wardrobe_items wi
      LEFT JOIN rfid_scans rs ON wi.rfid_tag = rs.rfid_tag AND rs.scan_type = 'exit'
      WHERE wi.user_id = ?
      GROUP BY wi.id
      ORDER BY wear_count DESC
      LIMIT 5
    `, [userId], (err, results) => {
      if (!err) stats.mostWornItems = results;
      
      res.json(stats);
    });
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});

// Export functions for routes
module.exports = {
  analyzeImageWithVision,
  matchWithWardrobe
};

// Start server
app.listen(PORT, () => {
  console.log(`🐒 ClosetMonkey backend running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔍 Vision API test: http://localhost:${PORT}/api/test-vision`);
  console.log(`📂 Environment: ${process.env.NODE_ENV || 'development'}`);
});
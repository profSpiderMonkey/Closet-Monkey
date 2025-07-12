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
    // Neutrals
    { name: 'black', rgb: [0, 0, 0] },
    { name: 'white', rgb: [255, 255, 255] },
    { name: 'gray', rgb: [128, 128, 128] },
    { name: 'dark gray', rgb: [64, 64, 64] },
    { name: 'light gray', rgb: [211, 211, 211] },
    { name: 'silver', rgb: [192, 192, 192] },
    { name: 'charcoal', rgb: [54, 69, 79] },
    
    // Blues - Enhanced for better light blue detection
    { name: 'navy', rgb: [0, 0, 128] },
    { name: 'blue', rgb: [0, 0, 255] },
    { name: 'light blue', rgb: [173, 216, 230] },
    { name: 'baby blue', rgb: [137, 207, 240] },
    { name: 'baby blue', rgb: [152, 193, 217] }, // Alternative baby blue
    { name: 'sky blue', rgb: [135, 206, 235] },
    { name: 'powder blue', rgb: [176, 224, 230] },
    { name: 'pale blue', rgb: [175, 238, 238] },
    { name: 'ice blue', rgb: [175, 238, 238] },
    { name: 'light blue', rgb: [190, 210, 230] }, // Another light blue variant
    { name: 'steel blue', rgb: [70, 130, 180] },
    { name: 'royal blue', rgb: [65, 105, 225] },
    { name: 'cornflower blue', rgb: [100, 149, 237] },
    { name: 'midnight blue', rgb: [25, 25, 112] },
    { name: 'slate blue', rgb: [106, 90, 205] },
    { name: 'oxford blue', rgb: [0, 33, 71] },
    { name: 'teal', rgb: [0, 128, 128] },
    { name: 'turquoise', rgb: [64, 224, 208] },
    
    // Browns/Tans
    { name: 'brown', rgb: [165, 42, 42] },
    { name: 'dark brown', rgb: [101, 67, 33] },
    { name: 'light brown', rgb: [181, 101, 29] },
    { name: 'tan', rgb: [210, 180, 140] },
    { name: 'beige', rgb: [245, 245, 220] },
    { name: 'khaki', rgb: [240, 230, 140] },
    { name: 'camel', rgb: [193, 154, 107] },
    { name: 'chocolate', rgb: [210, 105, 30] },
    { name: 'coffee', rgb: [111, 78, 55] },
    { name: 'cognac', rgb: [159, 69, 19] },
    { name: 'saddle brown', rgb: [139, 69, 19] },
    { name: 'sienna', rgb: [160, 82, 45] },
    { name: 'rust', rgb: [183, 65, 14] },
    
    // Reds
    { name: 'red', rgb: [255, 0, 0] },
    { name: 'dark red', rgb: [139, 0, 0] },
    { name: 'crimson', rgb: [220, 20, 60] },
    { name: 'burgundy', rgb: [128, 0, 32] },
    { name: 'maroon', rgb: [128, 0, 0] },
    { name: 'wine', rgb: [114, 47, 55] },
    { name: 'brick red', rgb: [178, 34, 34] },
    
    // Greens
    { name: 'green', rgb: [0, 128, 0] },
    { name: 'dark green', rgb: [0, 100, 0] },
    { name: 'forest green', rgb: [34, 139, 34] },
    { name: 'olive', rgb: [128, 128, 0] },
    { name: 'olive green', rgb: [85, 107, 47] },
    { name: 'sage', rgb: [157, 187, 123] },
    { name: 'mint green', rgb: [152, 251, 152] },
    { name: 'hunter green', rgb: [53, 94, 59] },
    
    // Purples
    { name: 'purple', rgb: [128, 0, 128] },
    { name: 'dark purple', rgb: [75, 0, 130] },
    { name: 'violet', rgb: [238, 130, 238] },
    { name: 'lavender', rgb: [230, 230, 250] },
    { name: 'plum', rgb: [221, 160, 221] },
    { name: 'eggplant', rgb: [97, 64, 81] },
    
    // Pinks
    { name: 'pink', rgb: [255, 192, 203] },
    { name: 'hot pink', rgb: [255, 105, 180] },
    { name: 'rose', rgb: [255, 228, 225] },
    { name: 'blush', rgb: [222, 93, 131] },
    { name: 'coral', rgb: [255, 127, 80] },
    { name: 'salmon', rgb: [250, 128, 114] },
    
    // Yellows/Oranges
    { name: 'yellow', rgb: [255, 255, 0] },
    { name: 'gold', rgb: [255, 215, 0] },
    { name: 'mustard', rgb: [255, 219, 88] },
    { name: 'cream', rgb: [255, 253, 208] },
    { name: 'ivory', rgb: [255, 255, 240] },
    { name: 'orange', rgb: [255, 165, 0] },
    { name: 'burnt orange', rgb: [204, 85, 0] },
    { name: 'peach', rgb: [255, 218, 185] },
    { name: 'apricot', rgb: [251, 206, 177] }
  ];

  console.log(`🎨 Color analysis for RGB(${r}, ${g}, ${b}):`);
  
  // Convert RGB to HSL for better color analysis
  const hsl = rgbToHsl(r, g, b);
  const [h, s, l] = hsl;
  console.log(`   HSL: (${h.toFixed(1)}°, ${(s * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%)`);
  
  // First, try perceptual color matching using weighted RGB distance
  let closestColor = colors[0];
  let minDistance = Infinity;

  colors.forEach(color => {
    // Weighted RGB distance that considers human perception
    const distance = Math.sqrt(
      Math.pow((r - color.rgb[0]) * 0.3, 2) +  // Red weight
      Math.pow((g - color.rgb[1]) * 0.59, 2) + // Green weight (highest)
      Math.pow((b - color.rgb[2]) * 0.11, 2)   // Blue weight
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = color;
    }
  });

  console.log(`   Closest match: ${closestColor.name} (distance: ${minDistance.toFixed(2)})`);
  
  // HSL-based color detection for better accuracy
  const brightness = l;
  const saturation = s;
  const hue = h;
  
  // Very low saturation = grayscale
  if (saturation < 0.15) {
    if (brightness < 0.3) {
      return 'black';
    } else if (brightness < 0.4) {
      return 'charcoal';
    } else if (brightness < 0.5) {
      return 'dark gray';
    } else if (brightness < 0.7) {
      return 'gray';
    } else if (brightness < 0.9) {
      return 'light gray';
    } else {
      return 'white';
    }
  }
  
  // Special handling for light blue suits and clothing
  if (hue >= 180 && hue <= 240 && brightness > 0.5) {
    if (brightness > 0.8 && saturation > 0.2) return 'baby blue';
    if (brightness > 0.7 && saturation > 0.15) return 'light blue';
    if (brightness > 0.6 && saturation > 0.2) return 'powder blue';
    if (brightness > 0.5 && saturation > 0.3) return 'sky blue';
  }
  
  // High saturation colors - use hue-based detection
  if (saturation > 0.3) {
    if (hue >= 0 && hue < 15) return brightness > 0.7 ? 'pink' : 'red';
    if (hue >= 15 && hue < 45) return brightness > 0.7 ? 'peach' : 'orange';
    if (hue >= 45 && hue < 75) return brightness > 0.7 ? 'cream' : 'yellow';
    if (hue >= 75 && hue < 105) return brightness > 0.7 ? 'mint green' : 'green';
    if (hue >= 105 && hue < 135) return brightness > 0.7 ? 'sage' : 'green';
    if (hue >= 135 && hue < 165) return 'teal';
    if (hue >= 165 && hue < 190) return brightness > 0.7 ? 'sky blue' : 'blue';
    if (hue >= 190 && hue < 225) {
      if (brightness > 0.8) return 'powder blue';
      if (brightness > 0.6) return 'light blue';
      if (brightness > 0.4) return 'blue';
      return 'navy';
    }
    if (hue >= 225 && hue < 255) {
      if (brightness > 0.8) return 'baby blue';
      if (brightness > 0.6) return 'light blue';
      if (brightness > 0.4) return 'blue';
      return 'navy';
    }
    if (hue >= 255 && hue < 285) return brightness > 0.7 ? 'lavender' : 'purple';
    if (hue >= 285 && hue < 315) return brightness > 0.7 ? 'plum' : 'purple';
    if (hue >= 315 && hue < 345) return brightness > 0.7 ? 'rose' : 'burgundy';
    if (hue >= 345 && hue <= 360) return brightness > 0.7 ? 'pink' : 'red';
  }
  
  // Medium saturation - muted colors
  if (saturation > 0.15 && saturation <= 0.3) {
    if (hue >= 0 && hue < 60) return brightness > 0.5 ? 'tan' : 'brown';
    if (hue >= 60 && hue < 120) return brightness > 0.5 ? 'khaki' : 'olive';
    if (hue >= 120 && hue < 180) return brightness > 0.5 ? 'sage' : 'olive green';
    if (hue >= 180 && hue < 240) return brightness > 0.5 ? 'steel blue' : 'navy';
    if (hue >= 240 && hue < 300) return brightness > 0.5 ? 'slate blue' : 'dark purple';
    if (hue >= 300 && hue <= 360) return brightness > 0.5 ? 'wine' : 'maroon';
  }

  // Fallback to closest color match
  return minDistance < 100 ? closestColor.name : 'unknown';
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
      
      // Ensure valid bounds with safety margins
      const left = Math.max(0, Math.floor(minX));
      const top = Math.max(0, Math.floor(minY));
      const right = Math.min(width - 1, Math.ceil(maxX));
      const bottom = Math.min(height - 1, Math.ceil(maxY));
      
      const cropWidth = Math.max(1, right - left);
      const cropHeight = Math.max(1, bottom - top);
      
      console.log(`   📐 Combined crop area: left=${left}, top=${top}, width=${cropWidth}, height=${cropHeight}`);
      
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
      
      // Calculate bounds with safety checks
      const left = Math.max(0, Math.floor(Math.min(...xCoords)));
      const top = Math.max(0, Math.floor(Math.min(...yCoords)));
      const right = Math.min(width - 1, Math.ceil(Math.max(...xCoords)));
      const bottom = Math.min(height - 1, Math.ceil(Math.max(...yCoords)));
      
      const cropWidth = Math.max(1, right - left);
      const cropHeight = Math.max(1, bottom - top);
      
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

    const detectedItems = [];
    const colors = [];
    const clothingTerms = [
      'shirt', 'pants', 'dress', 'jacket', 'shoe', 'tie', 'hat', 'sock', 
      'suit', 'jeans', 'sweater', 'coat', 'blazer', 'skirt', 'blouse',
      'trouser', 'sneaker', 'boot', 'sandal', 'heel', 'belt', 'scarf',
      'vest', 'cardigan', 'hoodie', 'polo', 't-shirt', 'tank top'
    ];
    
    console.log('🔍 Processing detected objects first...');
    
    // Extract actual colors from Vision API FIRST
    console.log('🎨 Extracting colors from Vision API...');
    console.log('🔍 Properties result:', JSON.stringify(propertiesResult, null, 2));
    const detectedColors = [];
    
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
        
        // Additional debug for blue colors
        if (b > 100 || colorName.includes('blue')) {
          const [h, s, l] = rgbToHsl(r, g, b);
          console.log(`      🔍 Blue analysis: HSL(${h.toFixed(1)}°, ${(s*100).toFixed(1)}%, ${(l*100).toFixed(1)}%)`);
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
    
    // Process detected objects AFTER color detection
    if (objectResult.localizedObjectAnnotations) {
      console.log('Raw object detections:', 
        objectResult.localizedObjectAnnotations.map(obj => ({
          name: obj.name,
          score: obj.score
        }))
      );
      
      // Process each detected object
      objectResult.localizedObjectAnnotations.forEach(obj => {
        const objectName = obj.name.toLowerCase();
        if (clothingTerms.some(term => objectName.includes(term) || term.includes(objectName))) {
          detectedItems.push({
            type: objectName,
            confidence: Math.round(obj.score * 100),
            boundingBox: obj.boundingPoly.normalizedVertices,
            source: 'object_detection'
          });
        }
      });
    }

    // Log raw label results
    if (labelResult.labelAnnotations) {
      console.log('Raw labels detected:', 
        labelResult.labelAnnotations.slice(0, 10).map(label => ({
          description: label.description,
          score: label.score
        }))
      );
    }

    // If no objects detected, try to infer from labels
    if (detectedItems.length === 0 && labelResult.labelAnnotations) {
      const clothingLabels = labelResult.labelAnnotations.filter(label => {
        const description = label.description.toLowerCase();
        return clothingTerms.some(term => description.includes(term)) ||
               ['clothing', 'apparel', 'fashion', 'garment', 'outfit'].some(term => description.includes(term));
      });

      clothingLabels.slice(0, 5).forEach(label => {
        detectedItems.push({
          type: label.description.toLowerCase(),
          confidence: Math.round(label.score * 100),
          boundingBox: null,
          source: 'label_detection'
        });
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

    console.log('🎯 Final detected colors:', detectedColors);
    
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

    const wardrobeItems = req.body.wardrobeItems ? JSON.parse(req.body.wardrobeItems) : [];
    const userId = req.body.userId || '7eb88885-3bc3-4c09-af20-7fbd0bf6fa07';

    console.log(`Analyzing outfit for user: ${userId}`);
    console.log(`Wardrobe items count: ${wardrobeItems.length}`);
    
    // Convert uploaded image to base64 for Vision API
    const imageBuffer = require('fs').readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');

    // Analyze the outfit image
    const { detectedItems, brands, colors } = await analyzeImageWithVision(`data:image/jpeg;base64,${base64Image}`);
    
    console.log('Raw Vision API results:');
    console.log(`Detected ${detectedItems.length} items:`, detectedItems);
    console.log('Detected brands:', brands);
    console.log('Detected colors:', colors);

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
          console.log(`   Assigning color "${primaryColor}" to ${item.type} (index ${index})`);
        } else {
          // If no bounding box, distribute colors across items
          primaryColor = colors[index % colors.length];
          console.log(`   Assigning color "${primaryColor}" to ${item.type} (no bounding box)`);
        }
      } else {
        console.log(`   ⚠️  No colors available for ${item.type}, will use fallback`);
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
        console.log(`   Using fallback color "${primaryColor}" for ${item.type}`);
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

    // Infer complementary items (like dress shirt with suit)
    console.log('🔍 Checking for complementary items...');
    const complementaryItems = [];
    
    // Check if we have a suit/blazer but no shirt
    const hasSuitOrBlazer = processedItems.some(item => 
      ['suit', 'blazer', 'jacket', 'coat'].includes(item.type.toLowerCase())
    );
    const hasShirt = processedItems.some(item => 
      ['shirt', 'blouse', 't-shirt', 'dress shirt'].includes(item.type.toLowerCase())
    );
    
    if (hasSuitOrBlazer && !hasShirt) {
      console.log('   👔 Detected suit/blazer without shirt - inferring dress shirt');
      complementaryItems.push({
        name: 'White Dress Shirt',
        category: 'Shirts',
        color: 'white',
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
    
    // Check if we have a tie but no shirt (another indicator)
    const hasTie = processedItems.some(item => 
      item.type.toLowerCase() === 'tie'
    );
    
    if (hasTie && !hasShirt && complementaryItems.length === 0) {
      console.log('   👔 Detected tie without shirt - inferring dress shirt');
      complementaryItems.push({
        name: 'White Dress Shirt',
        category: 'Shirts', 
        color: 'white',
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
    console.log(`Added ${complementaryItems.length} inferred items`);

    // Merge similar detected items (especially shoes) before matching with wardrobe
    console.log('🔗 Merging similar detected items...');
    const mergedItems = mergeDetectedItems(allItems);
    console.log(`Merged ${allItems.length} items down to ${mergedItems.length} items`);

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
          croppedUrl = await createCroppedImage(
            imageBuffer, 
            item.boundingBox, 
            `${item.type}_${i}`
          );
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
    console.log('📋 Returning detected items for user review (not saving yet)');
    
    // Generate a suggested outfit name for the frontend to use
    const suggestedOutfitName = generateOutfitName(matchedItems);

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
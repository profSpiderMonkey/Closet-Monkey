// backend/server.js
// Closet Monkey API Server

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `item-${uniqueSuffix}${extension}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Only allow image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// In-memory storage for MVP (replace with real database later)
let wardrobeItems = [
  // Sample data for testing
  {
    id: 1,
    name: "Navy Blue Suit Jacket",
    category: "Jackets",
    color: "Navy",
    brand: "Hugo Boss",
    material: "Wool",
    size: "42R",
    rfid_tag: "RF001",
    description: "Professional navy suit jacket for business meetings",
    image: null,
    laundry_status: "clean",
    status: "in_closet",
    created_at: new Date().toISOString(),
    last_worn: null
  },
  {
    id: 2,
    name: "White Cotton Dress Shirt",
    category: "Shirts",
    color: "White",
    brand: "Brooks Brothers",
    material: "Cotton",
    size: "16.5/34",
    rfid_tag: "RF002",
    description: "Classic white dress shirt",
    image: null,
    laundry_status: "clean",
    status: "in_closet",
    created_at: new Date().toISOString(),
    last_worn: null
  }
];

let nextId = 3;
let wearEvents = [];
let outfitSuggestions = [];

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// WARDROBE ITEMS ENDPOINTS
// ============================================================================

// GET /api/items - Get all wardrobe items
app.get('/api/items', (req, res) => {
  try {
    console.log(`Returning ${wardrobeItems.length} wardrobe items`);
    res.json(wardrobeItems);
  } catch (error) {
    console.error('Error getting items:', error);
    res.status(500).json({ error: 'Failed to get items' });
  }
});

// GET /api/items/:id - Get specific wardrobe item
app.get('/api/items/:id', (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const item = wardrobeItems.find(item => item.id === itemId);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(item);
  } catch (error) {
    console.error('Error getting item:', error);
    res.status(500).json({ error: 'Failed to get item' });
  }
});

// POST /api/items - Add new wardrobe item
app.post('/api/items', upload.single('image'), (req, res) => {
  try {
    console.log('POST /api/items - Adding new item');
    console.log('Request body:', req.body);
    console.log('Uploaded file:', req.file);

    if (!req.body.itemData) {
      return res.status(400).json({ error: 'itemData is required' });
    }

    const itemData = JSON.parse(req.body.itemData);
    
    // Validate required fields
    if (!itemData.name || !itemData.category) {
      return res.status(400).json({ error: 'Name and category are required' });
    }
    
    const newItem = {
      id: nextId++,
      name: itemData.name,
      category: itemData.category,
      color: itemData.color || '',
      brand: itemData.brand || '',
      material: itemData.material || '',
      size: itemData.size || '',
      rfid_tag: itemData.rfidTag || '',
      description: itemData.description || '',
      image: req.file ? `/uploads/${req.file.filename}` : null,
      laundry_status: 'clean',
      status: 'in_closet',
      created_at: new Date().toISOString(),
      last_worn: null
    };

    wardrobeItems.push(newItem);
    
    console.log('Successfully added new item:', newItem);
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error adding item:', error);
    res.status(500).json({ error: 'Failed to add item: ' + error.message });
  }
});

// PUT /api/items/:id - Update wardrobe item
app.put('/api/items/:id', upload.single('image'), (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const itemIndex = wardrobeItems.findIndex(item => item.id === itemId);
    
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    let updateData = req.body;
    if (req.body.itemData) {
      updateData = JSON.parse(req.body.itemData);
    }
    
    // Handle new image upload
    if (req.file) {
      // Delete old image if it exists
      const oldItem = wardrobeItems[itemIndex];
      if (oldItem.image) {
        const oldImagePath = path.join(__dirname, oldItem.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      updateData.image = `/uploads/${req.file.filename}`;
    }
    
    wardrobeItems[itemIndex] = { 
      ...wardrobeItems[itemIndex], 
      ...updateData,
      id: itemId // Ensure ID doesn't change
    };
    
    console.log('Updated item:', wardrobeItems[itemIndex]);
    res.json(wardrobeItems[itemIndex]);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/items/:id - Delete wardrobe item
app.delete('/api/items/:id', (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const itemIndex = wardrobeItems.findIndex(item => item.id === itemId);
    
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Delete associated image file if it exists
    const item = wardrobeItems[itemIndex];
    if (item.image) {
      const imagePath = path.join(__dirname, item.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log('Deleted image file:', imagePath);
      }
    }
    
    wardrobeItems.splice(itemIndex, 1);
    console.log(`Deleted item with ID: ${itemId}`);
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// ============================================================================
// LAUNDRY MANAGEMENT ENDPOINTS
// ============================================================================

// PUT /api/items/:id/laundry - Update laundry status
app.put('/api/items/:id/laundry', (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const { status } = req.body;
    
    if (!['clean', 'dirty', 'washing', 'drying'].includes(status)) {
      return res.status(400).json({ error: 'Invalid laundry status' });
    }
    
    const itemIndex = wardrobeItems.findIndex(item => item.id === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    wardrobeItems[itemIndex].laundry_status = status;
    res.json(wardrobeItems[itemIndex]);
  } catch (error) {
    console.error('Error updating laundry status:', error);
    res.status(500).json({ error: 'Failed to update laundry status' });
  }
});

// GET /api/items/dirty - Get all dirty items
app.get('/api/items/dirty', (req, res) => {
  try {
    const dirtyItems = wardrobeItems.filter(item => item.laundry_status === 'dirty');
    res.json(dirtyItems);
  } catch (error) {
    console.error('Error getting dirty items:', error);
    res.status(500).json({ error: 'Failed to get dirty items' });
  }
});

// ============================================================================
// RFID / WEAR TRACKING ENDPOINTS
// ============================================================================

// POST /api/wear-events - Log wear event (for RFID tracking)
app.post('/api/wear-events', (req, res) => {
  try {
    const { rfidTags, timestamp, type } = req.body;
    
    const wearEvent = {
      id: Date.now(),
      rfidTags: rfidTags || [],
      timestamp: timestamp || new Date().toISOString(),
      type: type || 'departure' // 'departure' or 'arrival'
    };
    
    wearEvents.push(wearEvent);
    
    // Update item status and laundry status
    if (rfidTags && rfidTags.length > 0) {
      rfidTags.forEach(tag => {
        const item = wardrobeItems.find(item => item.rfid_tag === tag);
        if (item) {
          item.last_worn = timestamp || new Date().toISOString();
          if (type === 'departure') {
            item.status = 'worn';
            item.laundry_status = 'dirty';
          }
        }
      });
    }
    
    console.log('Logged wear event:', wearEvent);
    res.json({ message: 'Wear event logged successfully', event: wearEvent });
  } catch (error) {
    console.error('Error logging wear event:', error);
    res.status(500).json({ error: 'Failed to log wear event' });
  }
});

// GET /api/wear-events - Get wear history
app.get('/api/wear-events', (req, res) => {
  try {
    res.json(wearEvents);
  } catch (error) {
    console.error('Error getting wear events:', error);
    res.status(500).json({ error: 'Failed to get wear events' });
  }
});

// ============================================================================
// OUTFIT SUGGESTIONS ENDPOINTS
// ============================================================================

// GET /api/outfit-suggestions - Get AI outfit suggestions
app.get('/api/outfit-suggestions', (req, res) => {
  try {
    const { weather, occasion, excludeItems } = req.query;
    
    // Get available (clean) items
    let availableItems = wardrobeItems.filter(item => 
      item.laundry_status === 'clean' && item.status === 'in_closet'
    );
    
    // Exclude specified items
    if (excludeItems) {
      const excludeIds = excludeItems.split(',').map(id => parseInt(id));
      availableItems = availableItems.filter(item => !excludeIds.includes(item.id));
    }
    
    // Simple outfit generation logic (enhance this later)
    const suggestions = [];
    
    if (availableItems.length >= 2) {
      // Basic outfit: try to get different categories
      const shirts = availableItems.filter(item => item.category === 'Shirts');
      const pants = availableItems.filter(item => item.category === 'Pants');
      const jackets = availableItems.filter(item => item.category === 'Jackets');
      
      const suggestion = {
        id: Date.now(),
        name: "AI Suggestion",
        items: [],
        weather: weather || "Sunny, 72°F",
        occasion: occasion || "Casual",
        confidence: 0.8
      };
      
      // Add one item from each category if available
      if (shirts.length > 0) suggestion.items.push(shirts[0].id);
      if (pants.length > 0) suggestion.items.push(pants[0].id);
      if (jackets.length > 0 && (weather?.includes('cold') || weather?.includes('Cool'))) {
        suggestion.items.push(jackets[0].id);
      }
      
      // If we don't have enough items, just add the first few available
      while (suggestion.items.length < 3 && suggestion.items.length < availableItems.length) {
        const nextItem = availableItems.find(item => !suggestion.items.includes(item.id));
        if (nextItem) suggestion.items.push(nextItem.id);
        else break;
      }
      
      if (suggestion.items.length > 0) {
        suggestions.push(suggestion);
      }
    }
    
    res.json(suggestions);
  } catch (error) {
    console.error('Error getting outfit suggestions:', error);
    res.status(500).json({ error: 'Failed to get outfit suggestions' });
  }
});

// POST /api/outfit-suggestions - Create custom outfit
app.post('/api/outfit-suggestions', (req, res) => {
  try {
    const { name, items, weather, occasion } = req.body;
    
    const outfit = {
      id: Date.now(),
      name: name || "Custom Outfit",
      items: items || [],
      weather: weather || "",
      occasion: occasion || "",
      created_at: new Date().toISOString()
    };
    
    outfitSuggestions.push(outfit);
    res.status(201).json(outfit);
  } catch (error) {
    console.error('Error creating outfit:', error);
    res.status(500).json({ error: 'Failed to create outfit' });
  }
});

// ============================================================================
// WEATHER & CALENDAR INTEGRATION (Placeholder for Phase 3)
// ============================================================================

// GET /api/weather - Get weather data
app.get('/api/weather', (req, res) => {
  try {
    // TODO: Integrate with real weather API
    const mockWeather = {
      current: {
        temperature: 72,
        condition: "Sunny",
        humidity: 45,
        description: "Perfect weather for light layers"
      },
      forecast: [
        { day: "Today", high: 75, low: 65, condition: "Sunny" },
        { day: "Tomorrow", high: 73, low: 63, condition: "Partly Cloudy" },
        { day: "Wednesday", high: 70, low: 60, condition: "Rainy" }
      ]
    };
    
    res.json(mockWeather);
  } catch (error) {
    console.error('Error getting weather:', error);
    res.status(500).json({ error: 'Failed to get weather data' });
  }
});

// GET /api/calendar - Get calendar events
app.get('/api/calendar', (req, res) => {
  try {
    // TODO: Integrate with real calendar API
    const mockEvents = [
      {
        id: 1,
        title: "Team Meeting",
        start: new Date().toISOString(),
        end: new Date(Date.now() + 3600000).toISOString(),
        attendees: ["colleague1@company.com", "colleague2@company.com"],
        location: "Conference Room A"
      }
    ];
    
    res.json(mockEvents);
  } catch (error) {
    console.error('Error getting calendar:', error);
    res.status(500).json({ error: 'Failed to get calendar events' });
  }
});

// ============================================================================
// HEALTH CHECK & ROOT ENDPOINTS
// ============================================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    items_count: wardrobeItems.length,
    wear_events_count: wearEvents.length
  });
});

// Root endpoint with API documentation
app.get('/', (req, res) => {
  res.json({ 
    message: '🐒 Closet Monkey API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      wardrobe: [
        'GET /api/items - Get all items',
        'GET /api/items/:id - Get specific item',
        'POST /api/items - Add new item (with image upload)',
        'PUT /api/items/:id - Update item',
        'DELETE /api/items/:id - Delete item'
      ],
      laundry: [
        'PUT /api/items/:id/laundry - Update laundry status',
        'GET /api/items/dirty - Get dirty items'
      ],
      tracking: [
        'POST /api/wear-events - Log wear event',
        'GET /api/wear-events - Get wear history'
      ],
      suggestions: [
        'GET /api/outfit-suggestions - Get AI suggestions',
        'POST /api/outfit-suggestions - Create custom outfit'
      ],
      integrations: [
        'GET /api/weather - Get weather data',
        'GET /api/calendar - Get calendar events'
      ],
      system: [
        'GET /health - Health check',
        'GET / - This documentation'
      ]
    },
    stats: {
      items: wardrobeItems.length,
      wear_events: wearEvents.length,
      outfit_suggestions: outfitSuggestions.length
    }
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Handle multer errors
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
    }
  }
  
  if (error.message === 'Only image files are allowed!') {
    return res.status(400).json({ error: 'Only image files are allowed!' });
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    available_endpoints: [
      'GET /',
      'GET /health',
      'GET /api/items',
      'POST /api/items',
      'PUT /api/items/:id',
      'DELETE /api/items/:id'
    ]
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log('🐒========================================🐒');
  console.log(`   Closet Monkey API Server Started`);
  console.log('🐒========================================🐒');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API docs: http://localhost:${PORT}/`);
  console.log(`👔 Wardrobe items: ${wardrobeItems.length}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
  console.log('🐒========================================🐒');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🐒 Shutting down Closet Monkey API server...');
  process.exit(0);
});

module.exports = app;
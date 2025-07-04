#!/bin/bash

# Closet Monkey Project Setup Script
# This script creates the complete project structure and all necessary files

set -e  # Exit on any error

echo "🐒 Setting up Closet Monkey project..."
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    print_error "This script should be run inside a git repository."
    print_info "Please run 'git clone https://github.com/profspidermonkey/closet-monkey.git' first"
    exit 1
fi

print_info "Creating project structure..."

# Create all directories
mkdir -p frontend/src/components
mkdir -p frontend/public
mkdir -p backend/src/{routes,controllers,models,database,middleware}
mkdir -p backend/uploads/wardrobe
mkdir -p backend/data
mkdir -p mobile/src
mkdir -p hardware/logs
mkdir -p cloud/src
mkdir -p docs
mkdir -p scripts
mkdir -p docker
mkdir -p .github/workflows

print_status "Directory structure created"

# Create README.md
print_info "Creating README.md..."
cat > README.md << 'EOF'
# Closet Monkey AI - Smart Wardrobe Management System

> The AI-powered wardrobe assistant that brings Cher's closet from Clueless to life.

## 🚀 Project Overview

Closet Monkey combines RFID tracking, AI-powered outfit suggestions, and dry cleaner integration to create the ultimate wardrobe management experience.

### Key Features
- **Automated Wardrobe Cataloging** via dry cleaner partnerships
- **RFID-Based Wear Tracking** with Raspberry Pi hardware
- **AI Outfit Suggestions** considering weather and calendar
- **Social Marketplace** for styling services and item trading
- **Missing Item Alerts** when items don't return home

## 📋 Development Phases

### Phase 1 (MVP) - Core Local Features ✅
- [x] Basic wardrobe cataloging
- [x] RFID wear tracking
- [x] Local Pi interface
- [ ] SQLite database integration
- [ ] Hardware deployment

### Phase 2 - AI Enhancement
- [ ] Google Vision API integration
- [ ] Smart outfit suggestions
- [ ] Laundry management

### Phase 3 - Connected Intelligence
- [ ] Weather API integration
- [ ] Calendar integration
- [ ] Missing item alerts
- [ ] Cloud backend

### Phase 4 - Social & Commerce
- [ ] Mobile app
- [ ] Social features
- [ ] Styling marketplace
- [ ] Item marketplace

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Raspberry Pi   │    │   Cloud Backend │    │   Mobile App    │
│  (Local Hub)    │◄──►│   (Node.js)     │◄──►│ (React Native)  │
│                 │    │                 │    │                 │
│ • RFID Reader   │    │ • User Auth     │    │ • Social Feed   │
│ • Local API     │    │ • Data Sync     │    │ • Marketplace   │
│ • Web Interface │    │ • AI Services   │    │ • Styling       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │
         └───────────────────────┼─────────────────────────────┐
                                 │                             │
                    ┌─────────────────┐              ┌─────────────────┐
                    │  Dry Cleaners   │              │  External APIs  │
                    │   (SMRT POS)    │              │                 │
                    │                 │              │ • Google Vision │
                    │ • Item Tagging  │              │ • Weather API   │
                    │ • Data Export   │              │ • Calendar API  │
                    └─────────────────┘              └─────────────────┘
```

## 🛠️ Tech Stack

### Frontend
- **Pi Interface**: React + Tailwind CSS
- **Mobile App**: React Native + Expo

### Backend
- **Pi Server**: Node.js + Express
- **Cloud API**: Node.js + Express
- **Database**: SQLite (Pi) + PostgreSQL (Cloud)

### Hardware
- **Platform**: Raspberry Pi 4
- **RFID**: 13.56MHz RFID Reader + Tags
- **Connectivity**: WiFi + Bluetooth

### AI/ML
- **Computer Vision**: Google Vision API
- **Recommendations**: Custom ML models
- **Image Processing**: TensorFlow.js

## 🚦 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.9+ (for hardware)
- Raspberry Pi 4 (for full system)

### Development Setup
```bash
# Clone the repository
git clone https://github.com/profspidermonkey/closet-monkey.git
cd closet-monkey

# Run the setup script
./setup.sh

# Install all dependencies
npm run install:all

# Start development servers
npm run dev
```

## 📁 Project Structure

```
closet-monkey/
├── frontend/              # React web app (Pi touchscreen interface)
├── backend/               # Node.js API server
├── mobile/                # React Native mobile app (Phase 4)
├── hardware/              # Raspberry Pi RFID integration
├── cloud/                 # Scalable cloud backend (Phase 3+)
├── docs/                  # Documentation
├── scripts/               # Deployment and utility scripts
└── docker/                # Containerization configs
```

## 🎯 Current Status

**Active Development**: Phase 1 MVP
- ✅ Core React interface completed
- 🟡 Backend API in development
- 🟡 RFID hardware integration in progress
- 🔴 Dry cleaner partnership pilot pending

## 📄 License

Proprietary - All rights reserved by SpiderMonkey MotorSports

---

**Built with ❤️ by the SpiderMonkey team**
EOF

print_status "README.md created"

# Create root package.json
print_info "Creating root package.json..."
cat > package.json << 'EOF'
{
  "name": "closet-monkey",
  "version": "0.1.0",
  "private": true,
  "description": "AI-powered wardrobe management system",
  "author": "SpiderMonkey MotorSports",
  "license": "UNLICENSED",
  "workspaces": [
    "frontend",
    "backend",
    "mobile",
    "cloud"
  ],
  "scripts": {
    "install:all": "npm install && npm run install:frontend && npm run install:backend",
    "install:frontend": "cd frontend && npm install",
    "install:backend": "cd backend && npm install",
    "dev:frontend": "cd frontend && npm start",
    "dev:backend": "cd backend && npm run dev",
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "build": "npm run build:frontend && npm run build:backend",
    "build:frontend": "cd frontend && npm run build",
    "build:backend": "cd backend && npm run build",
    "deploy:pi": "./scripts/deploy-pi.sh",
    "test": "npm run test:frontend && npm run test:backend",
    "test:frontend": "cd frontend && npm test",
    "test:backend": "cd backend && npm test"
  },
  "devDependencies": {
    "concurrently": "^7.6.0"
  }
}
EOF

print_status "Root package.json created"

# Create backend package.json
print_info "Creating backend package.json..."
cat > backend/package.json << 'EOF'
{
  "name": "closet-monkey-backend",
  "version": "0.1.0",
  "description": "Closet Monkey API Server",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "dev": "nodemon src/app.js",
    "build": "echo 'No build step required for Node.js'",
    "test": "jest",
    "migrate": "node src/database/migrate.js",
    "seed": "node src/database/seed.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "sqlite3": "^5.1.6",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "morgan": "^1.10.0",
    "multer": "^1.4.5-lts.1",
    "axios": "^1.4.0",
    "ws": "^8.13.0",
    "bcrypt": "^5.1.0",
    "jsonwebtoken": "^9.0.1",
    "dotenv": "^16.3.1",
    "express-rate-limit": "^6.8.1",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.6.1",
    "supertest": "^6.3.3"
  }
}
EOF

print_status "Backend package.json created"

# Create frontend package.json
print_info "Creating frontend package.json..."
cat > frontend/package.json << 'EOF'
{
  "name": "closet-monkey-frontend",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "@testing-library/jest-dom": "^5.16.4",
    "@testing-library/react": "^13.3.0",
    "@testing-library/user-event": "^13.5.0",
    "lucide-react": "^0.263.1",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1",
    "web-vitals": "^2.1.4"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": [
      "react-app",
      "react-app/jest"
    ]
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  },
  "proxy": "http://localhost:3001"
}
EOF

print_status "Frontend package.json created"

# Create frontend index.html
print_info "Creating frontend index.html..."
cat > frontend/public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="Closet Monkey - AI-powered wardrobe management" />
    <title>Closet Monkey</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
EOF

print_status "Frontend index.html created"

# Create frontend index.js
print_info "Creating frontend index.js..."
cat > frontend/src/index.js << 'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
EOF

print_status "Frontend index.js created"

# Create frontend index.css
print_info "Creating frontend index.css..."
cat > frontend/src/index.css << 'EOF'
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}
EOF

print_status "Frontend index.css created"

# Create main React App component (this will need the MVP code we built earlier)
print_info "Creating frontend App.js..."
cat > frontend/src/App.js << 'EOF'
import React, { useState, useRef } from 'react';
import { Camera, Plus, Eye, Shirt, Calendar, Cloud, Users, ShoppingBag, Search, Filter, Star, MapPin, Thermometer } from 'lucide-react';

const ClosetMonkeyMVP = () => {
  const [currentView, setCurrentView] = useState('home');
  const [wardrobeItems, setWardrobeItems] = useState([
    {
      id: 1,
      name: "Navy Suit Jacket",
      category: "Jackets",
      color: "Navy",
      brand: "Hugo Boss",
      rfidTag: "RF001",
      image: "/api/placeholder/150/200",
      lastWorn: "2025-01-15",
      status: "clean",
      weather: ["cool", "formal"]
    },
    {
      id: 2,
      name: "White Dress Shirt",
      category: "Shirts",
      color: "White",
      brand: "Brooks Brothers",
      rfidTag: "RF002",
      image: "/api/placeholder/150/200",
      lastWorn: "2025-01-15",
      status: "clean",
      weather: ["any"]
    }
  ]);
  
  const [outfits, setOutfits] = useState([
    {
      id: 1,
      name: "Business Meeting",
      items: [1, 2],
      date: "2025-01-15",
      weather: "Cool, 45°F",
      occasion: "Work Meeting"
    }
  ]);

  const [newItem, setNewItem] = useState({
    name: '',
    category: '',
    color: '',
    brand: '',
    rfidTag: ''
  });

  const fileInputRef = useRef(null);

  const categories = ["Shirts", "Pants", "Jackets", "Dresses", "Shoes", "Accessories"];
  const colors = ["Black", "White", "Navy", "Gray", "Brown", "Blue", "Red", "Green"];

  const addItem = () => {
    if (newItem.name && newItem.category) {
      const item = {
        id: Date.now(),
        ...newItem,
        image: "/api/placeholder/150/200",
        lastWorn: null,
        status: "clean",
        weather: ["any"]
      };
      setWardrobeItems([...wardrobeItems, item]);
      setNewItem({ name: '', category: '', color: '', brand: '', rfidTag: '' });
      setCurrentView('wardrobe');
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      console.log("Image uploaded:", file.name);
      setTimeout(() => {
        setNewItem({
          ...newItem,
          name: "Detected: Blue Shirt",
          category: "Shirts",
          color: "Blue"
        });
      }, 1000);
    }
  };

  const generateOutfitSuggestion = () => {
    const availableItems = wardrobeItems.filter(item => item.status === 'clean');
    if (availableItems.length >= 2) {
      const suggestion = {
        id: Date.now(),
        name: "AI Suggestion",
        items: [availableItems[0].id, availableItems[1].id],
        date: new Date().toISOString().split('T')[0],
        weather: "Sunny, 72°F",
        occasion: "Casual"
      };
      setOutfits([suggestion, ...outfits]);
    }
  };

  const HomeView = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-lg">
        <h2 className="text-2xl font-bold mb-2">Welcome to Closet Monkey</h2>
        <p className="opacity-90">Your AI-powered wardrobe assistant</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center space-x-3 mb-3">
            <Shirt className="h-8 w-8 text-blue-600" />
            <div>
              <h3 className="font-semibold">Wardrobe Items</h3>
              <p className="text-gray-600">{wardrobeItems.length} items cataloged</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center space-x-3 mb-3">
            <Eye className="h-8 w-8 text-green-600" />
            <div>
              <h3 className="font-semibold">Outfits Created</h3>
              <p className="text-gray-600">{outfits.length} outfits logged</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow border">
        <h3 className="font-semibold mb-4 flex items-center">
          <Thermometer className="h-5 w-5 mr-2 text-orange-500" />
          Today's Weather-Based Suggestion
        </h3>
        <div className="flex items-center space-x-4 p-4 bg-blue-50 rounded-lg">
          <div className="text-sm text-gray-600">
            <p>Today: Sunny, 72°F</p>
            <p>Perfect for: Light layers, cotton fabrics</p>
          </div>
          <button 
            onClick={generateOutfitSuggestion}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Get Suggestion
          </button>
        </div>
      </div>
    </div>
  );

  // Add other view components here...
  const WardrobeView = () => <div>Wardrobe View - To be implemented</div>;
  const AddItemView = () => <div>Add Item View - To be implemented</div>;
  const OutfitsView = () => <div>Outfits View - To be implemented</div>;

  const navigationItems = [
    { id: 'home', label: 'Home', icon: Camera },
    { id: 'wardrobe', label: 'Wardrobe', icon: Shirt },
    { id: 'outfits', label: 'Outfits', icon: Eye },
    { id: 'social', label: 'Social', icon: Users },
    { id: 'marketplace', label: 'Market', icon: ShoppingBag },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg"></div>
              <h1 className="text-xl font-bold text-gray-900">Closet Monkey</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">RFID Status: Connected</span>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {navigationItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`flex items-center space-x-2 py-4 border-b-2 transition-colors ${
                    currentView === item.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'home' && <HomeView />}
        {currentView === 'wardrobe' && <WardrobeView />}
        {currentView === 'outfits' && <OutfitsView />}
        {currentView === 'social' && (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Social Features</h3>
            <p className="text-gray-600">Coming soon in Phase 4!</p>
          </div>
        )}
        {currentView === 'marketplace' && (
          <div className="text-center py-12">
            <ShoppingBag className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Marketplace</h3>
            <p className="text-gray-600">Coming soon in Phase 4!</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default ClosetMonkeyMVP;
EOF

print_status "Frontend App.js created"

# Create backend main app
print_info "Creating backend app.js..."
cat > backend/src/app.js << 'EOF'
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const wardrobeRoutes = require('./routes/wardrobe');
const outfitRoutes = require('./routes/outfits');
const rfidRoutes = require('./routes/rfid');

const { initializeDatabase } = require('./database/init');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/wardrobe', wardrobeRoutes);
app.use('/api/outfits', outfitRoutes);
app.use('/api/rfid', rfidRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: require('../../package.json').version
  });
});

// WebSocket for real-time RFID updates
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Initialize database
initializeDatabase();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Closet Monkey API server running on port ${PORT}`);
});

module.exports = { app };
EOF

print_status "Backend app.js created"

# Create database files
print_info "Creating database files..."

cat > backend/src/database/Database.js << 'EOF'
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor() {
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const dbPath = path.join(dataDir, 'closet_monkey.db');
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database');
      }
    });
  }

  run(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

module.exports = new Database();
EOF

cat > backend/src/database/init.js << 'EOF'
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
EOF

print_status "Database files created"

# Create basic route files
print_info "Creating route files..."

cat > backend/src/routes/wardrobe.js << 'EOF'
const express = require('express');
const router = express.Router();

// Basic routes - will be expanded later
router.get('/', (req, res) => {
  res.json({ message: 'Wardrobe routes working' });
});

module.exports = router;
EOF

cat > backend/src/routes/outfits.js << 'EOF'
const express = require('express');
const router = express.Router();

// Basic routes - will be expanded later
router.get('/', (req, res) => {
  res.json({ message: 'Outfits routes working' });
});

module.exports = router;
EOF

cat > backend/src/routes/rfid.js << 'EOF'
const express = require('express');
const router = express.Router();

// Basic routes - will be expanded later
router.get('/', (req, res) => {
  res.json({ message: 'RFID routes working' });
});

module.exports = router;
EOF

print_status "Route files created"

# Create environment file template
print_info "Creating environment template..."
cat > backend/.env.example << 'EOF'
# Server Configuration
PORT=3001
NODE_ENV=development

# Database
DATABASE_PATH=./data/closet_monkey.db

# Google Vision API
GOOGLE_VISION_API_KEY=your_google_vision_api_key_here

# Weather API
WEATHER_API_KEY=your_weather_api_key_here

# JWT Secret
JWT_SECRET=your_jwt_secret_here

# Upload Configuration
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads
EOF

print_status "Environment template created"

# Create GitHub Actions workflow
print_info "Creating GitHub Actions workflow..."
cat > .github/workflows/ci.yml << 'EOF'
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      - name: Install dependencies
        run: cd frontend && npm ci
      - name: Run tests
        run: cd frontend && npm test -- --coverage --watchAll=false
      - name: Build
        run: cd frontend && npm run build

  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      - name: Install dependencies
        run: cd backend && npm ci
      - name: Run tests
        run: cd backend && npm test
      - name: Build
        run: cd backend && npm run build

  deploy-pi:
    runs-on: ubuntu-latest
    needs: [test-frontend, test-backend]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Raspberry Pi
        run: echo "Pi deployment would happen here"
EOF

print_status "GitHub Actions workflow created"

# Create deployment script
print_info "Creating deployment script..."
cat > scripts/deploy-pi.sh << 'EOF'
#!/bin/bash

# Closet Monkey Raspberry Pi Deployment Script

echo "🐒 Deploying Closet Monkey to Raspberry Pi..."

# Build frontend
echo "📦 Building frontend..."
cd frontend && npm run build
cd ..

# Copy files to Pi (adjust IP address and user as needed)
PI_USER="pi"
PI_HOST="raspberrypi.local"
PI_PATH="/home/pi/closet-monkey"

echo "📤 Copying files to Pi..."
rsync -avz --exclude node_modules --exclude .git . ${PI_USER}@${PI_HOST}:${PI_PATH}

# Install dependencies and restart services on Pi
echo "🔄 Installing dependencies on Pi..."
ssh ${PI_USER}@${PI_HOST} "cd ${PI_PATH} && npm run install:backend && sudo systemctl restart closet-monkey"

echo "✅ Deployment complete!"
EOF

chmod +x scripts/deploy-pi.sh

print_status "Deployment script created"

# Create hardware files
print_info "Creating hardware files..."
cat > hardware/rfid_reader.py << 'EOF'
#!/usr/bin/env python3
"""
Closet Monkey RFID Reader
Hardware interface for Raspberry Pi RFID tracking
"""

import time
import json
import requests
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/home/pi/closet-monkey/hardware/logs/rfid.log'),
        logging.StreamHandler()
    ]
)

class RFIDReader:
    def __init__(self, api_url="http://localhost:3001/api"):
        self.api_url = api_url
        self.last_tags = set()
        
    def read_tags(self):
        """
        Read RFID tags - this will need to be implemented
        based on your specific RFID hardware
        """
        # Placeholder - implement actual RFID reading here
        # This would interface with your RFID reader hardware
        return []
    
    def detect_departure_arrival(self, current_tags):
        """
        Determine if this is a departure or arrival event
        """
        if not self.last_tags and current_tags:
            event_type = "departure"
        elif self.last_tags and not current_tags:
            event_type = "arrival"
        elif current_tags != self.last_tags:
            event_type = "departure" if len(current_tags) > len(self.last_tags) else "arrival"
        else:
            return None
            
        return event_type
    
    def send_to_api(self, tags, event_type):
        """
        Send RFID event to the backend API
        """
        try:
            data = {
                "tags": list(tags),
                "event_type": event_type,
                "timestamp": datetime.now().isoformat(),
                "location": "main_door"
            }
            
            response = requests.post(f"{self.api_url}/rfid/event", json=data)
            response.raise_for_status()
            
            logging.info(f"Sent {event_type} event with {len(tags)} tags")
            
        except requests.exceptions.RequestException as e:
            logging.error(f"Failed to send API request: {e}")
    
    def run(self):
        """
        Main loop for RFID monitoring
        """
        logging.info("Starting RFID reader...")
        
        while True:
            try:
                current_tags = set(self.read_tags())
                event_type = self.detect_departure_arrival(current_tags)
                
                if event_type:
                    self.send_to_api(current_tags, event_type)
                    self.last_tags = current_tags.copy()
                
                time.sleep(1)  # Check every second
                
            except KeyboardInterrupt:
                logging.info("RFID reader stopped by user")
                break
            except Exception as e:
                logging.error(f"Error in RFID reader: {e}")
                time.sleep(5)  # Wait before retrying

if __name__ == "__main__":
    reader = RFIDReader()
    reader.run()
EOF

cat > hardware/requirements.txt << 'EOF'
requests==2.31.0
RPi.GPIO==0.7.1
spidev==3.6
EOF

print_status "Hardware files created"

# Create documentation files
print_info "Creating documentation..."
cat > docs/API.md << 'EOF'
# Closet Monkey API Documentation

## Base URL
```
http://localhost:3001/api
```

## Authentication
Currently using basic API without authentication. JWT will be added in Phase 3.

## Endpoints

### Wardrobe Items

#### GET /wardrobe
Get all wardrobe items
```json
{
  "items": [
    {
      "id": 1,
      "name": "Navy Suit Jacket",
      "category": "Jackets",
      "color": "Navy",
      "brand": "Hugo Boss",
      "rfid_tag": "RF001",
      "status": "clean",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ]
}
```

#### POST /wardrobe
Create new wardrobe item
```json
{
  "name": "Blue Shirt",
  "category": "Shirts",
  "color": "Blue",
  "brand": "Brooks Brothers",
  "rfid_tag": "RF002"
}
```

### RFID Events

#### POST /rfid/event
Record RFID event from hardware
```json
{
  "tags": ["RF001", "RF002"],
  "event_type": "departure",
  "timestamp": "2025-01-15T08:00:00Z",
  "location": "main_door"
}
```

### Health Check

#### GET /health
Check API status
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:00:00Z",
  "version": "0.1.0"
}
```
EOF

cat > docs/HARDWARE.md << 'EOF'
# Closet Monkey Hardware Setup

## Required Components

### Raspberry Pi Setup
- **Device**: Raspberry Pi 4 Model B (4GB+ recommended)
- **OS**: Raspberry Pi OS Lite (64-bit)
- **Storage**: 32GB+ microSD card
- **Display**: 7" touchscreen (optional for local interface)

### RFID Components
- **Reader**: 13.56MHz RFID reader module
- **Tags**: Washable fabric RFID tags
- **Antenna**: External antenna for better range

## Installation Steps

### 1. Raspberry Pi Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python dependencies
sudo apt install python3-pip -y
pip3 install -r hardware/requirements.txt

# Enable SPI for RFID
sudo raspi-config
# Navigate to Interface Options > SPI > Enable
```

### 2. RFID Reader Connection
```
RFID Reader -> Raspberry Pi GPIO
VCC         -> 3.3V (Pin 1)
GND         -> Ground (Pin 6)
MISO        -> GPIO 9 (Pin 21)
MOSI        -> GPIO 10 (Pin 19)
SCK         -> GPIO 11 (Pin 23)
SDA         -> GPIO 8 (Pin 24)
```

### 3. Software Installation
```bash
# Clone repository
git clone https://github.com/profspidermonkey/closet-monkey.git
cd closet-monkey

# Install dependencies
npm run install:backend

# Setup as system service
sudo cp scripts/closet-monkey.service /etc/systemd/system/
sudo systemctl enable closet-monkey
sudo systemctl start closet-monkey
```

## Testing RFID

```bash
# Test RFID reader
cd hardware
python3 rfid_reader.py
```

## Troubleshooting

### RFID Not Reading
1. Check SPI is enabled: `lsmod | grep spi`
2. Verify GPIO connections
3. Check tag frequency (13.56MHz)

### API Connection Issues
1. Check backend is running: `sudo systemctl status closet-monkey`
2. Verify network connectivity
3. Check firewall settings
EOF

print_status "Documentation created"

# Create Docker files for future deployment
print_info "Creating Docker configuration..."
cat > docker/Dockerfile.pi << 'EOF'
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm run install:all

# Copy source code
COPY . .

# Build frontend
RUN npm run build:frontend

EXPOSE 3001

CMD ["npm", "run", "dev:backend"]
EOF

cat > docker/docker-compose.yml << 'EOF'
version: '3.8'

services:
  closet-monkey-backend:
    build:
      context: ..
      dockerfile: docker/Dockerfile.pi
    ports:
      - "3001:3001"
    volumes:
      - ../backend/data:/app/backend/data
      - ../backend/uploads:/app/backend/uploads
    environment:
      - NODE_ENV=production
      - PORT=3001
    restart: unless-stopped

  # Add other services here (Redis, etc.) as needed
EOF

print_status "Docker configuration created"

# Create mobile placeholder
print_info "Creating mobile app placeholder..."
cat > mobile/package.json << 'EOF'
{
  "name": "closet-monkey-mobile",
  "version": "0.1.0",
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "expo": "~49.0.0",
    "react": "18.2.0",
    "react-native": "0.72.0"
  },
  "devDependencies": {
    "@babel/core": "^7.20.0"
  }
}
EOF

cat > mobile/app.json << 'EOF'
{
  "expo": {
    "name": "Closet Monkey",
    "slug": "closet-monkey",
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "platforms": [
      "ios",
      "android"
    ]
  }
}
EOF

print_status "Mobile app placeholder created"

# Make the script executable
chmod +x setup.sh 2>/dev/null || true

echo ""
echo "================================================"
print_status "Closet Monkey project setup complete!"
echo ""
print_info "Next steps:"
echo "1. Run: npm run install:all"
echo "2. Run: npm run dev"
echo "3. Open http://localhost:3000 for frontend"
echo "4. Open http://localhost:3001/api/health for backend"
echo ""
print_info "Project structure:"
echo "📁 frontend/ - React web app (Pi interface)"
echo "📁 backend/  - Node.js API server"
echo "📁 mobile/   - React Native app (Phase 4)"
echo "📁 hardware/ - Raspberry Pi RFID code"
echo "📁 docs/     - Documentation"
echo ""
print_warning "Remember to:"
echo "• Copy your .env file: cp backend/.env.example backend/.env"
echo "• Configure your API keys in backend/.env"
echo "• Set up your Raspberry Pi hardware"
echo ""
echo "🎉 Happy coding!"

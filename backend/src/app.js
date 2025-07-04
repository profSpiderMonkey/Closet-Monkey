const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { initializeDatabase } = require('./database/init');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Basic route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '0.1.0'
  });
});

// Wardrobe routes (basic for now)
app.get('/api/wardrobe', (req, res) => {
  res.json([]);
});

app.post('/api/wardrobe', (req, res) => {
  res.json({ message: 'Item creation endpoint - coming soon' });
});

// Initialize database
initializeDatabase();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Closet Monkey API server running on port ${PORT}`);
});

module.exports = app;
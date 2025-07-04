// backend/src/routes/wardrobe.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const wardrobeController = require('../controllers/wardrobeController');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads/wardrobe');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  }
});

// Routes
router.get('/', wardrobeController.getAllItems);
router.get('/search/:query', wardrobeController.searchItems);
router.get('/category/:category', wardrobeController.getItemsByCategory);
router.get('/:id', wardrobeController.getItemById);
router.post('/', upload.single('image'), wardrobeController.createItem);
router.put('/:id', upload.single('image'), wardrobeController.updateItem);
router.delete('/:id', wardrobeController.deleteItem);

module.exports = router;


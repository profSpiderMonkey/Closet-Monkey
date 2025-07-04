const express = require('express');
const router = express.Router();

// Basic routes - will be expanded later
router.get('/', (req, res) => {
  res.json({ message: 'RFID routes working' });
});

module.exports = router;

const express = require('express');
const router = express.Router();

// Basic routes - will be expanded later
router.get('/', (req, res) => {
  res.json({ message: 'Outfits routes working' });
});

module.exports = router;

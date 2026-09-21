const express = require('express');

const router = express.Router();

// Simple check to confirm the backend is up
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'CampusPulse backend is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;

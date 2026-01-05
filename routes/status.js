const express = require('express');
const router = express.Router();
const { getAllStatusEnums } = require('../constants/status');

/**
 * @route   GET /api/status/enums
 * @desc    Get all status enums for the frontend
 * @access  Public (can be protected if needed)
 */
router.get('/enums', (req, res) => {
  try {
    const statusEnums = getAllStatusEnums();
    
    res.status(200).json({
      success: true,
      data: statusEnums
    });
  } catch (error) {
    console.error('Error getting status enums:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve status enums',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;


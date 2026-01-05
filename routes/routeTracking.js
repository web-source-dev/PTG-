const express = require('express');
const router = express.Router();
const routeTrackingService = require('../utils/routeTrackingService');
const { protect } = require('../middleware/auth');

// Get tracking summary for a route
router.get('/routes/:routeId/summary', protect, async (req, res) => {
  try {
    const { routeId } = req.params;

    const summary = await routeTrackingService.getTrackingSummary(routeId);

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'No tracking data found for this route'
      });
    }

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get tracking summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get tracking summary'
    });
  }
});

// Get active tracking for current driver
router.get('/driver/active', protect, async (req, res) => {
  try {
    if (req.user.role !== 'ptgDriver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can access tracking data'
      });
    }

    const tracking = await routeTrackingService.getActiveTrackingForDriver(req.user._id);

    res.json({
      success: true,
      data: tracking
    });
  } catch (error) {
    console.error('Get active tracking error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get active tracking'
    });
  }
});

// Get tracking history for a driver
router.get('/driver/:driverId/history', protect, async (req, res) => {
  try {
    const { driverId } = req.params;
    const { limit = 50 } = req.query;

    // Only allow admins/dispatchers to view other drivers' history, or drivers to view their own
    if (req.user.role !== 'ptgAdmin' && req.user.role !== 'ptgDispatcher' && req.user._id.toString() !== driverId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const history = await routeTrackingService.getDriverHistory(driverId, parseInt(limit));

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Get driver tracking history error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get driver tracking history'
    });
  }
});

// Get tracking history for a truck
router.get('/truck/:truckId/history', protect, async (req, res) => {
  try {
    const { truckId } = req.params;
    const { limit = 50 } = req.query;

    const history = await routeTrackingService.getTruckHistory(truckId, parseInt(limit));

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Get truck tracking history error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get truck tracking history'
    });
  }
});

// Force complete tracking for a route (admin only)
router.post('/routes/:routeId/complete', protect, async (req, res) => {
  try {
    if (req.user.role !== 'ptgAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can force complete tracking'
      });
    }

    const { routeId } = req.params;

    await routeTrackingService.completeTracking(routeId);

    res.json({
      success: true,
      message: 'Route tracking completed successfully'
    });
  } catch (error) {
    console.error('Force complete tracking error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to complete tracking'
    });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driverController');
const { protect, isPTG_Driver } = require('../middleware/auth');

// All driver routes require authentication and driver role
router.use(protect);
router.use(isPTG_Driver);

// Routes for driver routes

// GET /api/driver/routes - Get all routes for the authenticated driver
router.get('/routes', driverController.getMyRoutes);

// GET /api/driver/routes/:id - Get single route by ID (only if assigned to driver)
router.get('/routes/:id', driverController.getMyRouteById);

// Route action endpoints
// POST /api/driver/routes/:id/start - Start route
router.post('/routes/:id/start', driverController.startMyRoute);

// POST /api/driver/routes/:id/stop - Stop route
router.post('/routes/:id/stop', driverController.stopMyRoute);

// POST /api/driver/routes/:id/resume - Resume route
router.post('/routes/:id/resume', driverController.resumeMyRoute);

// POST /api/driver/routes/:id/complete - Complete route (simple - no stop updates)
router.post('/routes/:id/complete', driverController.completeMyRoute);

// PUT /api/driver/routes/:id - Update route (limited fields for drivers - checklist, reports - NOT photos, NOT status)
router.put('/routes/:id', driverController.updateMyRoute);

// Stop action endpoints
// POST /api/driver/routes/:id/stops/:stopId/complete - Complete a specific stop
router.post('/routes/:id/stops/:stopId/complete', driverController.completeMyRouteStop);

// POST /api/driver/routes/:id/stops/:stopId/skip - Skip a specific stop
router.post('/routes/:id/stops/:stopId/skip', driverController.skipMyRouteStop);

// Photo endpoints
// POST /api/driver/routes/:id/stops/:stopId/photos - Upload photos to a stop
router.post('/routes/:id/stops/:stopId/photos', driverController.uploadStopPhotos);

// POST /api/driver/routes/:id/stops/:stopId/photos/remove - Remove photo from a stop
router.post('/routes/:id/stops/:stopId/photos/remove', driverController.removeStopPhoto);

// PUT /api/driver/routes/:id/stops/:stopId - Update a specific stop (checklist, notes - NOT photos, NOT status)
router.put('/routes/:id/stops/:stopId', driverController.updateMyRouteStop);

module.exports = router;


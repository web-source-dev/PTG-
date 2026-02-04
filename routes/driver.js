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

// PUT /api/driver/routes/:id - Update route (limited fields for drivers)
router.put('/routes/:id', driverController.updateMyRoute);

// PUT /api/driver/routes/:id/stops/:stopId - Update a specific stop
router.put('/routes/:id/stops/:stopId', driverController.updateMyRouteStop);

// POST /api/driver/routes/:id/complete - Complete route (marks route and all pending/in-progress stops as completed)
const routeController = require('../controllers/routeController');
router.post('/routes/:id/complete', routeController.completeRoute);

module.exports = router;


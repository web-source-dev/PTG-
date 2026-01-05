const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { protect } = require('../middleware/auth');

// Driver location updates (no auth required for background tracking)
router.put('/drivers/:driverId/location', locationController.updateDriverLocation);

// Route tracking updates (for automatic polling)
router.put('/route-tracking/:routeId/update', locationController.updateRouteTracking);

// Get route tracking data
router.get('/route-tracking/:routeId', locationController.getRouteTracking);

// Apply authentication to all other routes
router.use(protect);

// Geocode an address to coordinates
router.post('/geocode', locationController.geocodeAddress);

// Calculate distance and duration between two points
router.post('/distance', locationController.calculateDistance);

// Update stop coordinates using geocoding
router.put('/routes/:routeId/stops/:stopId/coordinates', locationController.updateStopCoordinates);

// Calculate and save route distances
router.post('/routes/:routeId/distances', locationController.calculateRouteDistances);

// Get driver current location and route info
router.get('/drivers/:driverId/location', locationController.getDriverLocation);

// Get all drivers' current locations (for dispatcher/admin)
router.get('/drivers/locations', locationController.getAllDriversLocations);

module.exports = router;

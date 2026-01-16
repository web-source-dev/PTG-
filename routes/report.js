const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect, authorizeRoles } = require('../middleware/auth');

// All report routes require authentication and admin/dispatcher access
router.use(protect);
router.use(authorizeRoles('ptgAdmin', 'ptgDispatcher'));

// Driver reports
router.get('/drivers', reportController.getAllDriversReport);
router.get('/drivers/:driverId', reportController.getDriverReport);

// Truck reports
router.get('/trucks', reportController.getAllTrucksReport);
router.get('/trucks/:truckId', reportController.getTruckReport);

// Route reports
router.get('/routes', reportController.getAllRoutesReport);
router.get('/routes/:routeId', reportController.getRouteReport);

// Overall summary
router.get('/summary', reportController.getOverallSummary);

module.exports = router;


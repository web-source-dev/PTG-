const express = require('express');
const router = express.Router();
const shipperController = require('../controllers/shipperController');
const { protect, authorizeRoles } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Get all shippers (simple list for dropdown)
router.get('/simple', shipperController.getAllShippersSimple);

// Get all shippers with pagination
router.get('/', shipperController.getAllShippers);

// Recalculate statistics for all shippers (admin utility)
router.post('/recalculate-statistics', authorizeRoles('ptgAdmin'), shipperController.recalculateAllShipperStatistics);

// Get shipper profile with vehicles and routes
router.get('/:id/profile', shipperController.getShipperProfile);

// Get single shipper by ID
router.get('/:id', shipperController.getShipperById);

// Create or find shipper
router.post('/', authorizeRoles('ptgAdmin', 'ptgDispatcher'), shipperController.createOrFindShipper);

// Update shipper
router.put('/:id', authorizeRoles('ptgAdmin', 'ptgDispatcher'), shipperController.updateShipper);

// Delete shipper
router.delete('/:id', authorizeRoles('ptgAdmin'), shipperController.deleteShipper);

module.exports = router;


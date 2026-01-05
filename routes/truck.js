const express = require('express');
const router = express.Router();
const truckController = require('../controllers/truckController');
const { protect, authorizeRoles } = require('../middleware/auth');

// All truck routes require authentication
router.use(protect);

// Routes for trucks

// GET /api/trucks - Get all trucks (with pagination and filters)
router.get('/', truckController.getAllTrucks);

// POST /api/trucks - Create new truck
router.post('/', authorizeRoles('ptgAdmin', 'ptgDispatcher'), truckController.createTruck);

// GET /api/trucks/:id - Get single truck
router.get('/:id', truckController.getTruckById);

// PUT /api/trucks/:id - Update truck
router.put('/:id', authorizeRoles('ptgAdmin', 'ptgDispatcher'), truckController.updateTruck);

// DELETE /api/trucks/:id - Delete truck
router.delete('/:id', authorizeRoles('ptgAdmin'), truckController.deleteTruck);

// Truck performance tracking routes (Admin and Dispatcher)
router.post('/:id/fuel-expense', protect, authorizeRoles('ptgAdmin', 'ptgDispatcher'), truckController.addTruckFuelExpense);
router.post('/:id/maintenance-expense', protect, authorizeRoles('ptgAdmin', 'ptgDispatcher'), truckController.addTruckMaintenanceExpense);
router.put('/:id/stats', protect, authorizeRoles('ptgAdmin', 'ptgDispatcher'), truckController.updateTruckStats);

module.exports = router;


const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { protect, optionalAuth, authorizeRoles } = require('../middleware/auth');

// Apply optional auth for API key authentication from VOS
router.use(optionalAuth);

// Routes for vehicles

// GET /api/vehicles - Get all vehicles (with pagination and filters)
router.get('/', vehicleController.getAllVehicles);

// GET /api/vehicles/vin/:vin - Get vehicle by VIN
router.get('/vin/:vin', vehicleController.getVehicleByVin);

// POST /api/vehicles - Create new vehicle
router.post('/', vehicleController.createVehicle);

// POST /api/vehicles/import-vos - Import vehicle from VOS Central Dispatch
router.post('/import-vos', vehicleController.importFromVOS);

// GET /api/vehicles/:id - Get single vehicle
router.get('/:id', vehicleController.getVehicleById);

// PUT /api/vehicles/:id - Update vehicle
router.put('/:id', vehicleController.updateVehicle);

// DELETE /api/vehicles/:id - Delete vehicle
router.delete('/:id', vehicleController.deleteVehicle);

module.exports = router;

const express = require('express');
const router = express.Router();
const vehicleProfitCalculationController = require('../controllers/vehicleProfitCalculationController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Routes for vehicle profit calculations

// GET /api/vehicle-profit-calculations - Get all vehicle profit calculations
router.get('/', vehicleProfitCalculationController.getAllVehicleProfitCalculations);

// GET /api/vehicle-profit-calculations/vehicle/:vehicleId - Get calculation by vehicle ID
router.get('/vehicle/:vehicleId', vehicleProfitCalculationController.getVehicleProfitCalculationByVehicleId);

// POST /api/vehicle-profit-calculations - Create or update calculation (by vehicleId)
router.post('/', vehicleProfitCalculationController.createOrUpdateVehicleProfitCalculation);

// PUT /api/vehicle-profit-calculations/:id - Update calculation by ID
router.put('/:id', vehicleProfitCalculationController.updateVehicleProfitCalculation);

// DELETE /api/vehicle-profit-calculations/:id - Delete calculation
router.delete('/:id', vehicleProfitCalculationController.deleteVehicleProfitCalculation);

module.exports = router;


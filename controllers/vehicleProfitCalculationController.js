const VehicleProfitCalculation = require('../models/VehicleProfitCalculation');
const Vehicle = require('../models/Vehicle');
const AuditLog = require('../models/AuditLog');

// @desc    Get all vehicle profit calculations
// @route   GET /api/vehicle-profit-calculations
// @access  Private
const getAllVehicleProfitCalculations = async (req, res) => {
  try {
    const { page = 1, limit = 1000 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const calculations = await VehicleProfitCalculation.find()
      .populate('vehicleId', 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip deliveryPriority')
      .populate('createdBy', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await VehicleProfitCalculation.countDocuments();

    res.status(200).json({
      success: true,
      data: calculations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get all vehicle profit calculations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get vehicle profit calculation by vehicle ID
// @route   GET /api/vehicle-profit-calculations/vehicle/:vehicleId
// @access  Private
const getVehicleProfitCalculationByVehicleId = async (req, res) => {
  try {
    const { vehicleId } = req.params;

    let calculation = await VehicleProfitCalculation.findOne({ vehicleId })
      .populate('vehicleId', 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip deliveryPriority')
      .populate('createdBy', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName email');

    // If no calculation exists, create a default one
    if (!calculation) {
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle) {
        return res.status(404).json({
          success: false,
          message: 'Vehicle not found'
        });
      }

      calculation = await VehicleProfitCalculation.create({
        vehicleId,
        createdBy: req.user?._id,
        lastUpdatedBy: req.user?._id
      });

      await calculation.populate([
        { path: 'vehicleId', select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip deliveryPriority' },
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'lastUpdatedBy', select: 'firstName lastName email' }
      ]);
    }

    res.status(200).json({
      success: true,
      data: { calculation }
    });
  } catch (error) {
    console.error('Get vehicle profit calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create or update vehicle profit calculation
// @route   POST /api/vehicle-profit-calculations
// @route   PUT /api/vehicle-profit-calculations/:id
// @access  Private
const createOrUpdateVehicleProfitCalculation = async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      lastUpdatedBy: req.user?._id
    };

    // If vehicleId is provided, try to find existing calculation
    if (updateData.vehicleId) {
      let calculation = await VehicleProfitCalculation.findOne({ vehicleId: updateData.vehicleId });

      if (calculation) {
        // Update existing
        Object.assign(calculation, updateData);
        await calculation.save();

        await calculation.populate([
          { path: 'vehicleId', select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip deliveryPriority' },
          { path: 'createdBy', select: 'firstName lastName email' },
          { path: 'lastUpdatedBy', select: 'firstName lastName email' }
        ]);

        // Log update
        await AuditLog.create({
          action: 'update_vehicle_profit_calculation',
          entityType: 'vehicleProfitCalculation',
          entityId: calculation._id,
          userId: req.user?._id,
          details: updateData,
          notes: `Updated profit calculation for vehicle ${calculation.vehicleId}`
        });

        return res.status(200).json({
          success: true,
          message: 'Vehicle profit calculation updated successfully',
          data: { calculation }
        });
      } else {
        // Create new
        calculation = await VehicleProfitCalculation.create({
          ...updateData,
          createdBy: req.user?._id,
          lastUpdatedBy: req.user?._id
        });

        await calculation.populate([
          { path: 'vehicleId', select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip deliveryPriority' },
          { path: 'createdBy', select: 'firstName lastName email' },
          { path: 'lastUpdatedBy', select: 'firstName lastName email' }
        ]);

        // Log creation
        await AuditLog.create({
          action: 'create_vehicle_profit_calculation',
          entityType: 'vehicleProfitCalculation',
          entityId: calculation._id,
          userId: req.user?._id,
          details: updateData,
          notes: `Created profit calculation for vehicle ${calculation.vehicleId}`
        });

        return res.status(201).json({
          success: true,
          message: 'Vehicle profit calculation created successfully',
          data: { calculation }
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'vehicleId is required'
      });
    }
  } catch (error) {
    console.error('Create/update vehicle profit calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update vehicle profit calculation
// @route   PUT /api/vehicle-profit-calculations/:id
// @access  Private
const updateVehicleProfitCalculation = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      lastUpdatedBy: req.user?._id
    };

    const calculation = await VehicleProfitCalculation.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('vehicleId', 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip deliveryPriority')
      .populate('createdBy', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName email');

    if (!calculation) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle profit calculation not found'
      });
    }

    // Log update
    await AuditLog.create({
      action: 'update_vehicle_profit_calculation',
      entityType: 'vehicleProfitCalculation',
      entityId: id,
      userId: req.user?._id,
      details: updateData,
      notes: `Updated profit calculation for vehicle ${calculation.vehicleId}`
    });

    res.status(200).json({
      success: true,
      message: 'Vehicle profit calculation updated successfully',
      data: { calculation }
    });
  } catch (error) {
    console.error('Update vehicle profit calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete vehicle profit calculation
// @route   DELETE /api/vehicle-profit-calculations/:id
// @access  Private
const deleteVehicleProfitCalculation = async (req, res) => {
  try {
    const { id } = req.params;

    const calculation = await VehicleProfitCalculation.findByIdAndDelete(id);

    if (!calculation) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle profit calculation not found'
      });
    }

    // Log deletion
    await AuditLog.create({
      action: 'delete_vehicle_profit_calculation',
      entityType: 'vehicleProfitCalculation',
      entityId: id,
      userId: req.user?._id,
      notes: `Deleted profit calculation for vehicle ${calculation.vehicleId}`
    });

    res.status(200).json({
      success: true,
      message: 'Vehicle profit calculation deleted successfully'
    });
  } catch (error) {
    console.error('Delete vehicle profit calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getAllVehicleProfitCalculations,
  getVehicleProfitCalculationByVehicleId,
  createOrUpdateVehicleProfitCalculation,
  updateVehicleProfitCalculation,
  deleteVehicleProfitCalculation
};


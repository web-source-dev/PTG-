const Vehicle = require('../models/Vehicle');
const TransportJob = require('../models/TransportJob');
const AuditLog = require('../models/AuditLog');
const { updateVehicleOnCreate } = require('../utils/statusManager');

/**
 * Create a new vehicle
 */
exports.createVehicle = async (req, res) => {
  try {
    const vehicleData = req.body;

    // Add metadata - handle external users from API key authentication
    if (req.authType === 'api-key' && req.externalUser) {
      vehicleData.externalUserId = req.externalUser.id;
      vehicleData.externalUserEmail = req.externalUser.email;
      vehicleData.createdBy = null; // Don't link to internal PTG user
      vehicleData.source = 'VOS'; // VOS API calls
    } else {
      vehicleData.createdBy = req.user ? req.user._id : null;
      vehicleData.source = 'PTG'; // PTG frontend/authenticated users
    }

    // Create vehicle
    const vehicle = await Vehicle.create(vehicleData);

    // Log vehicle creation
    await AuditLog.create({
      action: 'create_vehicle',
      entityType: 'vehicle',
      entityId: vehicle._id,
      userId: req.user?._id, // May be null for API key auth
      driverId: undefined, // Vehicles don't have drivers assigned directly
      details: {
        vin: vehicleData.vin,
        year: vehicleData.year,
        make: vehicleData.make,
        model: vehicleData.model,
        source: vehicleData.source,
        buyerName: vehicleData.buyerName
      },
      notes: `Created vehicle ${vehicleData.vin} (${vehicleData.year} ${vehicleData.make} ${vehicleData.model})`
    });

    // Update vehicle status to "Intake Completed" when vehicle is created
    await updateVehicleOnCreate(vehicle._id);

    // Reload vehicle to get updated status
    const updatedVehicle = await Vehicle.findById(vehicle._id);

    // Note: Transport job is NOT created automatically
    // PTG team will create transport job when they decide on carrier (PTG or Central Dispatch)

    res.status(201).json({
      success: true,
      data: updatedVehicle,
      message: 'Vehicle created successfully'
    });
  } catch (error) {
    console.error('Error creating vehicle:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create vehicle'
    });
  }
};

/**
 * Get all vehicles with pagination and filters
 */
exports.getAllVehicles = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;

    // Build query
    let query = {};

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { vin: { $regex: search, $options: 'i' } },
        { make: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
        { buyerName: { $regex: search, $options: 'i' } }
      ];
    }

    const vehicles = await Vehicle.find(query)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'firstName lastName email')
      .populate('transportJobId')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Vehicle.countDocuments(query);

    res.status(200).json({
      success: true,
      data: vehicles,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total: total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch vehicles'
    });
  }
};

/**
 * Get single vehicle by ID
 */
exports.getVehicleById = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('transportJobId');

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found'
      });
    }

    res.status(200).json({
      success: true,
      data: vehicle
    });
  } catch (error) {
    console.error('Error fetching vehicle:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch vehicle'
    });
  }
};

/**
 * Get vehicle by VIN
 */
exports.getVehicleByVin = async (req, res) => {
  try {
    const { vin } = req.params;

    const vehicle = await Vehicle.findOne({ vin: vin.toUpperCase() })
      .populate('createdBy', 'firstName lastName email')
      .populate('transportJobId');

    res.status(200).json({
      success: true,
      data: vehicle,
      found: !!vehicle
    });
  } catch (error) {
    console.error('Error fetching vehicle by VIN:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch vehicle by VIN'
    });
  }
};

/**
 * Update vehicle
 */
exports.updateVehicle = async (req, res) => {
  try {
    const updateData = req.body;
    const vehicleId = req.params.id;

    // Add update metadata - handle external users from API key authentication
    if (req.authType === 'api-key' && req.externalUser) {
      updateData.externalUserId = req.externalUser.id;
      updateData.externalUserEmail = req.externalUser.email;
      updateData.lastUpdatedBy = null; // Don't link to internal PTG user
    } else {
      updateData.lastUpdatedBy = req.user ? req.user._id : null;
    }

    const vehicle = await Vehicle.findByIdAndUpdate(
      vehicleId,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'firstName lastName email')
     .populate('transportJobId');

    // Log vehicle update
    await AuditLog.create({
      action: 'update_vehicle',
      entityType: 'vehicle',
      entityId: vehicleId,
      userId: req.user._id,
      driverId: undefined, // Vehicles don't have drivers assigned directly
      details: updateData,
      notes: `Updated vehicle ${vehicle?.vin || vehicleId}`
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found'
      });
    }

    res.status(200).json({
      success: true,
      data: vehicle,
      message: 'Vehicle updated successfully'
    });
  } catch (error) {
    console.error('Error updating vehicle:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update vehicle'
    });
  }
};

/**
 * Delete vehicle
 */
exports.deleteVehicle = async (req, res) => {
  try {
    const vehicleId = req.params.id;

    // Find vehicle first to check if it exists
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found'
      });
    }

    // Log vehicle deletion
    await AuditLog.create({
      action: 'delete_vehicle',
      entityType: 'vehicle',
      entityId: vehicleId,
      userId: req.user._id,
      driverId: undefined, // Vehicles don't have drivers assigned directly
      details: {
        vin: vehicle.vin,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        transportJobId: vehicle.transportJobId
      },
      notes: `Deleted vehicle ${vehicle.vin} (${vehicle.year} ${vehicle.make} ${vehicle.model})`
    });

    // If there's a transport job, delete it too
    if (vehicle.transportJobId) {
      await TransportJob.findByIdAndDelete(vehicle.transportJobId);
    }

    // Delete the vehicle
    await Vehicle.findByIdAndDelete(vehicleId);

    res.status(200).json({
      success: true,
      message: 'Vehicle and associated transport job deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete vehicle'
    });
  }
};

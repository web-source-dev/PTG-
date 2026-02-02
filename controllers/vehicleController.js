const mongoose = require('mongoose');
const Vehicle = require('../models/Vehicle');
const TransportJob = require('../models/TransportJob');
const AuditLog = require('../models/AuditLog');
const { updateVehicleOnCreate } = require('../utils/statusManager');
const { calculateVehicleDistance, calculateVehiclesDistances } = require('../utils/vehicleDistanceService');

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
        shipperName: vehicleData.shipperName,
        shipperCompany: vehicleData.shipperCompany
      },
      notes: `Created vehicle ${vehicleData.vin} (${vehicleData.year} ${vehicleData.make} ${vehicleData.model})`
    });

    // Update vehicle status to "Intake Completed" when vehicle is created
    await updateVehicleOnCreate(vehicle._id);

    // Reload vehicle to get updated status
    const updatedVehicle = await Vehicle.findById(vehicle._id);

    // Note: Transport job is NOT created automatically
    // PTG team will create transport job

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
    const { page = 1, limit = 50, status, search, startDate, endDate } = req.query;

    // Build query
    let query = {};

    if (status) {
      // Handle both single status and array of statuses
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else {
        query.status = status;
      }
    }

    if (search) {
      query.$or = [
        { vin: { $regex: search, $options: 'i' } },
        { make: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
        { shipperName: { $regex: search, $options: 'i' } },
        { shipperCompany: { $regex: search, $options: 'i' } }
      ];
    }

    // Date range filtering - filter by createdAt
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const vehicles = await Vehicle.find(query)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'firstName lastName email')
      .populate('currentTransportJobId')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Vehicle.countDocuments(query);

    // Calculate distances for all vehicles (in parallel, but with error handling)
    const vehiclesWithDistance = await calculateVehiclesDistances(vehicles);

    res.status(200).json({
      success: true,
      data: vehiclesWithDistance,
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
      .populate({
        path: 'currentTransportJobId',
        populate: [
          {
            path: 'routeId',
            select: 'routeNumber status driverId truckId'
          },
          {
            path: 'pickupRouteId',
            select: 'routeNumber status plannedStartDate',
            populate: [
              { path: 'driverId', select: 'firstName lastName' },
              { path: 'truckId', select: 'truckNumber' }
            ]
          },
          {
            path: 'dropRouteId',
            select: 'routeNumber status plannedStartDate',
            populate: [
              { path: 'driverId', select: 'firstName lastName' },
              { path: 'truckId', select: 'truckNumber' }
            ]
          }
        ]
      })
      .populate({
        path: 'transportJobs.transportJobId',
        populate: [
          {
            path: 'pickupRouteId',
            select: 'routeNumber status plannedStartDate',
            populate: [
              { path: 'driverId', select: 'firstName lastName' },
              { path: 'truckId', select: 'truckNumber' }
            ]
          },
          {
            path: 'dropRouteId',
            select: 'routeNumber status plannedStartDate',
            populate: [
              { path: 'driverId', select: 'firstName lastName' },
              { path: 'truckId', select: 'truckNumber' }
            ]
          }
        ]
      });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found'
      });
    }

    // If vehicle has a transport job, include the photos and checklists from it
    let transportJobData = null;
    if (vehicle.currentTransportJobId) {
      const TransportJob = require('../models/TransportJob');
      const transportJob = await TransportJob.findById(vehicle.currentTransportJobId._id)
        .select('pickupPhotos deliveryPhotos pickupChecklist deliveryChecklist status');

      if (transportJob) {
        transportJobData = {
          _id: transportJob._id,
          pickupPhotos: transportJob.pickupPhotos || [],
          deliveryPhotos: transportJob.deliveryPhotos || [],
          pickupChecklist: transportJob.pickupChecklist || [],
          deliveryChecklist: transportJob.deliveryChecklist || [],
          status: transportJob.status
        };
      }
    }

    // Calculate distance between pickup and drop locations
    let distanceInfo = null;
    try {
      distanceInfo = await calculateVehicleDistance(vehicle);
    } catch (error) {
      console.error('Error calculating distance for vehicle:', error);
      // Continue without distance info
    }

    // Convert vehicle to plain object and add distance info
    const vehicleObj = vehicle.toObject ? vehicle.toObject() : vehicle;
    vehicleObj.distanceInfo = distanceInfo ? {
      distance: distanceInfo.distance,
      duration: distanceInfo.duration
    } : null;

    res.status(200).json({
      success: true,
      data: {
        vehicle: vehicleObj,
        transportJobData
      }
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
      .populate('currentTransportJobId');

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
     .populate('currentTransportJobId');

    // Log vehicle update (only if user ID is valid ObjectId)
    const isValidObjectId = req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id);
    await AuditLog.create({
      action: 'update_vehicle',
      entityType: 'vehicle',
      entityId: vehicleId,
      userId: isValidObjectId ? req.user._id : null,
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
 * Import vehicle from VOS Central Dispatch transport
 */
exports.importFromVOS = async (req, res) => {
  try {
    const vosTransportData = req.body;

    // Validate required fields
    if (!vosTransportData.vin || !vosTransportData.year || !vosTransportData.make || !vosTransportData.model) {
      return res.status(400).json({
        success: false,
        error: 'Missing required vehicle information (VIN, year, make, model)'
      });
    }

    // Check if vehicle with this VIN already exists
    const existingVehicle = await Vehicle.findOne({ vin: vosTransportData.vin.toUpperCase() });
    if (existingVehicle) {
      return res.status(409).json({
        success: false,
        error: `Vehicle with VIN ${vosTransportData.vin} already exists in PTG system`
      });
    }

    // Map VOS transport data to PTG vehicle data
    const vehicleData = {
      vin: vosTransportData.vin,
      year: vosTransportData.year,
      make: vosTransportData.make,
      model: vosTransportData.model,

      // Shipper details - map from VOS data or use defaults
      shipperName: vosTransportData.buyerName || vosTransportData.shipperName || 'Central Dispatch',
      shipperCompany: vosTransportData.shipperCompany || 'Central Dispatch',
      shipperEmail: vosTransportData.shipperEmail || vosTransportData.createdBy?.email || '',
      shipperPhone: vosTransportData.shipperPhone || '',
      submissionDate: vosTransportData.purchaseDate ? new Date(vosTransportData.purchaseDate) : new Date(),

      // Documents (copy from VOS if available)
      documents: vosTransportData.documents || [],

      // Priority and notes
      deliveryPriority: vosTransportData.deliveryPriority || 'Normal',
      notes: vosTransportData.notes || `Imported from VOS Central Dispatch Transport - ${vosTransportData._id}. Location data moved to transport job.`,

      // Metadata
      source: 'VOS_IMPORT',
      externalUserId: vosTransportData.createdBy?._id || vosTransportData.createdBy,
      externalUserEmail: vosTransportData.createdBy?.email,

      // Add metadata - handle import context
      createdBy: req.user ? req.user._id : null
    };

    // Create the vehicle
    const vehicle = await Vehicle.create(vehicleData);

    // Log vehicle import
    await AuditLog.create({
      action: 'import_vehicle',
      entityType: 'vehicle',
      entityId: vehicle._id,
      userId: req.user?._id,
      driverId: undefined,
      details: {
        vin: vehicleData.vin,
        year: vehicleData.year,
        make: vehicleData.make,
        model: vehicleData.model,
        source: 'VOS_CENTRAL_DISPATCH',
        vosTransportId: vosTransportData._id
      },
      notes: `Imported vehicle ${vehicleData.vin} from VOS Central Dispatch`
    });

    // Update vehicle status to "Intake Completed" when vehicle is imported
    await updateVehicleOnCreate(vehicle._id);

    // Reload vehicle to get updated status
    const updatedVehicle = await Vehicle.findById(vehicle._id);

    res.status(201).json({
      success: true,
      data: updatedVehicle,
      message: 'Vehicle successfully imported from Central Dispatch'
    });
  } catch (error) {
    console.error('Error importing vehicle from VOS:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to import vehicle from Central Dispatch'
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

    // Log vehicle deletion (only if user ID is valid ObjectId)
    const isValidObjectId = req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id);
    await AuditLog.create({
      action: 'delete_vehicle',
      entityType: 'vehicle',
      entityId: vehicleId,
      userId: isValidObjectId ? req.user._id : null,
      driverId: undefined, // Vehicles don't have drivers assigned directly
      details: {
        vin: vehicle.vin,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        currentTransportJobId: vehicle.currentTransportJobId
      },
      notes: `Deleted vehicle ${vehicle.vin} (${vehicle.year} ${vehicle.make} ${vehicle.model})`
    });

    // If there's a transport job, delete it too
    if (vehicle.currentTransportJobId) {
      await TransportJob.findByIdAndDelete(vehicle.currentTransportJobId);
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

const Shipper = require('../models/Shipper');
const Vehicle = require('../models/Vehicle');
const Route = require('../models/Route');
const TransportJob = require('../models/TransportJob');
const AuditLog = require('../models/AuditLog');

/**
 * Get all shippers with pagination and filters
 */
exports.getAllShippers = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, sortBy = 'shipperCompany', sortOrder = 'asc' } = req.query;

    // Build query
    let query = {};

    if (search) {
      query.$or = [
        { shipperName: { $regex: search, $options: 'i' } },
        { shipperCompany: { $regex: search, $options: 'i' } },
        { shipperEmail: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const shippers = await Shipper.find(query)
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('createdBy', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName email');

    const total = await Shipper.countDocuments(query);

    res.status(200).json({
      success: true,
      data: shippers,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total: total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching shippers:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch shippers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get single shipper by ID with profile data
 */
exports.getShipperById = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName email');

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: 'Shipper not found'
      });
    }

    // Get vehicles for this shipper (exclude deleted)
    const vehicles = await Vehicle.find({ 
      shipperId: shipper._id,
      deleted: { $ne: true } // Exclude deleted vehicles
    })
      .select('vin year make model status currentTransportJobId createdAt')
      .populate('currentTransportJobId', 'jobNumber status')
      .sort({ createdAt: -1 });

    // Get delivered vehicles (exclude deleted)
    const deliveredVehicles = await Vehicle.find({
      shipperId: shipper._id,
      status: 'Delivered',
      deleted: { $ne: true } // Exclude deleted vehicles
    }).countDocuments();

    // Get routes that contain vehicles from this shipper (exclude deleted transport jobs and routes)
    const transportJobIds = await TransportJob.find({
      vehicleId: { $in: vehicles.map(v => v._id) },
      deleted: { $ne: true } // Exclude deleted transport jobs
    }).distinct('_id');

    const routes = await Route.find({
      deleted: { $ne: true }, // Exclude deleted routes
      $or: [
        { 'stops.transportJobId': { $in: transportJobIds } },
        { selectedTransportJobs: { $in: transportJobIds } }
      ]
    })
      .select('routeNumber status driverId truckId plannedStartDate actualStartDate actualEndDate createdAt')
      .populate('driverId', 'firstName lastName email')
      .populate('truckId', 'truckNumber licensePlate')
      .sort({ createdAt: -1 });

    const completedRoutes = routes.filter(r => r.status === 'Completed').length;

    // Update statistics (only count non-deleted items)
    shipper.totalVehicles = vehicles.length;
    shipper.totalDeliveredVehicles = deliveredVehicles;
    shipper.totalRoutes = routes.length;
    shipper.totalCompletedRoutes = completedRoutes;
    await shipper.save();

    res.status(200).json({
      success: true,
      data: {
        shipper,
        vehicles,
        routes,
        statistics: {
          totalVehicles: vehicles.length,
          totalDeliveredVehicles: deliveredVehicles,
          totalRoutes: routes.length,
          totalCompletedRoutes: completedRoutes
        }
      }
    });
  } catch (error) {
    console.error('Error fetching shipper:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch shipper',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create or find shipper
 * If shipper with same company and email exists, return it; otherwise create new
 */
exports.createOrFindShipper = async (req, res) => {
  try {
    const { shipperName, shipperCompany, shipperEmail, shipperPhone, address, city, state, zipCode, notes } = req.body;

    if (!shipperName || !shipperCompany) {
      return res.status(400).json({
        success: false,
        message: 'Shipper name and company are required'
      });
    }

    // Try to find existing shipper by company and email (if provided)
    let shipper = null;
    if (shipperEmail) {
      shipper = await Shipper.findOne({
        shipperCompany: shipperCompany.trim(),
        shipperEmail: shipperEmail.toLowerCase().trim()
      });
    } else {
      // If no email, try to find by company and name
      shipper = await Shipper.findOne({
        shipperCompany: shipperCompany.trim(),
        shipperName: shipperName.trim()
      });
    }

    if (shipper) {
      // Update existing shipper with new information if provided
      const updateData = {};
      if (shipperPhone && !shipper.shipperPhone) updateData.shipperPhone = shipperPhone;
      if (address && !shipper.address) updateData.address = address;
      if (city && !shipper.city) updateData.city = city;
      if (state && !shipper.state) updateData.state = state;
      if (zipCode && !shipper.zipCode) updateData.zipCode = zipCode;
      if (notes && !shipper.notes) updateData.notes = notes;
      updateData.lastUpdatedBy = req.user?._id;

      if (Object.keys(updateData).length > 0) {
        await Shipper.findByIdAndUpdate(shipper._id, updateData);
        shipper = await Shipper.findById(shipper._id);
      }

      return res.status(200).json({
        success: true,
        message: 'Existing shipper found',
        data: {
          shipper
        }
      });
    }

    // Create new shipper
    const shipperData = {
      shipperName: shipperName.trim(),
      shipperCompany: shipperCompany.trim(),
      shipperEmail: shipperEmail ? shipperEmail.toLowerCase().trim() : undefined,
      shipperPhone: shipperPhone ? shipperPhone.trim() : undefined,
      address: address ? address.trim() : undefined,
      city: city ? city.trim() : undefined,
      state: state ? state.trim() : undefined,
      zipCode: zipCode ? zipCode.trim() : undefined,
      notes: notes ? notes.trim() : undefined,
      createdBy: req.user?._id,
      lastUpdatedBy: req.user?._id
    };

    shipper = await Shipper.create(shipperData);

    // Log shipper creation
    await AuditLog.create({
      action: 'create_shipper',
      entityType: 'shipper',
      entityId: shipper._id,
      userId: req.user?._id,
      details: {
        shipperName: shipper.shipperName,
        shipperCompany: shipper.shipperCompany,
        shipperEmail: shipper.shipperEmail
      },
      notes: `Created shipper ${shipper.shipperCompany}`
    });

    res.status(201).json({
      success: true,
      message: 'Shipper created successfully',
      data: {
        shipper
      }
    });
  } catch (error) {
    console.error('Error creating shipper:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create shipper',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update shipper
 */
exports.updateShipper = async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      lastUpdatedBy: req.user?._id
    };

    const shipper = await Shipper.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: 'Shipper not found'
      });
    }

    // Log shipper update
    await AuditLog.create({
      action: 'update_shipper',
      entityType: 'shipper',
      entityId: shipper._id,
      userId: req.user?._id,
      details: updateData,
      notes: `Updated shipper ${shipper.shipperCompany}`
    });

    res.status(200).json({
      success: true,
      message: 'Shipper updated successfully',
      data: {
        shipper
      }
    });
  } catch (error) {
    console.error('Error updating shipper:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update shipper',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete shipper
 */
exports.deleteShipper = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.params.id);

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: 'Shipper not found'
      });
    }

    // Check if shipper has vehicles
    const vehicleCount = await Vehicle.countDocuments({ shipperId: shipper._id });
    if (vehicleCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete shipper. ${vehicleCount} vehicle(s) are associated with this shipper.`
      });
    }

    // Log shipper deletion
    await AuditLog.create({
      action: 'delete_shipper',
      entityType: 'shipper',
      entityId: shipper._id,
      userId: req.user?._id,
      details: {
        shipperName: shipper.shipperName,
        shipperCompany: shipper.shipperCompany
      },
      notes: `Deleted shipper ${shipper.shipperCompany}`
    });

    await Shipper.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Shipper deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting shipper:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete shipper',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get shipper profile with vehicles and routes (for profile page)
 */
exports.getShipperProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      page = 1, 
      limit = 50, 
      vehicleStatus, 
      routeStatus,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      startDate,
      endDate
    } = req.query;

    const shipper = await Shipper.findById(id);
    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: 'Shipper not found'
      });
    }

    // Build vehicle query (exclude deleted vehicles)
    let vehicleQuery = { 
      shipperId: shipper._id,
      deleted: { $ne: true } // Exclude deleted vehicles
    };
    if (vehicleStatus) {
      if (Array.isArray(vehicleStatus)) {
        vehicleQuery.status = { $in: vehicleStatus };
      } else {
        vehicleQuery.status = vehicleStatus;
      }
    }

    // Date filtering for vehicles
    if (startDate || endDate) {
      vehicleQuery.createdAt = {};
      if (startDate) {
        vehicleQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        vehicleQuery.createdAt.$lte = end;
      }
    }

    // Get vehicles
    const vehicleSort = {};
    vehicleSort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const vehicles = await Vehicle.find(vehicleQuery)
      .select('vin year make model status currentTransportJobId createdAt')
      .populate('currentTransportJobId', 'jobNumber status')
      .sort(vehicleSort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const totalVehicles = await Vehicle.countDocuments(vehicleQuery);

    // Get transport job IDs for routes (exclude deleted transport jobs)
    const transportJobIds = await TransportJob.find({
      vehicleId: { $in: vehicles.map(v => v._id) },
      deleted: { $ne: true } // Exclude deleted transport jobs
    }).distinct('_id');

    // Build route query (exclude deleted routes)
    let routeQuery = {
      deleted: { $ne: true }, // Exclude deleted routes
      $or: [
        { 'stops.transportJobId': { $in: transportJobIds } },
        { selectedTransportJobs: { $in: transportJobIds } }
      ]
    };

    if (routeStatus) {
      if (Array.isArray(routeStatus)) {
        routeQuery.status = { $in: routeStatus };
      } else {
        routeQuery.status = routeStatus;
      }
    }

    // Date filtering for routes
    if (startDate || endDate) {
      routeQuery.plannedStartDate = {};
      if (startDate) {
        routeQuery.plannedStartDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        routeQuery.plannedStartDate.$lte = end;
      }
    }

    const routeSort = {};
    routeSort[sortBy === 'createdAt' ? 'createdAt' : sortBy] = sortOrder === 'desc' ? -1 : 1;

    const routes = await Route.find(routeQuery)
      .select('routeNumber status driverId truckId plannedStartDate actualStartDate actualEndDate createdAt')
      .populate('driverId', 'firstName lastName email')
      .populate('truckId', 'truckNumber licensePlate')
      .sort(routeSort);

    // Calculate statistics (exclude deleted vehicles)
    const totalDeliveredVehicles = await Vehicle.countDocuments({
      shipperId: shipper._id,
      status: 'Delivered',
      deleted: { $ne: true } // Exclude deleted vehicles
    });

    const completedRoutes = routes.filter(r => r.status === 'Completed').length;

    // Update shipper statistics (exclude deleted vehicles)
    shipper.totalVehicles = await Vehicle.countDocuments({ 
      shipperId: shipper._id,
      deleted: { $ne: true } // Exclude deleted vehicles
    });
    shipper.totalDeliveredVehicles = totalDeliveredVehicles;
    shipper.totalRoutes = routes.length;
    shipper.totalCompletedRoutes = completedRoutes;
    await shipper.save();

    res.status(200).json({
      success: true,
      data: {
        shipper,
        vehicles: {
          data: vehicles,
          pagination: {
            page: parseInt(page),
            pages: Math.ceil(totalVehicles / parseInt(limit)),
            total: totalVehicles,
            limit: parseInt(limit)
          }
        },
        routes,
        statistics: {
          totalVehicles: shipper.totalVehicles,
          totalDeliveredVehicles: shipper.totalDeliveredVehicles,
          totalRoutes: shipper.totalRoutes,
          totalCompletedRoutes: shipper.totalCompletedRoutes
        }
      }
    });
  } catch (error) {
    console.error('Error fetching shipper profile:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch shipper profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all shippers (simple list for dropdown)
 */
exports.getAllShippersSimple = async (req, res) => {
  try {
    const { search } = req.query;

    let query = {};
    if (search) {
      query.$or = [
        { shipperName: { $regex: search, $options: 'i' } },
        { shipperCompany: { $regex: search, $options: 'i' } },
        { shipperEmail: { $regex: search, $options: 'i' } }
      ];
    }

    const shippers = await Shipper.find(query)
      .select('shipperName shipperCompany shipperEmail shipperPhone')
      .sort({ shipperCompany: 1, shipperName: 1 })
      .limit(100);

    res.status(200).json({
      success: true,
      data: shippers
    });
  } catch (error) {
    console.error('Error fetching shippers:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch shippers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


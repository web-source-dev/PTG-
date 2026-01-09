const TransportJob = require('../models/TransportJob');
const Vehicle = require('../models/Vehicle');
const AuditLog = require('../models/AuditLog');
const { updateStatusOnTransportJobCreate } = require('../utils/statusManager');

/**
 * Create a new transport job
 */
exports.createTransportJob = async (req, res) => {
  try {
    const jobData = req.body;

    // Add metadata
    if (req.user) {
      jobData.createdBy = req.user._id;
      jobData.lastUpdatedBy = req.user._id;
    }

    // Create transport job
    const transportJob = await TransportJob.create(jobData);

    // Log transport job creation
    await AuditLog.create({
      action: 'create_transport_job',
      entityType: 'transportJob',
      entityId: transportJob._id,
      userId: req.user._id,
      driverId: jobData.assignedDriver, // Driver assigned to this job
      details: {
        jobNumber: transportJob.jobNumber,
        vehicleId: jobData.vehicleId,
        carrier: jobData.carrier,
        status: transportJob.status
      },
      notes: `Created transport job ${transportJob.jobNumber}`
    });

    // If vehicleId is provided, update vehicle with transport job reference
    if (jobData.vehicleId) {
      await Vehicle.findByIdAndUpdate(jobData.vehicleId, {
        transportJobId: transportJob._id
      });
    }

    // Update statuses: transport job to "Needs Dispatch", vehicle to "Ready for Transport"
    await updateStatusOnTransportJobCreate(transportJob._id, jobData.vehicleId);

    // Reload transport job to get updated status
    const updatedTransportJob = await TransportJob.findById(transportJob._id)
      .populate('vehicleId', 'vin year make model');

    res.status(201).json({
      success: true,
      message: 'Transport job created successfully',
      data: {
        transportJob: updatedTransportJob
      }
    });
  } catch (error) {
    console.error('Error creating transport job:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create transport job',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all transport jobs with pagination and filters
 */
exports.getAllTransportJobs = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, carrier, search } = req.query;

    // Build query
    let query = {};

    if (status) {
      query.status = status;
    }

    if (carrier) {
      query.carrier = carrier;
    }

    if (search) {
      query.$or = [
        { jobNumber: { $regex: search, $options: 'i' } },
        { centralDispatchLoadId: { $regex: search, $options: 'i' } }
      ];
    }

    const transportJobs = await TransportJob.find(query)
      .sort({ createdAt: -1 })
      .populate('vehicleId', 'vin year make model pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd pickupContactName pickupContactPhone dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd dropContactName dropContactPhone availableToShipDate')
      .populate({
        path: 'routeId',
        select: 'routeNumber status',
        populate: [
          { path: 'driverId', select: 'firstName lastName' },
          { path: 'truckId', select: 'truckNumber' }
        ]
      })
      .populate('createdBy', 'firstName lastName email')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await TransportJob.countDocuments(query);

    res.status(200).json({
      success: true,
      data: transportJobs,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total: total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching transport jobs:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch transport jobs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get single transport job by ID
 */
exports.getTransportJobById = async (req, res) => {
  try {
    const transportJob = await TransportJob.findById(req.params.id)
      .populate('vehicleId')
      .populate({
        path: 'routeId',
        populate: [
          { path: 'driverId', select: 'firstName lastName email phoneNumber' },
          { path: 'truckId', select: 'truckNumber licensePlate make model year' }
        ]
      })
      .populate('createdBy', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName email');

    if (!transportJob) {
      return res.status(404).json({
        success: false,
        message: 'Transport job not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        transportJob
      }
    });
  } catch (error) {
    console.error('Error fetching transport job:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch transport job',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update transport job
 */
exports.updateTransportJob = async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      lastUpdatedBy: req.user ? req.user._id : undefined
    };

    const transportJob = await TransportJob.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    )
      .populate('vehicleId', 'vin year make model')
      .populate({
        path: 'routeId',
        select: 'routeNumber status',
        populate: [
          { path: 'driverId', select: 'firstName lastName' },
          { path: 'truckId', select: 'truckNumber' }
        ]
      });

    // Log transport job update
    await AuditLog.create({
      action: 'update_transport_job',
      entityType: 'transportJob',
      entityId: req.params.id,
      userId: req.user._id,
      driverId: transportJob.assignedDriver,
      details: updateData,
      notes: `Updated transport job ${transportJob.jobNumber || req.params.id}`
      });

    if (!transportJob) {
      return res.status(404).json({
        success: false,
        message: 'Transport job not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Transport job updated successfully',
      data: {
        transportJob
      }
    });
  } catch (error) {
    console.error('Error updating transport job:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update transport job',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete transport job
 */
exports.deleteTransportJob = async (req, res) => {
  try {
    const transportJob = await TransportJob.findById(req.params.id);

    if (!transportJob) {
      return res.status(404).json({
        success: false,
        message: 'Transport job not found'
      });
    }

    // Check if transport job is part of an active route
    if (transportJob.routeId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete transport job that is part of a route. Please remove it from the route first.'
      });
    }

    // Log transport job deletion
    await AuditLog.create({
      action: 'delete_transport_job',
      entityType: 'transportJob',
      entityId: req.params.id,
      userId: req.user._id,
      driverId: transportJob.assignedDriver,
      details: {
        jobNumber: transportJob.jobNumber,
        vehicleId: transportJob.vehicleId,
        status: transportJob.status
      },
      notes: `Deleted transport job ${transportJob.jobNumber || req.params.id}`
    });

    // Remove transport job reference from vehicle
    if (transportJob.vehicleId) {
      await Vehicle.findByIdAndUpdate(transportJob.vehicleId, {
        $unset: { transportJobId: 1 }
      });
    }

    await TransportJob.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Transport job deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting transport job:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete transport job',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


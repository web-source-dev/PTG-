const TransportJob = require('../models/TransportJob');
const Vehicle = require('../models/Vehicle');
const Load = require('../models/Load');
const Route = require('../models/Route');
const AuditLog = require('../models/AuditLog');
const auditService = require('../utils/auditService');
const { 
  updateStatusOnTransportJobCreate, 
  syncTransportJobToRouteStops,
  updateStatusOnTransportJobStatusChange,
  calculateVehicleStatusFromJobs,
  calculateLoadStatusFromJobs
} = require('../utils/statusManager');
const { VEHICLE_STATUS, LOAD_STATUS } = require('../constants/status');

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
        loadId: jobData.loadId,
        loadType: jobData.loadType || 'vehicle',
        carrier: jobData.carrier,
        status: transportJob.status
      },
      notes: `Created transport job ${transportJob.jobNumber}`
    });

    // If vehicleId is provided, update vehicle with transport job reference and history
    if (jobData.vehicleId && jobData.loadType !== 'load') {
      const vehicle = await Vehicle.findById(jobData.vehicleId);
      if (vehicle) {
        // Add to transport history
        const transportHistoryEntry = {
          transportJobId: transportJob._id,
          routeId: null, // Will be set when route is created
          status: 'pending',
          transportPurpose: jobData.transportPurpose || 'initial_delivery',
          createdAt: new Date()
        };

      await Vehicle.findByIdAndUpdate(jobData.vehicleId, {
          $push: { transportJobs: transportHistoryEntry },
          $inc: { totalTransports: 1 },
          currentTransportJobId: transportJob._id,
          lastTransportDate: new Date(),
          isAvailableForTransport: false
      });
      }
    }

    // If loadId is provided, update load with transport job reference and history
    if (jobData.loadId && jobData.loadType === 'load') {
      const load = await Load.findById(jobData.loadId);
      if (load) {
        // Add to transport history
        const transportHistoryEntry = {
          transportJobId: transportJob._id,
          routeId: null, // Will be set when route is created
          status: 'pending',
          transportPurpose: jobData.transportPurpose || 'initial_delivery',
          createdAt: new Date()
        };

      await Load.findByIdAndUpdate(jobData.loadId, {
          $push: { transportJobs: transportHistoryEntry },
          $inc: { totalTransports: 1 },
          currentTransportJobId: transportJob._id,
          lastTransportDate: new Date(),
          isAvailableForTransport: false
      });
      }
    }

    // Update statuses: transport job to "Needs Dispatch", vehicle/load to "Ready for Transport"
    const entityId = jobData.loadType === 'load' ? jobData.loadId : jobData.vehicleId;
    await updateStatusOnTransportJobCreate(transportJob._id, entityId, jobData.loadType || 'vehicle');

    // Reload transport job to get updated status
    const updatedTransportJob = await TransportJob.findById(transportJob._id)
      .populate('vehicleId', 'vin year make model')
      .populate('loadId', 'loadNumber loadType description shipperId shipperName shipperCompany shipperEmail shipperPhone submissionDate');

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
    const { page = 1, limit = 50, status, carrier, search, startDate, endDate } = req.query;

    // Build query
    let query = { deleted: { $ne: true } }; // Exclude deleted transport jobs

    if (status) {
      // Handle both single status and array of statuses
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else {
        query.status = status;
      }
    }

    if (carrier) {
      query.carrier = carrier;
    }

    if (search) {
      query.$or = [
        { jobNumber: { $regex: search, $options: 'i' } }
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

    const transportJobs = await TransportJob.find(query)
      .sort({ createdAt: -1 })
      .populate('vehicleId', 'vin year make model pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd pickupContactName pickupContactPhone dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd dropContactName dropContactPhone availableToShipDate')
      .populate('loadId', 'loadNumber loadType description weight dimensions quantity unit shipperId shipperName shipperCompany shipperEmail shipperPhone submissionDate initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip')
      .populate({
        path: 'routeId',
        select: 'routeNumber status',
        populate: [
          { path: 'driverId', select: 'firstName lastName' },
          { path: 'truckId', select: 'truckNumber' }
        ]
      })
      .populate({
        path: 'pickupRouteId',
        select: 'routeNumber status plannedStartDate',
        populate: [
          { path: 'driverId', select: 'firstName lastName' },
          { path: 'truckId', select: 'truckNumber' }
        ]
      })
      .populate({
        path: 'dropRouteId',
        select: 'routeNumber status plannedStartDate',
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
      .populate('loadId', 'loadNumber loadType description weight dimensions quantity unit shipperId shipperName shipperCompany shipperEmail shipperPhone submissionDate')
      .populate({
        path: 'routeId',
        populate: [
          { path: 'driverId', select: 'firstName lastName email phoneNumber' },
          { path: 'truckId', select: 'truckNumber licensePlate make model year' }
        ]
      })
      .populate({
        path: 'pickupRouteId',
        select: 'routeNumber status plannedStartDate plannedEndDate',
        populate: [
          { path: 'driverId', select: 'firstName lastName email phoneNumber' },
          { path: 'truckId', select: 'truckNumber licensePlate make model year' }
        ]
      })
      .populate({
        path: 'dropRouteId',
        select: 'routeNumber status plannedStartDate plannedEndDate',
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
      .populate('loadId', 'loadNumber loadType description weight dimensions quantity unit shipperId shipperName shipperCompany shipperEmail shipperPhone submissionDate')
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

    // Update vehicle status and transportJobs history if transport job status changed
    if (updateData.status) {
      await updateStatusOnTransportJobStatusChange(req.params.id);
    }

    if (!transportJob) {
      return res.status(404).json({
        success: false,
        message: 'Transport job not found'
      });
    }

    // Sync transport job updates to route stops
    // This will update any route stops that reference this transport job
    try {
      await syncTransportJobToRouteStops(req.params.id);
    } catch (syncError) {
      console.error('Error syncing transport job to route stops:', syncError);
      // Don't fail the update if sync fails, just log the error
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
    const transportJob = await TransportJob.findById(req.params.id)
      .populate('vehicleId')
      .populate('loadId', 'loadNumber loadType description shipperId shipperName shipperCompany shipperEmail shipperPhone submissionDate');

    if (!transportJob) {
      return res.status(404).json({
        success: false,
        message: 'Transport job not found'
      });
    }


    // Find all routes that have stops referencing this transport job (only non-deleted routes)
    const routesWithJob = await Route.find({
      deleted: { $ne: true }, // Only count non-deleted routes
      $or: [
        { 'stops.transportJobId': req.params.id },
        { selectedTransportJobs: req.params.id }
      ]
    });

    // Build effects message for confirmation
    const effects = [];
    if (routesWithJob.length > 0) {
      effects.push(`This transport job is referenced in ${routesWithJob.length} route(s).`);
    }
    if (transportJob.loadType === 'load' && transportJob.loadId) {
      const load = await Load.findById(transportJob.loadId);
      if (load && !load.deleted) {
        const allJobs = await TransportJob.find({ 
          loadId: transportJob.loadId,
          deleted: { $ne: true } // Only count non-deleted jobs
        });
        if (allJobs.length === 1) {
          effects.push(`Load status will be set to "Intake Completed" (this is the only transport job).`);
        } else {
          effects.push(`Load status will be recalculated based on remaining ${allJobs.length - 1} transport job(s).`);
        }
      }
    } else if (transportJob.vehicleId) {
      const vehicle = await Vehicle.findById(transportJob.vehicleId);
      if (vehicle && !vehicle.deleted) {
        const allJobs = await TransportJob.find({ 
          vehicleId: transportJob.vehicleId,
          deleted: { $ne: true } // Only count non-deleted jobs
        });
        if (allJobs.length === 1) {
          effects.push(`Vehicle status will be set to "Intake Completed" (this is the only transport job).`);
        } else {
          effects.push(`Vehicle status will be recalculated based on remaining ${allJobs.length - 1} transport job(s).`);
        }
      }
    }

    // Check if confirmation is required (if there are effects)
    if (effects.length > 0 && (!req.body || !req.body.confirm)) {
      return res.status(400).json({
        success: false,
        requiresConfirmation: true,
        message: 'Deleting this transport job will have the following effects:',
        effects: effects,
        confirmationMessage: 'Please confirm deletion by including { "confirm": true } in the request body.'
      });
    }

    // Update vehicle or load status based on remaining transport jobs
    if (transportJob.loadType === 'load' && transportJob.loadId) {
      const loadId = typeof transportJob.loadId === 'object'
        ? (transportJob.loadId._id || transportJob.loadId.id)
        : transportJob.loadId;
      
      const load = await Load.findById(loadId);
      if (load && !load.deleted) {
        // Get all remaining non-deleted transport jobs for this load
        const remainingJobs = await TransportJob.find({
          loadId: loadId,
          _id: { $ne: req.params.id },
          deleted: { $ne: true }
        });

        if (remainingJobs.length === 0) {
          // No remaining jobs - set load to "Intake Completed"
          await Load.findByIdAndUpdate(loadId, {
            status: LOAD_STATUS.INTAKE_COMPLETE,
            currentTransportJobId: null,
            $pull: { transportJobs: { transportJobId: req.params.id } }
          });
        } else {
          // Recalculate load status based on remaining jobs
          const newLoadStatus = await calculateLoadStatusFromJobs(loadId);
          await Load.findByIdAndUpdate(loadId, {
            status: newLoadStatus,
            $pull: { transportJobs: { transportJobId: req.params.id } }
          });
          
          // If the deleted job was the current one, set a new current job
          if (load.currentTransportJobId && load.currentTransportJobId.toString() === req.params.id.toString()) {
            await Load.findByIdAndUpdate(loadId, {
              currentTransportJobId: remainingJobs[0]._id
            });
          }
        }
      }
    } else if (transportJob.vehicleId) {
      const vehicleId = typeof transportJob.vehicleId === 'object'
        ? (transportJob.vehicleId._id || transportJob.vehicleId.id)
        : transportJob.vehicleId;
      
      const vehicle = await Vehicle.findById(vehicleId);
      if (vehicle && !vehicle.deleted) {
        // Get all remaining non-deleted transport jobs for this vehicle
        const remainingJobs = await TransportJob.find({
          vehicleId: vehicleId,
          _id: { $ne: req.params.id },
          deleted: { $ne: true }
        });

        if (remainingJobs.length === 0) {
          // No remaining jobs - set vehicle to "Intake Completed"
          await Vehicle.findByIdAndUpdate(vehicleId, {
            status: VEHICLE_STATUS.INTAKE_COMPLETE,
            currentTransportJobId: null,
            $pull: { transportJobs: { transportJobId: req.params.id } }
          });
        } else {
          // Recalculate vehicle status based on remaining jobs
          const newVehicleStatus = await calculateVehicleStatusFromJobs(vehicleId);
          await Vehicle.findByIdAndUpdate(vehicleId, {
            status: newVehicleStatus,
            $pull: { transportJobs: { transportJobId: req.params.id } }
          });
          
          // If the deleted job was the current one, set a new current job
          if (vehicle.currentTransportJobId && vehicle.currentTransportJobId.toString() === req.params.id.toString()) {
            await Vehicle.findByIdAndUpdate(vehicleId, {
              currentTransportJobId: remainingJobs[0]._id
            });
          }
        }
      }
    }

    // Add labels to route stops that reference this transport job
    const deletionTime = new Date();
    const deletionLabel = `Transport job was deleted at ${deletionTime.toLocaleString()}`;
    
    // Find all routes (including deleted ones) that have stops referencing this transport job
    const allRoutesWithJob = await Route.find({
      $or: [
        { 'stops.transportJobId': req.params.id },
        { selectedTransportJobs: req.params.id }
      ]
    });
    
    for (const route of allRoutesWithJob) {
      let routeUpdated = false;
      
      // Update stops that reference this transport job
      route.stops.forEach(stop => {
        const stopJobId = typeof stop.transportJobId === 'object'
          ? (stop.transportJobId._id || stop.transportJobId.id)
          : stop.transportJobId;
        
        if (stopJobId && stopJobId.toString() === req.params.id.toString()) {
          // Add label to the stop
          if (!stop.label) {
            stop.label = deletionLabel;
          } else {
            stop.label = `${stop.label}\n${deletionLabel}`;
          }
          routeUpdated = true;
        }
      });
      
      if (routeUpdated) {
        await route.save();
      }
    }

    // Soft delete the transport job (mark as deleted instead of actually deleting)
    await TransportJob.findByIdAndUpdate(req.params.id, {
      deleted: true,
      deletedAt: deletionTime
    });

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
        status: transportJob.status,
        routesAffected: routesWithJob.length,
        effects: effects
      },
      notes: `Soft deleted transport job ${transportJob.jobNumber || req.params.id}. ${effects.join(' ')}`
    });

    res.status(200).json({
      success: true,
      message: 'Transport job deleted successfully. Data preserved for route stops.',
      effects: effects
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
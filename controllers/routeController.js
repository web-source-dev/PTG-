const Route = require('../models/Route');
const TransportJob = require('../models/TransportJob');
const Truck = require('../models/Truck');
const AuditLog = require('../models/AuditLog');
const locationService = require('../utils/locationService');
const {
  updateStatusOnRouteCreate,
  updateStatusOnRouteStatusChange,
  updateStatusOnTransportJobRemoved
} = require('../utils/statusManager');

/**
 * Create a new route
 */
exports.createRoute = async (req, res) => {
  try {
    const routeData = req.body;

    // Add metadata
    if (req.user) {
      routeData.createdBy = req.user._id;
      routeData.lastUpdatedBy = req.user._id;
    }

    // Validate driver and truck exist and are available
    if (routeData.driverId && routeData.truckId) {
      // Check if truck is available
      const truck = await Truck.findById(routeData.truckId);
      if (!truck) {
        return res.status(404).json({
          success: false,
          message: 'Truck not found'
        });
      }

      if (truck.status !== 'Available') {
        return res.status(400).json({
          success: false,
          message: 'Selected truck is not available. Please select an available truck.'
        });
      }

      // Check if driver is available (no active route)
      const driver = await User.findById(routeData.driverId);
      if (!driver) {
        return res.status(404).json({
          success: false,
          message: 'Driver not found'
        });
      }

      if (driver.currentRouteId) {
        return res.status(400).json({
          success: false,
          message: 'Selected driver already has an active route. Please select a driver without an active route.'
        });
      }
    }

    // Initialize checklists for stops if not provided
    if (routeData.stops && Array.isArray(routeData.stops)) {
      routeData.stops = routeData.stops.map(stop => {
        if (!stop.checklist || stop.checklist.length === 0) {
          const { getDefaultChecklist } = require('../utils/checklistDefaults');
          stop.checklist = getDefaultChecklist(stop.stopType);
        }
        return stop;
      });
    }

    // Create route
    const route = await Route.create(routeData);

    // Log route creation
    await AuditLog.create({
      action: 'create_route',
      entityType: 'route',
      entityId: route._id,
      userId: req.user._id,
      driverId: routeData.driverId,
      details: {
        routeNumber: route.routeNumber,
        driverId: routeData.driverId,
        truckId: routeData.truckId,
        selectedTransportJobs: routeData.selectedTransportJobs,
        plannedStartDate: routeData.plannedStartDate,
        plannedEndDate: routeData.plannedEndDate
      },
      notes: `Created route ${route.routeNumber} for driver ${routeData.driverId}`
    });

    // Update transport jobs with route reference based on selectedTransportJobs and stops
    if (routeData.selectedTransportJobs && Array.isArray(routeData.selectedTransportJobs)) {
      for (const jobId of routeData.selectedTransportJobs) {
        await TransportJob.findByIdAndUpdate(jobId, {
            routeId: route._id
          });
        }
    }

    // Also update based on stops that have transportJobId
    if (routeData.stops && Array.isArray(routeData.stops)) {
      const jobIds = new Set();
      routeData.stops.forEach(stop => {
        if (stop.transportJobId) {
          jobIds.add(stop.transportJobId.toString());
        }
      });
      for (const jobId of jobIds) {
        await TransportJob.findByIdAndUpdate(jobId, {
          routeId: route._id
        });
      }
    }

    // Update statuses: route to "Planned", transport jobs to "Dispatched", truck to "In Use"
    await updateStatusOnRouteCreate(
      route._id,
      routeData.selectedTransportJobs,
      routeData.truckId
    );

    // Calculate and save route distances
    try {
      const updatedRoute = await locationService.calculateRouteDistances(route);

      // Clean and validate the stops data before replacement
      const cleanStops = updatedRoute.stops.map((processedStop) => {
        // Create a clean copy of the stop
        const cleanStop = { ...processedStop };

        // Ensure the stop data is valid for Mongoose
        if (cleanStop.location) {
          // Remove any invalid coordinates
          if (cleanStop.location.coordinates === undefined ||
              cleanStop.location.coordinates === null ||
              (typeof cleanStop.location.coordinates === 'object' &&
               Object.keys(cleanStop.location.coordinates).length === 0) ||
              (typeof cleanStop.location.coordinates === 'object' &&
               (cleanStop.location.coordinates.latitude === undefined ||
                cleanStop.location.coordinates.longitude === undefined ||
                isNaN(cleanStop.location.coordinates.latitude) ||
                isNaN(cleanStop.location.coordinates.longitude)))) {
            delete cleanStop.location.coordinates;
          }
        }

        return cleanStop;
      });

      // Replace the stops array with clean data
      route.stops = cleanStops;

      // Update totals
      route.totalDistance = updatedRoute.totalDistance;
      route.totalDuration = updatedRoute.totalDuration;

      const savedRoute = await route.save();

    } catch (locationError) {
      console.error('❌ Failed to calculate route distances:', locationError.message);
      console.error('❌ Error details:', locationError);
      // Don't fail the route creation if location calculation fails
    }

    // Populate before sending response
    const populatedRoute = await Route.findById(route._id)
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate('truckId', 'truckNumber licensePlate make model year')
      .populate({
        path: 'selectedTransportJobs',
        select: 'jobNumber status vehicleId',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip pickupContactName pickupContactPhone dropContactName dropContactPhone'
        }
      })
      .populate({
        path: 'stops.transportJobId',
        select: 'jobNumber status vehicleId',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip pickupContactName pickupContactPhone dropContactName dropContactPhone'
        }
      });

    res.status(201).json({
      success: true,
      message: 'Route created successfully',
      data: {
        route: populatedRoute
      }
    });
  } catch (error) {
    console.error('Error creating route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all routes with pagination and filters
 */
exports.getAllRoutes = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, driverId, truckId, search } = req.query;

    // Build query
    let query = {};

    if (status) {
      query.status = status;
    }

    if (driverId) {
      query.driverId = driverId;
    }

    if (truckId) {
      query.truckId = truckId;
    }

    if (search) {
      query.$or = [
        { routeNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const routes = await Route.find(query)
      .sort({ createdAt: -1 })
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate('truckId', 'truckNumber licensePlate make model year')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Route.countDocuments(query);

    res.status(200).json({
      success: true,
      data: routes,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total: total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch routes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get single route by ID
 */
exports.getRouteById = async (req, res) => {
  try {
    const route = await Route.findById(req.params.id)
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate('truckId', 'truckNumber licensePlate make model year status')
      .populate({
        path: 'selectedTransportJobs',
        select: 'jobNumber status vehicleId',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip pickupContactName pickupContactPhone dropContactName dropContactPhone'
        }
      })
      .populate({
        path: 'stops.transportJobId',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip pickupContactName pickupContactPhone dropContactName dropContactPhone'
        }
      })
      .populate('createdBy', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName email');

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        route
      }
    });
  } catch (error) {
    console.error('Error fetching route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update route
 */
exports.updateRoute = async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      lastUpdatedBy: req.user ? req.user._id : undefined
    };

    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Handle status updates if route status changes
    if (updateData.status && updateData.status !== route.status) {
      // Update truck status
      const truck = await Truck.findById(route.truckId);
      if (truck) {
        if (updateData.status === 'Completed' || updateData.status === 'Cancelled') {
          truck.status = 'Available';
          truck.currentDriver = undefined;
        } else if (updateData.status === 'In Progress' || updateData.status === 'Planned') {
          truck.status = 'In Use';
          if (updateData.driverId) {
            truck.currentDriver = updateData.driverId;
          }
        }
        await truck.save();
      }

      // Update all related statuses (transport jobs, vehicles)
      await updateStatusOnRouteStatusChange(route._id, updateData.status, route.status);
    }

    // Handle selectedTransportJobs updates
    if (updateData.selectedTransportJobs !== undefined) {
      // Remove route reference from old transport jobs
      const oldJobIds = route.selectedTransportJobs 
        ? route.selectedTransportJobs.map(id => id.toString())
        : [];
      
      // Also get job IDs from old stops
      if (route.stops && Array.isArray(route.stops)) {
        route.stops.forEach(stop => {
          if (stop.transportJobId) {
            oldJobIds.push(stop.transportJobId.toString());
          }
        });
      }

      const uniqueOldJobIds = [...new Set(oldJobIds)];
      for (const jobId of uniqueOldJobIds) {
        await TransportJob.findByIdAndUpdate(jobId, {
          $unset: { routeId: 1 }
        });
      }

      // Add route reference to new selected transport jobs
      if (Array.isArray(updateData.selectedTransportJobs)) {
        for (const jobId of updateData.selectedTransportJobs) {
          await TransportJob.findByIdAndUpdate(jobId, {
              routeId: route._id
            });
        }
      }
    }

    // Handle stops updates - ensure sequence is set and update transport job references
    if (updateData.stops !== undefined && Array.isArray(updateData.stops)) {
      // Ensure sequence is set for all stops and initialize checklists
      const { getDefaultChecklist } = require('../utils/checklistDefaults');
      updateData.stops.forEach((stop, index) => {
        if (stop.sequence === undefined) {
          stop.sequence = index + 1;
        }
        // Initialize checklist if not provided
        if (!stop.checklist || stop.checklist.length === 0) {
          stop.checklist = getDefaultChecklist(stop.stopType);
        }
      });

      // Update transport job references from stops
      const jobIds = new Set();
      updateData.stops.forEach(stop => {
        if (stop.transportJobId) {
          jobIds.add(stop.transportJobId.toString());
        }
      });
      for (const jobId of jobIds) {
        await TransportJob.findByIdAndUpdate(jobId, {
          routeId: route._id
        });
      }
    }

    // Update route
    let updatedRoute = await Route.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    // Log route update
    await AuditLog.create({
      action: 'update_route',
      entityType: 'route',
      entityId: req.params.id,
      userId: req.user._id,
      driverId: route.driverId,
      details: updateData,
      notes: `Updated route ${route.routeNumber || req.params.id}`
    });

    // If stops were updated, recalculate distances and coordinates
    if (updateData.stops !== undefined && Array.isArray(updateData.stops)) {
      console.log('🔄 Recalculating distances for updated route:', updatedRoute._id);
      try {
        const routeWithDistances = await locationService.calculateRouteDistances(updatedRoute);

        // Clean and validate the stops data before replacement
        console.log('🔄 Preparing clean stops data for replacement');
        const cleanStops = routeWithDistances.stops.map((processedStop, index) => {
          console.log(`📝 Stop ${index + 1} final data:`, {
            id: processedStop._id,
            hasLocation: !!processedStop.location,
            hasCoordinates: !!(processedStop.location?.coordinates),
            coordinates: processedStop.location?.coordinates,
            distance: processedStop.distanceFromPrevious,
            duration: processedStop.durationFromPrevious
          });

          // Create a clean copy of the stop
          const cleanStop = { ...processedStop };

          // Ensure the stop data is valid for Mongoose
          if (cleanStop.location) {
            // Remove any invalid coordinates completely
            if (cleanStop.location.coordinates === undefined ||
                cleanStop.location.coordinates === null ||
                (typeof cleanStop.location.coordinates === 'object' &&
                 Object.keys(cleanStop.location.coordinates).length === 0) ||
                (typeof cleanStop.location.coordinates === 'object' &&
                 (cleanStop.location.coordinates.latitude === undefined ||
                  cleanStop.location.coordinates.longitude === undefined ||
                  isNaN(cleanStop.location.coordinates.latitude) ||
                  isNaN(cleanStop.location.coordinates.longitude)))) {
              delete cleanStop.location.coordinates;
              console.log(`🧹 Removed invalid coordinates from stop ${processedStop._id}`);
            }
          }

          return cleanStop;
        });

        // Replace the entire stops array with clean, validated data
        updatedRoute.stops = cleanStops;

        // Update totals
        updatedRoute.totalDistance = routeWithDistances.totalDistance;
        updatedRoute.totalDuration = routeWithDistances.totalDuration;

        const savedRoute = await updatedRoute.save();
        console.log('✅ Route updated with recalculated distances, saved ID:', savedRoute._id);

        // Verify coordinates were saved
        const stopsWithCoords = savedRoute.stops.filter(s => s.location?.coordinates).length;
        console.log(`🔍 Verification: ${stopsWithCoords}/${savedRoute.stops.length} stops have coordinates`);
        console.log('📊 Final totals - Distance:', savedRoute.totalDistance, 'Duration:', savedRoute.totalDuration);
      } catch (locationError) {
        console.error('❌ Failed to recalculate route distances on update:', locationError.message);
        // Don't fail the update if distance calculation fails
      }
    }

    // Populate before sending response
    const populatedRoute = await Route.findById(updatedRoute._id)
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate('truckId', 'truckNumber licensePlate make model year')
      .populate({
        path: 'selectedTransportJobs',
        select: 'jobNumber status vehicleId',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip pickupContactName pickupContactPhone dropContactName dropContactPhone'
        }
      })
      .populate({
        path: 'stops.transportJobId',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip pickupContactName pickupContactPhone dropContactName dropContactPhone'
        }
      });

    res.status(200).json({
      success: true,
      message: 'Route updated successfully',
      data: {
        route: populatedRoute
      }
    });
  } catch (error) {
    console.error('Error updating route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Remove transport job from route
 */
exports.removeTransportJobFromRoute = async (req, res) => {
  try {
    const { routeId } = req.params;
    const { transportJobId } = req.body;

    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Remove transport job from selectedTransportJobs
    if (route.selectedTransportJobs) {
      route.selectedTransportJobs = route.selectedTransportJobs.filter(
        id => id.toString() !== transportJobId
      );
    }

    // Remove all stops associated with this transport job
    if (route.stops) {
      route.stops = route.stops.filter(
        stop => stop.transportJobId?.toString() !== transportJobId
    );
    
      // Re-sequence remaining stops
      route.stops.forEach((stop, index) => {
        stop.sequence = index + 1;
    });
    }

    await route.save();

    // Log transport job removal from route
    await AuditLog.create({
      action: 'remove_transport_job_from_route',
      entityType: 'route',
      entityId: routeId,
      userId: req.user._id,
      driverId: route.driverId,
      details: {
        transportJobId,
        routeId
      },
      notes: `Removed transport job ${transportJobId} from route ${route.routeNumber || routeId}`
    });

    // Remove route reference from transport job and update statuses
    await updateStatusOnTransportJobRemoved(transportJobId);

    const updatedRoute = await Route.findById(routeId)
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate('truckId', 'truckNumber licensePlate make model year')
      .populate({
        path: 'selectedTransportJobs',
        select: 'jobNumber status vehicleId',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip pickupContactName pickupContactPhone dropContactName dropContactPhone'
        }
      })
      .populate({
        path: 'stops.transportJobId',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip pickupContactName pickupContactPhone dropContactName dropContactPhone'
        }
      });

    res.status(200).json({
      success: true,
      message: 'Transport job removed from route successfully',
      data: {
        route: updatedRoute
      }
    });
  } catch (error) {
    console.error('Error removing transport job from route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to remove transport job from route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete route
 */
exports.deleteRoute = async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Remove route reference from all transport jobs in selectedTransportJobs
    if (route.selectedTransportJobs && Array.isArray(route.selectedTransportJobs)) {
      for (const jobId of route.selectedTransportJobs) {
        await TransportJob.findByIdAndUpdate(jobId, {
        $unset: { routeId: 1 }
      });
      }
    }

    // Also remove route reference from transport jobs in stops
    if (route.stops && Array.isArray(route.stops)) {
      const jobIds = new Set();
      route.stops.forEach(stop => {
        if (stop.transportJobId) {
          jobIds.add(stop.transportJobId.toString());
        }
      });
      for (const jobId of jobIds) {
        await TransportJob.findByIdAndUpdate(jobId, {
          $unset: { routeId: 1 }
        });
      }
    }

    // Update truck status
    if (route.truckId) {
      const truck = await Truck.findById(route.truckId);
      if (truck) {
        truck.status = 'Available';
        truck.currentDriver = undefined;
        await truck.save();
      }
    }

    // Log route deletion
    await AuditLog.create({
      action: 'delete_route',
      entityType: 'route',
      entityId: req.params.id,
      userId: req.user._id,
      driverId: route.driverId,
      details: {
        routeNumber: route.routeNumber,
        driverId: route.driverId,
        truckId: route.truckId,
        status: route.status
      },
      notes: `Deleted route ${route.routeNumber || req.params.id}`
    });

    // Delete route
    await Route.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Route deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


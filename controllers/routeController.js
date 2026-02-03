const mongoose = require('mongoose');
const Route = require('../models/Route');
const TransportJob = require('../models/TransportJob');
const Truck = require('../models/Truck');
const User = require('../models/User');
const RouteTracking = require('../models/routeTracker');
const AuditLog = require('../models/AuditLog');
const CalendarEvent = require('../models/CalendarEvent');
const locationService = require('../utils/locationService');
const { ROUTE_STATUS, ROUTE_STOP_STATUS, TRANSPORT_JOB_STATUS, VEHICLE_STATUS } = require('../constants/status');
const {
  updateStatusOnRouteCreate,
  updateStatusOnStopsSetup,
  updateStatusOnRouteStatusChange,
  updateStatusOnTransportJobRemoved,
  updateStatusOnStopUpdate,
  syncRouteStopToTransportJob,
  updateTransportJobRouteReferences
} = require('../utils/statusManager');

// Helper function to safely extract job ID from stop transportJobId
const getJobIdFromStop = (transportJobId) => {
  if (!transportJobId) return null;
  if (typeof transportJobId === 'object') {
    return transportJobId._id || transportJobId.id;
  }
  return transportJobId.toString();
};

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

    // Initialize stops array if not provided
    if (!routeData.stops || !Array.isArray(routeData.stops)) {
      routeData.stops = [];
    }

    // Auto-create start stop if journeyStartLocation is provided
    if (routeData.journeyStartLocation && routeData.journeyStartLocation.name) {
      const startLocation = {
        name: routeData.journeyStartLocation.name,
        address: routeData.journeyStartLocation.address,
        city: routeData.journeyStartLocation.city,
        state: routeData.journeyStartLocation.state,
        zip: routeData.journeyStartLocation.zip || routeData.journeyStartLocation.zipCode, // Support both zip and zipCode
        formattedAddress: routeData.journeyStartLocation.formattedAddress,
        coordinates: routeData.journeyStartLocation.coordinates
      };
      // populateFormattedAddress will extract zip from address if not provided and normalize zipCode to zip
      locationService.populateFormattedAddress(startLocation);
      
      // Ensure journeyStartLocation also has the zip populated
      if (startLocation.zip && !routeData.journeyStartLocation.zip) {
        routeData.journeyStartLocation.zip = startLocation.zip;
      }
      
      const startStop = {
        stopType: 'start',
        sequence: 1,
        location: startLocation,
        scheduledDate: routeData.plannedStartDate,
        scheduledTimeStart: routeData.plannedStartDate,
        status: 'Pending'
      };

      // Add checklist for start stop
      const { getDefaultChecklist } = require('../utils/checklistDefaults');
      startStop.checklist = getDefaultChecklist('start');

      routeData.stops.unshift(startStop);
    }

    // Auto-create end stop if journeyEndLocation is provided
    if (routeData.journeyEndLocation && routeData.journeyEndLocation.name) {
      const endLocation = {
        name: routeData.journeyEndLocation.name,
        address: routeData.journeyEndLocation.address,
        city: routeData.journeyEndLocation.city,
        state: routeData.journeyEndLocation.state,
        zip: routeData.journeyEndLocation.zip || routeData.journeyEndLocation.zipCode, // Support both zip and zipCode
        formattedAddress: routeData.journeyEndLocation.formattedAddress,
        coordinates: routeData.journeyEndLocation.coordinates
      };
      // populateFormattedAddress will extract zip from address if not provided and normalize zipCode to zip
      locationService.populateFormattedAddress(endLocation);
      
      // Ensure journeyEndLocation also has the zip populated
      if (endLocation.zip && !routeData.journeyEndLocation.zip) {
        routeData.journeyEndLocation.zip = endLocation.zip;
      }
      
      const endStop = {
        stopType: 'end',
        sequence: routeData.stops.length + 1,
        location: endLocation,
        scheduledDate: routeData.plannedEndDate,
        scheduledTimeStart: routeData.plannedEndDate,
        status: 'Pending'
      };

      // Add checklist for end stop
      const { getDefaultChecklist } = require('../utils/checklistDefaults');
      endStop.checklist = getDefaultChecklist('end');

      routeData.stops.push(endStop);
    }

    // Initialize checklists for all stops
    routeData.stops = routeData.stops.map(stop => {
      if (!stop.checklist || stop.checklist.length === 0) {
        const { getDefaultChecklist } = require('../utils/checklistDefaults');
        stop.checklist = getDefaultChecklist(stop.stopType);
      }
      return stop;
    });

    // Create route
    const route = await Route.create(routeData);

    // Create route tracker
    await RouteTracking.create({
      routeId: route._id,
      driverId: routeData.driverId,
      truckId: routeData.truckId,
      status: 'active',
      history: []
    });

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

    // Sync selectedTransportJobs with transport jobs from stops
    if (routeData.stops && Array.isArray(routeData.stops)) {
      const jobIds = new Set();
      routeData.stops.forEach(stop => {
        if (stop.transportJobId) {
          jobIds.add(getJobIdFromStop(stop.transportJobId));
        }
      });
      
      // Update selectedTransportJobs to include all transport jobs from stops
      if (jobIds.size > 0) {
        routeData.selectedTransportJobs = Array.from(jobIds).map(id => new mongoose.Types.ObjectId(id));
        route.selectedTransportJobs = routeData.selectedTransportJobs;
        await route.save();
      }
    }

    // Update transport job route references (pickupRouteId and dropRouteId)
    // This enables multi-route transport jobs where pickup can be on Route 1 and drop on Route 2
    if (routeData.stops && Array.isArray(routeData.stops)) {
      await updateTransportJobRouteReferences(route._id, routeData.stops);
    }

    // Update statuses: route to "Planned" only
    // Transport jobs and vehicles will be updated when stops are saved (updateStatusOnStopsSetup)
    // Truck will be updated when route starts (updateStatusOnRouteStatusChange)
    await updateStatusOnRouteCreate(
      route._id,
      routeData.selectedTransportJobs,
      routeData.truckId
    );

    // Create calendar event for this route
    try {
      const driver = await User.findById(routeData.driverId);
      const driverName = driver ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim() : 'Driver';
      const driverEmail = driver?.email || '';
      const truck = await Truck.findById(routeData.truckId);
      const truckNumber = truck?.truckNumber || truck?.licensePlate || 'Truck';
      const truckMake = truck?.make || '';
      const truckModel = truck?.model || '';
      const truckYear = truck?.year || '';
      const truckDetails = [truckMake, truckModel, truckYear].filter(Boolean).join(' ') || 'Truck';
      const routeNumber = route.routeNumber || route._id;

      const description = `${truckNumber} - ${driverName}${driverEmail ? ` (${driverEmail})` : ''} - ${truckDetails} - Route ${routeNumber}`;

      const calendarEvent = await CalendarEvent.create({
        title: `Route ${routeNumber}`,
        description: description,
        startDate: routeData.plannedStartDate,
        endDate: routeData.plannedEndDate,
        allDay: false,
        color: 'blue',
        driverId: routeData.driverId,
        routeId: route._id,
        truckId: routeData.truckId,
        createdBy: req.user._id,
        status: 'active'
      });

      // Log calendar event creation
      await AuditLog.create({
        action: 'create_calendar_event',
        entityType: 'calendarEvent',
        entityId: calendarEvent._id,
        userId: req.user._id,
        driverId: routeData.driverId,
        details: {
          title: calendarEvent.title,
          startDate: calendarEvent.startDate,
          endDate: calendarEvent.endDate,
          routeId: route._id
        },
        notes: `Auto-created calendar event for route ${route.routeNumber || route._id}`
      });
    } catch (calendarError) {
      console.error('Error creating calendar event for route:', calendarError);
      // Don't fail route creation if calendar event creation fails
    }

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
        select: 'jobNumber status vehicleId carrier carrierPayment',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
        }
      })
      .populate({
        path: 'stops.transportJobId',
        select: 'jobNumber status vehicleId carrier carrierPayment pickupRouteId dropRouteId',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'pickupRouteId',
            select: 'routeNumber status plannedStartDate'
          },
          {
            path: 'dropRouteId',
            select: 'routeNumber status plannedStartDate'
          }
        ]
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
    const { page = 1, limit = 50, status, driverId, truckId, search, startDate, endDate } = req.query;

    // Build query
    let query = {};

    if (status) {
      // Handle both single status, comma-separated string, and array of statuses
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else if (status.includes(',')) {
        // Handle comma-separated status values for backward compatibility
        const statusArray = status.split(',').map(s => s.trim());
        query.status = { $in: statusArray };
      } else {
        query.status = status;
      }
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

    // Date range filtering - filter by plannedStartDate
    if (startDate || endDate) {
      query.plannedStartDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.plannedStartDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.plannedStartDate.$lte = end;
      }
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
        select: 'jobNumber status vehicleId carrier carrierPayment',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
        }
      })
      .populate({
        path: 'stops.transportJobId',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'pickupRouteId',
            select: 'routeNumber status plannedStartDate'
          },
          {
            path: 'dropRouteId',
            select: 'routeNumber status plannedStartDate'
          }
        ]
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

    // Populate formattedAddress for journey locations if updated
    // Also normalize zipCode to zip
    if (updateData.journeyStartLocation) {
      if (updateData.journeyStartLocation.zipCode && !updateData.journeyStartLocation.zip) {
        updateData.journeyStartLocation.zip = updateData.journeyStartLocation.zipCode;
      }
      locationService.populateFormattedAddress(updateData.journeyStartLocation);
    }
    if (updateData.journeyEndLocation) {
      if (updateData.journeyEndLocation.zipCode && !updateData.journeyEndLocation.zip) {
        updateData.journeyEndLocation.zip = updateData.journeyEndLocation.zipCode;
      }
      locationService.populateFormattedAddress(updateData.journeyEndLocation);
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
            oldJobIds.push(getJobIdFromStop(stop.transportJobId));
          }
        });
      }

      const uniqueOldJobIds = [...new Set(oldJobIds)];

      // Get new transport job IDs
      const newJobIds = Array.isArray(updateData.selectedTransportJobs)
        ? updateData.selectedTransportJobs.map(id => id.toString())
        : [];

      // Find transport jobs that are being removed
      const removedJobIds = uniqueOldJobIds.filter(jobId => !newJobIds.includes(jobId));

      // Update status for removed transport jobs
      for (const removedJobId of removedJobIds) {
        try {
          await updateStatusOnTransportJobRemoved(removedJobId);
        } catch (removalError) {
          console.error('Failed to update status for removed transport job:', removedJobId, removalError);
          // Don't fail the route update if transport job status update fails
        }
      }

      // Remove route reference from old transport jobs
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
      // Get original transport jobs from the route before any updates
      const originalJobIds = new Set();
      if (route.selectedTransportJobs && Array.isArray(route.selectedTransportJobs)) {
        route.selectedTransportJobs.forEach(jobId => {
          originalJobIds.add(jobId.toString());
        });
      }
      if (route.stops && Array.isArray(route.stops)) {
        route.stops.forEach(stop => {
          if (stop.transportJobId) {
            originalJobIds.add(getJobIdFromStop(stop.transportJobId));
          }
        });
      }

      // Ensure sequence is set for all stops, initialize checklists, and populate formattedAddress
      const { getDefaultChecklist } = require('../utils/checklistDefaults');
      updateData.stops.forEach((stop, index) => {
        if (stop.sequence === undefined) {
          stop.sequence = index + 1;
        }
        // Initialize checklist if not provided
        if (!stop.checklist || stop.checklist.length === 0) {
          stop.checklist = getDefaultChecklist(stop.stopType);
        }
        // Populate formattedAddress for stop location
        if (stop.location) {
          locationService.populateFormattedAddress(stop.location);
        }
      });

      // Update transport job references from stops
      // Also sync selectedTransportJobs to include all transport jobs from stops
      const jobIds = new Set();
      updateData.stops.forEach(stop => {
        if (stop.transportJobId) {
          jobIds.add(getJobIdFromStop(stop.transportJobId));
        }
      });

      // Sync selectedTransportJobs with transport jobs from stops
      if (jobIds.size > 0) {
        updateData.selectedTransportJobs = Array.from(jobIds).map(id => new mongoose.Types.ObjectId(id));
      } else {
        // If no transport jobs in stops, clear selectedTransportJobs
        updateData.selectedTransportJobs = [];
      }

      // Update transport job route references (pickupRouteId and dropRouteId)
      // This enables multi-route transport jobs where pickup can be on Route 1 and drop on Route 2
      await updateTransportJobRouteReferences(route._id, updateData.stops);

      // Check for transport jobs that were COMPLETELY removed from the route (no stops at all)
      // These jobs should have their status reverted to "Needs Dispatch"
      // Note: Jobs with partial stop removal (e.g., only pickup removed but drop remains) are handled by updateTransportJobRouteReferences
      // but their status remains unchanged since they still have at least one stop in this route
      const completelyRemovedJobIds = [];
      for (const originalJobId of originalJobIds) {
        // A job is completely removed only if it has NO stops at all in the updated route
        const hasAnyStopInUpdatedRoute = updateData.stops.some(stop => {
        const stopJobId = getJobIdFromStop(stop.transportJobId);
          return stopJobId && stopJobId.toString() === originalJobId;
        });

        if (!hasAnyStopInUpdatedRoute) {
          completelyRemovedJobIds.push(originalJobId);
        }
      }

      // Update status for completely removed transport jobs (no stops at all in this route)
      for (const removedJobId of completelyRemovedJobIds) {
        try {
          await updateStatusOnTransportJobRemoved(removedJobId);
        } catch (removalError) {
          console.error('Failed to update status for completely removed transport job:', removedJobId, removalError);
          // Don't fail the route update if transport job status update fails
        }
      }

      // Note: Stops setup status update will be called AFTER route is saved
      // This ensures we use the updated stops data

      // Check for stop status changes and update related statuses
      // Also handle automatic next stop activation when a stop is completed
      const originalStops = route.stops || [];
      const sortedOriginalStops = [...originalStops].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      const sortedUpdatedStops = [...updateData.stops].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

      // Find stops that were just marked as completed
      const newlyCompletedStops = sortedUpdatedStops.filter(updatedStop => {
        const updatedStatus = updatedStop.status;
        if (updatedStatus !== 'Completed') return false;

        // Find corresponding original stop
        const originalStop = sortedOriginalStops.find(orig => {
          const origId = orig._id ? orig._id.toString() : (orig.id ? orig.id.toString() : null);
          const updatedId = updatedStop._id ? updatedStop._id.toString() : (updatedStop.id ? updatedStop.id.toString() : null);
          return origId && updatedId && origId === updatedId;
        });

        // Check if status changed from non-Completed to Completed
        return originalStop && originalStop.status !== 'Completed';
      });

      // If a stop was just completed, set the next pending stop to "In Progress"
      if (newlyCompletedStops.length > 0) {
        const inProgressStops = sortedUpdatedStops.filter(s => s.status === 'In Progress');

        // Only set next stop to "In Progress" if there's no stop currently in progress
        if (inProgressStops.length === 0) {
          const nextPendingStop = sortedUpdatedStops.find(s => {
            const status = s.status;
            return !status || status === 'Pending';
          });

          if (nextPendingStop) {
            const stopIndex = updateData.stops.findIndex(s => {
              const stopId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
              const pendingId = nextPendingStop._id ? nextPendingStop._id.toString() : (nextPendingStop.id ? nextPendingStop.id.toString() : null);
              return stopId && pendingId && stopId === pendingId;
            });

            if (stopIndex !== -1) {
              updateData.stops[stopIndex].status = 'In Progress';
            }
          }
        }
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

    // Sync route stop location changes to transport jobs AFTER saving the route
    if (updateData.stops !== undefined && Array.isArray(updateData.stops)) {
      console.log(`🔄 Checking ${updateData.stops.length} stops for transport job sync`);
      const originalStops = route.stops || [];

      for (let index = 0; index < updateData.stops.length; index++) {
        const updatedStop = updateData.stops[index];

        // Check if this is a pickup or drop stop with transport job
        if (updatedStop && (updatedStop.stopType === 'pickup' || updatedStop.stopType === 'drop') && updatedStop.transportJobId) {
          console.log(`🔍 Processing ${updatedStop.stopType} stop with transport job ${updatedStop.transportJobId}`);

          // Find original stop - try multiple ways to match
          let originalStop = null;
          const updatedId = updatedStop._id || updatedStop.id;
          if (updatedId) {
            originalStop = originalStops.find(s => {
              const origId = s._id || s.id;
              return origId && origId.toString() === updatedId.toString();
            });
          }

          // If no ID match, try sequence-based matching for stops that have sequence
          if (!originalStop && updatedStop.sequence) {
            originalStop = originalStops.find(s => s.sequence === updatedStop.sequence);
          }

          const hasLocationChanges = !originalStop ||
            !originalStop.location ||
            !updatedStop.location ||
            JSON.stringify(originalStop.location) !== JSON.stringify(updatedStop.location);

          console.log(`📍 Stop ${updatedStop._id || updatedStop.id || updatedStop.sequence}: hasLocationChanges=${hasLocationChanges}, originalStop=${!!originalStop}`);

          if (hasLocationChanges && updatedStop.location) {
            try {
              // Directly sync the location data to transport job
              const jobId = typeof updatedStop.transportJobId === 'object'
                ? updatedStop.transportJobId._id || updatedStop.transportJobId.id
                : updatedStop.transportJobId;

              const updateData = {};
              if (updatedStop.stopType === 'pickup') {
                updateData.pickupLocationName = updatedStop.location.name;
                updateData.pickupCity = updatedStop.location.city;
                updateData.pickupState = updatedStop.location.state;
                updateData.pickupZip = updatedStop.location.zip;
                // Populate formattedAddress if available from stop location, otherwise generate it
                if (updatedStop.location.formattedAddress) {
                  updateData.pickupFormattedAddress = updatedStop.location.formattedAddress;
                } else {
                  const pickupLocation = {
                    name: updatedStop.location.name,
                    city: updatedStop.location.city,
                    state: updatedStop.location.state,
                    zip: updatedStop.location.zip
                  };
                  locationService.populateFormattedAddress(pickupLocation);
                  if (pickupLocation.formattedAddress) {
                    updateData.pickupFormattedAddress = pickupLocation.formattedAddress;
                  }
                }
              } else if (updatedStop.stopType === 'drop') {
                updateData.dropLocationName = updatedStop.location.name;
                updateData.dropCity = updatedStop.location.city;
                updateData.dropState = updatedStop.location.state;
                updateData.dropZip = updatedStop.location.zip;
                // Populate formattedAddress if available from stop location, otherwise generate it
                if (updatedStop.location.formattedAddress) {
                  updateData.dropFormattedAddress = updatedStop.location.formattedAddress;
                } else {
                  const dropLocation = {
                    name: updatedStop.location.name,
                    city: updatedStop.location.city,
                    state: updatedStop.location.state,
                    zip: updatedStop.location.zip
                  };
                  locationService.populateFormattedAddress(dropLocation);
                  if (dropLocation.formattedAddress) {
                    updateData.dropFormattedAddress = dropLocation.formattedAddress;
                  }
                }
              }

              if (Object.keys(updateData).length > 0) {
                await TransportJob.findByIdAndUpdate(jobId, updateData);
                console.log(`✅ Synced location changes directly to transport job ${jobId}:`, updateData);
              }
            } catch (syncError) {
              console.error('Failed to sync route stop to transport job:', syncError);
              // Don't fail the route update if sync fails
            }
          } else {
            console.log(`ℹ️ No location changes detected for stop ${updatedStop._id || updatedStop.id || updatedStop.sequence}`);
          }
        }
      }
    }

    // Check if stops are being added/updated (stops setup) - AFTER route is saved
    // If stops have transportJobId, update transport jobs and vehicles to "Dispatched"
    // This should happen whenever transport job stops are added, regardless of route status
    if (updateData.stops !== undefined && Array.isArray(updateData.stops)) {
      const hasTransportJobStops = updateData.stops.some(stop => stop.transportJobId);

      if (hasTransportJobStops) {
        // This is stops setup - update transport jobs and vehicles to "Dispatched" and "Ready for Transport"
        // Pass the stops array directly to ensure we use the updated data
        try {
          await updateStatusOnStopsSetup(route._id, updateData.stops);
        } catch (stopsSetupError) {
          console.error('Failed to update statuses on stops setup:', stopsSetupError);
          // Don't fail the route update if stops setup status updates fail
        }
      }
    }

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

    // Update or create calendar event for this route
    try {
      const existingCalendarEvent = await CalendarEvent.findOne({ routeId: route._id });
      
      // Determine what fields to update
      const calendarUpdateData = {};
      // Use updatedRoute if available, otherwise use updateData or route
      const finalRoute = updatedRoute || route;
      if (updateData.plannedStartDate !== undefined) {
        calendarUpdateData.startDate = updateData.plannedStartDate;
      } else if (updatedRoute && updatedRoute.plannedStartDate) {
        calendarUpdateData.startDate = updatedRoute.plannedStartDate;
      }
      if (updateData.plannedEndDate !== undefined) {
        calendarUpdateData.endDate = updateData.plannedEndDate;
      } else if (updatedRoute && updatedRoute.plannedEndDate) {
        calendarUpdateData.endDate = updatedRoute.plannedEndDate;
      }
      if (updateData.driverId !== undefined) {
        calendarUpdateData.driverId = updateData.driverId;
      }
      if (updateData.truckId !== undefined) {
        calendarUpdateData.truckId = updateData.truckId;
      }
      if (updateData.status === 'Cancelled') {
        calendarUpdateData.status = 'cancelled';
      } else if (updateData.status && existingCalendarEvent && existingCalendarEvent.status === 'cancelled') {
        calendarUpdateData.status = 'active';
      }

      // Update route number in title if route number changed
      if (updateData.routeNumber !== undefined || (updatedRoute && updatedRoute.routeNumber)) {
        const routeNumber = (updatedRoute && updatedRoute.routeNumber) || route.routeNumber;
        calendarUpdateData.title = `Route ${routeNumber || route._id}`;
      }

      // Update description if driver or truck changed
      if (updateData.driverId !== undefined || updateData.truckId !== undefined) {
        const driverId = updateData.driverId || route.driverId;
        const truckId = updateData.truckId || route.truckId;
        const driver = await User.findById(driverId);
        const truck = await Truck.findById(truckId);
        const driverName = driver ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim() : 'Driver';
        const driverEmail = driver?.email || '';
        const truckNumber = truck?.truckNumber || truck?.licensePlate || 'Truck';
        const truckMake = truck?.make || '';
        const truckModel = truck?.model || '';
        const truckYear = truck?.year || '';
        const truckDetails = [truckMake, truckModel, truckYear].filter(Boolean).join(' ') || 'Truck';
        const routeNumber = (updatedRoute && updatedRoute.routeNumber) || route.routeNumber || route._id;
        
        calendarUpdateData.description = `${truckNumber} - ${driverName}${driverEmail ? ` (${driverEmail})` : ''} - ${truckDetails} - Route ${routeNumber}`;
      }

      if (existingCalendarEvent) {
        // Update existing calendar event
        if (Object.keys(calendarUpdateData).length > 0) {
          await CalendarEvent.findByIdAndUpdate(
            existingCalendarEvent._id,
            calendarUpdateData,
            { new: true }
          );

          // Log calendar event update
          await AuditLog.create({
            action: 'update_calendar_event',
            entityType: 'calendarEvent',
            entityId: existingCalendarEvent._id,
            userId: req.user._id,
            driverId: route.driverId,
            details: calendarUpdateData,
            notes: `Auto-updated calendar event for route ${route.routeNumber || req.params.id}`
          });
        }
      } else {
        // Create new calendar event if it doesn't exist
        const finalRoute = updatedRoute || route;
        const driver = await User.findById(finalRoute.driverId);
        const truck = await Truck.findById(finalRoute.truckId);
        const driverName = driver ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim() : 'Driver';
        const driverEmail = driver?.email || '';
        const truckNumber = truck?.truckNumber || truck?.licensePlate || 'Truck';
        const truckMake = truck?.make || '';
        const truckModel = truck?.model || '';
        const truckYear = truck?.year || '';
        const truckDetails = [truckMake, truckModel, truckYear].filter(Boolean).join(' ') || 'Truck';
        const routeNumber = finalRoute.routeNumber || finalRoute._id;

        const description = `${truckNumber} - ${driverName}${driverEmail ? ` (${driverEmail})` : ''} - ${truckDetails} - Route ${routeNumber}`;

        const calendarEvent = await CalendarEvent.create({
          title: `Route ${routeNumber}`,
          description: description,
          startDate: finalRoute.plannedStartDate,
          endDate: finalRoute.plannedEndDate,
          allDay: false,
          color: 'blue',
          driverId: finalRoute.driverId,
          routeId: finalRoute._id,
          truckId: finalRoute.truckId,
          createdBy: req.user._id,
          status: finalRoute.status === 'Cancelled' ? 'cancelled' : 'active'
        });

        // Log calendar event creation
        await AuditLog.create({
          action: 'create_calendar_event',
          entityType: 'calendarEvent',
          entityId: calendarEvent._id,
          userId: req.user._id,
          driverId: finalRoute.driverId,
          details: {
            title: calendarEvent.title,
            startDate: calendarEvent.startDate,
            endDate: calendarEvent.endDate,
            routeId: finalRoute._id
          },
          notes: `Auto-created calendar event for route ${finalRoute.routeNumber || finalRoute._id}`
        });
      }
    } catch (calendarError) {
      console.error('Error updating/creating calendar event for route:', calendarError);
      // Don't fail route update if calendar event update fails
    }

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

        // If route has transport jobs in stops, ensure they are updated to "Dispatched"
        // This ensures transport job statuses are set correctly after any route updates
        const hasTransportJobStops = savedRoute.stops && savedRoute.stops.some(stop => stop.transportJobId);

        if (hasTransportJobStops) {
          try {
            await updateStatusOnStopsSetup(savedRoute._id, savedRoute.stops);
          } catch (stopsSetupError) {
            console.error('Failed to update statuses on stops setup after distance recalculation:', stopsSetupError);
            // Don't fail the route update if stops setup status updates fail
          }
        }

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
        select: 'jobNumber status vehicleId carrier carrierPayment',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
        }
      })
      .populate({
        path: 'stops.transportJobId',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'pickupRouteId',
            select: 'routeNumber status plannedStartDate'
          },
          {
            path: 'dropRouteId',
            select: 'routeNumber status plannedStartDate'
          }
        ]
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
        select: 'jobNumber status vehicleId carrier carrierPayment',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
        }
      })
      .populate({
        path: 'stops.transportJobId',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'pickupRouteId',
            select: 'routeNumber status plannedStartDate'
          },
          {
            path: 'dropRouteId',
            select: 'routeNumber status plannedStartDate'
          }
        ]
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
 * Complete a specific stop in a route
 * This endpoint handles stop completion and updates vehicle/transport job statuses
 */
exports.completeRouteStop = async (req, res) => {
  try {
    const routeId = req.params.id;
    const stopId = req.params.stopId;
    const { checklist, notes, photos, actualDate, actualTime } = req.body;

    // Find the route
    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Find the stop - handle both ObjectId and string comparisons
    const stopIndex = route.stops.findIndex(s => {
      const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
      const stopIdStr = stopId.toString();
      // Try direct match first
      if (sId && sId === stopIdStr) return true;
      // Try matching with fallback ID format (stopType-sequence)
      if (!sId && s.stopType && s.sequence) {
        const fallbackId = `${s.stopType}-${s.sequence}`;
        return fallbackId === stopIdStr;
      }
      return false;
    });

    if (stopIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found'
      });
    }

    const originalStop = route.stops[stopIndex];
    const originalStatus = originalStop.status;

    // Update stop with completion data
    if (checklist !== undefined) {
      route.stops[stopIndex].checklist = checklist;
    }
    if (notes !== undefined) {
      route.stops[stopIndex].notes = notes;
    }
    if (photos !== undefined) {
      route.stops[stopIndex].photos = photos;
    }
    if (actualDate !== undefined) {
      route.stops[stopIndex].actualDate = actualDate;
    }
    if (actualTime !== undefined) {
      route.stops[stopIndex].actualTime = actualTime;
    }

    // Mark stop as completed
    route.stops[stopIndex].status = 'Completed';
    if (!route.stops[stopIndex].actualDate) {
      route.stops[stopIndex].actualDate = new Date();
    }
    if (!route.stops[stopIndex].actualTime) {
      route.stops[stopIndex].actualTime = new Date();
    }

    // Update lastUpdatedBy
    route.lastUpdatedBy = req.user ? req.user._id : undefined;

    // Save the route
    await route.save();

    // Reload route to get updated stops
    const updatedRoute = await Route.findById(routeId);

    // Update statuses based on stop completion (AFTER route is saved)
    // This ensures vehicle and transport job statuses are updated
    try {
      const stopType = originalStop.stopType;
      const transportJobId = getJobIdFromStop(originalStop.transportJobId);
      
      if (!transportJobId) {
        console.warn(`⚠️ No transportJobId found for stop ${stopId} (type: ${stopType}) - skipping status update`);
      } else {
        console.log(`🔄 Updating statuses for stop completion: route=${routeId}, stopType=${stopType}, transportJobId=${transportJobId}`);
        
        await updateStatusOnStopUpdate(
          routeId,
          stopIndex,
          ROUTE_STOP_STATUS.COMPLETED, // Use constant instead of string
          stopType,
          transportJobId,
          updatedRoute.stops // Pass the saved route stops
        );
        
        console.log(`✅ Successfully updated statuses for stop completion: route=${routeId}, transportJobId=${transportJobId}`);
      }
    } catch (stopStatusError) {
      console.error('❌ Failed to update statuses on stop completion:', stopStatusError);
      console.error('Error stack:', stopStatusError.stack);
      // Don't fail the stop completion if status updates fail, but log it
    }

    // Log stop completion
    try {
      await AuditLog.create({
        action: 'mark_stop_completed',
        entityType: 'route',
        entityId: routeId,
        userId: req.user ? req.user._id : undefined,
        driverId: route.driverId,
        routeId,
        details: {
          stopId: stopId,
          stopType: originalStop.stopType,
          transportJobId: getJobIdFromStop(originalStop.transportJobId)
        },
        notes: `Marked ${originalStop.stopType} stop as completed from route view`
      });
    } catch (auditError) {
      console.error('Failed to create audit log for stop completion:', auditError);
      // Don't fail if audit log creation fails
    }

    // Populate route for response
    const populatedRoute = await Route.findById(routeId)
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate('truckId', 'truckNumber licensePlate make model year status')
      .populate({
        path: 'stops.transportJobId',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model status'
        }
      })
      .populate('createdBy', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName email');

    res.status(200).json({
      success: true,
      message: 'Stop completed successfully',
      data: {
        route: populatedRoute
      }
    });
  } catch (error) {
    console.error('Error completing stop:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to complete stop',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Mark a stop as not delivered
 * This will mark the stop as skipped, cancel the transport job, and update vehicle status
 */
exports.markStopNotDelivered = async (req, res) => {
  try {
    const routeId = req.params.id;
    const stopId = req.params.stopId;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Reason is required'
      });
    }

    // Find the route
    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Find the stop
    const stopIndex = route.stops.findIndex(s => {
      const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
      const stopIdStr = stopId.toString();
      if (sId && sId === stopIdStr) return true;
      if (!sId && s.stopType && s.sequence) {
        const fallbackId = `${s.stopType}-${s.sequence}`;
        return fallbackId === stopIdStr;
      }
      return false;
    });

    if (stopIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found'
      });
    }

    const stop = route.stops[stopIndex];

    // Only allow this for pickup or drop stops
    if (stop.stopType !== 'pickup' && stop.stopType !== 'drop') {
      return res.status(400).json({
        success: false,
        message: 'Not delivered action is only available for pickup or drop stops'
      });
    }

    // Get transport job ID
    const transportJobId = getJobIdFromStop(stop.transportJobId);
    if (!transportJobId) {
      return res.status(400).json({
        success: false,
        message: 'Transport job not found for this stop'
      });
    }

    // Mark stop as skipped with reason
    route.stops[stopIndex].status = ROUTE_STOP_STATUS.SKIPPED;
    route.stops[stopIndex].notes = route.stops[stopIndex].notes 
      ? `${route.stops[stopIndex].notes}\n\nNot Delivered Reason: ${reason}`
      : `Not Delivered Reason: ${reason}`;
    route.stops[stopIndex].actualDate = new Date();
    route.stops[stopIndex].actualTime = new Date();
    route.lastUpdatedBy = req.user ? req.user._id : undefined;

    // Save the route
    await route.save();

    // Cancel the transport job
    const transportJob = await TransportJob.findById(transportJobId);
    if (transportJob) {
      transportJob.status = TRANSPORT_JOB_STATUS.CANCELLED;
      await transportJob.save();

      // Update vehicle status based on all transport jobs
      if (transportJob.vehicleId) {
        const Vehicle = require('../models/Vehicle');
        const { calculateVehicleStatusFromJobs, updateVehicleTransportJobsHistory } = require('../utils/statusManager');
        const newVehicleStatus = await calculateVehicleStatusFromJobs(transportJob.vehicleId);
        await Vehicle.findByIdAndUpdate(transportJob.vehicleId, {
          status: newVehicleStatus
        });

        // Update vehicle's transportJobs history
        await updateVehicleTransportJobsHistory(transportJobId, TRANSPORT_JOB_STATUS.CANCELLED);
      }
    }

    // Create audit log
    try {
      await AuditLog.create({
        action: 'mark_stop_not_delivered',
        entityType: 'route',
        entityId: routeId,
        userId: req.user ? req.user._id : undefined,
        driverId: route.driverId,
        routeId,
        details: {
          stopId: stopId,
          stopType: stop.stopType,
          transportJobId: transportJobId,
          reason: reason
        },
        notes: `Marked ${stop.stopType} stop as not delivered: ${reason}`
      });
    } catch (auditError) {
      console.error('Failed to create audit log for not delivered:', auditError);
    }

    // Populate route for response
    const populatedRoute = await Route.findById(routeId)
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate('truckId', 'truckNumber licensePlate make model year status')
      .populate({
        path: 'stops.transportJobId',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model status'
        }
      })
      .populate('createdBy', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName email');

    res.status(200).json({
      success: true,
      message: 'Stop marked as not delivered successfully',
      data: {
        route: populatedRoute
      }
    });
  } catch (error) {
    console.error('Error marking stop as not delivered:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to mark stop as not delivered',
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
          jobIds.add(getJobIdFromStop(stop.transportJobId));
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

    // Cancel or delete associated calendar event
    try {
      const calendarEvent = await CalendarEvent.findOne({ routeId: route._id });
      if (calendarEvent) {
        // Cancel the calendar event instead of deleting to preserve history
        await CalendarEvent.findByIdAndUpdate(calendarEvent._id, {
          status: 'cancelled'
        });

        // Log calendar event cancellation
        await AuditLog.create({
          action: 'update_calendar_event',
          entityType: 'calendarEvent',
          entityId: calendarEvent._id,
          userId: req.user._id,
          driverId: route.driverId,
          details: {
            status: 'cancelled'
          },
          notes: `Auto-cancelled calendar event for deleted route ${route.routeNumber || req.params.id}`
        });
      }
    } catch (calendarError) {
      console.error('Error cancelling calendar event for route:', calendarError);
      // Don't fail route deletion if calendar event update fails
    }

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
const mongoose = require('mongoose');
const Route = require('../models/Route');
const TransportJob = require('../models/TransportJob');
const Vehicle = require('../models/Vehicle');
const Load = require('../models/Load');
const Truck = require('../models/Truck');
const User = require('../models/User');
const RouteTracking = require('../models/routeTracker');
const AuditLog = require('../models/AuditLog');
const CalendarEvent = require('../models/CalendarEvent');
const auditService = require('../utils/auditService');
const locationService = require('../utils/locationService');
const routeTracker = require('../utils/routeTracker');
const { getDefaultChecklist } = require('../utils/checklistDefaults');
const { ROUTE_STATUS, ROUTE_STOP_STATUS, ROUTE_STATE, TRANSPORT_JOB_STATUS, VEHICLE_STATUS, TRUCK_STATUS, LOAD_STATUS } = require('../constants/status');
const {
  updateStatusOnRouteCreate,
  updateStatusOnStopsSetup,
  updateStatusOnRouteStatusChange,
  updateStatusOnTransportJobRemoved,
  updateStatusOnStopUpdate,
  syncRouteStopToTransportJob,
  updateTransportJobRouteReferences,
  calculateVehicleStatusFromJobs,
  updateVehicleTransportJobsHistory,
  isTransportJobFullyCompleted,
  createMaintenanceExpenseForRoute
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
      endStop.checklist = getDefaultChecklist('end');

      routeData.stops.push(endStop);
    }

    // Initialize checklists for all stops
    // Fetch transport jobs if needed for load detection
    const transportJobIds = routeData.stops
      .filter(stop => stop.transportJobId)
      .map(stop => {
        if (typeof stop.transportJobId === 'object' && stop.transportJobId !== null) {
          return stop.transportJobId._id || stop.transportJobId.id;
        }
        return stop.transportJobId;
      })
      .filter(Boolean);
    
    const transportJobs = transportJobIds.length > 0
      ? await TransportJob.find({ _id: { $in: transportJobIds } })
      : [];
    
    const transportJobMap = new Map(
      transportJobs.map(job => [job._id.toString(), job])
    );
    
    routeData.stops = routeData.stops.map(stop => {
      if (!stop.checklist || stop.checklist.length === 0) {
        // Check if this is a load transport job
        let transportJob = null;
        if (stop.transportJobId) {
          const jobId = typeof stop.transportJobId === 'object' && stop.transportJobId !== null
            ? (stop.transportJobId._id || stop.transportJobId.id)
            : stop.transportJobId;
          if (jobId) {
            transportJob = transportJobMap.get(jobId.toString());
          }
        }
        const isLoad = transportJob && (
          (transportJob.loadId && !transportJob.vehicleId) ||
          transportJob.loadType === 'load'
        );
        stop.checklist = getDefaultChecklist(stop.stopType, isLoad);
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
        select: 'jobNumber status vehicleId loadId loadType carrier carrierPayment',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
          }
        ]
      })
      .populate({
        path: 'stops.transportJobId',
        select: 'jobNumber status vehicleId loadId loadType carrier carrierPayment pickupRouteId dropRouteId',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
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
    await auditService.logUserError('create_route_failed', error, req.user._id, {
      routeData: req.body,
      context: 'route_controller_create_route'
    });
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
    let query = { deleted: { $ne: true } }; // Exclude deleted routes

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
    await auditService.logUserError('get_routes_failed', error, req.user._id, {
      query: req.query,
      context: 'route_controller_get_all_routes'
    });
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
        select: 'jobNumber status vehicleId loadId loadType carrier carrierPayment',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
          }
        ]
      })
      .populate({
        path: 'stops.transportJobId',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
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
 * 
 * This endpoint is used ONLY for:
 * 1. Route form updates (driver, truck, dates, journey locations, status)
 * 2. Stops setup (which stops exist, their sequence, locations, scheduled dates/times)
 * 
 * This endpoint does NOT handle:
 * - Stop status changes (use completeRouteStop endpoint)
 * - Stop completion logic (use completeRouteStop endpoint)
 * - Photo uploads (use uploadStopPhotos endpoint)
 * - Stop notes/checklist updates from drivers (use updateMyRouteStop endpoint)
 * 
 * When updating stops, this endpoint preserves:
 * - Stop status (from original stops)
 * - Photos (from original stops)
 * - actualDate, actualTime (from original stops)
 * - Notes and checklist (from original stops)
 * 
 * Admin/dispatcher can only modify:
 * - Stop existence (add/remove stops)
 * - Stop sequence
 * - Stop locations
 * - Scheduled dates/times
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

      // Ensure sequence is set for all stops, preserve transportJobId and driver-managed fields, initialize checklists, and populate formattedAddress
      const originalStops = route.stops || [];

      // Process stops sequentially to handle async operations
      for (let index = 0; index < updateData.stops.length; index++) {
        const stop = updateData.stops[index];
        if (stop.sequence === undefined) {
          stop.sequence = index + 1;
        }
        
        // Find original stop by ID or sequence
          const originalStop = originalStops.find(orig => {
            const origId = orig._id ? orig._id.toString() : (orig.id ? orig.id.toString() : null);
            const updatedId = stop._id ? stop._id.toString() : (stop.id ? stop.id.toString() : null);
            
            // Match by ID if available
            if (origId && updatedId && origId === updatedId) {
              return true;
            }
            
            // Match by stopType and sequence as fallback
            if (orig.stopType === stop.stopType && orig.sequence === stop.sequence) {
              return true;
            }
            
            return false;
          });
          
        if (originalStop) {
          // Preserve transportJobId from original route for pickup/drop stops
          // This is critical because transportJobId is required for pickup/drop stops
          if ((stop.stopType === 'pickup' || stop.stopType === 'drop') && !stop.transportJobId) {
            if (originalStop.transportJobId) {
            // Extract ID if it's an object
            if (typeof originalStop.transportJobId === 'object' && originalStop.transportJobId !== null) {
              stop.transportJobId = originalStop.transportJobId._id || originalStop.transportJobId.id;
            } else {
              stop.transportJobId = originalStop.transportJobId;
            }
          }
        }
        
          // Preserve driver-managed fields from original stop
          // Admin/dispatcher only manages: stopType, sequence, location, scheduledDate, scheduledTimeStart, scheduledTimeEnd
          if (originalStop.status) {
            stop.status = originalStop.status;
          }
          if (originalStop.photos) {
            stop.photos = originalStop.photos;
          }
          if (originalStop.actualDate) {
            stop.actualDate = originalStop.actualDate;
          }
          if (originalStop.actualTime) {
            stop.actualTime = originalStop.actualTime;
          }
          if (originalStop.notes) {
            stop.notes = originalStop.notes;
          }
          if (originalStop.checklist) {
            stop.checklist = originalStop.checklist;
          }
        } else {
          // New stop - initialize defaults
          if (!stop.status) {
            stop.status = 'Pending';
          }
          if (!stop.checklist || stop.checklist.length === 0) {
            // Check if this is a load transport job to get the correct checklist
            let isLoad = false;
            if (stop.transportJobId) {
              const jobId = getJobIdFromStop(stop.transportJobId);
              if (jobId) {
                  // Find the transport job to check if it's a load
                  try {
                    const transportJob = await TransportJob.findById(jobId).select('loadId loadType vehicleId');
                    if (transportJob) {
                      isLoad = (transportJob.loadId && !transportJob.vehicleId) || transportJob.loadType === 'load';
                    }
                  } catch (error) {
                    console.error('Error checking transport job type for checklist:', error);
                    // Continue with default (vehicle) checklist if we can't determine
                }
              }
            }
            stop.checklist = getDefaultChecklist(stop.stopType, isLoad);
          }
        }
        
        // Populate formattedAddress for stop location
        if (stop.location) {
          locationService.populateFormattedAddress(stop.location);
        }
      }

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

      // Sync checklists from stops to transport jobs
      for (const stop of updateData.stops) {
        if ((stop.stopType === 'pickup' || stop.stopType === 'drop') &&
            stop.transportJobId && stop.checklist && Array.isArray(stop.checklist)) {
          const jobId = getJobIdFromStop(stop.transportJobId);
          if (jobId) {
            const checklistField = stop.stopType === 'pickup' ? 'pickupChecklist' : 'deliveryChecklist';
            await TransportJob.findByIdAndUpdate(jobId, {
              [checklistField]: stop.checklist
            });
          }
        }
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
      const originalStops = route.stops || [];

      for (let index = 0; index < updateData.stops.length; index++) {
        const updatedStop = updateData.stops[index];

        // Check if this is a pickup or drop stop with transport job
        if (updatedStop && (updatedStop.stopType === 'pickup' || updatedStop.stopType === 'drop') && updatedStop.transportJobId) {

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

          // Check for location changes
          const hasLocationChanges = !originalStop ||
            !originalStop.location ||
            !updatedStop.location ||
            JSON.stringify(originalStop.location) !== JSON.stringify(updatedStop.location);

          // Check for scheduled date/time changes
          const originalScheduledDate = originalStop?.scheduledDate ? new Date(originalStop.scheduledDate).getTime() : null;
          const updatedScheduledDate = updatedStop?.scheduledDate ? new Date(updatedStop.scheduledDate).getTime() : null;
          const hasDateChanges = originalScheduledDate !== updatedScheduledDate;

          const originalTimeStart = originalStop?.scheduledTimeStart ? new Date(originalStop.scheduledTimeStart).getTime() : null;
          const updatedTimeStart = updatedStop?.scheduledTimeStart ? new Date(updatedStop.scheduledTimeStart).getTime() : null;
          const hasTimeStartChanges = originalTimeStart !== updatedTimeStart;

          const originalTimeEnd = originalStop?.scheduledTimeEnd ? new Date(originalStop.scheduledTimeEnd).getTime() : null;
          const updatedTimeEnd = updatedStop?.scheduledTimeEnd ? new Date(updatedStop.scheduledTimeEnd).getTime() : null;
          const hasTimeEndChanges = originalTimeEnd !== updatedTimeEnd;

          const hasScheduleChanges = hasDateChanges || hasTimeStartChanges || hasTimeEndChanges;

          // Sync changes to transport job if location or schedule changed
          if ((hasLocationChanges && updatedStop.location) || hasScheduleChanges) {
            try {
              // Directly sync the location and schedule data to transport job
              const jobId = typeof updatedStop.transportJobId === 'object'
                ? updatedStop.transportJobId._id || updatedStop.transportJobId.id
                : updatedStop.transportJobId;

              const updateData = {};
              
              if (updatedStop.stopType === 'pickup') {
                // Sync location changes
                if (hasLocationChanges && updatedStop.location) {
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
                }
                
                // Sync schedule changes
                if (hasScheduleChanges) {
                  // Handle date fields - use scheduledTimeStart/End if available, otherwise use scheduledDate
                  if (updatedStop.scheduledTimeStart) {
                    const timeStartDate = new Date(updatedStop.scheduledTimeStart);
                    updateData.pickupDateStart = timeStartDate;
                  } else if (updatedStop.scheduledDate) {
                    updateData.pickupDateStart = new Date(updatedStop.scheduledDate);
                  }
                  
                  if (updatedStop.scheduledTimeEnd) {
                    const timeEndDate = new Date(updatedStop.scheduledTimeEnd);
                    updateData.pickupDateEnd = timeEndDate;
                  } else if (updatedStop.scheduledTimeStart) {
                    // If only start time is set, use the same date for end
                    const timeStartDate = new Date(updatedStop.scheduledTimeStart);
                    updateData.pickupDateEnd = timeStartDate;
                  } else if (updatedStop.scheduledDate) {
                    updateData.pickupDateEnd = new Date(updatedStop.scheduledDate);
                  }
                  
                  // Sync time strings (HH:MM format) - extract from scheduledTimeStart/End
                  if (updatedStop.scheduledTimeStart) {
                    const timeStartDate = new Date(updatedStop.scheduledTimeStart);
                    const hours = timeStartDate.getHours().toString().padStart(2, '0');
                    const minutes = timeStartDate.getMinutes().toString().padStart(2, '0');
                    updateData.pickupTimeStart = `${hours}:${minutes}`;
                  } else {
                    // Clear time if scheduledTimeStart is removed
                    updateData.pickupTimeStart = null;
                  }
                  
                  if (updatedStop.scheduledTimeEnd) {
                    const timeEndDate = new Date(updatedStop.scheduledTimeEnd);
                    const hours = timeEndDate.getHours().toString().padStart(2, '0');
                    const minutes = timeEndDate.getMinutes().toString().padStart(2, '0');
                    updateData.pickupTimeEnd = `${hours}:${minutes}`;
                  } else {
                    // Clear time if scheduledTimeEnd is removed
                    updateData.pickupTimeEnd = null;
                  }
                }
              } else if (updatedStop.stopType === 'drop') {
                // Sync location changes
                if (hasLocationChanges && updatedStop.location) {
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
                
                // Sync schedule changes
                if (hasScheduleChanges) {
                  // Handle date fields - use scheduledTimeStart/End if available, otherwise use scheduledDate
                  if (updatedStop.scheduledTimeStart) {
                    const timeStartDate = new Date(updatedStop.scheduledTimeStart);
                    updateData.dropDateStart = timeStartDate;
                  } else if (updatedStop.scheduledDate) {
                    updateData.dropDateStart = new Date(updatedStop.scheduledDate);
                  }
                  
                  if (updatedStop.scheduledTimeEnd) {
                    const timeEndDate = new Date(updatedStop.scheduledTimeEnd);
                    updateData.dropDateEnd = timeEndDate;
                  } else if (updatedStop.scheduledTimeStart) {
                    // If only start time is set, use the same date for end
                    const timeStartDate = new Date(updatedStop.scheduledTimeStart);
                    updateData.dropDateEnd = timeStartDate;
                  } else if (updatedStop.scheduledDate) {
                    updateData.dropDateEnd = new Date(updatedStop.scheduledDate);
                  }
                  
                  // Sync time strings (HH:MM format) - extract from scheduledTimeStart/End
                  if (updatedStop.scheduledTimeStart) {
                    const timeStartDate = new Date(updatedStop.scheduledTimeStart);
                    const hours = timeStartDate.getHours().toString().padStart(2, '0');
                    const minutes = timeStartDate.getMinutes().toString().padStart(2, '0');
                    updateData.dropTimeStart = `${hours}:${minutes}`;
                  } else {
                    // Clear time if scheduledTimeStart is removed
                    updateData.dropTimeStart = null;
                  }
                  
                  if (updatedStop.scheduledTimeEnd) {
                    const timeEndDate = new Date(updatedStop.scheduledTimeEnd);
                    const hours = timeEndDate.getHours().toString().padStart(2, '0');
                    const minutes = timeEndDate.getMinutes().toString().padStart(2, '0');
                    updateData.dropTimeEnd = `${hours}:${minutes}`;
                  } else {
                    // Clear time if scheduledTimeEnd is removed
                    updateData.dropTimeEnd = null;
                  }
                }
              }

              if (Object.keys(updateData).length > 0) {
                await TransportJob.findByIdAndUpdate(jobId, updateData);
                console.log(`✅ Synced ${updatedStop.stopType} stop changes to transport job ${jobId}`);
              }
            } catch (syncError) {
              console.error('Failed to sync route stop to transport job:', syncError);
              // Don't fail the route update if sync fails
            }
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
      try {
        const routeWithDistances = await locationService.calculateRouteDistances(updatedRoute);

        // Clean and validate the stops data before replacement
        const cleanStops = routeWithDistances.stops.map((processedStop, index) => {
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
        select: 'jobNumber status vehicleId loadId loadType carrier carrierPayment',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
          }
        ]
      })
      .populate({
        path: 'stops.transportJobId',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
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
        select: 'jobNumber status vehicleId loadId loadType carrier carrierPayment',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
          }
        ]
      })
      .populate({
        path: 'stops.transportJobId',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
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

    // Check if this stop was just marked as completed (status changed from non-Completed to Completed)
    // If so, automatically set the next pending stop to "In Progress"
    const wasJustCompleted = originalStatus !== 'Completed';
    
    if (wasJustCompleted && route.stops && route.stops.length > 0) {
      // Sort stops by sequence
      const sortedStops = [...route.stops].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      
      // Find stops currently in progress (excluding the one we just completed)
      const inProgressStops = sortedStops.filter(s => {
        const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
        const completedStopId = route.stops[stopIndex]._id ? route.stops[stopIndex]._id.toString() : (route.stops[stopIndex].id ? route.stops[stopIndex].id.toString() : null);
        return s.status === 'In Progress' && sId !== completedStopId;
      });

      // Only set next stop to "In Progress" if there's no stop currently in progress
      if (inProgressStops.length === 0) {
        // Find the next pending stop after the completed one
        const nextPendingStop = sortedStops.find(s => {
          const status = s.status;
          const isPending = !status || status === 'Pending';
          // Make sure it's not the stop we just completed
          const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
          const completedStopId = route.stops[stopIndex]._id ? route.stops[stopIndex]._id.toString() : (route.stops[stopIndex].id ? route.stops[stopIndex].id.toString() : null);
          return isPending && sId !== completedStopId;
        });

        if (nextPendingStop) {
          // Find the index of the next pending stop in the original stops array
          const nextPendingIndex = route.stops.findIndex(s => {
            const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
            const pendingId = nextPendingStop._id ? nextPendingStop._id.toString() : (nextPendingStop.id ? nextPendingStop.id.toString() : null);
            return sId && pendingId && sId === pendingId;
          });

          if (nextPendingIndex !== -1) {
            route.stops[nextPendingIndex].status = 'In Progress';
          }
        }
      }
    }

    // Update lastUpdatedBy
    route.lastUpdatedBy = req.user ? req.user._id : undefined;

    // Save the route
    await route.save();

    // Reload route to get updated stops
    const updatedRoute = await Route.findById(routeId);
    const updatedStop = updatedRoute.stops[stopIndex];

    // Sync ALL photos and checklist from stop to transport job if this is a pickup/drop stop
    if ((originalStop.stopType === 'pickup' || originalStop.stopType === 'drop') && originalStop.transportJobId) {
      const jobId = getJobIdFromStop(originalStop.transportJobId);

      if (jobId) {
        // Sync photos
        if (updatedStop.photos && Array.isArray(updatedStop.photos)) {
          // Get ALL photos from the stop that were taken during this operation
          // Include both vehicle/load photos and stop photos taken at pickup/delivery
          const operationPhotoUrls = updatedStop.photos
            .filter(p => p.photoType === 'vehicle' || p.photoType === 'stop')
          .map(p => p.url);

          // Overwrite transport job photos with all photos from stop (ensures consistency)
        const updateField = originalStop.stopType === 'pickup' ? 'pickupPhotos' : 'deliveryPhotos';
        await TransportJob.findByIdAndUpdate(jobId, {
            [updateField]: operationPhotoUrls // Overwrite with current photos
        });
        }

        // Sync checklist
        if (updatedStop.checklist && Array.isArray(updatedStop.checklist)) {
          // Sync checklist to transport job
          const checklistField = originalStop.stopType === 'pickup' ? 'pickupChecklist' : 'deliveryChecklist';
          await TransportJob.findByIdAndUpdate(jobId, {
            [checklistField]: updatedStop.checklist
          });
        }
      }
    }

    // Update statuses based on stop completion (AFTER route is saved)
    // This ensures vehicle and transport job statuses are updated
    try {
      const stopType = originalStop.stopType;
      const transportJobId = getJobIdFromStop(originalStop.transportJobId);
      
      if (!transportJobId) {
        console.warn(`⚠️ No transportJobId found for stop ${stopId} (type: ${stopType}) - skipping status update`);
      } else {        
        await updateStatusOnStopUpdate(
          routeId,
          stopIndex,
          ROUTE_STOP_STATUS.COMPLETED, // Use constant instead of string
          stopType,
          transportJobId,
          updatedRoute.stops // Pass the saved route stops
        );
        
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
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
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
 * Update a stop's checklist and notes without completing it
 * This endpoint allows admin/dispatcher to update stop data without changing status
 */
exports.updateRouteStop = async (req, res) => {
  try {
    const routeId = req.params.id;
    const stopId = req.params.stopId;
    const { checklist, notes } = req.body;

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

    // Update stop fields (only checklist and notes, NOT status, NOT photos)
    if (checklist !== undefined) {
      route.stops[stopIndex].checklist = checklist;
    }
    if (notes !== undefined) {
      route.stops[stopIndex].notes = notes;
    }

    route.lastUpdatedBy = req.user ? req.user._id : undefined;
    await route.save();

    // Sync checklist to transport job if this is a pickup/drop stop
    if ((route.stops[stopIndex].stopType === 'pickup' || route.stops[stopIndex].stopType === 'drop') &&
        route.stops[stopIndex].transportJobId && checklist) {
      const jobId = typeof route.stops[stopIndex].transportJobId === 'object'
        ? (route.stops[stopIndex].transportJobId._id || route.stops[stopIndex].transportJobId.id)
        : route.stops[stopIndex].transportJobId;

      if (jobId && Array.isArray(checklist)) {
        const checklistField = route.stops[stopIndex].stopType === 'pickup' ? 'pickupChecklist' : 'deliveryChecklist';
        await TransportJob.findByIdAndUpdate(jobId, {
          [checklistField]: checklist
        });
      }
    }

    // Log stop update
    try {
      await AuditLog.create({
        action: 'update_route',
        entityType: 'route',
        entityId: routeId,
        userId: req.user ? req.user._id : undefined,
        driverId: route.driverId,
        routeId,
        details: {
          stopId: stopId,
          stopType: route.stops[stopIndex].stopType,
          updatedFields: {
            checklist: checklist !== undefined,
            notes: notes !== undefined
          }
        },
        notes: `Updated ${route.stops[stopIndex].stopType} stop checklist/notes from route view`
      });
    } catch (auditError) {
      console.error('Failed to create audit log for stop update:', auditError);
    }

    // Populate route for response
    const populatedRoute = await Route.findById(routeId)
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate('truckId', 'truckNumber licensePlate make model year status')
      .populate({
        path: 'stops.transportJobId',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
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

    res.status(200).json({
      success: true,
      message: 'Stop updated successfully',
      data: {
        route: populatedRoute
      }
    });
  } catch (error) {
    console.error('Error updating stop:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update stop',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Upload photos to a specific stop - Admin/Dispatcher version
 * Instantly saves photos and syncs to transport job
 */
exports.uploadStopPhotos = async (req, res) => {
  try {
    const routeId = req.params.id;
    const stopId = req.params.stopId;
    const { photos, currentLocation } = req.body;

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Photos array is required'
      });
    }

    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

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

    const originalStop = route.stops[stopIndex];

    // Add new photos to stop
    const newPhotos = photos.map(photo => ({
      url: photo.url,
      timestamp: photo.timestamp || new Date(),
      location: photo.location || currentLocation,
      notes: photo.notes,
      photoType: photo.photoType || 'stop',
      photoCategory: photo.photoCategory
    }));

    route.stops[stopIndex].photos = [
      ...(originalStop.photos || []),
      ...newPhotos
    ];
    route.lastUpdatedBy = req.user ? req.user._id : undefined;
    await route.save();

    // Log photo uploads
    const vehiclePhotos = newPhotos.filter(p => p.photoType === 'vehicle').length;
    const stopPhotos = newPhotos.filter(p => p.photoType !== 'vehicle').length;

    if (vehiclePhotos > 0) {
      await AuditLog.create({
        action: 'upload_vehicle_photo',
        entityType: 'route',
        entityId: routeId,
        userId: req.user ? req.user._id : undefined,
        driverId: route.driverId,
        location: currentLocation,
        routeId,
        details: {
          stopId: stopId,
          stopType: originalStop.stopType,
          photoCount: vehiclePhotos
        },
        notes: `Uploaded ${vehiclePhotos} vehicle photo(s) for ${originalStop.stopType} stop (admin/dispatcher)`
      });
    }

    if (stopPhotos > 0) {
      await AuditLog.create({
        action: 'upload_stop_photo',
        entityType: 'route',
        entityId: routeId,
        userId: req.user ? req.user._id : undefined,
        driverId: route.driverId,
        location: currentLocation,
        routeId,
        details: {
          stopId: stopId,
          stopType: originalStop.stopType,
          photoCount: stopPhotos
        },
        notes: `Uploaded ${stopPhotos} stop photo(s) for ${originalStop.stopType} stop (admin/dispatcher)`
      });
    }

    // Sync ALL vehicle photos from stop to transport job if this is a pickup/drop stop
    // Reload route to get the updated stop with all photos
    const updatedRoute = await Route.findById(routeId);
    const updatedStop = updatedRoute.stops[stopIndex];
    
    if ((originalStop.stopType === 'pickup' || originalStop.stopType === 'drop') && originalStop.transportJobId) {
      const jobId = typeof originalStop.transportJobId === 'object'
        ? (originalStop.transportJobId._id || originalStop.transportJobId.id)
        : originalStop.transportJobId;

      if (jobId && updatedStop.photos && Array.isArray(updatedStop.photos)) {
        // Get ALL photos from the stop that were taken during this operation
        // Include both vehicle/load photos and stop photos taken at pickup/delivery
        const operationPhotoUrls = updatedStop.photos
          .filter(p => p.photoType === 'vehicle' || p.photoType === 'stop')
          .map(p => p.url);

        // Overwrite transport job photos with all vehicle photos from stop (ensures consistency)
        const updateField = originalStop.stopType === 'pickup' ? 'pickupPhotos' : 'deliveryPhotos';
        await TransportJob.findByIdAndUpdate(jobId, {
          [updateField]: operationPhotoUrls // Overwrite with current photos
        });
      }
    }

    // Populate and return route
    const populatedRoute = await Route.findById(routeId)
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate('truckId', 'truckNumber licensePlate make model year status')
      .populate({
        path: 'selectedTransportJobs',
        select: 'jobNumber status vehicleId loadId loadType carrier carrierPayment',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
          }
        ]
      })
      .populate({
        path: 'stops.transportJobId',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
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
      message: `Successfully uploaded ${newPhotos.length} photo(s)`,
      data: {
        route: populatedRoute
      }
    });
  } catch (error) {
    console.error('Error uploading stop photos:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload photos',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Remove photo from a specific stop - Admin/Dispatcher version
 */
exports.removeStopPhoto = async (req, res) => {
  try {
    const routeId = req.params.id;
    const stopId = req.params.stopId;
    const { photoIndex } = req.body;

    if (photoIndex === undefined || photoIndex === null) {
      return res.status(400).json({
        success: false,
        message: 'Photo index is required'
      });
    }

    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

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

    const originalStop = route.stops[stopIndex];
    const photos = originalStop.photos || [];

    if (photoIndex < 0 || photoIndex >= photos.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid photo index'
      });
    }

    const removedPhoto = photos[photoIndex];
    const isVehiclePhoto = removedPhoto.photoType === 'vehicle';

    // Remove photo from stop
    route.stops[stopIndex].photos = photos.filter((_, index) => index !== photoIndex);
    route.lastUpdatedBy = req.user ? req.user._id : undefined;
    await route.save();

    // Log photo removal
    await AuditLog.create({
      action: isVehiclePhoto ? 'upload_vehicle_photo' : 'upload_stop_photo',
      entityType: 'route',
      entityId: routeId,
      userId: req.user ? req.user._id : undefined,
      driverId: route.driverId,
      routeId,
      details: {
        stopId: stopId,
        stopType: originalStop.stopType,
        photoIndex: photoIndex,
        photoUrl: removedPhoto.url
      },
      notes: `Removed ${isVehiclePhoto ? 'vehicle' : 'stop'} photo from ${originalStop.stopType} stop (admin/dispatcher)`
    });

    // Sync ALL vehicle photos from stop to transport job if this is a pickup/drop stop
    // Reload route to get the updated stop with all photos after removal
    const updatedRouteForRemoval = await Route.findById(routeId);
    const updatedStopForRemoval = updatedRouteForRemoval.stops[stopIndex];
    
    if ((originalStop.stopType === 'pickup' || originalStop.stopType === 'drop') && originalStop.transportJobId) {
      const jobId = typeof originalStop.transportJobId === 'object'
        ? (originalStop.transportJobId._id || originalStop.transportJobId.id)
        : originalStop.transportJobId;

      if (jobId && updatedStopForRemoval.photos && Array.isArray(updatedStopForRemoval.photos)) {
        // Get ALL photos from the stop after removal that were taken during this operation
        // Include both vehicle/load photos and stop photos taken at pickup/delivery
        const operationPhotoUrls = updatedStopForRemoval.photos
          .filter(p => p.photoType === 'vehicle' || p.photoType === 'stop')
          .map(p => p.url);

        // Overwrite transport job photos with all photos from stop (ensures consistency)
        const updateField = originalStop.stopType === 'pickup' ? 'pickupPhotos' : 'deliveryPhotos';
        await TransportJob.findByIdAndUpdate(jobId, {
          [updateField]: operationPhotoUrls // Overwrite with current photos
        });
      }
    }

    // Populate and return route
    const populatedRoute = await Route.findById(routeId)
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate('truckId', 'truckNumber licensePlate make model year status')
      .populate({
        path: 'selectedTransportJobs',
        select: 'jobNumber status vehicleId loadId loadType carrier carrierPayment',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
          }
        ]
      })
      .populate({
        path: 'stops.transportJobId',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
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
      message: 'Photo removed successfully',
      data: {
        route: populatedRoute
      }
    });
  } catch (error) {
    console.error('Error removing stop photo:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to remove photo',
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
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
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
 * Manually update stop, transport job, and vehicle statuses
 * This endpoint allows admins/dispatchers to manually fix status inconsistencies
 */
exports.manualUpdateStopStatuses = async (req, res) => {
  try {
    const routeId = req.params.id;
    const stopId = req.params.stopId;
    const { stopStatus, transportJobStatus, vehicleStatus, loadStatus } = req.body;

    // At least one status must be provided
    if (!stopStatus && !transportJobStatus && !vehicleStatus && !loadStatus) {
      return res.status(400).json({
        success: false,
        message: 'At least one status (stopStatus, transportJobStatus, vehicleStatus, or loadStatus) must be provided'
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
    const transportJobId = getJobIdFromStop(stop.transportJobId);
    const updates = [];
    const oldValues = {};

    // Update stop status if provided
    if (stopStatus) {
      if (!Object.values(ROUTE_STOP_STATUS).includes(stopStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid stop status: ${stopStatus}. Valid values: ${Object.values(ROUTE_STOP_STATUS).join(', ')}`
        });
      }
      oldValues.stopStatus = stop.status;
      route.stops[stopIndex].status = stopStatus;
      updates.push(`Stop status: ${oldValues.stopStatus || 'N/A'} → ${stopStatus}`);
    }

    // Update transport job status if provided
    let transportJob = null;
    if (transportJobStatus && transportJobId) {
      if (!Object.values(TRANSPORT_JOB_STATUS).includes(transportJobStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid transport job status: ${transportJobStatus}. Valid values: ${Object.values(TRANSPORT_JOB_STATUS).join(', ')}`
        });
      }
      transportJob = await TransportJob.findById(transportJobId);
      if (transportJob) {
        oldValues.transportJobStatus = transportJob.status;
        transportJob.status = transportJobStatus;
        await transportJob.save();

        // Update vehicle's transportJobs history
        await updateVehicleTransportJobsHistory(transportJobId, transportJobStatus);

        updates.push(`Transport job ${transportJob.jobNumber || transportJobId} status: ${oldValues.transportJobStatus} → ${transportJobStatus}`);
      }
    }

    // Update vehicle status if provided
    let vehicle = null;
    if (vehicleStatus) {
      if (!Object.values(VEHICLE_STATUS).includes(vehicleStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid vehicle status: ${vehicleStatus}. Valid values: ${Object.values(VEHICLE_STATUS).join(', ')}`
        });
      }

      // Get vehicle ID from transport job if available
      let vehicleId = null;
      if (transportJobId) {
        const job = transportJob || await TransportJob.findById(transportJobId).select('vehicleId');
        if (job && job.vehicleId) {
          vehicleId = job.vehicleId._id || job.vehicleId;
        }
      }

      if (!vehicleId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot update vehicle status: No vehicle associated with this stop'
        });
      }

      vehicle = await Vehicle.findById(vehicleId);
      if (vehicle) {
        oldValues.vehicleStatus = vehicle.status;
        vehicle.status = vehicleStatus;
        
        // Add deliveredAt timestamp if vehicle is now delivered
        if (vehicleStatus === VEHICLE_STATUS.DELIVERED) {
          vehicle.deliveredAt = new Date();
        }
        
        await vehicle.save();
        updates.push(`Vehicle ${vehicle.vin || vehicleId} status: ${oldValues.vehicleStatus} → ${vehicleStatus}`);
      }
    }

    // Update load status if provided
    let load = null;
    if (loadStatus) {
      if (!Object.values(LOAD_STATUS).includes(loadStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid load status: ${loadStatus}. Valid values: ${Object.values(LOAD_STATUS).join(', ')}`
        });
      }

      // Get load ID from transport job if available
      let loadId = null;
      if (transportJobId) {
        const job = transportJob || await TransportJob.findById(transportJobId).select('loadId');
        if (job && job.loadId) {
          loadId = job.loadId._id || job.loadId;
        }
      }

      if (!loadId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot update load status: No load associated with this stop'
        });
      }

      load = await Load.findById(loadId);
      if (load) {
        oldValues.loadStatus = load.status;
        load.status = loadStatus;

        // Add deliveredAt timestamp if load is now delivered
        if (loadStatus === LOAD_STATUS.DELIVERED) {
          load.deliveredAt = new Date();
        }

        await load.save();
        updates.push(`Load ${load.description || load.loadNumber || loadId} status: ${oldValues.loadStatus} → ${loadStatus}`);
      }
    }

    // Save route if stop status was updated
    if (stopStatus) {
      route.lastUpdatedBy = req.user ? req.user._id : undefined;
      await route.save();
    }

    // Create audit log
    await AuditLog.create({
      action: 'manual_status_update',
      entityType: 'route',
      entityId: routeId,
      userId: req.user ? req.user._id : undefined,
      driverId: route.driverId,
      routeId,
      details: {
        stopId: stopId,
        stopType: stop.stopType,
        transportJobId: transportJobId,
        oldValues: oldValues,
        newValues: {
          stopStatus: stopStatus || stop.status,
          transportJobStatus: transportJobStatus || (transportJob ? transportJob.status : null),
          vehicleStatus: vehicleStatus || (vehicle ? vehicle.status : null),
          loadStatus: loadStatus || (load ? load.status : null)
        }
      },
      notes: `Manual status update: ${updates.join('; ')}`
    });

    // Populate route for response
    const populatedRoute = await Route.findById(routeId)
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate('truckId', 'truckNumber licensePlate make model year status')
      .populate({
        path: 'stops.transportJobId',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
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

    res.status(200).json({
      success: true,
      message: 'Statuses updated successfully',
      data: {
        route: populatedRoute,
        updates: updates
      }
    });
  } catch (error) {
    console.error('Error manually updating statuses:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to manually update statuses',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Complete route - marks route as completed and completes all pending/in-progress stops
 * Only updates transport jobs and vehicles that are not already cancelled or delivered
 */
exports.completeRoute = async (req, res) => {
  try {
    const routeId = req.params.id;
    const userId = req.user?._id;
    const userRole = req.user?.role;

    // Find the route
    const route = await Route.findById(routeId)
      .populate('stops.transportJobId');
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // If user is a driver, verify they own this route
    if (userRole === 'ptgDriver') {
      const driverId = typeof route.driverId === 'object' 
        ? (route.driverId._id || route.driverId.id) 
        : route.driverId;
      
      if (!driverId || driverId.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to complete this route'
        });
      }
    }

    // Check if route is already completed
    if (route.status === ROUTE_STATUS.COMPLETED) {
      return res.status(400).json({
        success: false,
        message: 'Route is already completed'
      });
    }

    const oldStatus = route.status;
    const completedStops = [];
    const skippedStops = [];
    const processedTransportJobs = new Set();
    const processedVehicles = new Set();
    const transportJobIdsToProcess = new Set();

    // First pass: Mark all pending/in-progress stops as completed and collect transport job IDs
    for (let i = 0; i < route.stops.length; i++) {
      const stop = route.stops[i];
      const stopId = stop._id ? stop._id.toString() : `${stop.stopType}-${stop.sequence}`;
      
      // Only process stops that are pending or in progress
      if (stop.status === ROUTE_STOP_STATUS.PENDING || stop.status === ROUTE_STOP_STATUS.IN_PROGRESS) {
        // Mark stop as completed
        route.stops[i].status = ROUTE_STOP_STATUS.COMPLETED;
        if (!route.stops[i].actualDate) {
          route.stops[i].actualDate = new Date();
        }
        if (!route.stops[i].actualTime) {
          route.stops[i].actualTime = new Date();
        }
        completedStops.push(stopId);

        // Collect transport job IDs for processing after route is saved
        const transportJobId = getJobIdFromStop(stop.transportJobId);
        if (transportJobId) {
          transportJobIdsToProcess.add(transportJobId);
        }
      } else if (stop.status === ROUTE_STOP_STATUS.COMPLETED || stop.status === ROUTE_STOP_STATUS.SKIPPED) {
        // Track already completed/skipped stops
        if (stop.status === ROUTE_STOP_STATUS.SKIPPED) {
          skippedStops.push(stopId);
        }
      }
    }

    // Mark route as completed
    route.status = ROUTE_STATUS.COMPLETED;
    route.actualEndDate = new Date();
    route.lastUpdatedBy = req.user ? req.user._id : undefined;

    // Save the route first so that isTransportJobFullyCompleted can see the updated stops
    await route.save();

    // Second pass: Process transport jobs and vehicles now that route is saved
    for (const transportJobId of transportJobIdsToProcess) {
      if (processedTransportJobs.has(transportJobId)) continue;
      processedTransportJobs.add(transportJobId);
      
      try {
        const transportJob = await TransportJob.findById(transportJobId).populate('vehicleId');
        if (!transportJob) continue;

        // Only update if not already cancelled or delivered
        if (transportJob.status === TRANSPORT_JOB_STATUS.CANCELLED || 
            transportJob.status === TRANSPORT_JOB_STATUS.DELIVERED) {
          continue;
        }

        // Find all stops for this transport job in the current route
        const jobStops = route.stops.filter(s => {
          const jobId = getJobIdFromStop(s.transportJobId);
          return jobId && jobId.toString() === transportJobId.toString();
        });

        const hasPickupStop = jobStops.some(s => s.stopType === 'pickup');
        const hasDropStop = jobStops.some(s => s.stopType === 'drop');
        const pickupCompleted = jobStops.some(s => s.stopType === 'pickup' && s.status === ROUTE_STOP_STATUS.COMPLETED);
        const dropCompleted = jobStops.some(s => s.stopType === 'drop' && s.status === ROUTE_STOP_STATUS.COMPLETED);

        // If this route has a pickup stop that was just completed, mark job as In Transit
        if (hasPickupStop && pickupCompleted && transportJob.status !== TRANSPORT_JOB_STATUS.IN_TRANSIT) {
          transportJob.status = TRANSPORT_JOB_STATUS.IN_TRANSIT;
          await transportJob.save();

          // Update vehicle's transportJobs history
          await updateVehicleTransportJobsHistory(transportJobId, TRANSPORT_JOB_STATUS.IN_TRANSIT);
        }

        // If this route has a drop stop, check if transport job is fully completed across all routes
        if (hasDropStop && dropCompleted) {
          const isFullyCompleted = await isTransportJobFullyCompleted(transportJobId);

          if (isFullyCompleted && transportJob.status !== TRANSPORT_JOB_STATUS.DELIVERED) {
            // Mark as Delivered
            transportJob.status = TRANSPORT_JOB_STATUS.DELIVERED;
            await transportJob.save();

            // Update vehicle's transportJobs history
            await updateVehicleTransportJobsHistory(transportJobId, TRANSPORT_JOB_STATUS.DELIVERED);
          }
        }

        // Update vehicle if not cancelled or delivered
        if (transportJob.vehicleId) {
          const vehicleId = typeof transportJob.vehicleId === 'object'
            ? (transportJob.vehicleId._id || transportJob.vehicleId.id)
            : transportJob.vehicleId;
          
          if (vehicleId && !processedVehicles.has(vehicleId.toString())) {
            processedVehicles.add(vehicleId.toString());
            const vehicle = await Vehicle.findById(vehicleId);
            if (vehicle && vehicle.status !== VEHICLE_STATUS.CANCELLED && 
                vehicle.status !== VEHICLE_STATUS.DELIVERED) {
              const newVehicleStatus = await calculateVehicleStatusFromJobs(vehicleId);
              const updateData = { status: newVehicleStatus };

              // Add deliveredAt timestamp if vehicle is now fully delivered
              if (newVehicleStatus === VEHICLE_STATUS.DELIVERED) {
                updateData.deliveredAt = new Date();
              }

              await Vehicle.findByIdAndUpdate(vehicleId, updateData);
            }
          }
        }
      } catch (jobError) {
        console.error(`Error processing transport job ${transportJobId}:`, jobError);
        // Continue processing other jobs even if one fails
      }
    }

    // Update truck status to Available
    if (route.truckId) {
      const truckId = typeof route.truckId === 'object' 
        ? (route.truckId._id || route.truckId.id) 
        : route.truckId;
      await Truck.findByIdAndUpdate(truckId, {
        status: TRUCK_STATUS.AVAILABLE,
        currentDriver: undefined
      });
    }

    // Remove currentRouteId from driver profile
    if (route.driverId) {
      const driverId = typeof route.driverId === 'object'
        ? (route.driverId._id || route.driverId.id)
        : route.driverId;
      await User.findByIdAndUpdate(driverId, {
        $unset: { currentRouteId: 1 }
      });
    }

    // Create maintenance expense for route
    try {
      await createMaintenanceExpenseForRoute(routeId);
    } catch (expenseError) {
      console.error('Failed to create maintenance expense when completing route:', expenseError);
      // Don't fail route completion if expense creation fails
    }

    // Create audit log
    try {
      await AuditLog.create({
        action: 'complete_route',
        entityType: 'route',
        entityId: routeId,
        userId: req.user ? req.user._id : undefined,
        driverId: route.driverId,
        routeId,
        details: {
          oldStatus,
          newStatus: ROUTE_STATUS.COMPLETED,
          completedStopsCount: completedStops.length,
          skippedStopsCount: skippedStops.length,
          processedTransportJobsCount: processedTransportJobs.size,
          processedVehiclesCount: processedVehicles.size
        },
        notes: `Route ${route.routeNumber || routeId} completed. ${completedStops.length} stops marked as completed.`
      });
    } catch (auditError) {
      console.error('Failed to create audit log for route completion:', auditError);
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
      message: 'Route completed successfully',
      data: {
        route: populatedRoute,
        summary: {
          completedStops: completedStops.length,
          skippedStops: skippedStops.length,
          processedTransportJobs: processedTransportJobs.size,
          processedVehicles: processedVehicles.size
        }
      }
    });
  } catch (error) {
    console.error('Error completing route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to complete route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Start route - Admin/Dispatcher can start a route (same functionality as driver start route)
 */
exports.startRoute = async (req, res) => {
  try {
    const routeId = req.params.id;
    const { currentLocation } = req.body;

    // Find the route
    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Check if route is already in progress
    if (route.status === ROUTE_STATUS.IN_PROGRESS) {
      return res.status(400).json({
        success: false,
        message: 'Route is already in progress'
      });
    }

    // Check if route is already completed or cancelled
    if (route.status === ROUTE_STATUS.COMPLETED || route.status === ROUTE_STATUS.CANCELLED) {
      return res.status(400).json({
        success: false,
        message: `Cannot start a route that is ${route.status.toLowerCase()}`
      });
    }

    // Get driver ID
    const driverId = typeof route.driverId === 'object' 
      ? (route.driverId._id || route.driverId.id) 
      : route.driverId;

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Route has no driver assigned'
      });
    }

    // Check if driver already has an active route
    const driver = await User.findById(driverId);
    if (driver && driver.currentRouteId && driver.currentRouteId.toString() !== routeId) {
      // Check if the current route is completed - if so, clear it and allow starting new route
      const currentRoute = await Route.findById(driver.currentRouteId);
      if (currentRoute && currentRoute.status === ROUTE_STATUS.COMPLETED) {
        // Clear the completed route from driver's currentRouteId
        await User.findByIdAndUpdate(driverId, {
          $unset: { currentRouteId: 1 }
        });
      } else {
        // Current route is still active (not completed), so prevent starting new route
      return res.status(400).json({
        success: false,
        message: 'Driver already has an active route. Please complete the current route before starting a new one.'
      });
      }
    }

    // Store old status for status change handler
    const oldStatus = route.status;

    // Update route status and state
    route.status = ROUTE_STATUS.IN_PROGRESS;
    route.state = ROUTE_STATE.STARTED;
    route.actualStartDate = new Date();
    route.lastUpdatedBy = req.user._id;

    // Set current route in user model
    await User.findByIdAndUpdate(driverId, {
      currentRouteId: routeId
    });

    // Set truck status to "In Use" when route starts
    if (route.truckId) {
      const truckId = typeof route.truckId === 'object' 
        ? (route.truckId._id || route.truckId.id) 
        : route.truckId;
      
      await Truck.findByIdAndUpdate(truckId, {
        status: TRUCK_STATUS.IN_USE,
        currentDriver: driverId
      });
    }

    // If route status is changing to "In Progress", automatically set first stop to "In Progress"
    if (route.stops && route.stops.length > 0) {
      // Sort stops by sequence
      const sortedStops = [...route.stops].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      // Find first pending stop and set it to "In Progress"
      const firstPendingStop = sortedStops.find(s => !s.status || s.status === ROUTE_STOP_STATUS.PENDING);
      if (firstPendingStop) {
        const stopIndex = route.stops.findIndex(s => {
          const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
          const firstPendingId = firstPendingStop._id ? firstPendingStop._id.toString() : (firstPendingStop.id ? firstPendingStop.id.toString() : null);
          return sId && firstPendingId && sId === firstPendingId;
        });
        
        if (stopIndex !== -1) {
          route.stops[stopIndex].status = ROUTE_STOP_STATUS.IN_PROGRESS;
        }
      }
    }

    // Save the route
    await route.save();

    // Log to audit log
    const startAuditLog = await AuditLog.create({
      action: 'start_route',
      entityType: 'route',
      entityId: routeId,
      userId: req.user._id,
      driverId: driverId,
      location: currentLocation,
      routeId,
      notes: 'Started route (admin/dispatcher action)'
    });

    // Initialize route tracking
    const truckId = route.truckId ? (typeof route.truckId === 'object' ? (route.truckId._id || route.truckId.id) : route.truckId) : null;
    await routeTracker.initializeTracking(routeId, driverId, truckId, startAuditLog._id);
    
    // Add location entry for start action if location is provided
    if (currentLocation) {
      await routeTracker.addLocationEntry(
        routeId,
        currentLocation.latitude,
        currentLocation.longitude,
        currentLocation.accuracy,
        startAuditLog._id
      );
    }

    // Update all related statuses (transport jobs, vehicles) when route status changes
    try {
      await updateStatusOnRouteStatusChange(routeId, ROUTE_STATUS.IN_PROGRESS, oldStatus);
    } catch (statusError) {
      console.error('Failed to update statuses on route start:', statusError);
      // Don't fail the route start if status updates fail
    }

    // Populate route for response
    const populatedRoute = await Route.findById(routeId)
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate('truckId', 'truckNumber licensePlate make model year status')
      .populate({
        path: 'selectedTransportJobs',
        select: 'jobNumber status vehicleId loadId loadType carrier carrierPayment',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
          }
        ]
      })
      .populate({
        path: 'stops.transportJobId',
        populate: [
          {
            path: 'vehicleId',
            select: 'vin year make model status pickupLocationName pickupCity pickupState pickupZip pickupDateStart pickupDateEnd pickupTimeStart pickupTimeEnd dropLocationName dropCity dropState dropZip dropDateStart dropDateEnd dropTimeStart dropTimeEnd pickupContactName pickupContactPhone dropContactName dropContactPhone documents notes'
          },
          {
            path: 'loadId',
            select: 'loadNumber loadType description weight dimensions quantity unit status initialPickupLocationName initialPickupCity initialPickupState initialPickupZip initialDropLocationName initialDropCity initialDropState initialDropZip documents notes'
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
      message: 'Route started successfully',
      data: {
        route: populatedRoute
      }
    });
  } catch (error) {
    console.error('Error starting route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to start route',
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

    // Collect all transport jobs affected by this route deletion
    const transportJobIds = new Set();
    
    if (route.selectedTransportJobs && Array.isArray(route.selectedTransportJobs)) {
      route.selectedTransportJobs.forEach(jobId => {
        transportJobIds.add(jobId.toString());
      });
    }

    if (route.stops && Array.isArray(route.stops)) {
      route.stops.forEach(stop => {
        if (stop.transportJobId) {
          transportJobIds.add(getJobIdFromStop(stop.transportJobId));
        }
      });
    }

    // Build effects message for confirmation
    const effects = [];
    if (transportJobIds.size > 0) {
      effects.push(`This route contains ${transportJobIds.size} transport job(s). Their statuses will be updated.`);
      
      // Check affected vehicles
      const affectedVehicles = new Set();
      for (const jobId of transportJobIds) {
        const job = await TransportJob.findById(jobId).select('vehicleId');
        if (job && job.vehicleId) {
          const vehicleId = typeof job.vehicleId === 'object' ? (job.vehicleId._id || job.vehicleId.id) : job.vehicleId;
          affectedVehicles.add(vehicleId.toString());
        }
      }
      if (affectedVehicles.size > 0) {
        effects.push(`Vehicle statuses for ${affectedVehicles.size} vehicle(s) will be recalculated.`);
      }
    }

    // Check if confirmation is required (if there are effects)
    if (effects.length > 0 && (!req.body || !req.body.confirm)) {
      return res.status(400).json({
        success: false,
        requiresConfirmation: true,
        message: 'Deleting this route will have the following effects:',
        effects: effects,
        confirmationMessage: 'Please confirm deletion by including { "confirm": true } in the request body.'
      });
    }

    // Update transport job statuses and remove route references (only for non-deleted jobs)
    for (const jobId of transportJobIds) {
      try {
        const job = await TransportJob.findById(jobId);
        if (!job || job.deleted) continue; // Skip deleted jobs

        // Remove route references
        await TransportJob.findByIdAndUpdate(jobId, {
          $unset: { 
            routeId: 1,
            pickupRouteId: 1,
            dropRouteId: 1
          }
        });

        // Update transport job status (revert to "Needs Dispatch" if not delivered/cancelled)
        if (job.status !== TRANSPORT_JOB_STATUS.DELIVERED && 
            job.status !== TRANSPORT_JOB_STATUS.CANCELLED) {
          await TransportJob.findByIdAndUpdate(jobId, {
            status: TRANSPORT_JOB_STATUS.NEEDS_DISPATCH,
            $unset: { assignedDriver: 1 }
        });
      }

        // Update vehicle status based on remaining transport jobs (only if vehicle is not deleted)
        if (job.vehicleId) {
          const vehicleId = typeof job.vehicleId === 'object' 
            ? (job.vehicleId._id || job.vehicleId.id) 
            : job.vehicleId;
          
          const vehicle = await Vehicle.findById(vehicleId);
          if (vehicle && !vehicle.deleted) {
            // Recalculate vehicle status based on all remaining non-deleted transport jobs
            const newVehicleStatus = await calculateVehicleStatusFromJobs(vehicleId);
            await Vehicle.findByIdAndUpdate(vehicleId, {
              status: newVehicleStatus
            });
          }
        }
      } catch (jobError) {
        console.error(`Error updating transport job ${jobId} on route deletion:`, jobError);
        // Continue with other jobs even if one fails
      }
    }

    // Update truck status to Available if this route is assigned to it
    if (route.truckId) {
      const truckId = typeof route.truckId === 'object'
        ? (route.truckId._id || route.truckId.id)
        : route.truckId;
      
      const truck = await Truck.findById(truckId);
      if (truck) {
        // Set truck status to Available when route is deleted
        truck.status = TRUCK_STATUS.AVAILABLE;
        truck.currentDriver = undefined;
        await truck.save();
      }
    }

    // Remove currentRouteId from driver profile if this route is their current route
    if (route.driverId) {
      const driverId = typeof route.driverId === 'object'
        ? (route.driverId._id || route.driverId.id)
        : route.driverId;
      
      const driver = await User.findById(driverId);
      if (driver && driver.currentRouteId && driver.currentRouteId.toString() === req.params.id.toString()) {
        // Remove currentRouteId from driver if it matches the deleted route
        await User.findByIdAndUpdate(driverId, {
          $unset: { currentRouteId: 1 }
        });
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
        status: route.status,
        transportJobsAffected: transportJobIds.size,
        effects: effects
      },
      notes: `Soft deleted route ${route.routeNumber || req.params.id}. ${effects.join(' ')}`
    });

    // Cancel associated calendar event
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
          notes: `Auto-cancelled calendar event for soft deleted route ${route.routeNumber || req.params.id}`
        });
      }
    } catch (calendarError) {
      console.error('Error cancelling calendar event for route:', calendarError);
      // Don't fail route deletion if calendar event update fails
    }

    // Soft delete the route (mark as deleted instead of actually deleting)
    const deletionTime = new Date();
    await Route.findByIdAndUpdate(req.params.id, {
      deleted: true,
      deletedAt: deletionTime
    });

    res.status(200).json({
      success: true,
      message: 'Route deleted successfully. Data preserved for reference.',
      effects: effects
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
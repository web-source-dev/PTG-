const Route = require('../models/Route');
const TransportJob = require('../models/TransportJob');
const Truck = require('../models/Truck');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const routeTracker = require('../utils/routeTracker');
const { ROUTE_STATE, TRUCK_STATUS } = require('../constants/status');
const {
  updateStatusOnStopUpdate
} = require('../utils/statusManager');

/**
 * Get all routes for the authenticated driver
 */
exports.getMyRoutes = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, startDate, endDate } = req.query;
    const driverId = req.user._id;

    // Build query - only routes assigned to this driver
    let query = { driverId };

    if (status) {
      // Handle comma-separated status values
      const statusArray = status.split(',').map(s => s.trim());
      if (statusArray.length > 1) {
        query.status = { $in: statusArray };
      } else {
        query.status = status;
      }
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
    console.error('Error fetching driver routes:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch routes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get single route by ID (only if assigned to the driver)
 */
exports.getMyRouteById = async (req, res) => {
  try {
    const driverId = req.user._id;
    const routeId = req.params.id;

    const route = await Route.findOne({ _id: routeId, driverId })
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
        message: 'Route not found or not assigned to you'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        route
      }
    });
  } catch (error) {
    console.error('Error fetching driver route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Start route - Simple endpoint to start a route
 */
exports.startMyRoute = async (req, res) => {
  try {
    const driverId = req.user._id;
    const routeId = req.params.id;

    const route = await Route.findOne({ _id: routeId, driverId });
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found or not assigned to you'
      });
    }

    // Check if route is already in progress
    if (route.status === 'In Progress') {
      return res.status(400).json({
        success: false,
        message: 'Route is already in progress'
      });
    }

    // Check if driver already has an active route
    if (req.user.currentRouteId && req.user.currentRouteId.toString() !== routeId) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active route. Please complete your current route before starting a new one.'
      });
    }

    // Update route status and state
    route.status = 'In Progress';
    route.state = ROUTE_STATE.STARTED;
    route.actualStartDate = new Date();
    route.lastUpdatedBy = req.user._id;

    // Set first pending stop to "In Progress"
    if (route.stops && route.stops.length > 0) {
      const sortedStops = [...route.stops].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      const firstPendingStop = sortedStops.find(s => !s.status || s.status === 'Pending');
      if (firstPendingStop) {
        const stopIndex = route.stops.findIndex(s => {
          const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
          const firstPendingId = firstPendingStop._id ? firstPendingStop._id.toString() : (firstPendingStop.id ? firstPendingStop.id.toString() : null);
          return sId && firstPendingId && sId === firstPendingId;
        });
        if (stopIndex !== -1) {
          route.stops[stopIndex].status = 'In Progress';
        }
      }
    }

    await route.save();

          // Set current route in user model
          await User.findByIdAndUpdate(req.user._id, {
            currentRouteId: routeId
          });

    // Set truck status to "In Use"
          if (route.truckId) {
            await Truck.findByIdAndUpdate(route.truckId, {
              status: TRUCK_STATUS.IN_USE,
              currentDriver: req.user._id
            });
          }

          // Log to audit log
          const startAuditLog = await AuditLog.create({
            action: 'start_route',
            entityType: 'route',
            entityId: routeId,
            userId: req.user._id,
            driverId: req.user._id,
            location: req.body.currentLocation,
            routeId,
            notes: 'Started route'
          });

          // Initialize route tracking
          await routeTracker.initializeTracking(routeId, req.user._id, route.truckId, startAuditLog._id);
          
          // Add location entry for start action if location is provided
          if (req.body.currentLocation) {
            await routeTracker.addLocationEntry(
              routeId,
              req.body.currentLocation.latitude,
              req.body.currentLocation.longitude,
              req.body.currentLocation.accuracy,
              startAuditLog._id
            );
          }

    // Populate and return route
    const populatedRoute = await Route.findById(routeId)
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
 * Stop route - Simple endpoint to stop a route
 */
exports.stopMyRoute = async (req, res) => {
  try {
    const driverId = req.user._id;
    const routeId = req.params.id;

    const route = await Route.findOne({ _id: routeId, driverId });
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found or not assigned to you'
      });
    }

    if (route.status !== 'In Progress') {
      return res.status(400).json({
        success: false,
        message: 'Route is not in progress'
      });
    }

    // Update route state
    route.state = ROUTE_STATE.STOPPED;
    route.lastUpdatedBy = req.user._id;
    await route.save();

    // Log to audit log
          const stopAuditLog = await AuditLog.create({
            action: 'stop_route',
            entityType: 'route',
            entityId: routeId,
            userId: req.user._id,
            driverId: req.user._id,
            location: req.body.currentLocation,
            routeId,
            notes: 'Stopped route'
          });

          // Add action to route tracking
          await routeTracker.addActionEntry(routeId, 'stop_route', req.body.currentLocation, stopAuditLog._id);

    // Populate and return route
    const populatedRoute = await Route.findById(routeId)
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
      message: 'Route stopped successfully',
      data: {
        route: populatedRoute
      }
    });
  } catch (error) {
    console.error('Error stopping route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to stop route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Resume route - Simple endpoint to resume a route
 */
exports.resumeMyRoute = async (req, res) => {
  try {
    const driverId = req.user._id;
    const routeId = req.params.id;

    const route = await Route.findOne({ _id: routeId, driverId });
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found or not assigned to you'
      });
    }

    if (route.status !== 'In Progress' || route.state !== ROUTE_STATE.STOPPED) {
      return res.status(400).json({
        success: false,
        message: 'Route is not stopped'
      });
    }

    // Update route state
    route.state = ROUTE_STATE.RESUMED;
    route.lastUpdatedBy = req.user._id;
    await route.save();

    // Log to audit log
          const resumeAuditLog = await AuditLog.create({
            action: 'resume_route',
            entityType: 'route',
            entityId: routeId,
            userId: req.user._id,
            driverId: req.user._id,
            location: req.body.currentLocation,
            routeId,
            notes: 'Resumed route'
          });

          // Add action to route tracking
          await routeTracker.addActionEntry(routeId, 'resume_route', req.body.currentLocation, resumeAuditLog._id);

    // Populate and return route
    const populatedRoute = await Route.findById(routeId)
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
      message: 'Route resumed successfully',
      data: {
        route: populatedRoute
      }
    });
  } catch (error) {
    console.error('Error resuming route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to resume route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Complete route - Simple endpoint to complete a route (no stop/transport job updates)
 */
exports.completeMyRoute = async (req, res) => {
  try {
    const driverId = req.user._id;
    const routeId = req.params.id;

    const route = await Route.findOne({ _id: routeId, driverId });
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found or not assigned to you'
      });
    }

    if (route.status === 'Completed') {
      return res.status(400).json({
        success: false,
        message: 'Route is already completed'
      });
    }

    // Update route status and state
    route.status = 'Completed';
    route.state = ROUTE_STATE.COMPLETED;
    route.actualEndDate = new Date();
    route.lastUpdatedBy = req.user._id;
    await route.save();

    // Log to audit log
          const completeAuditLog = await AuditLog.create({
            action: 'complete_route',
            entityType: 'route',
            entityId: routeId,
            userId: req.user._id,
            driverId: req.user._id,
            location: req.body.currentLocation,
            routeId,
            notes: 'Completed route'
          });

          // Complete route tracking
          await routeTracker.completeTracking(routeId, completeAuditLog._id);

          // Remove current route from user model
          await User.findByIdAndUpdate(req.user._id, {
            $unset: { currentRouteId: 1 }
          });

    // Set truck status back to "Available"
          if (route.truckId) {
            await Truck.findByIdAndUpdate(route.truckId, {
              status: TRUCK_STATUS.AVAILABLE,
              $unset: { currentDriver: 1 }
            });
          }

    // Populate and return route
    const populatedRoute = await Route.findById(routeId)
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
      message: 'Route completed successfully',
      data: {
        route: populatedRoute
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
 * Update route (driver can only update certain fields like photos, checklist, reports)
 * Simplified - no route actions, no stop status updates
 */
exports.updateMyRoute = async (req, res) => {
  try {
    const driverId = req.user._id;
    const routeId = req.params.id;

    const route = await Route.findOne({ _id: routeId, driverId });
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found or not assigned to you'
      });
    }

    // Drivers can only update specific fields (no status changes, no stop status changes, no photos)
    const allowedFields = [
      'stops', // For updating checklist, notes (but not photos, not status)
      'reports'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // If updating stops, preserve transportJobId and validate (but don't change status)
    if (updateData.stops !== undefined && Array.isArray(updateData.stops)) {
      const originalStops = route.stops || [];
      
      updateData.stops.forEach((stop, index) => {
        if (stop.sequence === undefined) {
          stop.sequence = index + 1;
        }
        
        // Preserve transportJobId from original route for pickup/drop stops
        if ((stop.stopType === 'pickup' || stop.stopType === 'drop') && !stop.transportJobId) {
          const originalStop = originalStops.find(orig => {
            const origId = orig._id ? orig._id.toString() : (orig.id ? orig.id.toString() : null);
            const updatedId = stop._id ? stop._id.toString() : (stop.id ? stop.id.toString() : null);
            if (origId && updatedId && origId === updatedId) return true;
            if (orig.stopType === stop.stopType && orig.sequence === stop.sequence) return true;
            return false;
          });
          
          if (originalStop && originalStop.transportJobId) {
            if (typeof originalStop.transportJobId === 'object' && originalStop.transportJobId !== null) {
              stop.transportJobId = originalStop.transportJobId._id || originalStop.transportJobId.id;
            } else {
              stop.transportJobId = originalStop.transportJobId;
            }
          }
        }

        // Preserve status and photos from original stop (don't allow status or photo changes here)
        const originalStop = originalStops.find(orig => {
          const origId = orig._id ? orig._id.toString() : (orig.id ? orig.id.toString() : null);
          const updatedId = stop._id ? stop._id.toString() : (stop.id ? stop.id.toString() : null);
          return origId && updatedId && origId === updatedId;
        });
        if (originalStop) {
          if (originalStop.status) {
            stop.status = originalStop.status;
          }
          if (originalStop.photos) {
            stop.photos = originalStop.photos;
          }
        }
      });

      const sortedOriginalStops = [...originalStops].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      const sortedUpdatedStops = [...updateData.stops].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

      // Log checklist completions and sync checklist to transport job (photos are handled by dedicated endpoint)
      for (let i = 0; i < sortedUpdatedStops.length; i++) {
        const updatedStop = sortedUpdatedStops[i];
        const originalStop = sortedOriginalStops.find(orig => {
          const origId = orig._id ? orig._id.toString() : (orig.id ? orig.id.toString() : null);
          const updatedId = updatedStop._id ? updatedStop._id.toString() : (updatedStop.id ? updatedStop.id.toString() : null);
          return origId && updatedId && origId === updatedId;
        });

        if (!originalStop) continue;

        // Preserve photos from original stop (don't allow photo updates here)
        if (originalStop.photos) {
          updatedStop.photos = originalStop.photos;
              }

              // Sync checklist to transport job
              if ((updatedStop.stopType === 'pickup' || updatedStop.stopType === 'drop') && updatedStop.transportJobId && updatedStop.checklist) {
                const jobId = typeof updatedStop.transportJobId === 'object'
                  ? (updatedStop.transportJobId._id || updatedStop.transportJobId.id)
                  : updatedStop.transportJobId;

                if (jobId && Array.isArray(updatedStop.checklist)) {
                  const checklistField = updatedStop.stopType === 'pickup' ? 'pickupChecklist' : 'deliveryChecklist';
                  await TransportJob.findByIdAndUpdate(jobId, {
                    [checklistField]: updatedStop.checklist
                  });
          }
        }

        // Log checklist item completions
        if (updatedStop.checklist && Array.isArray(updatedStop.checklist)) {
          const originalChecklist = originalStop.checklist || [];
          for (let j = 0; j < updatedStop.checklist.length; j++) {
            const updatedItem = updatedStop.checklist[j];
            const originalItem = originalChecklist[j];

            const wasChecked = updatedItem && updatedItem.checked;
            const wasOriginallyChecked = originalItem && originalItem.checked;
            const newlyCompleted = wasChecked && !wasOriginallyChecked;

            if (newlyCompleted) {
              await AuditLog.create({
                action: 'complete_checklist_item',
                entityType: 'route',
                entityId: routeId,
                userId: req.user._id,
                driverId: req.user._id,
                location: req.body.currentLocation,
                routeId,
                details: {
                  stopId: updatedStop._id || updatedStop.id,
                  stopType: updatedStop.stopType,
                  checklistItem: updatedItem.item
                },
                notes: `Completed checklist item: ${updatedItem.item}`
              });
            }
          }
        }
      }
    }

    // Log report addition if reports were added
    if (updateData.reports && Array.isArray(updateData.reports)) {
      const originalReportCount = route.reports ? route.reports.length : 0;
      const newReportCount = updateData.reports.length - originalReportCount;

      if (newReportCount > 0) {
        const newReports = updateData.reports.slice(-newReportCount);
        for (const report of newReports) {
          const reportAuditLog = await AuditLog.create({
            action: 'add_report',
            entityType: 'route',
            entityId: routeId,
            userId: req.user._id,
            driverId: req.user._id,
            location: req.body.currentLocation,
            routeId,
            details: {
              reportText: report.report
            },
            notes: `Added report: ${report.report.substring(0, 50)}${report.report.length > 50 ? '...' : ''}`
          });

          await routeTracker.addActionEntry(routeId, 'add_report', req.body.currentLocation, reportAuditLog._id, {
            reportText: report.report
          });
        }
      }
    }

    updateData.lastUpdatedBy = req.user._id;

    // Update route
    const updatedRoute = await Route.findByIdAndUpdate(
      routeId,
      updateData,
      {
        new: true,
        runValidators: true
      }
    )
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

    // Add location entry to route tracking if location is provided and route is active
    if (req.body.currentLocation && route.status === 'In Progress') {
      try {
        const location = req.body.currentLocation;        
        await routeTracker.addLocationEntry(
          routeId,
          location.latitude,
          location.longitude,
          location.accuracy || null,
          null
        );
      } catch (locationError) {
        console.error('❌ Error adding location entry to route tracking:', locationError);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Route updated successfully',
      data: {
        route: updatedRoute
      }
    });
  } catch (error) {
    console.error('Error updating driver route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Complete a specific stop - Updates stop status and related transport job/vehicle statuses
 */
exports.completeMyRouteStop = async (req, res) => {
  try {
    const driverId = req.user._id;
    const routeId = req.params.id;
    const stopId = req.params.stopId;

    const route = await Route.findOne({ _id: routeId, driverId });
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found or not assigned to you'
      });
    }

    const stopIndex = route.stops.findIndex(s => {
      const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
      const stopIdStr = stopId.toString();
      return sId && sId === stopIdStr;
    });

    if (stopIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found'
      });
    }

    const originalStop = route.stops[stopIndex];

    // Update stop with completion data
    if (req.body.checklist !== undefined) {
      route.stops[stopIndex].checklist = req.body.checklist;
    }
    if (req.body.notes !== undefined) {
      route.stops[stopIndex].notes = req.body.notes;
    }
    
    // Handle photos - sync ALL vehicle photos to transport job if provided
    if (req.body.photos !== undefined) {
      route.stops[stopIndex].photos = req.body.photos;
    }

    // Mark stop as completed
    route.stops[stopIndex].status = 'Completed';
    route.stops[stopIndex].actualDate = req.body.actualDate || new Date();
    route.stops[stopIndex].actualTime = req.body.actualTime || new Date();
    route.lastUpdatedBy = req.user._id;

    // Save route first
    await route.save();

    // Sync ALL vehicle photos from stop to transport job if this is a pickup/drop stop
    // Reload route to get the updated stop with all photos
    const updatedRouteForPhotos = await Route.findById(routeId);
    const updatedStopForPhotos = updatedRouteForPhotos.stops[stopIndex];
    
    if ((originalStop.stopType === 'pickup' || originalStop.stopType === 'drop') && originalStop.transportJobId) {
      const jobId = typeof originalStop.transportJobId === 'object'
        ? (originalStop.transportJobId._id || originalStop.transportJobId.id)
        : originalStop.transportJobId;

      if (jobId && updatedStopForPhotos.photos && Array.isArray(updatedStopForPhotos.photos)) {
        // Get ALL vehicle photos from the stop
        const vehiclePhotoUrls = updatedStopForPhotos.photos
          .filter(p => p.photoType === 'vehicle')
          .map(p => p.url);

        // Overwrite transport job photos with all vehicle photos from stop (ensures consistency)
        const updateField = originalStop.stopType === 'pickup' ? 'pickupPhotos' : 'deliveryPhotos';
        await TransportJob.findByIdAndUpdate(jobId, {
          [updateField]: vehiclePhotoUrls // Overwrite with current photos
        });
      }
    }

    // Update transport job and vehicle statuses if this is a pickup/drop stop
    if ((originalStop.stopType === 'pickup' || originalStop.stopType === 'drop') && originalStop.transportJobId) {
      try {
        const transportJobId = typeof originalStop.transportJobId === 'object'
          ? (originalStop.transportJobId._id || originalStop.transportJobId.id)
          : originalStop.transportJobId;

        await updateStatusOnStopUpdate(
          routeId,
          stopIndex,
          'Completed',
          originalStop.stopType,
          transportJobId,
          route.stops
        );
      } catch (stopStatusError) {
        console.error('Failed to update statuses on stop completion:', stopStatusError);
        // Don't fail the stop completion if status updates fail
      }
    }

    // Set next pending stop to "In Progress" if no stop is currently in progress
    const sortedStops = [...route.stops].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    const inProgressStops = sortedStops.filter(s => s.status === 'In Progress');
    
    if (inProgressStops.length === 0) {
      const nextPendingStop = sortedStops.find(s => {
        const status = s.status;
        return !status || status === 'Pending';
      });

      if (nextPendingStop) {
        const nextStopIndex = route.stops.findIndex(s => {
          const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
          const pendingId = nextPendingStop._id ? nextPendingStop._id.toString() : (nextPendingStop.id ? nextPendingStop.id.toString() : null);
          return sId && pendingId && sId === pendingId;
        });

        if (nextStopIndex !== -1) {
          route.stops[nextStopIndex].status = 'In Progress';
          await route.save();
        }
      }
    }

    // Log stop completion
    const stopCompleteAuditLog = await AuditLog.create({
      action: 'mark_stop_completed',
      entityType: 'route',
      entityId: routeId,
      userId: req.user._id,
      driverId: req.user._id,
      location: req.body.currentLocation,
      routeId,
      details: {
        stopId: stopId,
        stopType: originalStop.stopType
      },
      notes: `Marked ${originalStop.stopType} stop as completed`
    });

    await routeTracker.addActionEntry(routeId, 'mark_stop_completed', req.body.currentLocation, stopCompleteAuditLog._id, {
      stopId: stopId,
      stopType: originalStop.stopType
    });

    // Populate and return route
    const populatedRoute = await Route.findById(routeId)
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
 * Skip a specific stop - Marks stop as skipped and updates related transport job/vehicle statuses
 */
exports.skipMyRouteStop = async (req, res) => {
  try {
    const driverId = req.user._id;
    const routeId = req.params.id;
    const stopId = req.params.stopId;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Reason is required for skipping a stop'
      });
    }

    const route = await Route.findOne({ _id: routeId, driverId });
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found or not assigned to you'
      });
    }

    const stopIndex = route.stops.findIndex(s => {
      const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
      const stopIdStr = stopId.toString();
      return sId && sId === stopIdStr;
    });

    if (stopIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found'
      });
    }

    const originalStop = route.stops[stopIndex];

    // Only allow skipping pickup or drop stops
    if (originalStop.stopType !== 'pickup' && originalStop.stopType !== 'drop') {
      return res.status(400).json({
        success: false,
        message: 'Only pickup or drop stops can be skipped'
      });
    }

    // Mark stop as skipped
    route.stops[stopIndex].status = 'Skipped';
    route.stops[stopIndex].actualDate = new Date();
    route.stops[stopIndex].actualTime = new Date();
    route.stops[stopIndex].notes = route.stops[stopIndex].notes 
      ? `${route.stops[stopIndex].notes}\n\nSkipped Reason: ${reason}`
      : `Skipped Reason: ${reason}`;
    route.lastUpdatedBy = req.user._id;

    await route.save();

    // Update transport job and vehicle statuses
    if (originalStop.transportJobId) {
      try {
        const transportJobId = typeof originalStop.transportJobId === 'object'
          ? (originalStop.transportJobId._id || originalStop.transportJobId.id)
          : originalStop.transportJobId;

        // Cancel the transport job
        const transportJob = await TransportJob.findById(transportJobId);
        if (transportJob) {
          transportJob.status = 'Cancelled';
          await transportJob.save();

          // Update vehicle status
          if (transportJob.vehicleId) {
            const Vehicle = require('../models/Vehicle');
            const { calculateVehicleStatusFromJobs, updateVehicleTransportJobsHistory } = require('../utils/statusManager');
            const newVehicleStatus = await calculateVehicleStatusFromJobs(transportJob.vehicleId);
            await Vehicle.findByIdAndUpdate(transportJob.vehicleId, {
              status: newVehicleStatus
            });
            await updateVehicleTransportJobsHistory(transportJobId, 'Cancelled');
          }
        }
      } catch (statusError) {
        console.error('Failed to update statuses on stop skip:', statusError);
        // Don't fail the stop skip if status updates fail
      }
    }

    // Set next pending stop to "In Progress" if no stop is currently in progress
    const sortedStops = [...route.stops].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    const inProgressStops = sortedStops.filter(s => s.status === 'In Progress');
    
    if (inProgressStops.length === 0) {
      const nextPendingStop = sortedStops.find(s => {
        const status = s.status;
        return !status || status === 'Pending';
      });

      if (nextPendingStop) {
        const nextStopIndex = route.stops.findIndex(s => {
          const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
          const pendingId = nextPendingStop._id ? nextPendingStop._id.toString() : (nextPendingStop.id ? nextPendingStop.id.toString() : null);
          return sId && pendingId && sId === pendingId;
        });

        if (nextStopIndex !== -1) {
          route.stops[nextStopIndex].status = 'In Progress';
          await route.save();
        }
      }
    }

    // Log stop skip
    await AuditLog.create({
      action: 'mark_stop_not_delivered',
      entityType: 'route',
      entityId: routeId,
      userId: req.user._id,
      driverId: req.user._id,
      location: req.body.currentLocation,
          routeId,
      details: {
        stopId: stopId,
        stopType: originalStop.stopType,
        reason: reason
      },
      notes: `Skipped ${originalStop.stopType} stop: ${reason}`
    });

    // Populate and return route
    const populatedRoute = await Route.findById(routeId)
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
      message: 'Stop skipped successfully',
      data: {
        route: populatedRoute
      }
    });
  } catch (error) {
    console.error('Error skipping stop:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to skip stop',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Upload photos to a specific stop - Instantly saves photos and syncs to transport job
 */
exports.uploadStopPhotos = async (req, res) => {
  try {
    const driverId = req.user._id;
    const routeId = req.params.id;
    const stopId = req.params.stopId;
    const { photos, photoType = 'stop' } = req.body;

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Photos array is required'
      });
    }

    const route = await Route.findOne({ _id: routeId, driverId });
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found or not assigned to you'
      });
    }

    const stopIndex = route.stops.findIndex(s => {
      const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
      const stopIdStr = stopId.toString();
      return sId && sId === stopIdStr;
    });

    if (stopIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found'
      });
    }

    const originalStop = route.stops[stopIndex];
    const originalPhotoCount = originalStop.photos ? originalStop.photos.length : 0;

    // Add new photos to stop
    const newPhotos = photos.map(photo => ({
      url: photo.url,
      timestamp: photo.timestamp || new Date(),
      location: photo.location || req.body.currentLocation,
      notes: photo.notes,
      photoType: photo.photoType || photoType,
      photoCategory: photo.photoCategory
    }));

    route.stops[stopIndex].photos = [
      ...(originalStop.photos || []),
      ...newPhotos
    ];
    route.lastUpdatedBy = req.user._id;
    await route.save();

    // Log photo uploads
    const vehiclePhotos = newPhotos.filter(p => p.photoType === 'vehicle').length;
    const stopPhotos = newPhotos.filter(p => p.photoType !== 'vehicle').length;

    if (vehiclePhotos > 0) {
      const vehiclePhotoAuditLog = await AuditLog.create({
        action: 'upload_vehicle_photo',
        entityType: 'route',
        entityId: routeId,
        userId: req.user._id,
        driverId: req.user._id,
        location: req.body.currentLocation,
              routeId,
        details: {
          stopId: stopId,
          stopType: originalStop.stopType,
          photoCount: vehiclePhotos
        },
        notes: `Uploaded ${vehiclePhotos} vehicle photo(s) for ${originalStop.stopType} stop`
      });

      await routeTracker.addActionEntry(routeId, 'upload_vehicle_photo', req.body.currentLocation, vehiclePhotoAuditLog._id, {
        stopId: stopId,
        stopType: originalStop.stopType,
        photoCount: vehiclePhotos
      });
    }

    if (stopPhotos > 0) {
      const stopPhotoAuditLog = await AuditLog.create({
        action: 'upload_stop_photo',
        entityType: 'route',
        entityId: routeId,
        userId: req.user._id,
        driverId: req.user._id,
        location: req.body.currentLocation,
        routeId,
        details: {
          stopId: stopId,
          stopType: originalStop.stopType,
          photoCount: stopPhotos
        },
        notes: `Uploaded ${stopPhotos} stop photo(s) for ${originalStop.stopType} stop`
      });

      await routeTracker.addActionEntry(routeId, 'upload_stop_photo', req.body.currentLocation, stopPhotoAuditLog._id, {
        stopId: stopId,
        stopType: originalStop.stopType,
        photoCount: stopPhotos
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
        // Get ALL vehicle photos from the stop (not just new ones)
        const vehiclePhotoUrls = updatedStop.photos
          .filter(p => p.photoType === 'vehicle')
          .map(p => p.url);

        // Overwrite transport job photos with all vehicle photos from stop (ensures consistency)
        const updateField = originalStop.stopType === 'pickup' ? 'pickupPhotos' : 'deliveryPhotos';
        await TransportJob.findByIdAndUpdate(jobId, {
          [updateField]: vehiclePhotoUrls // Overwrite with current photos
        });
      }
    }

    // Populate and return route
    const populatedRoute = await Route.findById(routeId)
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
 * Remove photo from a specific stop
 */
exports.removeStopPhoto = async (req, res) => {
  try {
    const driverId = req.user._id;
    const routeId = req.params.id;
    const stopId = req.params.stopId;
    const { photoIndex } = req.body;

    if (photoIndex === undefined || photoIndex === null) {
      return res.status(400).json({
        success: false,
        message: 'Photo index is required'
      });
    }

    const route = await Route.findOne({ _id: routeId, driverId });
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found or not assigned to you'
      });
    }

    const stopIndex = route.stops.findIndex(s => {
      const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
      const stopIdStr = stopId.toString();
      return sId && sId === stopIdStr;
    });

    if (stopIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found'
      });
    }

    const stop = route.stops[stopIndex];
    if (!stop.photos || stop.photos.length <= photoIndex) {
      return res.status(400).json({
        success: false,
        message: 'Photo index out of range'
      });
    }

    // Remove photo from stop
    route.stops[stopIndex].photos = stop.photos.filter((_, idx) => idx !== photoIndex);
    route.lastUpdatedBy = req.user._id;
    await route.save();

    // Sync ALL vehicle photos from stop to transport job if this is a pickup/drop stop
    // Reload route to get the updated stop with all photos
    const updatedRouteForRemoval = await Route.findById(routeId);
    const updatedStopForRemoval = updatedRouteForRemoval.stops[stopIndex];
    
    if ((stop.stopType === 'pickup' || stop.stopType === 'drop') && stop.transportJobId) {
      const jobId = typeof stop.transportJobId === 'object'
        ? (stop.transportJobId._id || stop.transportJobId.id)
        : stop.transportJobId;

      if (jobId && updatedStopForRemoval.photos && Array.isArray(updatedStopForRemoval.photos)) {
        // Get ALL vehicle photos from the stop after removal
        const vehiclePhotoUrls = updatedStopForRemoval.photos
          .filter(p => p.photoType === 'vehicle')
          .map(p => p.url);

        // Overwrite transport job photos with all vehicle photos from stop (ensures consistency)
        const updateField = stop.stopType === 'pickup' ? 'pickupPhotos' : 'deliveryPhotos';
        await TransportJob.findByIdAndUpdate(jobId, {
          [updateField]: vehiclePhotoUrls // Overwrite with current photos
        });
      }
    }

    // Populate and return route
    const populatedRoute = await Route.findById(routeId)
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
 * Update a specific stop (for checklist, notes - but NOT photos, NOT status)
 * Photos should be uploaded via dedicated uploadStopPhotos endpoint
 */
exports.updateMyRouteStop = async (req, res) => {
  try {
    const driverId = req.user._id;
    const routeId = req.params.id;
    const stopId = req.params.stopId;

    const route = await Route.findOne({ _id: routeId, driverId });
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found or not assigned to you'
      });
    }

    const stopIndex = route.stops.findIndex(s => {
      const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
      const stopIdStr = stopId.toString();
      return sId && sId === stopIdStr;
    });

    if (stopIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found'
      });
    }

    const originalStop = route.stops[stopIndex];

    // Drivers can only update specific stop fields (NOT photos, NOT status)
    const allowedFields = [
      'notes',
      'checklist'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        route.stops[stopIndex][field] = req.body[field];
      }
    });

    // Preserve photos from original stop (don't allow photo updates here)
    if (originalStop.photos) {
      route.stops[stopIndex].photos = originalStop.photos;
    }

    route.lastUpdatedBy = req.user._id;
    await route.save();

    // Populate and return route
    const populatedRoute = await Route.findById(routeId)
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
      message: 'Stop updated successfully',
      data: {
        route: populatedRoute
      }
    });
  } catch (error) {
    console.error('Error updating driver route stop:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update stop',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
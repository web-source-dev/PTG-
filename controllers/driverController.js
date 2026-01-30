const Route = require('../models/Route');
const TransportJob = require('../models/TransportJob');
const Truck = require('../models/Truck');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const routeTracker = require('../utils/routeTracker');
const { ROUTE_STATE, TRUCK_STATUS } = require('../constants/status');
const {
  updateStatusOnRouteStatusChange,
  updateStatusOnStopUpdate,
  updateTransportJobRouteReferences
} = require('../utils/statusManager');

// Helper function to determine route action from status change
const getRouteActionFromStatus = (newStatus, oldStatus) => {
  if (newStatus === 'In Progress' && oldStatus === 'Planned') {
    return 'start_route';
  } else if (newStatus === 'Planned' && oldStatus === 'In Progress') {
    return 'stop_route';
  } else if (newStatus === 'In Progress' && oldStatus === 'Planned') {
    return 'resume_route';
  } else if (newStatus === 'Completed') {
    return 'complete_route';
  }
  return 'status_change';
};

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
 * Update route (driver can only update certain fields like status, actual dates, stop status, photos)
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

    // Check if driver already has an active route
    if (req.user.currentRouteId && req.user.currentRouteId.toString() !== routeId) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active route. Please complete your current route before starting a new one.'
      });
    }

    // Drivers can only update specific fields
    const allowedFields = [
      'status',
      'actualStartDate',
      'actualEndDate',
      'stops', // For updating stop status, photos, actual dates, checklist
      'reports'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Handle route state changes based on action
    const action = req.body.action;

    if (action) {
      switch (action) {
        case 'start_route':
          updateData.status = 'In Progress';
          updateData.state = ROUTE_STATE.STARTED;
          updateData.actualStartDate = new Date();

          // Set current route in user model
          await User.findByIdAndUpdate(req.user._id, {
            currentRouteId: routeId
          });

          // Set truck status to "In Use" when route starts
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
          break;
        case 'stop_route':
          updateData.state = ROUTE_STATE.STOPPED;
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
          break;
        case 'resume_route':
          updateData.state = ROUTE_STATE.RESUMED;
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
          break;
        case 'complete_route':
          updateData.status = 'Completed';
          updateData.state = ROUTE_STATE.COMPLETED;
          updateData.actualEndDate = new Date();

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

          // Set truck status back to "Available" when route is completed
          if (route.truckId) {
            await Truck.findByIdAndUpdate(route.truckId, {
              status: TRUCK_STATUS.AVAILABLE,
              $unset: { currentDriver: 1 }
            });
          }
          break;
      }
    }

    // If route status is changing to "In Progress", automatically set first stop to "In Progress"
    if (updateData.status === 'In Progress' && route.status !== 'In Progress') {
      if (route.stops && route.stops.length > 0) {
        // Sort stops by sequence
        const sortedStops = [...route.stops].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        // Find first pending stop and set it to "In Progress"
        const firstPendingStop = sortedStops.find(s => !s.status || s.status === 'Pending');
        if (firstPendingStop) {
          // Update the stops array
          if (!updateData.stops) {
            updateData.stops = route.stops.map(s => {
              if (s._id && s._id.toString() === firstPendingStop._id.toString()) {
                const stopObj = s.toObject ? s.toObject() : s;
                return { ...stopObj, status: 'In Progress' };
              }
              return s.toObject ? s.toObject() : s;
            });
          } else {
            // If stops are being updated, find and update the first pending one
            updateData.stops = updateData.stops.map(s => {
              const stopId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
              const firstPendingId = firstPendingStop._id ? firstPendingStop._id.toString() : (firstPendingStop.id ? firstPendingStop.id.toString() : null);
              if (stopId && firstPendingId && stopId === firstPendingId) {
                return { ...s, status: 'In Progress' };
              }
              return s;
            });
          }
        }
      }
    }

    // If updating stops, ensure sequence is maintained and validate
    if (updateData.stops !== undefined && Array.isArray(updateData.stops)) {
      updateData.stops.forEach((stop, index) => {
        if (stop.sequence === undefined) {
          stop.sequence = index + 1;
        }
      });

      // Check if any stop was marked as completed, and if so, set the next pending stop to "In Progress"
      // Compare with original route stops to detect changes
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

      // Log photo uploads, checklist completions, and stop completions
      for (let i = 0; i < sortedUpdatedStops.length; i++) {
        const updatedStop = sortedUpdatedStops[i];
        const originalStop = sortedOriginalStops.find(orig => {
          const origId = orig._id ? orig._id.toString() : (orig.id ? orig.id.toString() : null);
          const updatedId = updatedStop._id ? updatedStop._id.toString() : (updatedStop.id ? updatedStop.id.toString() : null);
          return origId && updatedId && origId === updatedId;
        });

        if (!originalStop) continue;

        // Log photo uploads
        if (updatedStop.photos && Array.isArray(updatedStop.photos)) {
          const originalPhotoCount = originalStop.photos ? originalStop.photos.length : 0;
          const newPhotoCount = updatedStop.photos.length - originalPhotoCount;

          if (newPhotoCount > 0) {
            const newPhotos = updatedStop.photos.slice(-newPhotoCount);
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
                  stopId: updatedStop._id || updatedStop.id,
                  stopType: updatedStop.stopType,
                  photoCount: vehiclePhotos
                },
                notes: `Uploaded ${vehiclePhotos} vehicle photo(s) for ${updatedStop.stopType} stop`
              });

              // Add to route tracking
              await routeTracker.addActionEntry(routeId, 'upload_vehicle_photo', req.body.currentLocation, vehiclePhotoAuditLog._id, {
                stopId: updatedStop._id || updatedStop.id,
                stopType: updatedStop.stopType,
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
                  stopId: updatedStop._id || updatedStop.id,
                  stopType: updatedStop.stopType,
                  photoCount: stopPhotos
                },
                notes: `Uploaded ${stopPhotos} stop photo(s) for ${updatedStop.stopType} stop`
              });

              // Add to route tracking
              await routeTracker.addActionEntry(routeId, 'upload_stop_photo', req.body.currentLocation, stopPhotoAuditLog._id, {
                stopId: updatedStop._id || updatedStop.id,
                stopType: updatedStop.stopType,
                photoCount: stopPhotos
              });
            }

              // Sync photos to transport job
              if ((updatedStop.stopType === 'pickup' || updatedStop.stopType === 'drop') && updatedStop.transportJobId) {
                const jobId = typeof updatedStop.transportJobId === 'object'
                  ? (updatedStop.transportJobId._id || updatedStop.transportJobId.id)
                  : updatedStop.transportJobId;

                if (jobId) {
                  const newPhotos = updatedStop.photos.slice(-newPhotoCount);
                  const photoUrls = newPhotos
                    .filter(p => p.photoType === 'vehicle')
                    .map(p => p.url);

                  if (photoUrls.length > 0) {
                    const updateField = updatedStop.stopType === 'pickup' ? 'pickupPhotos' : 'deliveryPhotos';
                    await TransportJob.findByIdAndUpdate(jobId, {
                      $push: { [updateField]: { $each: photoUrls } }
                    });
                  }
                }
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

        // Log stop completion
        if (updatedStop.status === 'Completed' && originalStop.status !== 'Completed') {
          const stopCompleteAuditLog = await AuditLog.create({
            action: 'mark_stop_completed',
            entityType: 'route',
            entityId: routeId,
            userId: req.user._id,
            driverId: req.user._id,
            location: req.body.currentLocation,
            routeId,
            details: {
              stopId: updatedStop._id || updatedStop.id,
              stopType: updatedStop.stopType
            },
            notes: `Marked ${updatedStop.stopType} stop as completed`
          });

          // Add to route tracking
          await routeTracker.addActionEntry(routeId, 'mark_stop_completed', req.body.currentLocation, stopCompleteAuditLog._id, {
            stopId: updatedStop._id || updatedStop.id,
            stopType: updatedStop.stopType
          });
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

          // Add to route tracking
          await routeTracker.addActionEntry(routeId, 'add_report', req.body.currentLocation, reportAuditLog._id, {
            reportText: report.report
          });
        }
      }
    }

    updateData.lastUpdatedBy = req.user._id;

    // Check route status before update to determine if tracking should be active
    const routeStatusBeforeUpdate = route.status;
    const willBeInProgress = updateData.status === 'In Progress' || (routeStatusBeforeUpdate === 'In Progress' && !updateData.status);

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


    // Handle route state/status changes after save
    let needsSave = false;

    // Record state change in route status history
    if (updateData.state && updateData.state !== route.state) {
      const stateHistoryEntry = {
        status: route.status, // Keep current status
        timestamp: new Date(),
        action: action || `state_${updateData.state.toLowerCase()}`,
        location: updateData.currentLocation || null,
        notes: `State changed to ${updateData.state}`
      };

      needsSave = true;
    }

    // Handle route status change after save
    if (updateData.status && updateData.status !== route.status) {

      // Record route status history with location
      const statusHistoryEntry = {
        status: updateData.status,
        timestamp: new Date(),
        action: getRouteActionFromStatus(updateData.status, route.status),
        location: updateData.currentLocation || null,
        notes: updateData.statusNotes || null
      };

      needsSave = true;

      // Update all related statuses (transport jobs, vehicles) when route status changes
      try {
        await updateStatusOnRouteStatusChange(routeId, updateData.status, route.status);
      } catch (statusError) {
        console.error('Failed to update statuses on route status change:', statusError);
        // Don't fail the route update if status updates fail
      }

      // If route is being completed, update all related entities
      if (updateData.status === 'Completed') {
        try {
          const { updateDriverStats, updateAllRelatedEntities } = require('../utils/statusManager');
          await updateDriverStats(routeId, driverId);
          await updateAllRelatedEntities(routeId);
        } catch (statsError) {
          console.error('Failed to update entities on route completion:', statsError);
          // Don't fail the route update if entity updates fail
        }
      }
    }

    if (needsSave) {
      await updatedRoute.save();
    }

    // Add location entry to route tracking if location is provided and route is/will be active
    // This captures location for general route updates (not just actions)
    // Check both the updated route status and if it will be in progress
    const routeIsActive = (updatedRoute && updatedRoute.status === 'In Progress') || willBeInProgress;
    
    if (req.body.currentLocation && routeIsActive) {
      try {
        const location = req.body.currentLocation;
        console.log(`📍 Attempting to add location entry to route tracking for route ${routeId}:`, {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          routeStatus: updatedRoute?.status,
          willBeInProgress: willBeInProgress
        });
        
        await routeTracker.addLocationEntry(
          routeId,
          location.latitude,
          location.longitude,
          location.accuracy || null,
          null // No specific audit log for general location updates
        );
        console.log(`✅ Successfully added location entry to route tracking for route ${routeId}`);
      } catch (locationError) {
        console.error('❌ Error adding location entry to route tracking:', locationError);
        // Don't fail the route update if location tracking fails
      }
    } else {
      if (req.body.currentLocation) {
        console.log(`⚠️ Location provided but not added to tracking:`, {
          hasLocation: !!req.body.currentLocation,
          routeStatus: updatedRoute?.status,
          routeExists: !!updatedRoute,
          willBeInProgress: willBeInProgress,
          routeIsActive: routeIsActive
        });
      }
    }

    // Handle stop updates after save - update transport job route references and statuses
    if (updateData.stops && Array.isArray(updateData.stops)) {
      // Update transport job route references (pickupRouteId and dropRouteId) when stops change
      // This handles cases where stops are removed or modified
      try {
        await updateTransportJobRouteReferences(routeId, updateData.stops);
      } catch (routeRefError) {
        console.error('Failed to update transport job route references:', routeRefError);
        // Don't fail the route update if route reference updates fail
      }
      const originalStops = route.stops || [];
      for (let index = 0; index < updateData.stops.length; index++) {
        const updatedStop = updateData.stops[index];
        const originalStop = originalStops.find(s => {
          const origId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
          const updatedId = updatedStop._id ? updatedStop._id.toString() : (updatedStop.id ? updatedStop.id.toString() : null);
          return origId && updatedId && origId === updatedId;
        });

        if (originalStop && updatedStop.status && updatedStop.status !== originalStop.status) {
          // Update statuses when stop status changes (especially when completed)
          try {
            const stopType = updatedStop.stopType || originalStop.stopType;
            const transportJobId = updatedStop.transportJobId || originalStop.transportJobId;
            await updateStatusOnStopUpdate(
              routeId,
              index,
              updatedStop.status,
              stopType,
              transportJobId,
              route.stops // Pass the current route stops (they should already be updated)
            );
          } catch (stopStatusError) {
            console.error('Failed to update statuses on stop update:', stopStatusError);
            // Don't fail the route update if stop status updates fail
          }
        }
      }
    }

    // Reload route to get updated statuses
    const finalRoute = await Route.findById(routeId)
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
        route: finalRoute || updatedRoute
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
 * Update a specific stop (for adding photos, updating status, actual dates)
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

    const stopIndex = route.stops.findIndex(s => 
      (s._id && s._id.toString() === stopId) || 
      (s._id === stopId)
    );

    if (stopIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found'
      });
    }

    // Drivers can only update specific stop fields
    const allowedFields = [
      'status',
      'actualDate',
      'actualTime',
      'photos',
      'notes',
      'checklist'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        route.stops[stopIndex][field] = req.body[field];
      }
    });

    route.lastUpdatedBy = req.user._id;
    await route.save();

    // Update statuses based on stop update (after save)
    const originalStop = route.stops[stopIndex];
    const newStopStatus = req.body.status;
    if (newStopStatus && newStopStatus !== originalStop.status) {
      // Update statuses when stop status changes (especially when completed)
      try {
        const stopType = originalStop.stopType;
        const transportJobId = originalStop.transportJobId;
        // For this endpoint, we need to create updated stops with the new status
        const updatedStops = route.stops.map((stop, idx) => {
          if (idx === stopIndex) {
            return { ...stop, status: newStopStatus };
          }
          return stop;
        });
        await updateStatusOnStopUpdate(
          routeId,
          stopIndex,
          newStopStatus,
          stopType,
          transportJobId,
          updatedStops
        );
      } catch (stopStatusError) {
        console.error('Failed to update statuses on stop update:', stopStatusError);
        // Don't fail the route update if stop status updates fail
      }
    }

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
      message: 'Stop updated successfully',
      data: {
        route: updatedRoute
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
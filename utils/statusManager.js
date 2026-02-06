/**
 * Status Management Utility
 * 
 * This utility handles automatic status updates across Vehicle, TransportJob, Route, and Truck models
 * to ensure status consistency throughout the application lifecycle.
 */

const Vehicle = require('../models/Vehicle');
const TransportJob = require('../models/TransportJob');
const Route = require('../models/Route');
const Truck = require('../models/Truck');
const User = require('../models/User');
const Expense = require('../models/Expense');
const {
  VEHICLE_STATUS,
  TRANSPORT_JOB_STATUS,
  ROUTE_STATUS,
  TRUCK_STATUS,
  ROUTE_STOP_STATUS
} = require('../constants/status');

/**
 * Helper function to create automatic maintenance expense for a completed route
 * This is called when a route is completed to create an expense based on truck maintenance rate
 */
const createMaintenanceExpenseForRoute = async (routeId) => {
  try {
    // Get the route with populated truck and driver
    const route = await Route.findById(routeId)
      .populate('truckId')
      .populate('driverId');

    if (!route || !route.truckId || !route.driverId) {
      return; // Can't create expense without route, truck, or driver
    }

    // Get fresh truck data to ensure we have the latest maintenanceRate
    const truck = await Truck.findById(route.truckId._id || route.truckId);
    
    if (!truck || !truck.maintenanceRate || truck.maintenanceRate <= 0) {
      return; // No maintenance rate set, skip expense creation
    }

    // Calculate miles from actualDistanceTraveled (in miles) or from totalDistance (now also in miles)
    let miles = 0;
    if (route.actualDistanceTraveled && route.actualDistanceTraveled > 0) {
      miles = route.actualDistanceTraveled;
    } else if (route.totalDistance && route.totalDistance.value) {
      // totalDistance.value is now stored in miles
      miles = route.totalDistance.value;
    }

    // Only create expense if we have valid miles
    if (miles <= 0) {
      return; // No distance traveled, skip expense creation
    }

    const maintenanceCost = truck.maintenanceRate * miles;
    
    // Get driver ID
    const driverId = typeof route.driverId === 'object' 
      ? (route.driverId._id || route.driverId.id) 
      : route.driverId;
    
    // Get truck ID
    const truckId = typeof route.truckId === 'object' 
      ? (route.truckId._id || route.truckId.id) 
      : route.truckId;

    // Check if expense already exists for this route (to avoid duplicates)
    const existingExpense = await Expense.findOne({
      routeId: route._id,
      type: 'maintenance',
      maintenanceRate: truck.maintenanceRate,
      miles: miles
    });

    if (existingExpense) {
      return; // Expense already created, skip
    }

    // Create maintenance expense
    const maintenanceExpense = await Expense.create({
      type: 'maintenance',
      category: 'service',
      description: `Automatic maintenance expense for route ${route.routeNumber || routeId} - ${miles.toFixed(2)} miles at $${truck.maintenanceRate.toFixed(2)}/mile`,
      totalCost: maintenanceCost,
      maintenanceRate: truck.maintenanceRate, // Store the rate used at the time
      miles: miles, // Store the miles used for calculation
      routeId: route._id,
      driverId: driverId,
      truckId: truckId,
      createdBy: driverId
    });


  } catch (error) {
    console.error('Error creating automatic maintenance expense for route:', error);
    throw error;
  }
};

/**
 * Update vehicle status when vehicle is created/submitted
 */
const updateVehicleOnCreate = async (vehicleId) => {
  try {
    await Vehicle.findByIdAndUpdate(vehicleId, {
      status: VEHICLE_STATUS.INTAKE_COMPLETE // This maps to 'Intake Completed'
    });
  } catch (error) {
    console.error('Error updating vehicle status on create:', error);
  }
};

/**
 * Update vehicle and transport job status when transport job is created
 */
/**
 * Calculate vehicle status based on all its transport jobs
 * Status priority (highest to lowest):
 * 1. "In Transport" - if any job is in transit
 * 2. "Ready for Transport" - if any job needs dispatch or is dispatched
 * 3. "Delivered" - if all jobs are delivered
 * 4. "Cancelled" - if all jobs are cancelled
 * 5. "Intake Completed" - if no active jobs
 */
const calculateVehicleStatusFromJobs = async (vehicleId) => {
  try {
    // Get all transport jobs for this vehicle
    const transportJobs = await TransportJob.find({ vehicleId }).select('status');

    if (transportJobs.length === 0) {
      return VEHICLE_STATUS.INTAKE_COMPLETED;
    }

    // Check status priority
    const hasInTransit = transportJobs.some(job => job.status === TRANSPORT_JOB_STATUS.IN_TRANSIT);
    if (hasInTransit) {
      return VEHICLE_STATUS.IN_TRANSPORT;
    }

    const hasReadyOrDispatched = transportJobs.some(job =>
      job.status === TRANSPORT_JOB_STATUS.NEEDS_DISPATCH ||
      job.status === TRANSPORT_JOB_STATUS.DISPATCHED
    );
    if (hasReadyOrDispatched) {
      return VEHICLE_STATUS.READY_FOR_TRANSPORT;
    }

    const hasActiveJobs = transportJobs.some(job =>
      job.status !== TRANSPORT_JOB_STATUS.DELIVERED &&
      job.status !== TRANSPORT_JOB_STATUS.CANCELLED
    );
    if (!hasActiveJobs) {
      // All jobs are either delivered or cancelled
      const allDelivered = transportJobs.every(job => job.status === TRANSPORT_JOB_STATUS.DELIVERED);
      const allCancelled = transportJobs.every(job => job.status === TRANSPORT_JOB_STATUS.CANCELLED);

      if (allDelivered) {
        return VEHICLE_STATUS.DELIVERED;
      } else if (allCancelled) {
        return VEHICLE_STATUS.CANCELLED;
      } else {
        // Mixed delivered/cancelled - keep as delivered for now
        return VEHICLE_STATUS.DELIVERED;
      }
    }

    // Default fallback
    return VEHICLE_STATUS.READY_FOR_TRANSPORT;
  } catch (error) {
    console.error('Error calculating vehicle status from jobs:', error);
    return VEHICLE_STATUS.INTAKE_COMPLETED;
  }
};

const updateStatusOnTransportJobCreate = async (transportJobId, vehicleId) => {
  try {
    // Set default status for transport job
    const jobStatus = TRANSPORT_JOB_STATUS.NEEDS_DISPATCH;

    // Update transport job status
    await TransportJob.findByIdAndUpdate(transportJobId, {
      status: jobStatus
    });

    // Update vehicle status based on all its transport jobs
    if (vehicleId) {
      const newVehicleStatus = await calculateVehicleStatusFromJobs(vehicleId);
      await Vehicle.findByIdAndUpdate(vehicleId, {
        status: newVehicleStatus,
        currentTransportJobId: transportJobId // Set this as the current active job
      });
    }
  } catch (error) {
    console.error('Error updating status on transport job create:', error);
  }
};

/**
 * Helper function to map TransportJob status to vehicle transportJobs array status
 */
const mapTransportJobStatusToVehicleHistoryStatus = (transportJobStatus) => {
  const statusMap = {
    [TRANSPORT_JOB_STATUS.NEEDS_DISPATCH]: 'pending',
    [TRANSPORT_JOB_STATUS.DISPATCHED]: 'pending',
    [TRANSPORT_JOB_STATUS.IN_TRANSIT]: 'in_progress',
    [TRANSPORT_JOB_STATUS.DELIVERED]: 'completed',
    [TRANSPORT_JOB_STATUS.CANCELLED]: 'cancelled'
  };
  return statusMap[transportJobStatus] || 'pending';
};

/**
 * Update vehicle's transportJobs array when transport job status changes
 */
const updateVehicleTransportJobsHistory = async (transportJobId, newStatus) => {
  try {
    // Get the transport job to find the vehicle
    const transportJob = await TransportJob.findById(transportJobId).select('vehicleId status');
    if (!transportJob || !transportJob.vehicleId) {
      return;
    }

    const vehicleId = transportJob.vehicleId._id || transportJob.vehicleId;
    const mappedStatus = mapTransportJobStatusToVehicleHistoryStatus(newStatus || transportJob.status);

    // Convert transportJobId to ObjectId for proper comparison
    const mongoose = require('mongoose');
    const jobObjectId = typeof transportJobId === 'string' 
      ? new mongoose.Types.ObjectId(transportJobId)
      : transportJobId;

    // Update the vehicle's transportJobs array
    // Find the entry with matching transportJobId and update its status
    await Vehicle.findByIdAndUpdate(
      vehicleId,
      {
        $set: {
          'transportJobs.$[elem].status': mappedStatus
        }
      },
      {
        arrayFilters: [
          { 'elem.transportJobId': jobObjectId }
        ]
      }
    );

  } catch (error) {
    console.error('Error updating vehicle transportJobs history:', error);
    // Don't throw - this is a non-critical update
  }
};

/**
 * Update vehicle status when a transport job status changes
 */
const updateStatusOnTransportJobStatusChange = async (transportJobId) => {
  try {
    // Get the transport job to find the vehicle
    const transportJob = await TransportJob.findById(transportJobId).select('vehicleId status');
    if (!transportJob || !transportJob.vehicleId) {
      return;
    }

    // Update vehicle's transportJobs history array
    await updateVehicleTransportJobsHistory(transportJobId, transportJob.status);

    // Calculate and update vehicle status
    const newVehicleStatus = await calculateVehicleStatusFromJobs(transportJob.vehicleId);
    await Vehicle.findByIdAndUpdate(transportJob.vehicleId, {
      status: newVehicleStatus
    });
  } catch (error) {
    console.error('Error updating status on transport job status change:', error);
  }
};

/**
 * Update statuses when route is created
 * NOTE: Only sets route status to "Planned". Does NOT update truck, transport jobs, or vehicles.
 * Those are updated when stops are saved (updateStatusOnStopsSetup) and when route starts (updateStatusOnRouteStatusChange).
 */
const updateStatusOnRouteCreate = async (routeId, selectedTransportJobs, truckId) => {
  try {
    // Update route status to "Planned" (default, but ensure it's set)
    const route = await Route.findById(routeId);
    if (route && route.status !== ROUTE_STATUS.PLANNED) {
      route.status = ROUTE_STATUS.PLANNED;
      await route.save();
    }

    // DO NOT update transport jobs, vehicles, or truck status here
    // Transport jobs and vehicles are updated when stops are saved (updateStatusOnStopsSetup)
    // Truck is updated when route starts (updateStatusOnRouteStatusChange)
  } catch (error) {
    console.error('Error updating status on route create:', error);
  }
};

/**
 * Update statuses when stops are saved (stops setup)
 * This is called when transport jobs are added to route stops and saved
 * @param {string} routeId - The route ID
 * @param {Array} stops - Optional: The stops array to use (if not provided, will read from database)
 */
const updateStatusOnStopsSetup = async (routeId, stops = null) => {
  try {
    const route = await Route.findById(routeId);
    if (!route) return;

    // Use provided stops or read from route
    const stopsToProcess = stops || route.stops;

    // Get all transport jobs from stops
    const transportJobIds = new Set();
    
    if (stopsToProcess && Array.isArray(stopsToProcess)) {
      stopsToProcess.forEach(stop => {
        if (stop.transportJobId) {
          const jobId = typeof stop.transportJobId === 'object' 
            ? (stop.transportJobId._id || stop.transportJobId.id) 
            : stop.transportJobId;
          if (jobId) transportJobIds.add(jobId.toString());
        }
      });
    }

    // Also get from selectedTransportJobs if available
    if (route.selectedTransportJobs && Array.isArray(route.selectedTransportJobs)) {
      route.selectedTransportJobs.forEach(job => {
        const jobId = typeof job === 'object' ? (job._id || job.id) : job;
        if (jobId) transportJobIds.add(jobId.toString());
      });
    }

    // Update transport jobs and vehicles statuses intelligently
    // Only update if status can be upgraded, not downgraded
    // This prevents downgrading statuses when adding drop stops to a new route after pickup is completed
    for (const jobId of transportJobIds) {
      // Get current transport job status
      const job = await TransportJob.findById(jobId).populate('vehicleId');
      if (!job) continue;

      // Check what stop types are being added in THIS route for this job
      const stopsForThisJob = stopsToProcess.filter(stop => {
        const stopJobId = typeof stop.transportJobId === 'object' 
          ? (stop.transportJobId._id || stop.transportJobId.id) 
          : stop.transportJobId;
        return stopJobId && stopJobId.toString() === jobId.toString();
      });

      const hasPickupStop = stopsForThisJob.some(s => s.stopType === 'pickup');
      const hasDropStop = stopsForThisJob.some(s => s.stopType === 'drop');

      // Only update transport job status if it can be upgraded
      // Don't downgrade from "In Transit" or "Delivered" back to "Dispatched"
      if (job.status === TRANSPORT_JOB_STATUS.NEEDS_DISPATCH) {
        // Only update to "Dispatched" if job is still "Needs Dispatch"
        // This handles the case where a new job is being added to a route
        await TransportJob.findByIdAndUpdate(jobId, {
          status: TRANSPORT_JOB_STATUS.DISPATCHED
        });
      } else if (job.status === TRANSPORT_JOB_STATUS.DISPATCHED && hasPickupStop) {
        // If job is "Dispatched" and we're adding a pickup stop, keep it as "Dispatched"
        // Status will be updated to "In Transit" when pickup is completed
        // No change needed here
      } else if (job.status === TRANSPORT_JOB_STATUS.IN_TRANSIT) {
        // If job is "In Transit" (pickup completed), don't downgrade it
        // This handles the case where drop stop is being added to a new route
        // Status will be updated to "Delivered" when drop is completed
        // No change needed here - preserve "In Transit" status
      }
      // For all other statuses (Delivered, Cancelled, Exception), don't change

      // Update vehicle status intelligently
      if (job.vehicleId) {
        const vehicleId = job.vehicleId._id || job.vehicleId;
        const vehicle = await Vehicle.findById(vehicleId);
        
        if (vehicle) {
          // Only update vehicle status if it can be upgraded
          // Don't downgrade from "In Transport" or "Delivered" back to "Ready for Transport"
          if (vehicle.status === VEHICLE_STATUS.READY_FOR_TRANSPORT) {
            // If vehicle is "Ready for Transport" and we're adding stops, keep it as "Ready for Transport"
            // Status will be updated to "In Transport" when pickup is completed
            // No change needed here
          } else if (vehicle.status === VEHICLE_STATUS.IN_TRANSPORT) {
            // If vehicle is "In Transport" (pickup completed), don't downgrade it
            // This handles the case where drop stop is being added to a new route
            // Status will be updated to "Delivered" when drop is completed
            // No change needed here - preserve "In Transport" status
          } else if (vehicle.status === VEHICLE_STATUS.INTAKE_COMPLETE) {
            // If vehicle is in early stages and we're adding stops, update to "Ready for Transport"
            if (hasPickupStop || hasDropStop) {
              await Vehicle.findByIdAndUpdate(vehicleId, {
                status: VEHICLE_STATUS.READY_FOR_TRANSPORT
              });
            }
          }
          // For "Delivered" or "Cancelled" statuses, don't change
        }
      }
    }

    // Only set route status to "Planned" if it hasn't been started yet
    // Do NOT change status if route is already "In Progress" or completed
    if (!route.status || route.status === '') {
      route.status = ROUTE_STATUS.PLANNED;
      await route.save();
    }

    // DO NOT update truck status - truck may be on another route and this is a future route
    // Truck status will be updated to "In Use" when route starts
  } catch (error) {
    console.error('Error updating status on stops setup:', error);
  }
};

/**
 * Helper function to check if a transport job is fully completed (both pickup and drop stops completed)
 */
const isTransportJobFullyCompleted = async (transportJobId) => {
  try {
    // Find all routes that have stops for this transport job
    const routesWithJob = await Route.find({
      $or: [
        { 'stops.transportJobId': transportJobId },
        { selectedTransportJobs: transportJobId }
      ]
    }).populate('stops');

    let hasPickupStop = false;
    let hasDropStop = false;
    let pickupCompleted = false;
    let dropCompleted = false;

    // Check all routes for this job's stops
    for (const route of routesWithJob) {
      if (route.stops && Array.isArray(route.stops)) {
        route.stops.forEach(stop => {
          const stopJobId = typeof stop.transportJobId === 'object'
            ? (stop.transportJobId._id || stop.transportJobId.id)
            : stop.transportJobId;

          if (stopJobId && stopJobId.toString() === transportJobId.toString()) {
            if (stop.stopType === 'pickup') {
              hasPickupStop = true;
              if (stop.status === ROUTE_STOP_STATUS.COMPLETED) {
                pickupCompleted = true;
              }
            } else if (stop.stopType === 'drop') {
              hasDropStop = true;
              if (stop.status === ROUTE_STOP_STATUS.COMPLETED) {
                dropCompleted = true;
              }
            }
          }
        });
      }
    }

    // Job is fully completed only if it has both pickup and drop stops, and both are completed
    return hasPickupStop && hasDropStop && pickupCompleted && dropCompleted;
  } catch (error) {
    console.error('Error checking if transport job is fully completed:', error);
    return false;
  }
};

/**
 * Update statuses when route status changes
 */
const updateStatusOnRouteStatusChange = async (routeId, newStatus, oldStatus) => {
  try {
    const route = await Route.findById(routeId)
      .populate('selectedTransportJobs')
      .populate('truckId');

    if (!route) return;

    // Get all transport jobs from selectedTransportJobs and stops
    const transportJobIds = new Set();

    if (route.selectedTransportJobs && Array.isArray(route.selectedTransportJobs)) {
      route.selectedTransportJobs.forEach(job => {
        const jobId = typeof job === 'object' ? (job._id || job.id) : job;
        if (jobId) transportJobIds.add(jobId.toString());
      });
    }

    if (route.stops && Array.isArray(route.stops)) {
      route.stops.forEach(stop => {
        if (stop.transportJobId) {
          const jobId = typeof stop.transportJobId === 'object'
            ? (stop.transportJobId._id || stop.transportJobId.id)
            : stop.transportJobId;
          if (jobId) transportJobIds.add(jobId.toString());
        }
      });
    }

    // Update statuses based on route status
    if (newStatus === ROUTE_STATUS.IN_PROGRESS) {
      // Route started - update route to "In Progress", truck to "In Use"
      // DO NOT update transport jobs or vehicles here - they remain "Dispatched" and "Ready for Transport"
      // Transport jobs and vehicles are updated when pickup stops are completed

      // Update truck status to "In Use"
      if (route.truckId) {
        await Truck.findByIdAndUpdate(route.truckId._id || route.truckId, {
          status: TRUCK_STATUS.IN_USE
        });
      }
    } else if (newStatus === ROUTE_STATUS.COMPLETED) {
      // Route completed - DO NOT automatically complete transport jobs
      // Transport jobs are only completed when ALL their stops (pickup + drop) are completed,
      // regardless of which routes they belong to. This is handled in updateStatusOnStopUpdate.

      // Update truck status to Available
      if (route.truckId) {
        await Truck.findByIdAndUpdate(route.truckId._id || route.truckId, {
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
    } else if (newStatus === ROUTE_STATUS.CANCELLED) {
      // Route cancelled - reset transport jobs and recalculate vehicle statuses
      for (const jobId of transportJobIds) {
        await TransportJob.findByIdAndUpdate(jobId, {
          status: TRANSPORT_JOB_STATUS.NEEDS_DISPATCH,
          $unset: { assignedDriver: 1 }
        });

        // Get the transport job to find the vehicle
        const job = await TransportJob.findById(jobId).populate('vehicleId');
        if (job && job.vehicleId) {
          // Recalculate vehicle status based on all transport jobs
          const newVehicleStatus = await calculateVehicleStatusFromJobs(job.vehicleId._id || job.vehicleId);
          await Vehicle.findByIdAndUpdate(job.vehicleId._id || job.vehicleId, {
            status: newVehicleStatus
          });
        }
      }

      // Update truck status to Available
      if (route.truckId) {
        await Truck.findByIdAndUpdate(route.truckId._id || route.truckId, {
          status: TRUCK_STATUS.AVAILABLE,
          currentDriver: undefined
        });
      }
    }
  } catch (error) {
    console.error('Error updating status on route status change:', error);
  }
};

/**
 * Update statuses when a stop is updated
 * Note: This should be called after the route has been saved with updated stops
 */
const updateStatusOnStopUpdate = async (routeId, stopIndex, newStopStatus, stopType, transportJobId, updatedStops = null) => {
  try {
    // Reload route to get latest data, but use updatedStops if provided
    const route = await Route.findById(routeId);
    if (!route) return;

    // Use updated stops if provided, otherwise use route.stops
    const stopsToCheck = updatedStops || route.stops;

    // If stop is completed and it's a drop stop, check if transport job is fully completed
    if (newStopStatus === ROUTE_STOP_STATUS.COMPLETED && stopType === 'drop' && transportJobId) {
      const jobId = typeof transportJobId === 'object'
        ? (transportJobId._id || transportJobId.id)
        : transportJobId;

      // Check if the transport job is fully completed (both pickup AND drop stops completed across all routes)
      const isFullyCompleted = await isTransportJobFullyCompleted(jobId);

      if (isFullyCompleted) {
        // Transport job is fully completed - mark as delivered
        await TransportJob.findByIdAndUpdate(jobId, {
          status: TRANSPORT_JOB_STATUS.DELIVERED
        });

        // Update vehicle's transportJobs history array
        await updateVehicleTransportJobsHistory(jobId, TRANSPORT_JOB_STATUS.DELIVERED);

        // Get the transport job to find the vehicle
        const job = await TransportJob.findById(jobId).populate('vehicleId');
        if (job && job.vehicleId) {
          // Recalculate vehicle status based on all transport jobs
          const newVehicleStatus = await calculateVehicleStatusFromJobs(job.vehicleId._id || job.vehicleId);
          const updateData = { status: newVehicleStatus };

          // Add deliveredAt timestamp if vehicle is now fully delivered
          if (newVehicleStatus === VEHICLE_STATUS.DELIVERED) {
            updateData.deliveredAt = new Date();
          }

          await Vehicle.findByIdAndUpdate(job.vehicleId._id || job.vehicleId, updateData);
        }
      }
    }

    // If stop is completed and it's a pickup stop, update transport job to "In Transit" and recalculate vehicle status
    if (newStopStatus === ROUTE_STOP_STATUS.COMPLETED && stopType === 'pickup' && transportJobId) {
      const jobId = typeof transportJobId === 'object'
        ? (transportJobId._id || transportJobId.id)
        : transportJobId;

      // Update transport job status to "In Transit"
      await TransportJob.findByIdAndUpdate(jobId, {
        status: TRANSPORT_JOB_STATUS.IN_TRANSIT
      });

      // Update vehicle's transportJobs history array
      await updateVehicleTransportJobsHistory(jobId, TRANSPORT_JOB_STATUS.IN_TRANSIT);

      // Get the transport job to find the vehicle
      const job = await TransportJob.findById(jobId).populate('vehicleId');
      if (job && job.vehicleId) {
        // Recalculate vehicle status based on all transport jobs
        const newVehicleStatus = await calculateVehicleStatusFromJobs(job.vehicleId._id || job.vehicleId);
        await Vehicle.findByIdAndUpdate(job.vehicleId._id || job.vehicleId, {
          status: newVehicleStatus
        });
      }
    }

    // Check if all stops are completed and update route status
    if (stopsToCheck && stopsToCheck.length > 0) {
      const allStopsCompleted = stopsToCheck.every(stop =>
        stop.status === ROUTE_STOP_STATUS.COMPLETED
      );

      if (allStopsCompleted && route.status !== ROUTE_STATUS.COMPLETED) {
        route.status = ROUTE_STATUS.COMPLETED;
        await route.save();

        // Update truck status
        if (route.truckId) {
          await Truck.findByIdAndUpdate(route.truckId, {
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

        // DO NOT automatically complete transport jobs when route is completed
        // Transport jobs should only be completed when ALL their stops (pickup + drop) are completed,
        // regardless of which routes they belong to. This prevents issues with multi-route transport jobs.

        // Create automatic maintenance expense when all stops are completed
        // This ensures expense is created even if updateAllRelatedEntities is not called
        try {
          await createMaintenanceExpenseForRoute(routeId);
        } catch (expenseError) {
          console.error('Failed to create maintenance expense when all stops completed:', expenseError);
          // Don't fail the stop update if expense creation fails
        }
      }
    }
  } catch (error) {
    console.error('Error updating status on stop update:', error);
  }
};

/**
 * Update statuses when transport job is removed from route
 */
const updateStatusOnTransportJobRemoved = async (transportJobId) => {
  try {
    // Get the transport job first to find the vehicle
    const job = await TransportJob.findById(transportJobId).select('vehicleId status pickupRouteId dropRouteId jobNumber');

    if (!job) {
      console.error('Transport job not found for removal:', transportJobId);
      return;
    }

    // Check if this job still has any route assignments after removal
    const stillHasPickupRoute = !!job.pickupRouteId;
    const stillHasDropRoute = !!job.dropRouteId;

    // Only reset to "Needs Dispatch" if the job has NO route assignments left
    const updateData = {};
    if (!stillHasPickupRoute && !stillHasDropRoute) {
      // Job is completely removed from all routes - reset to Needs Dispatch
      if (job.status !== TRANSPORT_JOB_STATUS.NEEDS_DISPATCH && job.status !== TRANSPORT_JOB_STATUS.DELIVERED) {
        updateData.status = TRANSPORT_JOB_STATUS.NEEDS_DISPATCH;
      }
    }

    // NOTE: Route references (pickupRouteId, dropRouteId, routeId) are cleared by updateTransportJobRouteReferences
    // This function only handles status updates, not route reference clearing
    updateData.$unset = { assignedDriver: 1 }; // Only clear assigned driver

    await TransportJob.findByIdAndUpdate(transportJobId, updateData);

    // Update vehicle status based on all its remaining transport jobs
    if (job.vehicleId) {
      const newVehicleStatus = await calculateVehicleStatusFromJobs(job.vehicleId);
      await Vehicle.findByIdAndUpdate(job.vehicleId, {
        status: newVehicleStatus
      });
    }

  } catch (error) {
    console.error('Error updating status on transport job removed:', error);
  }
};

// Update driver stats when route is completed
const updateDriverStats = async (routeId, driverId) => {
  try {
    const Route = require('../models/Route');
    const User = require('../models/User');

    // Get the completed route
    const route = await Route.findById(routeId).populate('selectedTransportJobs');
    if (!route) {
      console.error('Route not found for stats update:', routeId);
      return;
    }

    // Find the driver
    const driver = await User.findById(driverId);
    if (!driver || driver.role !== 'ptgDriver') {
      console.error('Driver not found or not a driver:', driverId);
      return;
    }

    // Initialize driverStats if not exists
    if (!driver.driverStats) {
      driver.driverStats = {
        totalLoadsMoved: 0,
        totalDistanceTraveled: 0,
        fuelExpenses: []
      };
    }

    // Update driver stats
    const loadsMoved = route.selectedTransportJobs ? route.selectedTransportJobs.length : 0;
    const distanceTraveled = route.actualDistanceTraveled || 0;

    driver.driverStats.totalLoadsMoved += loadsMoved;
    driver.driverStats.totalDistanceTraveled += distanceTraveled;

    await driver.save();

    // Also update truck stats if truck is assigned
    if (route.truckId) {
      const Truck = require('../models/Truck');
      const truck = await Truck.findById(route.truckId);
      if (truck) {
        if (!truck.truckStats) {
          truck.truckStats = {
            totalLoadsMoved: 0,
            totalDistanceTraveled: 0,
            fuelExpenses: [],
            maintenanceExpenses: []
          };
        }
        truck.truckStats.totalLoadsMoved += loadsMoved;
        truck.truckStats.totalDistanceTraveled += distanceTraveled;
        await truck.save();
      }
    }
  } catch (error) {
    console.error('Error updating driver stats:', error);
    throw error;
  }
};

/**
 * Update all related entities when a route is completed
 * This ensures that vehicles, transport jobs, trucks, and drivers are properly updated
 */
const updateAllRelatedEntities = async (routeId) => {
  try {
    // Get the completed route with all related data
    const route = await Route.findById(routeId)
      .populate({
        path: 'selectedTransportJobs',
        populate: { path: 'vehicleId' }
      })
      .populate('truckId')
      .populate('driverId');

    if (!route) {
      throw new Error('Route not found');
    }

    // DO NOT automatically update transport jobs or vehicles to 'Delivered'
    // Transport jobs should only be marked as delivered when ALL their stops (pickup + drop) are completed,
    // regardless of which routes they belong to. Vehicles should only be marked as delivered when
    // ALL their transport jobs are completed. This prevents issues with multi-route transport jobs.

    // Update truck status to 'Available' if it was 'In Use'
    if (route.truckId && route.truckId.status === 'In Use') {
      await Truck.findByIdAndUpdate(route.truckId._id, {
        status: TRUCK_STATUS.AVAILABLE
      });
    }

    // Create automatic maintenance expense based on truck maintenance rate
    try {
      await createMaintenanceExpenseForRoute(routeId);
    } catch (expenseError) {
      console.error('Error creating automatic maintenance expense:', expenseError);
      // Don't fail the route completion if expense creation fails
    }

  } catch (error) {
    console.error('Error updating all related entities:', error);
    throw error;
  }
};

/**
 * Helper function to safely create Date objects from date and time strings
 */
const createSafeDate = (dateStr, timeStr) => {
  if (!dateStr && !timeStr) return undefined;

  try {
    // If we have a date string, use it; otherwise use today's date
    const datePart = dateStr || new Date().toISOString().split('T')[0];
    const timePart = timeStr || '00:00';

    // Validate the time format (HH:MM)
    if (timeStr && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)) {
      console.warn(`Invalid time format: ${timeStr}, skipping date creation`);
      return undefined;
    }

    const dateTimeStr = `${datePart}T${timePart}`;
    const date = new Date(dateTimeStr);

    // Check if the created date is valid
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date created from ${dateTimeStr}, skipping`);
      return undefined;
    }

    return date;
  } catch (error) {
    console.warn(`Error creating date from date: ${dateStr}, time: ${timeStr}:`, error);
    return undefined;
  }
};

/**
 * Sync transport job updates to route stops
 * When a transport job is updated, find all routes that have stops referencing this job
 * and update the corresponding route stops with the new transport job information
 */
const syncTransportJobToRouteStops = async (transportJobId) => {
  try { 
    // Get the updated transport job
    const transportJob = await TransportJob.findById(transportJobId);
    if (!transportJob) {
      console.warn(`⚠️ Transport job ${transportJobId} not found, skipping sync`);
      return;
    }

    // Find all routes that have stops referencing this transport job
    const routes = await Route.find({
      'stops.transportJobId': transportJobId
    });

    for (const route of routes) {
      let routeUpdated = false;

      // Update stops that reference this transport job
      const updatedStops = route.stops.map(stop => {
        if (stop.transportJobId && stop.transportJobId.toString() === transportJobId.toString()) {
          // Update stop information based on transport job data
          // For pickup stops, sync pickup location and schedule
          if (stop.stopType === 'pickup') {
            return {
              ...stop,
              scheduledDate: transportJob.pickupDateStart || transportJob.pickupDateEnd || stop.scheduledDate,
              scheduledTimeStart: createSafeDate(transportJob.pickupDateStart, transportJob.pickupTimeStart) || stop.scheduledTimeStart,
              scheduledTimeEnd: createSafeDate(transportJob.pickupDateEnd, transportJob.pickupTimeEnd) || stop.scheduledTimeEnd,
              location: {
                ...stop.location,
                name: transportJob.pickupLocationName || stop.location?.name,
                city: transportJob.pickupCity || stop.location?.city,
                state: transportJob.pickupState || stop.location?.state,
                zip: transportJob.pickupZip || stop.location?.zip
              }
            };
          }

          // For drop stops, sync drop location and schedule
          if (stop.stopType === 'drop') {
            return {
              ...stop,
              scheduledDate: transportJob.dropDateStart || transportJob.dropDateEnd || stop.scheduledDate,
              scheduledTimeStart: createSafeDate(transportJob.dropDateStart, transportJob.dropTimeStart) || stop.scheduledTimeStart,
              scheduledTimeEnd: createSafeDate(transportJob.dropDateEnd, transportJob.dropTimeEnd) || stop.scheduledTimeEnd,
              location: {
                ...stop.location,
                name: transportJob.dropLocationName || stop.location?.name,
                city: transportJob.dropCity || stop.location?.city,
                state: transportJob.dropState || stop.location?.state,
                zip: transportJob.dropZip || stop.location?.zip
              }
            };
          }
        }
        return stop;
      });

      // If any stops were updated, save the route
      if (JSON.stringify(route.stops) !== JSON.stringify(updatedStops)) {
        route.stops = updatedStops;
        await route.save();
        routeUpdated = true;
      }
    }

  } catch (error) {
    console.error(`❌ Error syncing transport job ${transportJobId} to route stops:`, error);
    throw error;
  }
};

/**
 * Sync route stop updates to transport job
 * When a route stop is updated, update the corresponding transport job with the new stop information
 */
const syncRouteStopToTransportJob = async (routeId, stopId) => {
  try {
    // Get the route with the updated stop
    const route = await Route.findById(routeId);
    if (!route || !route.stops) {
      console.warn(`⚠️ Route ${routeId} or stops not found, skipping sync`);
      return;
    }

    // Find the specific stop
    let stop = route.stops.find(s => s._id && s._id.toString() === stopId.toString());
    if (!stop) {
      console.warn(`⚠️ Stop ${stopId} not found in route ${routeId}, searching by string comparison`);
      // Try alternative search methods
      stop = route.stops.find(s => s._id && s._id.toString() === stopId);
      if (stop) {
        console.log(`✅ Found stop by string comparison`);
      } else {
        console.warn(`❌ Stop ${stopId} not found in route ${routeId}, skipping sync`);
        return;
      }
    }

    // Only sync if this is a pickup or drop stop with a transport job reference
    if ((stop.stopType !== 'pickup' && stop.stopType !== 'drop') || !stop.transportJobId) {
      return;
    }

    // Get the transport job
    const transportJob = await TransportJob.findById(stop.transportJobId);
    if (!transportJob) {
      console.warn(`⚠️ Transport job ${stop.transportJobId} not found, skipping sync`);
      return;
    }

    let jobUpdated = false;
    const updateData = {};

    // Sync stop information to transport job based on stop type
    if (stop.stopType === 'pickup') {
      // Update pickup information from the stop
      if (stop.scheduledDate) {
        updateData.pickupDateStart = stop.scheduledDate;
        updateData.pickupDateEnd = stop.scheduledDate;
      }
      if (stop.scheduledTimeStart) {
        updateData.pickupTimeStart = stop.scheduledTimeStart.toTimeString().slice(0, 5); // HH:MM format
      }
      if (stop.scheduledTimeEnd) {
        updateData.pickupTimeEnd = stop.scheduledTimeEnd.toTimeString().slice(0, 5); // HH:MM format
      }
      if (stop.location) {
        updateData.pickupLocationName = stop.location.name;
        updateData.pickupCity = stop.location.city;
        updateData.pickupState = stop.location.state;
        updateData.pickupZip = stop.location.zip;
      }
    } else if (stop.stopType === 'drop') {
      // Update drop information from the stop
      if (stop.scheduledDate) {
        updateData.dropDateStart = stop.scheduledDate;
        updateData.dropDateEnd = stop.scheduledDate;
      }
      if (stop.scheduledTimeStart) {
        updateData.dropTimeStart = stop.scheduledTimeStart.toTimeString().slice(0, 5); // HH:MM format
      }
      if (stop.scheduledTimeEnd) {
        updateData.dropTimeEnd = stop.scheduledTimeEnd.toTimeString().slice(0, 5); // HH:MM format
      }
      if (stop.location) {
        updateData.dropLocationName = stop.location.name;
        updateData.dropCity = stop.location.city;
        updateData.dropState = stop.location.state;
        updateData.dropZip = stop.location.zip;
      }
    }

    // If any data was updated, save the transport job
    if (Object.keys(updateData).length > 0) {
      await TransportJob.findByIdAndUpdate(transportJob._id, updateData);
      jobUpdated = true;
    }
  } catch (error) {
    console.error(`❌ Error syncing route stop ${stopId} to transport job:`, error);
    throw error;
  }
};

/**
 * Update transport job route references (pickupRouteId and dropRouteId)
 * This enables multi-route transport jobs where pickup can be on Route 1 and drop on Route 2
 * 
 * @param {string} routeId - The route ID
 * @param {Array} stops - Array of route stops
 */
const updateTransportJobRouteReferences = async (routeId, stops) => {
  try {
    if (!stops || !Array.isArray(stops)) {
      return;
    }

    // Track which transport jobs have pickup and drop stops in this route
    const transportJobRoutes = new Map(); // Map<transportJobId, { hasPickup: boolean, hasDrop: boolean }>

    // Scan all stops to find pickup and drop stops
    for (const stop of stops) {
      if ((stop.stopType === 'pickup' || stop.stopType === 'drop') && stop.transportJobId) {
        let jobId = stop.transportJobId;
        if (typeof jobId === 'object') {
          jobId = jobId._id || jobId.id;
        }
        jobId = jobId.toString();

        if (!transportJobRoutes.has(jobId)) {
          transportJobRoutes.set(jobId, { hasPickup: false, hasDrop: false });
        }

        const jobInfo = transportJobRoutes.get(jobId);
        if (stop.stopType === 'pickup') {
          jobInfo.hasPickup = true;
        } else if (stop.stopType === 'drop') {
          jobInfo.hasDrop = true;
        }
      }
    }

    // Update each transport job with route references
    for (const [jobId, jobInfo] of transportJobRoutes.entries()) {
      const transportJob = await TransportJob.findById(jobId);
      if (!transportJob) continue;

      const updateData = {};

      // Update pickupRouteId if this route has a pickup stop for this job
      if (jobInfo.hasPickup) {
        // Check if pickup is already in a different route
        if (transportJob.pickupRouteId && 
            transportJob.pickupRouteId.toString() !== routeId.toString()) {
         }
        updateData.pickupRouteId = routeId;
      }

      // Update dropRouteId if this route has a drop stop for this job
      if (jobInfo.hasDrop) {
        // Check if drop is already in a different route
        if (transportJob.dropRouteId && 
            transportJob.dropRouteId.toString() !== routeId.toString()) {
          }
        updateData.dropRouteId = routeId;
      }

      // Only update if there's something to update
      if (Object.keys(updateData).length > 0) {
        // Also set routeId for backward compatibility (use pickupRouteId if available, otherwise dropRouteId)
        if (updateData.pickupRouteId) {
          updateData.routeId = updateData.pickupRouteId;
        } else if (updateData.dropRouteId) {
          updateData.routeId = updateData.dropRouteId;
        }

        await TransportJob.findByIdAndUpdate(jobId, updateData);
        // Also update the routeId in the vehicle's transportJobs array
        if (transportJob.vehicleId) {
          const vehicleId = transportJob.vehicleId._id || transportJob.vehicleId;
          const mongoose = require('mongoose');
          const jobObjectId = typeof jobId === 'string' 
            ? new mongoose.Types.ObjectId(jobId)
            : jobId;

          // Update routeId in vehicle's transportJobs array
          await Vehicle.findByIdAndUpdate(
            vehicleId,
            {
              $set: {
                'transportJobs.$[elem].routeId': routeId
              }
            },
            {
              arrayFilters: [
                { 'elem.transportJobId': jobObjectId }
              ]
            }
          );
          }
      }
    }

    // Handle transport jobs that were removed from this route
    // Find all transport jobs that currently have this route as pickupRouteId or dropRouteId
    // but are no longer in the stops
    const transportJobsWithThisRoute = await TransportJob.find({
      $or: [
        { pickupRouteId: routeId },
        { dropRouteId: routeId }
      ]
    });

    for (const job of transportJobsWithThisRoute) {
      const jobId = job._id.toString();
      const updateData = {};
      let needsUpdate = false;

      // Check if this job still has a pickup stop in this route
      const hasPickupInRoute = stops.some(stop => {
        if (!stop.transportJobId || stop.stopType !== 'pickup') return false;
        let stopJobId = stop.transportJobId;
        if (typeof stopJobId === 'object') {
          stopJobId = stopJobId._id || stopJobId.id;
        }
        return stopJobId && stopJobId.toString() === jobId;
      });

      // Check if this job still has a drop stop in this route
      const hasDropInRoute = stops.some(stop => {
        if (!stop.transportJobId || stop.stopType !== 'drop') return false;
        let stopJobId = stop.transportJobId;
        if (typeof stopJobId === 'object') {
          stopJobId = stopJobId._id || stopJobId.id;
        }
        return stopJobId && stopJobId.toString() === jobId;
      });

      // Clear pickupRouteId if pickup stop was removed AND it was assigned to this route
      if (job.pickupRouteId && job.pickupRouteId.toString() === routeId.toString() && !hasPickupInRoute) {
        updateData.pickupRouteId = null;
        needsUpdate = true;
      }

      // Clear dropRouteId if drop stop was removed AND it was assigned to this route
      if (job.dropRouteId && job.dropRouteId.toString() === routeId.toString() && !hasDropInRoute) {
        updateData.dropRouteId = null;
        needsUpdate = true;
      }

      // Update routeId for backward compatibility
      if (needsUpdate) {
        // Set routeId to the remaining valid route (pickupRouteId or dropRouteId)
        // If pickupRouteId is being cleared (set to null), use dropRouteId if it exists
        // If dropRouteId is being cleared, use pickupRouteId if it exists
        // If both are being cleared, set routeId to null
        if (updateData.pickupRouteId === null && job.dropRouteId) {
          // pickupRouteId is being cleared, but dropRouteId still exists
          updateData.routeId = job.dropRouteId;
        } else if (updateData.dropRouteId === null && job.pickupRouteId) {
          // dropRouteId is being cleared, but pickupRouteId still exists
          updateData.routeId = job.pickupRouteId;
        } else if (updateData.pickupRouteId === null && updateData.dropRouteId === null) {
          // Both are being cleared
          updateData.routeId = null;
        } else {
          // Neither is being cleared, keep the existing routeId logic
          updateData.routeId = job.pickupRouteId || job.dropRouteId;
        }

        await TransportJob.findByIdAndUpdate(jobId, updateData);
      }
    }
  } catch (error) {
    console.error('❌ Error updating transport job route references:', error);
    // Don't throw - this is a non-critical update
  }
};

module.exports = {
  calculateVehicleStatusFromJobs,
  updateVehicleTransportJobsHistory,
  updateDriverStats,
  updateAllRelatedEntities,
  updateVehicleOnCreate,
  updateStatusOnTransportJobCreate,
  updateStatusOnTransportJobStatusChange,
  updateStatusOnRouteCreate,
  updateStatusOnStopsSetup,
  updateStatusOnRouteStatusChange,
  updateStatusOnStopUpdate,
  updateStatusOnTransportJobRemoved,
  syncTransportJobToRouteStops,
  syncRouteStopToTransportJob,
  updateTransportJobRouteReferences,
  createMaintenanceExpenseForRoute
};
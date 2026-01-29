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
      console.log(`Maintenance expense already exists for route ${route.routeNumber || routeId}`);
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

    console.log(`Created automatic maintenance expense for route ${route.routeNumber || routeId}: $${maintenanceCost.toFixed(2)} (${miles.toFixed(2)} miles × $${truck.maintenanceRate.toFixed(2)}/mile)`);
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
 * Update vehicle status when a transport job status changes
 */
const updateStatusOnTransportJobStatusChange = async (transportJobId) => {
  try {
    // Get the transport job to find the vehicle
    const transportJob = await TransportJob.findById(transportJobId).select('vehicleId');
    if (!transportJob || !transportJob.vehicleId) {
      return;
    }

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

    // Update transport jobs status to "Dispatched" and vehicles to "Ready for Transport"
    for (const jobId of transportJobIds) {
        await TransportJob.findByIdAndUpdate(jobId, {
          status: TRANSPORT_JOB_STATUS.DISPATCHED
        });

        // Get transport job to find vehicle
        const job = await TransportJob.findById(jobId).populate('vehicleId');
        if (job && job.vehicleId) {
          await Vehicle.findByIdAndUpdate(job.vehicleId._id || job.vehicleId, {
            status: VEHICLE_STATUS.READY_FOR_TRANSPORT
          });
        }
      }

    // Ensure route status is "Planned"
    if (route.status !== ROUTE_STATUS.PLANNED) {
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
      // Route completed - check if all stops are completed
      const allStopsCompleted = route.stops && route.stops.length > 0 
        ? route.stops.every(stop => stop.status === ROUTE_STOP_STATUS.COMPLETED)
        : false;

      if (allStopsCompleted) {
        // All stops completed - mark transport jobs as delivered and recalculate vehicle statuses
        for (const jobId of transportJobIds) {
          await TransportJob.findByIdAndUpdate(jobId, {
            status: TRANSPORT_JOB_STATUS.DELIVERED
          });

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

    // If stop is completed and it's a drop stop, update transport job and recalculate vehicle status
    if (newStopStatus === ROUTE_STOP_STATUS.COMPLETED && stopType === 'drop' && transportJobId) {
      const jobId = typeof transportJobId === 'object'
        ? (transportJobId._id || transportJobId.id)
        : transportJobId;

      // Check if all drop stops for this transport job are completed
      const allDropStopsCompleted = stopsToCheck.filter(stop => {
        const stopJobId = typeof stop.transportJobId === 'object'
          ? (stop.transportJobId._id || stop.transportJobId.id)
          : stop.transportJobId;
        return stopJobId && stopJobId.toString() === jobId.toString() && stop.stopType === 'drop';
      }).every(stop => stop.status === ROUTE_STOP_STATUS.COMPLETED);

      if (allDropStopsCompleted) {
        // All drop stops completed - mark transport job as delivered
        await TransportJob.findByIdAndUpdate(jobId, {
          status: TRANSPORT_JOB_STATUS.DELIVERED
        });

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

        // Update all transport jobs and vehicles as delivered
        const transportJobIds = new Set();
        if (route.selectedTransportJobs && Array.isArray(route.selectedTransportJobs)) {
          route.selectedTransportJobs.forEach(job => {
            const jobId = typeof job === 'object' ? (job._id || job.id) : job;
            if (jobId) transportJobIds.add(jobId.toString());
          });
        }

        // Also get job IDs from stops (use updated stops)
        stopsToCheck.forEach(stop => {
          if (stop.transportJobId) {
            const jobId = typeof stop.transportJobId === 'object'
              ? (stop.transportJobId._id || stop.transportJobId.id)
              : stop.transportJobId;
            if (jobId) transportJobIds.add(jobId.toString());
          }
        });

        for (const jobId of transportJobIds) {
          await TransportJob.findByIdAndUpdate(jobId, {
            status: TRANSPORT_JOB_STATUS.DELIVERED
          });

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
    const job = await TransportJob.findById(transportJobId).select('vehicleId status');

    if (!job) {
      console.error('Transport job not found for removal:', transportJobId);
      return;
    }

    // Reset transport job status to needs dispatch and remove route reference
    await TransportJob.findByIdAndUpdate(transportJobId, {
      status: TRANSPORT_JOB_STATUS.NEEDS_DISPATCH,
      $unset: { routeId: 1, assignedDriver: 1 }
    });

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
    console.log(`Updated driver ${driverId} stats: +${loadsMoved} loads, +${distanceTraveled} miles`);

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
        console.log(`Updated truck ${route.truckId} stats: +${loadsMoved} loads, +${distanceTraveled} miles`);
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
    console.log(`Updating all related entities for completed route ${routeId}`);

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

    // Update all transport jobs to 'Delivered'
    if (route.selectedTransportJobs && route.selectedTransportJobs.length > 0) {
      for (const job of route.selectedTransportJobs) {
        if (job.status !== 'Delivered') {
          await TransportJob.findByIdAndUpdate(job._id, {
            status: TRANSPORT_JOB_STATUS.DELIVERED,
            lastUpdatedBy: route.driverId
          });
          console.log(`Updated transport job ${job.jobNumber} to Delivered`);
        }
      }
    }

    // Update all vehicles to 'Delivered'
    if (route.selectedTransportJobs && route.selectedTransportJobs.length > 0) {
      for (const job of route.selectedTransportJobs) {
        if (job.vehicleId && job.vehicleId.status !== 'Delivered') {
          await Vehicle.findByIdAndUpdate(job.vehicleId._id, {
            status: VEHICLE_STATUS.DELIVERED,
            deliveredAt: new Date(),
            lastUpdatedBy: route.driverId
          });
          console.log(`Updated vehicle ${job.vehicleId.vin} to Delivered`);
        }
      }
    }

    // Update truck status to 'Available' if it was 'In Use'
    if (route.truckId && route.truckId.status === 'In Use') {
      await Truck.findByIdAndUpdate(route.truckId._id, {
        status: TRUCK_STATUS.AVAILABLE
      });
      console.log(`Updated truck ${route.truckId.truckNumber} to Available`);
    }

    // Create automatic maintenance expense based on truck maintenance rate
    try {
      await createMaintenanceExpenseForRoute(routeId);
    } catch (expenseError) {
      console.error('Error creating automatic maintenance expense:', expenseError);
      // Don't fail the route completion if expense creation fails
    }

    console.log(`Successfully updated all related entities for route ${route.routeNumber}`);

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
    console.log(`🔄 Starting sync from transport job ${transportJobId} to route stops`);

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

    console.log(`📋 Found ${routes.length} routes with stops referencing transport job ${transportJobId}`);

    for (const route of routes) {
      let routeUpdated = false;

      // Update stops that reference this transport job
      const updatedStops = route.stops.map(stop => {
        if (stop.transportJobId && stop.transportJobId.toString() === transportJobId.toString()) {
          console.log(`🔄 Updating stop ${stop._id} in route ${route._id} with new transport job data`);

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
        console.log(`✅ Updated route ${route._id} with new transport job data`);
      }
    }

    console.log(`✅ Completed sync from transport job ${transportJobId} to route stops`);
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
    console.log(`🔄 Starting sync from route stop ${stopId} in route ${routeId} to transport job`);

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
      console.log(`ℹ️ Stop ${stopId} is not a pickup/drop stop or has no transport job reference, skipping sync`);
      return;
    }

    console.log(`📋 Processing ${stop.stopType} stop ${stopId} for transport job ${stop.transportJobId}`);

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
      console.log(`✅ Updated transport job ${transportJob._id} with new stop data:`, updateData);
    }

    console.log(`✅ Completed sync from route stop ${stopId} to transport job ${transportJob._id}`);
  } catch (error) {
    console.error(`❌ Error syncing route stop ${stopId} to transport job:`, error);
    throw error;
  }
};

module.exports = {
  calculateVehicleStatusFromJobs,
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
  syncRouteStopToTransportJob
};
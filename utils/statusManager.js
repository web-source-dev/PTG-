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

    // Calculate miles from actualDistanceTraveled (in miles) or from totalDistance (in meters)
    let miles = 0;
    if (route.actualDistanceTraveled && route.actualDistanceTraveled > 0) {
      miles = route.actualDistanceTraveled;
    } else if (route.totalDistance && route.totalDistance.value) {
      // Convert meters to miles
      miles = route.totalDistance.value / 1609.34;
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
const updateStatusOnTransportJobCreate = async (transportJobId, vehicleId) => {
  try {
    // Update transport job status to "Needs Dispatch"
    await TransportJob.findByIdAndUpdate(transportJobId, {
      status: TRANSPORT_JOB_STATUS.NEEDS_DISPATCH
    });

    // Update vehicle status to "Ready for Transport"
    if (vehicleId) {
      await Vehicle.findByIdAndUpdate(vehicleId, {
        status: VEHICLE_STATUS.READY_FOR_TRANSPORT
      });
    }
  } catch (error) {
    console.error('Error updating status on transport job create:', error);
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
        // All stops completed - mark transport jobs and vehicles as delivered
        for (const jobId of transportJobIds) {
          await TransportJob.findByIdAndUpdate(jobId, {
            status: TRANSPORT_JOB_STATUS.DELIVERED
          });

          const job = await TransportJob.findById(jobId).populate('vehicleId');
          if (job && job.vehicleId) {
            await Vehicle.findByIdAndUpdate(job.vehicleId._id || job.vehicleId, {
              status: VEHICLE_STATUS.DELIVERED
            });
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
      // Route cancelled - revert transport jobs and vehicles
      for (const jobId of transportJobIds) {
        await TransportJob.findByIdAndUpdate(jobId, {
          status: TRANSPORT_JOB_STATUS.NEEDS_DISPATCH
        });

        const job = await TransportJob.findById(jobId).populate('vehicleId');
        if (job && job.vehicleId) {
          await Vehicle.findByIdAndUpdate(job.vehicleId._id || job.vehicleId, {
            status: VEHICLE_STATUS.READY_FOR_TRANSPORT
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
const updateStatusOnStopUpdate = async (routeId, stopIndex, newStopStatus, stopType, transportJobId) => {
  try {
    // Reload route to get latest stop statuses
    const route = await Route.findById(routeId);
    if (!route) return;

    // If stop is completed and it's a drop stop, update transport job and vehicle
    if (newStopStatus === ROUTE_STOP_STATUS.COMPLETED && stopType === 'drop' && transportJobId) {
      const jobId = typeof transportJobId === 'object' 
        ? (transportJobId._id || transportJobId.id) 
        : transportJobId;

      // Check if all drop stops for this transport job are completed
      const allDropStopsCompleted = route.stops.filter(stop => {
        const stopJobId = typeof stop.transportJobId === 'object'
          ? (stop.transportJobId._id || stop.transportJobId.id)
          : stop.transportJobId;
        return stopJobId && stopJobId.toString() === jobId.toString() && stop.stopType === 'drop';
      }).every(stop => stop.status === ROUTE_STOP_STATUS.COMPLETED);

      if (allDropStopsCompleted) {
        // All drop stops completed - mark transport job and vehicle as delivered
        await TransportJob.findByIdAndUpdate(jobId, {
          status: TRANSPORT_JOB_STATUS.DELIVERED
        });

        const job = await TransportJob.findById(jobId).populate('vehicleId');
        if (job && job.vehicleId) {
          await Vehicle.findByIdAndUpdate(job.vehicleId._id || job.vehicleId, {
            status: VEHICLE_STATUS.DELIVERED
          });
        }
      }
    }

    // If stop is completed and it's a pickup stop, update transport job to "In Transit" and vehicle to "In Transport"
    if (newStopStatus === ROUTE_STOP_STATUS.COMPLETED && stopType === 'pickup' && transportJobId) {
      const jobId = typeof transportJobId === 'object' 
        ? (transportJobId._id || transportJobId.id) 
        : transportJobId;

      // Update transport job status to "In Transit"
      await TransportJob.findByIdAndUpdate(jobId, {
        status: TRANSPORT_JOB_STATUS.IN_TRANSIT
      });

      const job = await TransportJob.findById(jobId).populate('vehicleId');
      if (job && job.vehicleId) {
        // Only update if not already delivered
        const vehicle = await Vehicle.findById(job.vehicleId._id || job.vehicleId);
        if (vehicle && vehicle.status !== VEHICLE_STATUS.DELIVERED) {
          await Vehicle.findByIdAndUpdate(job.vehicleId._id || job.vehicleId, {
            status: VEHICLE_STATUS.IN_TRANSPORT
          });
        }
      }
    }

    // Check if all stops are completed and update route status
    if (route.stops && route.stops.length > 0) {
      const allStopsCompleted = route.stops.every(stop => 
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

        // Also get job IDs from stops
        route.stops.forEach(stop => {
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

          const job = await TransportJob.findById(jobId).populate('vehicleId');
          if (job && job.vehicleId) {
            await Vehicle.findByIdAndUpdate(job.vehicleId._id || job.vehicleId, {
              status: VEHICLE_STATUS.DELIVERED
            });
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
    // Update transport job status back to "Needs Dispatch"
    await TransportJob.findByIdAndUpdate(transportJobId, {
      status: TRANSPORT_JOB_STATUS.NEEDS_DISPATCH,
      $unset: { routeId: 1 }
    });

    // Update vehicle status back to "Ready for Transport"
    const job = await TransportJob.findById(transportJobId).populate('vehicleId');
    if (job && job.vehicleId) {
      await Vehicle.findByIdAndUpdate(job.vehicleId._id || job.vehicleId, {
        status: VEHICLE_STATUS.READY_FOR_TRANSPORT
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

module.exports = {
  updateDriverStats,
  updateAllRelatedEntities,
  updateVehicleOnCreate,
  updateStatusOnTransportJobCreate,
  updateStatusOnRouteCreate,
  updateStatusOnStopsSetup,
  updateStatusOnRouteStatusChange,
  updateStatusOnStopUpdate,
  updateStatusOnTransportJobRemoved
};
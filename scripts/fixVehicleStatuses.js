/**
 * Production Data Fix Script
 * 
 * This script fixes vehicle and transport job statuses for vehicles that have
 * completed stops but incorrect statuses.
 * 
 * Usage: node scripts/fixVehicleStatuses.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Vehicle = require('../models/Vehicle');
const TransportJob = require('../models/TransportJob');
const Route = require('../models/Route');
const {
  VEHICLE_STATUS,
  TRANSPORT_JOB_STATUS,
  ROUTE_STOP_STATUS
} = require('../constants/status');

// Vehicles to fix (from production issue)
// Can specify by VIN (preferred) or by year/make/model
const vehiclesToFix = [
  { vin: 'YV1A22MK2H1014889' }, // 2017 VOLVO S90
  { year: 2024, make: 'Acura', model: 'RDX' },
  { year: 2021, make: 'Chevrolet', model: 'Silverado' },
  { year: 2018, make: 'Porsche', model: 'Cayenne E-Hybrid' },
  { year: 2024, make: 'Ford', model: 'Maverick XL 4DR' }
];

// Option to check all vehicles or just the specified ones
const CHECK_ALL_VEHICLES = true; // Set to false to only check vehiclesToFix list

/**
 * Check if a transport job is fully completed
 * - If job has both pickup and drop stops: both must be completed
 * - If job has only drop stop: drop stop must be completed
 * - If job has only pickup stop: pickup stop must be completed (but job should be IN_TRANSIT, not DELIVERED)
 */
const isTransportJobFullyCompleted = async (transportJobId) => {
  try {
    // Find all routes that have stops for this transport job
    const routesWithJob = await Route.find({
      $or: [
        { 'stops.transportJobId': transportJobId },
        { selectedTransportJobs: transportJobId }
      ]
    });

    let hasPickupStop = false;
    let hasDropStop = false;
    let pickupCompleted = false;
    let dropCompleted = false;

    // Check all routes for this job's stops
    for (const route of routesWithJob) {
      if (route.stops && Array.isArray(route.stops)) {
        route.stops.forEach(stop => {
          const stopJobId = typeof stop.transportJobId === 'object'
            ? (stop.transportJobId._id || stop.transportJobId.id || stop.transportJobId.toString())
            : stop.transportJobId;

          if (stopJobId && stopJobId.toString() === transportJobId.toString()) {
            if (stop.stopType === 'pickup') {
              hasPickupStop = true;
              if (stop.status === ROUTE_STOP_STATUS.COMPLETED || stop.status === 'Completed') {
                pickupCompleted = true;
              }
            } else if (stop.stopType === 'drop') {
              hasDropStop = true;
              if (stop.status === ROUTE_STOP_STATUS.COMPLETED || stop.status === 'Completed') {
                dropCompleted = true;
              }
            }
          }
        });
      }
    }

    // Job is fully completed if:
    // 1. Has both pickup and drop stops, and both are completed
    // 2. Has only drop stop, and drop stop is completed
    if (hasPickupStop && hasDropStop) {
      // Both stops exist - both must be completed
      return pickupCompleted && dropCompleted;
    } else if (hasDropStop && !hasPickupStop) {
      // Only drop stop exists - drop must be completed
      return dropCompleted;
    } else if (hasPickupStop && !hasDropStop) {
      // Only pickup stop exists - pickup must be completed (but job should be IN_TRANSIT, not DELIVERED)
      return pickupCompleted;
    }

    // No stops found
    return false;
  } catch (error) {
    console.error(`Error checking if transport job ${transportJobId} is fully completed:`, error);
    return false;
  }
};

/**
 * Get stop completion status for a transport job
 * Returns: { hasPickupStop, hasDropStop, pickupCompleted, dropCompleted, onlyDropStop, onlyPickupStop }
 */
const getStopCompletionStatus = async (transportJobId) => {
  try {
    const routesWithJob = await Route.find({
      $or: [
        { 'stops.transportJobId': transportJobId },
        { selectedTransportJobs: transportJobId }
      ]
    });

    let hasPickupStop = false;
    let hasDropStop = false;
    let pickupCompleted = false;
    let dropCompleted = false;

    for (const route of routesWithJob) {
      if (route.stops && Array.isArray(route.stops)) {
        route.stops.forEach(stop => {
          const stopJobId = typeof stop.transportJobId === 'object'
            ? (stop.transportJobId._id || stop.transportJobId.id || stop.transportJobId.toString())
            : stop.transportJobId;

          if (stopJobId && stopJobId.toString() === transportJobId.toString()) {
            if (stop.stopType === 'pickup') {
              hasPickupStop = true;
              if (stop.status === ROUTE_STOP_STATUS.COMPLETED || stop.status === 'Completed') {
                pickupCompleted = true;
              }
            } else if (stop.stopType === 'drop') {
              hasDropStop = true;
              if (stop.status === ROUTE_STOP_STATUS.COMPLETED || stop.status === 'Completed') {
                dropCompleted = true;
              }
            }
          }
        });
      }
    }

    return {
      hasPickupStop,
      hasDropStop,
      pickupCompleted,
      dropCompleted,
      onlyDropStop: hasDropStop && !hasPickupStop,
      onlyPickupStop: hasPickupStop && !hasDropStop
    };
  } catch (error) {
    console.error(`Error getting stop completion status for transport job ${transportJobId}:`, error);
    return {
      hasPickupStop: false,
      hasDropStop: false,
      pickupCompleted: false,
      dropCompleted: false,
      onlyDropStop: false,
      onlyPickupStop: false
    };
  }
};

/**
 * Calculate vehicle status based on all its transport jobs
 */
const calculateVehicleStatusFromJobs = async (vehicleId) => {
  try {
    // Get all transport jobs for this vehicle
    const transportJobs = await TransportJob.find({ vehicleId }).select('status');

    if (transportJobs.length === 0) {
      return VEHICLE_STATUS.INTAKE_COMPLETE;
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
    return VEHICLE_STATUS.INTAKE_COMPLETE;
  }
};

/**
 * Update vehicle's transportJobs history array
 */
const updateVehicleTransportJobsHistory = async (transportJobId, newStatus) => {
  try {
    const transportJob = await TransportJob.findById(transportJobId).select('vehicleId status');
    if (!transportJob || !transportJob.vehicleId) {
      return;
    }

    const vehicleId = transportJob.vehicleId._id || transportJob.vehicleId;
    
    // Map transport job status to vehicle history status
    let mappedStatus = 'pending';
    if (newStatus === TRANSPORT_JOB_STATUS.IN_TRANSIT) {
      mappedStatus = 'in_progress';
    } else if (newStatus === TRANSPORT_JOB_STATUS.DELIVERED) {
      mappedStatus = 'completed';
    } else if (newStatus === TRANSPORT_JOB_STATUS.CANCELLED) {
      mappedStatus = 'cancelled';
    }

    await Vehicle.findByIdAndUpdate(
      vehicleId,
      {
        $set: {
          'transportJobs.$[elem].status': mappedStatus
        }
      },
      {
        arrayFilters: [
          { 'elem.transportJobId': new mongoose.Types.ObjectId(transportJobId) }
        ]
      }
    );
    
    console.log(`✅ Updated vehicle ${vehicleId} transportJobs history: transportJob ${transportJobId} status -> ${mappedStatus}`);
  } catch (error) {
    console.error('Error updating vehicle transportJobs history:', error);
  }
};

/**
 * Process a single vehicle and fix its status if needed
 */
const processVehicle = async (vehicle, vehicleInfo = null) => {
  const vehicleDescription = vehicleInfo 
    ? (vehicleInfo.vin ? `VIN: ${vehicleInfo.vin}` : `${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`)
    : `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.vin ? ` (VIN: ${vehicle.vin})` : ''}`;
  
  console.log(`\n📦 Processing: ${vehicleDescription}`);
  console.log(`   Found vehicle: ${vehicle.vin || 'N/A'} (ID: ${vehicle._id})`);
  console.log(`   Current status: ${vehicle.status}`);

  // Find all transport jobs for this vehicle
  const transportJobs = await TransportJob.find({ vehicleId: vehicle._id });
  console.log(`   Found ${transportJobs.length} transport job(s)`);

  if (transportJobs.length === 0) {
    console.log(`   ⚠️  No transport jobs found - skipping`);
    return { fixed: false, skipped: true };
  }

  let vehicleNeedsUpdate = false;
  let jobsFixed = 0;

  // Check each transport job
  for (const job of transportJobs) {
    console.log(`\n   📋 Checking transport job: ${job.jobNumber || job._id}`);
    console.log(`      Current status: ${job.status}`);

    // Check if a route is assigned to this transport job
    const hasRouteAssigned = !!(job.routeId || job.pickupRouteId || job.dropRouteId);
    if (hasRouteAssigned) {
      const routeIds = [];
      if (job.routeId) routeIds.push(job.routeId.toString());
      if (job.pickupRouteId) routeIds.push(job.pickupRouteId.toString());
      if (job.dropRouteId) routeIds.push(job.dropRouteId.toString());
      console.log(`      Route assigned: Yes (Route IDs: ${routeIds.join(', ')})`);
    } else {
      console.log(`      Route assigned: No`);
    }

    // Get detailed stop completion status
    const stopStatus = await getStopCompletionStatus(job._id);
    console.log(`      Has pickup stop: ${stopStatus.hasPickupStop}, Has drop stop: ${stopStatus.hasDropStop}`);
    console.log(`      Pickup completed: ${stopStatus.pickupCompleted}, Drop completed: ${stopStatus.dropCompleted}`);
    
    if (stopStatus.onlyDropStop) {
      console.log(`      ⚠️  Job has ONLY drop stop (no pickup stop)`);
    } else if (stopStatus.onlyPickupStop) {
      console.log(`      ⚠️  Job has ONLY pickup stop (no drop stop)`);
    }

    // NEVER downgrade from DELIVERED or CANCELLED - these are final states
    const isFinalState = job.status === TRANSPORT_JOB_STATUS.DELIVERED || 
                         job.status === TRANSPORT_JOB_STATUS.CANCELLED;
    
    if (isFinalState) {
      console.log(`      ⚠️  Job is already in final state (${job.status}) - skipping status update`);
    } else {
      // Determine what status the job should have
      let targetStatus = null;
      
      // Priority 1: Check if route is assigned - should be DISPATCHED (unless already completed/in transit)
      if (hasRouteAssigned && job.status === TRANSPORT_JOB_STATUS.NEEDS_DISPATCH) {
        // Route is assigned but status is still "Needs Dispatch" - should be "Dispatched"
        targetStatus = TRANSPORT_JOB_STATUS.DISPATCHED;
      }
      // Priority 2: Check stop completion status
      // Case 1: Job has only drop stop
      else if (stopStatus.onlyDropStop) {
        if (stopStatus.dropCompleted) {
          // Drop stop is completed - mark as DELIVERED
          targetStatus = TRANSPORT_JOB_STATUS.DELIVERED;
        } else if (hasRouteAssigned && job.status === TRANSPORT_JOB_STATUS.NEEDS_DISPATCH) {
          // Route assigned but drop not completed - should be DISPATCHED
          targetStatus = TRANSPORT_JOB_STATUS.DISPATCHED;
        }
      }
      // Case 2: Job has only pickup stop
      else if (stopStatus.onlyPickupStop) {
        if (stopStatus.pickupCompleted) {
          // Pickup stop is completed - should be IN_TRANSIT (waiting for drop)
          // BUT only if not already DELIVERED
          if (job.status !== TRANSPORT_JOB_STATUS.DELIVERED) {
            targetStatus = TRANSPORT_JOB_STATUS.IN_TRANSIT;
          }
        } else if (hasRouteAssigned && job.status === TRANSPORT_JOB_STATUS.NEEDS_DISPATCH) {
          // Route assigned but pickup not completed - should be DISPATCHED
          targetStatus = TRANSPORT_JOB_STATUS.DISPATCHED;
        }
      }
      // Case 3: Job has both pickup and drop stops
      else if (stopStatus.hasPickupStop && stopStatus.hasDropStop) {
        if (stopStatus.pickupCompleted && stopStatus.dropCompleted) {
          // Both stops are completed - mark as DELIVERED
          targetStatus = TRANSPORT_JOB_STATUS.DELIVERED;
        } else if (stopStatus.pickupCompleted && !stopStatus.dropCompleted) {
          // Pickup is completed but drop is not - should be IN_TRANSIT
          // BUT only if not already DELIVERED
          if (job.status !== TRANSPORT_JOB_STATUS.DELIVERED) {
            targetStatus = TRANSPORT_JOB_STATUS.IN_TRANSIT;
          }
        } else if (hasRouteAssigned && job.status === TRANSPORT_JOB_STATUS.NEEDS_DISPATCH) {
          // Route assigned but stops not completed - should be DISPATCHED
          targetStatus = TRANSPORT_JOB_STATUS.DISPATCHED;
        }
      }
      // Case 4: No stops found but route is assigned
      else if (hasRouteAssigned && job.status === TRANSPORT_JOB_STATUS.NEEDS_DISPATCH) {
        // Route assigned but no stops found yet - should be DISPATCHED
        targetStatus = TRANSPORT_JOB_STATUS.DISPATCHED;
      }

      // Update job status if needed (but never downgrade from DELIVERED/CANCELLED)
      if (targetStatus && job.status !== targetStatus) {
        await TransportJob.findByIdAndUpdate(job._id, {
          status: targetStatus
        });
        console.log(`      ✅ Updated transport job status from "${job.status}" to "${targetStatus}"`);

        // Update vehicle's transportJobs history
        await updateVehicleTransportJobsHistory(job._id, targetStatus);

        jobsFixed++;
        vehicleNeedsUpdate = true;
      } else if (targetStatus && job.status === targetStatus) {
        console.log(`      ✓ Transport job already has correct status: ${targetStatus}`);
      } else {
        console.log(`      ✓ No status update needed for this transport job`);
      }
    }
  }

  // Recalculate and update vehicle status
  // NEVER downgrade from DELIVERED or CANCELLED - these are final states
  const vehicleIsFinalState = vehicle.status === VEHICLE_STATUS.DELIVERED || 
                               vehicle.status === VEHICLE_STATUS.CANCELLED;
  
  if (vehicleIsFinalState) {
    console.log(`\n   ⚠️  Vehicle is already in final state (${vehicle.status}) - skipping status update`);
    return { fixed: false, skipped: true };
  }
  
  if (vehicleNeedsUpdate || jobsFixed > 0) {
    const newVehicleStatus = await calculateVehicleStatusFromJobs(vehicle._id);
    console.log(`\n   🚗 Recalculated vehicle status: ${newVehicleStatus}`);

    // Never downgrade from DELIVERED or CANCELLED
    if (newVehicleStatus !== vehicle.status) {
      // Additional check: don't downgrade to an earlier status
      const statusHierarchy = {
        [VEHICLE_STATUS.PURCHASED_INTAKE_NEEDED]: 1,
        [VEHICLE_STATUS.INTAKE_COMPLETE]: 2,
        [VEHICLE_STATUS.READY_FOR_TRANSPORT]: 3,
        [VEHICLE_STATUS.IN_TRANSPORT]: 4,
        [VEHICLE_STATUS.DELIVERED]: 5,
        [VEHICLE_STATUS.CANCELLED]: 5 // Same level as DELIVERED (final state)
      };
      
      const currentLevel = statusHierarchy[vehicle.status] || 0;
      const newLevel = statusHierarchy[newVehicleStatus] || 0;
      
      // Only update if new status is same or higher level (never downgrade)
      if (newLevel >= currentLevel) {
        const updateData = { status: newVehicleStatus };
        
        // Add deliveredAt timestamp if vehicle is now fully delivered
        if (newVehicleStatus === VEHICLE_STATUS.DELIVERED) {
          updateData.deliveredAt = new Date();
        }

        await Vehicle.findByIdAndUpdate(vehicle._id, updateData);
        console.log(`   ✅ Updated vehicle status from "${vehicle.status}" to "${newVehicleStatus}"`);
        return { fixed: true, skipped: false };
      } else {
        console.log(`   ⚠️  Would downgrade vehicle status from "${vehicle.status}" to "${newVehicleStatus}" - skipping`);
        return { fixed: false, skipped: true };
      }
    } else {
      console.log(`   ✓ Vehicle status is already correct: ${vehicle.status}`);
      return { fixed: false, skipped: true };
    }
  } else {
    console.log(`   ✓ No updates needed for this vehicle`);
    return { fixed: false, skipped: true };
  }
};

/**
 * Main fix function
 */
const fixVehicleStatuses = async () => {
  try {
    console.log('🔧 Starting vehicle status fix script...\n');

    let totalFixed = 0;
    let totalSkipped = 0;
    let vehiclesToProcess = [];

    if (CHECK_ALL_VEHICLES) {
      console.log('🔍 Checking ALL vehicles for status inconsistencies...\n');
      
      // Find all vehicles that have transport jobs
      const vehiclesWithJobs = await Vehicle.find({
        $or: [
          { 'transportJobs.0': { $exists: true } },
          { currentTransportJobId: { $exists: true, $ne: null } }
        ]
      }).populate('currentTransportJobId');

      console.log(`Found ${vehiclesWithJobs.length} vehicles with transport jobs`);
      
      // Also include vehicles from the specific list
      const specificVehicles = [];
      for (const vehicleInfo of vehiclesToFix) {
        const vehicle = vehicleInfo.vin 
          ? await Vehicle.findOne({ vin: vehicleInfo.vin })
          : await Vehicle.findOne({
              year: vehicleInfo.year,
              make: { $regex: new RegExp(`^${vehicleInfo.make}$`, 'i') },
              model: { $regex: new RegExp(vehicleInfo.model, 'i') }
            });
        
        if (vehicle && !vehiclesWithJobs.some(v => v._id.toString() === vehicle._id.toString())) {
          specificVehicles.push(vehicle);
        }
      }
      
      vehiclesToProcess = [...vehiclesWithJobs, ...specificVehicles];
      
      // Remove duplicates
      const uniqueVehicles = new Map();
      vehiclesToProcess.forEach(v => {
        uniqueVehicles.set(v._id.toString(), v);
      });
      vehiclesToProcess = Array.from(uniqueVehicles.values());
      
      console.log(`Total unique vehicles to process: ${vehiclesToProcess.length}\n`);
    } else {
      console.log('🔍 Checking only specified vehicles...\n');
      
      // Process only the specified vehicles
      for (const vehicleInfo of vehiclesToFix) {
        const vehicle = vehicleInfo.vin 
          ? await Vehicle.findOne({ vin: vehicleInfo.vin })
          : await Vehicle.findOne({
              year: vehicleInfo.year,
              make: { $regex: new RegExp(`^${vehicleInfo.make}$`, 'i') },
              model: { $regex: new RegExp(vehicleInfo.model, 'i') }
            });

        if (!vehicle) {
          const vehicleDescription = vehicleInfo.vin 
            ? `VIN: ${vehicleInfo.vin}`
            : `${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`;
          console.log(`⚠️  Vehicle not found: ${vehicleDescription}`);
          totalSkipped++;
          continue;
        }

        vehiclesToProcess.push({ vehicle, vehicleInfo });
      }
    }

    // Process each vehicle
    for (const item of vehiclesToProcess) {
      const vehicle = item.vehicle || item;
      const vehicleInfo = item.vehicleInfo || null;
      
      const result = await processVehicle(vehicle, vehicleInfo);
      
      if (result.fixed) {
        totalFixed++;
      } else if (result.skipped) {
        totalSkipped++;
      }
    }

    console.log(`\n\n✅ Fix script completed!`);
    console.log(`   Fixed: ${totalFixed} vehicles`);
    console.log(`   Skipped: ${totalSkipped} vehicles`);

  } catch (error) {
    console.error('❌ Error in fix script:', error);
    throw error;
  }
};

// Run the script
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI)
    .then(() => {
      console.log('✅ Connected to MongoDB');
      return fixVehicleStatuses();
    })
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fixVehicleStatuses };


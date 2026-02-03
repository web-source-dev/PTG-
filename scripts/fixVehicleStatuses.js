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
const vehiclesToFix = [
  { year: 2017, make: 'VOLVO', model: 'S90' },
  { year: 2024, make: 'Acura', model: 'RDX' },
  { year: 2021, make: 'Chevrolet', model: 'Silverado' },
  { year: 2018, make: 'Porsche', model: 'Cayenne E-Hybrid' },
  { year: 2024, make: 'Ford', model: 'Maverick XL 4DR' }
];

/**
 * Check if a transport job is fully completed (both pickup and drop stops completed)
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

    // Job is fully completed only if it has both pickup and drop stops, and both are completed
    return hasPickupStop && hasDropStop && pickupCompleted && dropCompleted;
  } catch (error) {
    console.error(`Error checking if transport job ${transportJobId} is fully completed:`, error);
    return false;
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
 * Main fix function
 */
const fixVehicleStatuses = async () => {
  try {
    console.log('🔧 Starting vehicle status fix script...\n');

    let totalFixed = 0;
    let totalSkipped = 0;

    for (const vehicleInfo of vehiclesToFix) {
      console.log(`\n📦 Processing: ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`);
      
      // Find the vehicle
      const vehicle = await Vehicle.findOne({
        year: vehicleInfo.year,
        make: { $regex: new RegExp(`^${vehicleInfo.make}$`, 'i') },
        model: { $regex: new RegExp(vehicleInfo.model, 'i') }
      });

      if (!vehicle) {
        console.log(`⚠️  Vehicle not found: ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`);
        totalSkipped++;
        continue;
      }

      console.log(`   Found vehicle: ${vehicle.vin || 'N/A'} (ID: ${vehicle._id})`);
      console.log(`   Current status: ${vehicle.status}`);

      // Find all transport jobs for this vehicle
      const transportJobs = await TransportJob.find({ vehicleId: vehicle._id });
      console.log(`   Found ${transportJobs.length} transport job(s)`);

      if (transportJobs.length === 0) {
        console.log(`   ⚠️  No transport jobs found - skipping`);
        totalSkipped++;
        continue;
      }

      let vehicleNeedsUpdate = false;
      let jobsFixed = 0;

      // Check each transport job
      for (const job of transportJobs) {
        console.log(`\n   📋 Checking transport job: ${job.jobNumber || job._id}`);
        console.log(`      Current status: ${job.status}`);

        // Check if job is fully completed
        const isFullyCompleted = await isTransportJobFullyCompleted(job._id);
        console.log(`      Fully completed: ${isFullyCompleted}`);

        if (isFullyCompleted && job.status !== TRANSPORT_JOB_STATUS.DELIVERED) {
          // Update transport job status
          await TransportJob.findByIdAndUpdate(job._id, {
            status: TRANSPORT_JOB_STATUS.DELIVERED
          });
          console.log(`      ✅ Updated transport job status to DELIVERED`);

          // Update vehicle's transportJobs history
          await updateVehicleTransportJobsHistory(job._id, TRANSPORT_JOB_STATUS.DELIVERED);

          jobsFixed++;
          vehicleNeedsUpdate = true;
        } else if (isFullyCompleted) {
          console.log(`      ✓ Transport job already marked as DELIVERED`);
        } else {
          console.log(`      ⚠️  Transport job not fully completed - checking stops...`);
          
          // Check if pickup is completed but drop is not
          const routesWithJob = await Route.find({
            $or: [
              { 'stops.transportJobId': job._id },
              { selectedTransportJobs: job._id }
            ]
          });

          let pickupCompleted = false;
          let dropCompleted = false;

          for (const route of routesWithJob) {
            if (route.stops && Array.isArray(route.stops)) {
              route.stops.forEach(stop => {
                const stopJobId = typeof stop.transportJobId === 'object'
                  ? (stop.transportJobId._id || stop.transportJobId.id || stop.transportJobId.toString())
                  : stop.transportJobId;

                if (stopJobId && stopJobId.toString() === job._id.toString()) {
                  if (stop.stopType === 'pickup' && 
                      (stop.status === ROUTE_STOP_STATUS.COMPLETED || stop.status === 'Completed')) {
                    pickupCompleted = true;
                  } else if (stop.stopType === 'drop' && 
                             (stop.status === ROUTE_STOP_STATUS.COMPLETED || stop.status === 'Completed')) {
                    dropCompleted = true;
                  }
                }
              });
            }
          }

          console.log(`      Pickup completed: ${pickupCompleted}, Drop completed: ${dropCompleted}`);
          
          // If pickup is completed but job is not "In Transit", update it
          if (pickupCompleted && !dropCompleted && job.status !== TRANSPORT_JOB_STATUS.IN_TRANSIT) {
            await TransportJob.findByIdAndUpdate(job._id, {
              status: TRANSPORT_JOB_STATUS.IN_TRANSIT
            });
            console.log(`      ✅ Updated transport job status to IN_TRANSIT`);
            await updateVehicleTransportJobsHistory(job._id, TRANSPORT_JOB_STATUS.IN_TRANSIT);
            jobsFixed++;
            vehicleNeedsUpdate = true;
          }
        }
      }

      // Recalculate and update vehicle status
      if (vehicleNeedsUpdate || jobsFixed > 0) {
        const newVehicleStatus = await calculateVehicleStatusFromJobs(vehicle._id);
        console.log(`\n   🚗 Recalculated vehicle status: ${newVehicleStatus}`);

        if (newVehicleStatus !== vehicle.status) {
          const updateData = { status: newVehicleStatus };
          
          // Add deliveredAt timestamp if vehicle is now fully delivered
          if (newVehicleStatus === VEHICLE_STATUS.DELIVERED) {
            updateData.deliveredAt = new Date();
          }

          await Vehicle.findByIdAndUpdate(vehicle._id, updateData);
          console.log(`   ✅ Updated vehicle status from "${vehicle.status}" to "${newVehicleStatus}"`);
          totalFixed++;
        } else {
          console.log(`   ✓ Vehicle status is already correct: ${vehicle.status}`);
        }
      } else {
        console.log(`   ✓ No updates needed for this vehicle`);
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


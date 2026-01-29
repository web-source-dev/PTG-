/**
 * Migration Script: Move Vehicle Location Data to Transport Jobs
 *
 * This script migrates location data from Vehicle models to TransportJob models
 * to support multiple transport jobs per vehicle.
 *
 * Run this script after deploying the new model changes.
 */

const mongoose = require('mongoose');
const Vehicle = require('../models/Vehicle');
const TransportJob = require('../models/TransportJob');

const dotenv = require('dotenv');
dotenv.config();

async function migrateVehicleLocations() {
  console.log('Starting vehicle location migration...');

  try {
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL);
      console.log('Connected to database');
    }

    // Find all vehicles that have location data (using lean() to get raw data)
    const vehiclesWithLocations = await Vehicle.find({
      $or: [
        { pickupLocationName: { $exists: true } },
        { dropLocationName: { $exists: true } },
        { pickupCity: { $exists: true } },
        { dropCity: { $exists: true } }
      ]
    }).lean(); // Use lean() to get raw MongoDB data

    console.log(`Found ${vehiclesWithLocations.length} vehicles with location data`);

    let migratedCount = 0;
    let cleanedCount = 0;
    let skippedCount = 0;

    for (const vehicle of vehiclesWithLocations) {
      try {
        console.log(`Processing vehicle: ${vehicle.vin} (${vehicle.year} ${vehicle.make} ${vehicle.model})`);
        console.log(`   Vehicle location data: pickup="${vehicle.pickupLocationName}", drop="${vehicle.dropLocationName}"`);

        // Find the transport job for this vehicle
        let transportJob = null;

        // First try to find existing transport job by vehicleId
        transportJob = await TransportJob.findOne({ vehicleId: vehicle._id });

        // If not found, try the current transport job reference
        if (!transportJob && vehicle.currentTransportJobId) {
          transportJob = await TransportJob.findById(vehicle.currentTransportJobId);
        }

        // If still not found, try the legacy transportJobId reference
        if (!transportJob && vehicle.transportJobId) {
          if (typeof vehicle.transportJobId === 'string') {
            transportJob = await TransportJob.findById(vehicle.transportJobId);
          } else if (typeof vehicle.transportJobId === 'object' && vehicle.transportJobId._id) {
            transportJob = await TransportJob.findById(vehicle.transportJobId._id);
          }
        }

        // Also get the full vehicle document (not lean) for updating
        const fullVehicle = await Vehicle.findById(vehicle._id);

        if (transportJob) {
          // Move location data from vehicle to existing transport job
          console.log(`📝 Migrating location data for vehicle ${vehicle.vin} to existing transport job ${transportJob.jobNumber || transportJob._id}`);

          // Move location data from vehicle to transport job - force update with vehicle data
          const updateFields = {};

          // Always migrate vehicle data to transport job, overwriting any existing empty data
          // Pickup fields
          if (vehicle.pickupLocationName !== undefined) {
            updateFields.pickupLocationName = vehicle.pickupLocationName;
          }
          if (vehicle.pickupCity !== undefined) {
            updateFields.pickupCity = vehicle.pickupCity;
          }
          if (vehicle.pickupState !== undefined) {
            updateFields.pickupState = vehicle.pickupState;
          }
          if (vehicle.pickupZip !== undefined) {
            updateFields.pickupZip = vehicle.pickupZip;
          }
          if (vehicle.pickupContactName !== undefined) {
            updateFields.pickupContactName = vehicle.pickupContactName;
          }
          if (vehicle.pickupContactPhone !== undefined) {
            updateFields.pickupContactPhone = vehicle.pickupContactPhone;
          }
          if (vehicle.pickupDateStart !== undefined) {
            updateFields.pickupDateStart = vehicle.pickupDateStart;
          }
          if (vehicle.pickupDateEnd !== undefined) {
            updateFields.pickupDateEnd = vehicle.pickupDateEnd;
          }
          if (vehicle.pickupTimeStart !== undefined) {
            updateFields.pickupTimeStart = vehicle.pickupTimeStart;
          }
          if (vehicle.pickupTimeEnd !== undefined) {
            updateFields.pickupTimeEnd = vehicle.pickupTimeEnd;
          }

          // Drop fields
          if (vehicle.dropDestinationType !== undefined) {
            updateFields.dropDestinationType = vehicle.dropDestinationType;
          }
          if (vehicle.dropLocationName !== undefined) {
            updateFields.dropLocationName = vehicle.dropLocationName;
          }
          if (vehicle.dropCity !== undefined) {
            updateFields.dropCity = vehicle.dropCity;
          }
          if (vehicle.dropState !== undefined) {
            updateFields.dropState = vehicle.dropState;
          }
          if (vehicle.dropZip !== undefined) {
            updateFields.dropZip = vehicle.dropZip;
          }
          if (vehicle.dropContactName !== undefined) {
            updateFields.dropContactName = vehicle.dropContactName;
          }
          if (vehicle.dropContactPhone !== undefined) {
            updateFields.dropContactPhone = vehicle.dropContactPhone;
          }
          if (vehicle.dropDateStart !== undefined) {
            updateFields.dropDateStart = vehicle.dropDateStart;
          }
          if (vehicle.dropDateEnd !== undefined) {
            updateFields.dropDateEnd = vehicle.dropDateEnd;
          }
          if (vehicle.dropTimeStart !== undefined) {
            updateFields.dropTimeStart = vehicle.dropTimeStart;
          }
          if (vehicle.dropTimeEnd !== undefined) {
            updateFields.dropTimeEnd = vehicle.dropTimeEnd;
          }

          // Set transport purpose if not set
          if (!transportJob.transportPurpose) {
            updateFields.transportPurpose = 'initial_delivery';
          }

          // Only update if we have fields to update
          if (Object.keys(updateFields).length > 0) {
            console.log(`   Updating transport job with ${Object.keys(updateFields).length} fields:`, Object.keys(updateFields));
            console.log(`   Sample data: pickupLocationName=${updateFields.pickupLocationName || 'empty'}, dropLocationName=${updateFields.dropLocationName || 'empty'}`);
            await TransportJob.findByIdAndUpdate(transportJob._id, updateFields);
          } else {
            console.log(`   No data to migrate from vehicle to transport job`);
          }

          // Create transport history entry for the vehicle (only if not already exists)
          const existingHistoryEntry = vehicle.transportJobs?.find(
            job => job.transportJobId?.toString() === transportJob._id.toString()
          );

          if (!existingHistoryEntry) {
            const transportHistoryEntry = {
              transportJobId: transportJob._id,
              routeId: transportJob.routeId,
              status: transportJob.status,
              transportPurpose: 'initial_delivery',
              createdAt: transportJob.createdAt || new Date()
            };

            await Vehicle.findByIdAndUpdate(vehicle._id, {
              $push: { transportJobs: transportHistoryEntry },
              $inc: { totalTransports: 1 }
            });
            console.log(`   Added transport history entry`);
          } else {
            console.log(`   Transport history entry already exists`);
          }

          // Always remove location fields from vehicle after processing (transport jobs now handle this data)
          const locationFieldsToRemove = [
            'pickupLocationName', 'pickupCity', 'pickupState', 'pickupZip',
            'pickupContactName', 'pickupContactPhone', 'pickupDateStart', 'pickupDateEnd',
            'pickupTimeStart', 'pickupTimeEnd', 'dropDestinationType', 'dropLocationName',
            'dropCity', 'dropState', 'dropZip', 'dropContactName', 'dropContactPhone',
            'dropDateStart', 'dropDateEnd', 'dropTimeStart', 'dropTimeEnd', 'availableToShipDate'
          ];

          const unsetFields = {};
          locationFieldsToRemove.forEach(field => {
            // Only unset fields that actually exist on the raw vehicle data
            if (vehicle[field] !== undefined) {
              unsetFields[field] = 1;
            }
          });

          if (Object.keys(unsetFields).length > 0) {
            console.log(`   Unsetting fields:`, Object.keys(unsetFields));
            console.log(`   Vehicle ID: ${vehicle._id}`);

            // Use MongoDB native driver for more reliable $unset
            const db = mongoose.connection.db;
            const vehicleCollection = db.collection('vehicles');
            const updateResult = await vehicleCollection.updateOne(
              { _id: vehicle._id },
              { $unset: unsetFields }
            );

            console.log(`   MongoDB update result:`, updateResult.modifiedCount > 0 ? 'success' : 'failed');
            console.log(`   Removed ${Object.keys(unsetFields).length} location fields from vehicle (transport jobs now handle this data)`);
          } else {
            console.log(`   No location fields to remove from vehicle (fields found: ${locationFieldsToRemove.filter(f => vehicle[f] !== undefined).join(', ')})`);
          }

          console.log(`✅ Migrated vehicle ${vehicle.vin} - moved location data to transport job ${transportJob.jobNumber}`);
          migratedCount++;
        } else {
          // Vehicle has location data but no transport job - just clean up the old location fields
          console.log(`🧹 Cleaning up location data for vehicle ${vehicle.vin} (no transport job found)`);

          const locationFieldsToRemove = [
            'pickupLocationName', 'pickupCity', 'pickupState', 'pickupZip',
            'pickupContactName', 'pickupContactPhone', 'pickupDateStart', 'pickupDateEnd',
            'pickupTimeStart', 'pickupTimeEnd', 'dropDestinationType', 'dropLocationName',
            'dropCity', 'dropState', 'dropZip', 'dropContactName', 'dropContactPhone',
            'dropDateStart', 'dropDateEnd', 'dropTimeStart', 'dropTimeEnd', 'availableToShipDate'
          ];

          const unsetFields = {};
          locationFieldsToRemove.forEach(field => {
            // Only unset fields that actually exist on the raw vehicle data
            if (vehicle[field] !== undefined) {
              unsetFields[field] = 1;
            }
          });

          if (Object.keys(unsetFields).length > 0) {
            // Use MongoDB native driver for more reliable $unset
            const db = mongoose.connection.db;
            const vehicleCollection = db.collection('vehicles');
            const updateResult = await vehicleCollection.updateOne(
              { _id: vehicle._id },
              { $unset: unsetFields }
            );

            console.log(`   MongoDB update result:`, updateResult.modifiedCount > 0 ? 'success' : 'failed');
            console.log(`   Removed ${Object.keys(unsetFields).length} location fields from vehicle`);
            cleanedCount++;
          } else {
            console.log(`   No location fields to remove from vehicle`);
          }
        }

      } catch (error) {
        console.error(`❌ Error migrating vehicle ${vehicle.vin}:`, error);
        skippedCount++;
      }
    }

    // Update vehicles that don't have location data but do have transport jobs
    const vehiclesWithJobs = await Vehicle.find({
      $or: [
        { transportJobId: { $exists: true, $ne: null } },
        { currentTransportJobId: { $exists: true, $ne: null } }
      ],
      transportJobs: { $size: 0 } // No transport history yet
    });

    console.log(`Found ${vehiclesWithJobs.length} vehicles with transport jobs but no history`);

    for (const vehicle of vehiclesWithJobs) {
      try {
        let transportJobId = null;

        if (vehicle.currentTransportJobId) {
          transportJobId = vehicle.currentTransportJobId;
        } else if (vehicle.transportJobId) {
          transportJobId = typeof vehicle.transportJobId === 'object' ? vehicle.transportJobId._id : vehicle.transportJobId;
        }

        if (transportJobId) {
          const transportJob = await TransportJob.findById(transportJobId);
          if (transportJob) {
            const transportHistoryEntry = {
              transportJobId: transportJob._id,
              routeId: transportJob.routeId,
              status: transportJob.status,
              transportPurpose: 'initial_delivery',
              createdAt: transportJob.createdAt || new Date()
            };

            await Vehicle.findByIdAndUpdate(vehicle._id, {
              $push: { transportJobs: transportHistoryEntry },
              $inc: { totalTransports: 1 }
            });

            console.log(`✅ Added transport history for vehicle ${vehicle.vin}`);
          }
        }
      } catch (error) {
        console.error(`❌ Error adding transport history for vehicle ${vehicle.vin}:`, error);
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`✅ Successfully migrated: ${migratedCount} vehicles`);
    console.log(`   - Moved location data to existing transport jobs`);
    console.log(`🧹 Cleaned up: ${cleanedCount} vehicles`);
    console.log(`   - Removed old location fields from vehicles without transport jobs`);
    console.log(`⚠️  Skipped: ${skippedCount} vehicles`);
    console.log('🎉 Migration completed!');

    // Close database connection if we opened it
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('Database connection closed');
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateVehicleLocations()
    .then(() => {
      console.log('Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateVehicleLocations };


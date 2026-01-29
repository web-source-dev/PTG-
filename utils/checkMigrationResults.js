/**
 * Script to check migration results
 */

const mongoose = require('mongoose');
const Vehicle = require('../models/Vehicle');
const TransportJob = require('../models/TransportJob');

const dotenv = require('dotenv');
dotenv.config();

async function checkMigrationResults() {
  console.log('🔍 Checking migration results...');

  try {
    // Connect to database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL);
      console.log('📡 Connected to database');
    }

    // Check one vehicle that was supposed to be migrated
    const testVehicle = await Vehicle.findOne({ vin: '5NTJDDAF6NH030957' }).populate('transportJobs.transportJobId');
    console.log('\n=== VEHICLE CHECK ===');
    console.log('VIN:', testVehicle?.vin);

    // Check raw document for location fields
    const rawVehicle = await Vehicle.findOne({ vin: '5NTJDDAF6NH030957' }).lean();
    console.log('Raw vehicle location fields:', {
      pickupLocationName: rawVehicle?.pickupLocationName !== undefined ? rawVehicle.pickupLocationName : 'NOT EXISTS',
      dropLocationName: rawVehicle?.dropLocationName !== undefined ? rawVehicle.dropLocationName : 'NOT EXISTS',
      pickupCity: rawVehicle?.pickupCity !== undefined ? rawVehicle.pickupCity : 'NOT EXISTS',
      dropCity: rawVehicle?.dropCity !== undefined ? rawVehicle.dropCity : 'NOT EXISTS'
    });

    console.log('Transport history count:', testVehicle?.transportJobs?.length || 0);
    console.log('Current transport job:', testVehicle?.currentTransportJobId || 'NONE');

    // Check the transport job for this vehicle
    const transportJob = await TransportJob.findOne({ vehicleId: testVehicle?._id });
    console.log('\n=== TRANSPORT JOB CHECK ===');
    console.log('Job Number:', transportJob?.jobNumber);
    console.log('Has location data:', {
      pickupLocationName: transportJob?.pickupLocationName || 'EMPTY',
      dropLocationName: transportJob?.dropLocationName || 'EMPTY',
      pickupCity: transportJob?.pickupCity || 'EMPTY',
      dropCity: transportJob?.dropCity || 'EMPTY'
    });
    console.log('Transport purpose:', transportJob?.transportPurpose);

    // Check another vehicle that was cleaned up
    const cleanedVehicle = await Vehicle.findOne({ vin: '1C6RR7HT0HS777628' });
    console.log('\n=== CLEANED VEHICLE CHECK ===');
    console.log('VIN:', cleanedVehicle?.vin);
    console.log('Has location fields:', {
      pickupLocationName: cleanedVehicle?.hasOwnProperty('pickupLocationName') ? (cleanedVehicle.pickupLocationName || 'EMPTY') : 'NOT SET',
      dropLocationName: cleanedVehicle?.hasOwnProperty('dropLocationName') ? (cleanedVehicle.dropLocationName || 'EMPTY') : 'NOT SET',
      pickupCity: cleanedVehicle?.hasOwnProperty('pickupCity') ? (cleanedVehicle.pickupCity || 'EMPTY') : 'NOT SET',
      dropCity: cleanedVehicle?.hasOwnProperty('dropCity') ? (cleanedVehicle.dropCity || 'EMPTY') : 'NOT SET'
    });

    // Check a few vehicles to see their actual field structure
    const sampleVehicles = await Vehicle.find({}).limit(3).lean();
    console.log('\n=== SAMPLE VEHICLE FIELD STRUCTURE ===');
    sampleVehicles.forEach((vehicle, index) => {
      console.log(`Vehicle ${index + 1} (${vehicle.vin}):`, {
        hasPickupLocationName: vehicle.hasOwnProperty('pickupLocationName'),
        pickupLocationName: vehicle.pickupLocationName,
        hasDropLocationName: vehicle.hasOwnProperty('dropLocationName'),
        dropLocationName: vehicle.dropLocationName
      });
    });

    // Check using MongoDB native driver
    const db = mongoose.connection.db;
    const vehicleCollection = db.collection('vehicles');

    // Count vehicles that still have location fields
    const vehiclesWithLocationFields = await vehicleCollection.countDocuments({
      $or: [
        { pickupLocationName: { $exists: true } },
        { dropLocationName: { $exists: true } },
        { pickupCity: { $exists: true } },
        { dropCity: { $exists: true } }
      ]
    });

    console.log('\n=== SUMMARY ===');
    console.log(`Vehicles with location fields (should be 0 for vehicles with transport jobs): ${vehiclesWithLocationFields}`);

    // Also check specifically vehicles with transport jobs
    const vehiclesWithJobsAndFields = await vehicleCollection.countDocuments({
      transportJobs: { $exists: true, $not: { $size: 0 } },
      $or: [
        { pickupLocationName: { $exists: true } },
        { dropLocationName: { $exists: true } },
        { pickupCity: { $exists: true } },
        { dropCity: { $exists: true } }
      ]
    });

    console.log(`Vehicles with transport jobs that still have location fields: ${vehiclesWithJobsAndFields}`);

    // Count transport jobs with location fields
    const transportJobsWithLocationFields = await TransportJob.countDocuments({
      $or: [
        { pickupLocationName: { $exists: true } },
        { dropLocationName: { $exists: true } }
      ]
    });

    console.log(`Transport jobs with location fields: ${transportJobsWithLocationFields}`);

    // Count vehicles with transport jobs
    const vehiclesWithTransportJobs = await Vehicle.countDocuments({
      transportJobs: { $exists: true, $not: { $size: 0 } }
    });

    console.log(`Vehicles with transport history: ${vehiclesWithTransportJobs}`);

    await mongoose.connection.close();
    console.log('📪 Database connection closed');

  } catch (error) {
    console.error('❌ Error checking migration results:', error);
  }
}

// Run if called directly
if (require.main === module) {
  checkMigrationResults();
}

module.exports = { checkMigrationResults };

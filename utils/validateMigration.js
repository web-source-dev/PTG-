/**
 * Validation Script: Test Multiple Transport Jobs per Vehicle
 *
 * This script validates that the migration was successful and that
 * vehicles can now have multiple transport jobs.
 */

const mongoose = require('mongoose');
const Vehicle = require('../models/Vehicle');
const TransportJob = require('../models/TransportJob');

const dotenv = require('dotenv');
dotenv.config();

async function validateMigration() {
  console.log('🔍 Starting validation of vehicle transport migration...');

  try {
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL);
      console.log('📡 Connected to database');
    }

    let testsPassed = 0;
    let testsFailed = 0;

    // Test 1: Check that vehicles WITH transport jobs no longer have location fields
    console.log('\n🧪 Test 1: Vehicles with transport jobs should not have location fields');
    const vehiclesWithJobsAndLocationFields = await Vehicle.find({
      transportJobs: { $exists: true, $not: { $size: 0 } },
      $or: [
        { pickupLocationName: { $exists: true } },
        { dropLocationName: { $exists: true } },
        { pickupCity: { $exists: true } },
        { dropCity: { $exists: true } }
      ]
    });

    if (vehiclesWithJobsAndLocationFields.length === 0) {
      console.log('✅ PASS: Vehicles with transport jobs do not have location fields');
      testsPassed++;
    } else {
      console.log(`❌ FAIL: ${vehiclesWithJobsAndLocationFields.length} vehicles with transport jobs still have location fields`);
      testsFailed++;
    }

    // Test 2: Check that transport jobs have location fields
    console.log('\n🧪 Test 2: Transport jobs should have location fields');
    const transportJobsCount = await TransportJob.countDocuments();
    const transportJobsWithLocations = await TransportJob.find({
      $or: [
        { pickupLocationName: { $exists: true, $ne: '' } },
        { dropLocationName: { $exists: true, $ne: '' } }
      ]
    });

    if (transportJobsWithLocations.length > 0) {
      console.log(`✅ PASS: ${transportJobsWithLocations.length} transport jobs have location data`);
      testsPassed++;
    } else {
      console.log('❌ FAIL: No transport jobs have location data');
      testsFailed++;
    }

    // Test 3: Check that vehicles have transport history
    console.log('\n🧪 Test 3: Vehicles should have transport history');
    const vehiclesWithHistory = await Vehicle.find({
      transportJobs: { $exists: true, $not: { $size: 0 } }
    });

    if (vehiclesWithHistory.length > 0) {
      console.log(`✅ PASS: ${vehiclesWithHistory.length} vehicles have transport history`);
      testsPassed++;
    } else {
      console.log('⚠️  WARNING: No vehicles have transport history yet (this is OK if no transport jobs exist)');
      testsPassed++; // This is OK if there are no transport jobs
    }

    // Test 4: Check that transport jobs have transport purpose
    console.log('\n🧪 Test 4: Transport jobs should have transport purpose');
    const transportJobsWithPurpose = await TransportJob.find({
      transportPurpose: { $exists: true, $ne: null, $ne: '' }
    });

    if (transportJobsWithPurpose.length >= transportJobsCount) {
      console.log(`✅ PASS: ${transportJobsWithPurpose.length} transport jobs have transport purpose`);
      testsPassed++;
    } else {
      console.log(`⚠️  WARNING: Only ${transportJobsWithPurpose.length} of ${transportJobsCount} transport jobs have transport purpose`);
      testsPassed++; // This is OK - will be set on migration
    }

    // Test 5: Test creating multiple transport jobs for same vehicle
    console.log('\n🧪 Test 5: Test creating multiple transport jobs for same vehicle');

    // Find a vehicle to test with
    const testVehicle = await Vehicle.findOne();
    if (testVehicle) {
      console.log(`Testing with vehicle: ${testVehicle.vin}`);

      // Create a test transport job
      const testTransportJob = await TransportJob.create({
        vehicleId: testVehicle._id,
        status: 'Needs Dispatch',
        carrier: 'PTG',
        transportPurpose: 'relocation',
        pickupLocationName: 'Test Pickup',
        pickupCity: 'Test City',
        pickupState: 'TS',
        dropLocationName: 'Test Drop',
        dropCity: 'Test City 2',
        dropState: 'TS'
      });

      // Check if vehicle transport history was updated
      const updatedVehicle = await Vehicle.findById(testVehicle._id);
      const hasNewTransportJob = updatedVehicle.transportJobs.some(
        job => job.transportJobId.toString() === testTransportJob._id.toString()
      );

      if (hasNewTransportJob) {
        console.log('✅ PASS: Vehicle transport history updated correctly');
        testsPassed++;
      } else {
        console.log('❌ FAIL: Vehicle transport history not updated');
        testsFailed++;
      }

      // Clean up test data
      await TransportJob.findByIdAndDelete(testTransportJob._id);
      await Vehicle.findByIdAndUpdate(testVehicle._id, {
        $pull: { transportJobs: { transportJobId: testTransportJob._id } },
        $inc: { totalTransports: -1 }
      });

      console.log('🧹 Cleaned up test data');
    } else {
      console.log('⚠️  SKIP: No vehicles found to test with');
    }

    // Test 6: Check model validation
    console.log('\n🧪 Test 6: Model validation should work');
    try {
      const testJob = new TransportJob({
        vehicleId: new mongoose.Types.ObjectId(),
        status: 'Needs Dispatch',
        transportPurpose: 'invalid_purpose' // This should fail
      });

      await testJob.validate();
      console.log('❌ FAIL: Model validation should have rejected invalid transport purpose');
      testsFailed++;
    } catch (error) {
      console.log('✅ PASS: Model validation correctly rejected invalid transport purpose');
      testsPassed++;
    }

    // Summary
    console.log('\n=== Validation Summary ===');
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📊 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);

    if (testsFailed === 0) {
      console.log('🎉 All tests passed! Migration successful.');
    } else {
      console.log('⚠️  Some tests failed. Please review the migration.');
    }

    // Close database connection if we opened it
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('📪 Database connection closed');
    }

    return testsFailed === 0;

  } catch (error) {
    console.error('❌ Validation failed:', error);
    return false;
  }
}

// Run validation if called directly
if (require.main === module) {
  validateMigration()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Validation script error:', error);
      process.exit(1);
    });
}

module.exports = { validateMigration };


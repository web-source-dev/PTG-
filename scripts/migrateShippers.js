const mongoose = require('mongoose');
const Vehicle = require('../models/Vehicle');
const Shipper = require('../models/Shipper');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

/**
 * Migration script to create Shipper profiles from existing vehicle shipper data
 * This script:
 * 1. Finds all vehicles with shipper information but no shipperId
 * 2. Groups vehicles by shipper (company + email or company + name)
 * 3. Creates Shipper profiles
 * 4. Links vehicles to the newly created shippers
 */
async function migrateShippers() {
  try {
    console.log('🚀 Starting shipper migration...\n');

    // Connect to MongoDB
    const connectDB = require('../config/database');
    await connectDB();
    console.log('✅ Connected to MongoDB\n');

    // Find all vehicles with shipper info but no shipperId
    const vehiclesWithoutShipper = await Vehicle.find({
      $and: [
        {
          $or: [
            { shipperName: { $exists: true, $ne: null, $ne: '' } },
            { shipperCompany: { $exists: true, $ne: null, $ne: '' } }
          ]
        },
        {
          $or: [
            { shipperId: { $exists: false } },
            { shipperId: null }
          ]
        }
      ]
    });

    console.log(`📊 Found ${vehiclesWithoutShipper.length} vehicles without shipper profiles\n`);

    if (vehiclesWithoutShipper.length === 0) {
      console.log('✅ No vehicles need migration. All vehicles already have shipper profiles.');
      process.exit(0);
    }

    // Group vehicles by shipper (company + email or company + name)
    const shipperMap = new Map();
    let skippedCount = 0;

    for (const vehicle of vehiclesWithoutShipper) {
      // Skip if no company name
      if (!vehicle.shipperCompany || vehicle.shipperCompany.trim() === '') {
        skippedCount++;
        continue;
      }

      const company = vehicle.shipperCompany.trim();
      const email = vehicle.shipperEmail ? vehicle.shipperEmail.toLowerCase().trim() : null;
      const name = vehicle.shipperName ? vehicle.shipperName.trim() : null;

      // Create a unique key for grouping: company + email (if available) or company + name
      const shipperKey = email 
        ? `${company}::${email}`
        : (name ? `${company}::${name}` : company);

      if (!shipperMap.has(shipperKey)) {
        shipperMap.set(shipperKey, {
          shipperCompany: company,
          shipperName: name || '',
          shipperEmail: email || '',
          shipperPhone: vehicle.shipperPhone ? vehicle.shipperPhone.trim() : '',
          vehicleIds: []
        });
      }

      shipperMap.get(shipperKey).vehicleIds.push(vehicle._id);
    }

    console.log(`📦 Grouped into ${shipperMap.size} unique shippers`);
    console.log(`⏭️  Skipped ${skippedCount} vehicles without company name\n`);

    // Check for existing shippers to avoid duplicates
    const existingShippers = await Shipper.find({});
    const existingShipperMap = new Map();
    
    for (const shipper of existingShippers) {
      const key = shipper.shipperEmail
        ? `${shipper.shipperCompany}::${shipper.shipperEmail}`
        : `${shipper.shipperCompany}::${shipper.shipperName}`;
      existingShipperMap.set(key, shipper);
    }

    console.log(`🔍 Found ${existingShippers.length} existing shippers in database\n`);

    // Create shippers and update vehicles
    let createdCount = 0;
    let linkedCount = 0;
    let alreadyExistsCount = 0;
    let errorCount = 0;

    for (const [key, shipperData] of shipperMap.entries()) {
      try {
        // Check if shipper already exists
        let shipper = null;
        
        if (shipperData.shipperEmail) {
          shipper = await Shipper.findOne({
            shipperCompany: shipperData.shipperCompany,
            shipperEmail: shipperData.shipperEmail
          });
        } else {
          shipper = await Shipper.findOne({
            shipperCompany: shipperData.shipperCompany,
            shipperName: shipperData.shipperName
          });
        }

        if (!shipper) {
          // Create new shipper
          shipper = await Shipper.create({
            shipperName: shipperData.shipperName,
            shipperCompany: shipperData.shipperCompany,
            shipperEmail: shipperData.shipperEmail || undefined,
            shipperPhone: shipperData.shipperPhone || undefined,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          createdCount++;
          console.log(`✅ Created shipper: ${shipperData.shipperCompany}${shipperData.shipperName ? ` (${shipperData.shipperName})` : ''}`);
        } else {
          alreadyExistsCount++;
          console.log(`ℹ️  Shipper already exists: ${shipperData.shipperCompany}${shipperData.shipperName ? ` (${shipperData.shipperName})` : ''}`);
        }

        // Update all vehicles with this shipperId
        const updateResult = await Vehicle.updateMany(
          { _id: { $in: shipperData.vehicleIds } },
          { $set: { shipperId: shipper._id } }
        );

        linkedCount += updateResult.modifiedCount;
        console.log(`   └─ Linked ${updateResult.modifiedCount} vehicle(s) to shipper\n`);

      } catch (error) {
        errorCount++;
        console.error(`❌ Error processing shipper ${shipperData.shipperCompany}:`, error.message);
        console.error(`   └─ Affected vehicles: ${shipperData.vehicleIds.length}\n`);
      }
    }

    // Update shipper statistics for all shippers
    console.log('📊 Updating shipper statistics...\n');
    const allShippers = await Shipper.find({});
    
    for (const shipper of allShippers) {
      const vehicleCount = await Vehicle.countDocuments({ shipperId: shipper._id });
      const deliveredCount = await Vehicle.countDocuments({ 
        shipperId: shipper._id,
        status: 'Delivered'
      });

      // Get routes count for this shipper
      const vehicles = await Vehicle.find({ shipperId: shipper._id }).select('_id');
      const vehicleIds = vehicles.map(v => v._id);
      
      const TransportJob = require('../models/TransportJob');
      const Route = require('../models/Route');
      
      const transportJobIds = await TransportJob.find({
        vehicleId: { $in: vehicleIds }
      }).distinct('_id');

      const routes = await Route.find({
        $or: [
          { 'stops.transportJobId': { $in: transportJobIds } },
          { selectedTransportJobs: { $in: transportJobIds } }
        ]
      });

      const completedRoutes = routes.filter(r => r.status === 'Completed').length;

      await Shipper.findByIdAndUpdate(shipper._id, {
        totalVehicles: vehicleCount,
        totalDeliveredVehicles: deliveredCount,
        totalRoutes: routes.length,
        totalCompletedRoutes: completedRoutes,
        updatedAt: new Date()
      });
    }
    
    console.log(`✅ Updated statistics for ${allShippers.length} shippers\n`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total vehicles processed: ${vehiclesWithoutShipper.length}`);
    console.log(`Vehicles skipped (no company): ${skippedCount}`);
    console.log(`Unique shippers found: ${shipperMap.size}`);
    console.log(`New shippers created: ${createdCount}`);
    console.log(`Shippers already existed: ${alreadyExistsCount}`);
    console.log(`Vehicles linked to shippers: ${linkedCount}`);
    console.log(`Errors encountered: ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    console.log('✅ Migration completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateShippers()
    .then(() => {
      console.log('Migration script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script error:', error);
      process.exit(1);
    });
}

module.exports = { migrateShippers };


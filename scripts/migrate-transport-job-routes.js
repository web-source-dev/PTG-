/**
 * Migration Script: Update Transport Jobs with Multi-Route Support
 * 
 * This script migrates existing transport jobs from the old single-route model
 * to the new multi-route model by:
 * 1. Finding all transport jobs with routeId but missing pickupRouteId/dropRouteId
 * 2. Setting both pickupRouteId and dropRouteId to the existing routeId
 *    (since all existing jobs are single-route where pickup and drop are on the same route)
 * 
 * Usage:
 *   node ptg/Backend/scripts/migrate-transport-job-routes.js
 * 
 * Safety:
 *   - This script is idempotent (safe to run multiple times)
 *   - It only updates jobs that are missing pickupRouteId or dropRouteId
 *   - It preserves existing routeId for backward compatibility
 *   - For single-route jobs, both pickupRouteId and dropRouteId will be set to the same routeId
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import models
const TransportJob = require('../models/TransportJob');
const Route = require('../models/Route');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected for migration');
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    process.exit(1);
  }
};

/**
 * Migrate transport jobs to multi-route support
 */
const migrateTransportJobs = async () => {
  try {
    console.log('\n🔄 Starting migration of transport jobs to multi-route support...\n');

    // Find all transport jobs that have routeId but are missing pickupRouteId or dropRouteId
    // This includes jobs where:
    // 1. routeId exists but pickupRouteId is missing/null
    // 2. routeId exists but dropRouteId is missing/null
    // 3. Both are missing (most common case for old data)
    const transportJobs = await TransportJob.find({
      routeId: { $exists: true, $ne: null },
      $or: [
        { pickupRouteId: { $exists: false } },
        { dropRouteId: { $exists: false } },
        { pickupRouteId: null },
        { dropRouteId: null }
      ]
    }).select('_id jobNumber routeId pickupRouteId dropRouteId').lean();

    console.log(`📊 Found ${transportJobs.length} transport jobs to migrate\n`);

    if (transportJobs.length === 0) {
      console.log('✅ No transport jobs need migration. All jobs are already up to date!');
      return;
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const job of transportJobs) {
      try {
        const jobId = job._id.toString();
        // Extract routeId - handle both populated and non-populated cases
        const routeId = typeof job.routeId === 'object' && job.routeId !== null
          ? (job.routeId._id || job.routeId)
          : job.routeId;

        if (!routeId) {
          console.log(`⏭️  Skipping job ${job.jobNumber || jobId}: No routeId found`);
          skippedCount++;
          continue;
        }

        // Check if already fully migrated (both pickupRouteId and dropRouteId are set)
        if (job.pickupRouteId && job.dropRouteId) {
          console.log(`⏭️  Skipping job ${job.jobNumber || jobId}: Already has pickupRouteId and dropRouteId`);
          skippedCount++;
          continue;
        }

        // For all existing single-route transport jobs, set both pickupRouteId and dropRouteId
        // to the same routeId (since pickup and drop are on the same route)
        const updateData = {};

        // Set pickupRouteId if not already set
        if (!job.pickupRouteId) {
          updateData.pickupRouteId = routeId;
        }

        // Set dropRouteId if not already set
        if (!job.dropRouteId) {
          updateData.dropRouteId = routeId;
        }

        // Only update if there are changes
        if (Object.keys(updateData).length > 0) {
          await TransportJob.findByIdAndUpdate(jobId, updateData);
          
          const changes = [];
          if (updateData.pickupRouteId) changes.push('pickupRouteId');
          if (updateData.dropRouteId) changes.push('dropRouteId');
          
          console.log(`✅ Migrated job ${job.jobNumber || jobId}: Set ${changes.join(' and ')} to route ${routeId}`);
          migratedCount++;
        } else {
          // Already has the values set
          console.log(`⏭️  Skipping job ${job.jobNumber || jobId}: Already has required route references`);
          skippedCount++;
        }
      } catch (error) {
        console.error(`❌ Error migrating job ${job.jobNumber || job._id}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successfully migrated: ${migratedCount} jobs`);
    console.log(`   ⏭️  Skipped: ${skippedCount} jobs`);
    console.log(`   ❌ Errors: ${errorCount} jobs`);
    console.log(`   📦 Total processed: ${transportJobs.length} jobs\n`);

    if (migratedCount > 0) {
      console.log('✅ Migration completed successfully!');
    } else if (errorCount === 0) {
      console.log('✅ All transport jobs are already migrated or up to date!');
    } else {
      console.log('⚠️  Migration completed with some errors. Please review the output above.');
    }
  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  }
};

/**
 * Main execution
 */
const runMigration = async () => {
  try {
    await connectDB();
    await migrateTransportJobs();
    console.log('\n✅ Migration script completed');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

// Run migration if script is executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { migrateTransportJobs };


const mongoose = require('mongoose');
const LocationService = require('../utils/locationService');

// Models that need formatted address population
const Vehicle = require('../models/Vehicle');
const Load = require('../models/Load');
const TransportJob = require('../models/TransportJob');
const Route = require('../models/Route');
const Expense = require('../models/Expense');
const VehicleProfitCalculation = require('../models/VehicleProfitCalculation');

require('dotenv').config();

/**
 * Populate formatted addresses for all models
 */
async function populateAllFormattedAddresses() {
  try {
    console.log('Starting formatted address population...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vos-ptg', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    let totalUpdated = 0;

    // 1. Update Vehicle records
    console.log('Updating Vehicle records...');
    const vehicles = await Vehicle.find({
      $or: [
        { initialPickupFormattedAddress: { $exists: false } },
        { initialDropFormattedAddress: { $exists: false } }
      ]
    });

    let vehicleUpdates = 0;
    for (const vehicle of vehicles) {
      let updated = false;

      // Populate pickup formatted address
      if (!vehicle.initialPickupFormattedAddress &&
          (vehicle.initialPickupLocationName || vehicle.initialPickupCity || vehicle.initialPickupState)) {
        const pickupLocation = {
          name: vehicle.initialPickupLocationName,
          city: vehicle.initialPickupCity,
          state: vehicle.initialPickupState,
          zip: vehicle.initialPickupZip
        };
        LocationService.populateFormattedAddress(pickupLocation);
        if (pickupLocation.formattedAddress) {
          vehicle.initialPickupFormattedAddress = pickupLocation.formattedAddress;
          updated = true;
        }
      }

      // Populate drop formatted address
      if (!vehicle.initialDropFormattedAddress &&
          (vehicle.initialDropLocationName || vehicle.initialDropCity || vehicle.initialDropState)) {
        const dropLocation = {
          name: vehicle.initialDropLocationName,
          city: vehicle.initialDropCity,
          state: vehicle.initialDropState,
          zip: vehicle.initialDropZip
        };
        LocationService.populateFormattedAddress(dropLocation);
        if (dropLocation.formattedAddress) {
          vehicle.initialDropFormattedAddress = dropLocation.formattedAddress;
          updated = true;
        }
      }

      if (updated) {
        await vehicle.save();
        vehicleUpdates++;
      }
    }
    console.log(`Updated ${vehicleUpdates} Vehicle records`);
    totalUpdated += vehicleUpdates;

    // 2. Update Load records
    console.log('Updating Load records...');
    const loads = await Load.find({
      $or: [
        { initialPickupFormattedAddress: { $exists: false } },
        { initialDropFormattedAddress: { $exists: false } }
      ]
    });

    let loadUpdates = 0;
    for (const load of loads) {
      let updated = false;

      // Populate pickup formatted address
      if (!load.initialPickupFormattedAddress &&
          (load.initialPickupLocationName || load.initialPickupCity || load.initialPickupState)) {
        const pickupLocation = {
          name: load.initialPickupLocationName,
          city: load.initialPickupCity,
          state: load.initialPickupState,
          zip: load.initialPickupZip
        };
        LocationService.populateFormattedAddress(pickupLocation);
        if (pickupLocation.formattedAddress) {
          load.initialPickupFormattedAddress = pickupLocation.formattedAddress;
          updated = true;
        }
      }

      // Populate drop formatted address
      if (!load.initialDropFormattedAddress &&
          (load.initialDropLocationName || load.initialDropCity || load.initialDropState)) {
        const dropLocation = {
          name: load.initialDropLocationName,
          city: load.initialDropCity,
          state: load.initialDropState,
          zip: load.initialDropZip
        };
        LocationService.populateFormattedAddress(dropLocation);
        if (dropLocation.formattedAddress) {
          load.initialDropFormattedAddress = dropLocation.formattedAddress;
          updated = true;
        }
      }

      if (updated) {
        await load.save();
        loadUpdates++;
      }
    }
    console.log(`Updated ${loadUpdates} Load records`);
    totalUpdated += loadUpdates;

    // 3. Update TransportJob records
    console.log('Updating TransportJob records...');
    const transportJobs = await TransportJob.find({
      $or: [
        { pickupFormattedAddress: { $exists: false } },
        { dropFormattedAddress: { $exists: false } }
      ]
    });

    let transportJobUpdates = 0;
    for (const transportJob of transportJobs) {
      let updated = false;

      // Populate pickup formatted address
      if (!transportJob.pickupFormattedAddress &&
          (transportJob.pickupLocationName || transportJob.pickupCity || transportJob.pickupState)) {
        const pickupLocation = {
          name: transportJob.pickupLocationName,
          city: transportJob.pickupCity,
          state: transportJob.pickupState,
          zip: transportJob.pickupZip
        };
        LocationService.populateFormattedAddress(pickupLocation);
        if (pickupLocation.formattedAddress) {
          transportJob.pickupFormattedAddress = pickupLocation.formattedAddress;
          updated = true;
        }
      }

      // Populate drop formatted address
      if (!transportJob.dropFormattedAddress &&
          (transportJob.dropLocationName || transportJob.dropCity || transportJob.dropState)) {
        const dropLocation = {
          name: transportJob.dropLocationName,
          city: transportJob.dropCity,
          state: transportJob.dropState,
          zip: transportJob.dropZip
        };
        LocationService.populateFormattedAddress(dropLocation);
        if (dropLocation.formattedAddress) {
          transportJob.dropFormattedAddress = dropLocation.formattedAddress;
          updated = true;
        }
      }

      if (updated) {
        await transportJob.save();
        transportJobUpdates++;
      }
    }
    console.log(`Updated ${transportJobUpdates} TransportJob records`);
    totalUpdated += transportJobUpdates;

    // 4. Update Route records - stops locations
    console.log('Updating Route records...');
    const routes = await Route.find({
      'stops.location': { $exists: true },
      'stops.location.formattedAddress': { $exists: false }
    });

    let routeUpdates = 0;
    for (const route of routes) {
      let updated = false;

      if (route.stops && Array.isArray(route.stops)) {
        for (const stop of route.stops) {
          if (stop.location && !stop.location.formattedAddress) {
            // Populate formatted address for stop location
            LocationService.populateFormattedAddress(stop.location);
            if (stop.location.formattedAddress) {
              updated = true;
            }
          }
        }
      }

      if (updated) {
        await route.save();
        routeUpdates++;
      }
    }
    console.log(`Updated ${routeUpdates} Route records`);
    totalUpdated += routeUpdates;

    // 5. Update Expense records - askedLocation
    console.log('Updating Expense records...');
    const expenses = await Expense.find({
      'askedLocation': { $exists: true },
      'askedLocation.formattedAddress': { $exists: false }
    });

    let expenseUpdates = 0;
    for (const expense of expenses) {
      if (expense.askedLocation && !expense.askedLocation.formattedAddress) {
        LocationService.populateFormattedAddress(expense.askedLocation);
        if (expense.askedLocation.formattedAddress) {
          await expense.save();
          expenseUpdates++;
        }
      }
    }
    console.log(`Updated ${expenseUpdates} Expense records`);
    totalUpdated += expenseUpdates;

    // 6. Update VehicleProfitCalculation records
    console.log('Updating VehicleProfitCalculation records...');
    const profitCalculations = await VehicleProfitCalculation.find({
      $or: [
        { pickupFormattedAddress: { $exists: false } },
        { dropFormattedAddress: { $exists: false } }
      ]
    });

    let profitCalcUpdates = 0;
    for (const calc of profitCalculations) {
      let updated = false;

      // Populate pickup formatted address
      if (!calc.pickupFormattedAddress &&
          (calc.pickupLocationName || calc.pickupCity || calc.pickupState)) {
        const pickupLocation = {
          name: calc.pickupLocationName,
          city: calc.pickupCity,
          state: calc.pickupState,
          zip: calc.pickupZip
        };
        LocationService.populateFormattedAddress(pickupLocation);
        if (pickupLocation.formattedAddress) {
          calc.pickupFormattedAddress = pickupLocation.formattedAddress;
          updated = true;
        }
      }

      // Populate drop formatted address
      if (!calc.dropFormattedAddress &&
          (calc.dropLocationName || calc.dropCity || calc.dropState)) {
        const dropLocation = {
          name: calc.dropLocationName,
          city: calc.dropCity,
          state: calc.dropState,
          zip: calc.dropZip
        };
        LocationService.populateFormattedAddress(dropLocation);
        if (dropLocation.formattedAddress) {
          calc.dropFormattedAddress = dropLocation.formattedAddress;
          updated = true;
        }
      }

      if (updated) {
        await calc.save();
        profitCalcUpdates++;
      }
    }
    console.log(`Updated ${profitCalcUpdates} VehicleProfitCalculation records`);
    totalUpdated += profitCalcUpdates;

    console.log(`\n=== FORMATTED ADDRESS POPULATION COMPLETE ===`);
    console.log(`Total records updated: ${totalUpdated}`);
    console.log(`- Vehicles: ${vehicleUpdates}`);
    console.log(`- Loads: ${loadUpdates}`);
    console.log(`- Transport Jobs: ${transportJobUpdates}`);
    console.log(`- Routes: ${routeUpdates}`);
    console.log(`- Expenses: ${expenseUpdates}`);
    console.log(`- Vehicle Profit Calculations: ${profitCalcUpdates}`);

  } catch (error) {
    console.error('Error populating formatted addresses:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the script
if (require.main === module) {
  populateAllFormattedAddresses();
}

module.exports = { populateAllFormattedAddresses };

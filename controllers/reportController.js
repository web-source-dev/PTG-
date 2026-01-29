const Route = require('../models/Route');
const TransportJob = require('../models/TransportJob');
const Truck = require('../models/Truck');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Expense = require('../models/Expense');
const mongoose = require('mongoose');

/**
 * Helper function to safely extract ObjectId from populated or unpopulated references
 * CRITICAL: Always check for populated documents FIRST before calling .toString()
 * because calling .toString() on a populated Mongoose document serializes the entire object
 */
const extractId = (ref) => {
  if (!ref) return null;
  
  // If it's already a string ObjectId (24 hex characters)
  if (typeof ref === 'string' && /^[0-9a-fA-F]{24}$/.test(ref)) {
    return ref;
  }
  
  // CRITICAL: For objects, ALWAYS check for _id FIRST
  // This handles both populated Mongoose documents and ObjectIds
  // NEVER call .toString() on the object itself if it's a populated document
  if (typeof ref === 'object' && ref !== null) {
    // Priority 1: Check if it has _id property using hasOwnProperty or 'in' operator
    // This is the most reliable way to extract ID from populated Mongoose documents
    // Check if _id exists in the object (either own property or inherited)
    if ('_id' in ref && ref._id !== undefined && ref._id !== null) {
      try {
        // If _id is an ObjectId instance, safely convert to string
        if (ref._id instanceof mongoose.Types.ObjectId) {
          return ref._id.toString();
        }
        // If _id is already a string ObjectId
        if (typeof ref._id === 'string' && /^[0-9a-fA-F]{24}$/.test(ref._id)) {
          return ref._id;
        }
        // If _id is something else, try to convert it safely
        if (mongoose.Types.ObjectId.isValid(ref._id)) {
          // Convert to string using valueOf or String()
          const idStr = String(ref._id.valueOf ? ref._id.valueOf() : ref._id);
          if (/^[0-9a-fA-F]{24}$/.test(idStr)) {
            return idStr;
          }
        }
      } catch (e) {
        // If any conversion fails, return null
        return null;
      }
    }
    
    // Priority 2: Check if it's a Mongoose document with .id getter (safe to use)
    // The .id getter returns _id.toString() without serializing the document
    // This is safer than accessing _id directly in some cases
    try {
      const idValue = ref.id;
      if (idValue && typeof idValue === 'string' && /^[0-9a-fA-F]{24}$/.test(idValue)) {
        return idValue;
      }
    } catch (e) {
      // If accessing .id fails or throws error, continue
    }
    
    // Priority 3: Check if it's an ObjectId instance (not a populated document)
    // Only check this if _id was not found above
    if (!('_id' in ref) && ref instanceof mongoose.Types.ObjectId) {
      return ref.toString();
    }
    
    // Priority 4: If it's an object but we couldn't extract ID, it might be an invalid reference
    // Return null to avoid adding invalid IDs to the Set
    return null;
  }
  
  return null;
};

/**
 * Get driver report - summary of all driver activities
 */
exports.getDriverReport = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { startDate, endDate } = req.query;

    // Validate driver exists
    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.plannedStartDate = {};
      if (startDate) dateFilter.plannedStartDate.$gte = new Date(startDate);
      if (endDate) dateFilter.plannedStartDate.$lte = new Date(endDate);
    }

    // Get all routes for this driver
    const routes = await Route.find({ driverId, ...dateFilter })
      .populate('truckId', 'truckNumber licensePlate make model year')
      .populate({
        path: 'selectedTransportJobs',
        select: 'jobNumber status vehicleId carrier carrierPayment',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model'
        }
      })
      .populate({
        path: 'stops.transportJobId',
        select: 'jobNumber status vehicleId carrier carrierPayment',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model'
        }
      })
      .sort({ plannedStartDate: -1 });

    // Get all transport jobs completed by this driver (from routes)
    const transportJobIds = new Set();
    routes.forEach(route => {
      if (route.selectedTransportJobs) {
        route.selectedTransportJobs.forEach(jobId => {
          const id = extractId(jobId);
          if (id) transportJobIds.add(id);
        });
      }
      if (route.stops) {
        route.stops.forEach(stop => {
          if (stop.transportJobId) {
            const id = extractId(stop.transportJobId);
            if (id) transportJobIds.add(id);
          }
        });
      }
    });

    const transportJobs = await TransportJob.find({
      _id: { $in: Array.from(transportJobIds) }
    })
      .populate('vehicleId', 'vin year make model')
      .sort({ createdAt: -1 });

    // Get all expenses by this driver
    const expenseFilter = { driverId };
    if (startDate || endDate) {
      expenseFilter.createdAt = {};
      if (startDate) expenseFilter.createdAt.$gte = new Date(startDate);
      if (endDate) expenseFilter.createdAt.$lte = new Date(endDate);
    }

    const expenses = await Expense.find(expenseFilter)
      .populate('truckId', 'truckNumber licensePlate make model year')
      .populate('routeId', 'routeNumber plannedStartDate plannedEndDate')
      .sort({ createdAt: -1 });

    // Calculate summary statistics
    const totalCost = expenses.reduce((sum, e) => sum + (e.totalCost || 0), 0);
    const totalCarrierPayment = transportJobs.reduce((sum, tj) => sum + (tj.carrierPayment || 0), 0);
    const totalGallons = expenses.filter(e => e.type === 'fuel' && e.gallons).reduce((sum, e) => sum + (e.gallons || 0), 0);
    const summary = {
      totalRoutes: routes.length,
      totalTransportJobs: transportJobIds.size,
      totalExpenses: expenses.length,
      totalFuelExpenses: expenses.filter(e => e.type === 'fuel').length,
      totalMaintenanceExpenses: expenses.filter(e => e.type === 'maintenance').length,
      totalFuelCost: expenses.filter(e => e.type === 'fuel').reduce((sum, e) => sum + (e.totalCost || 0), 0),
      totalMaintenanceCost: expenses.filter(e => e.type === 'maintenance').reduce((sum, e) => sum + (e.totalCost || 0), 0),
      totalCost,
      totalDistance: routes.reduce((sum, r) => sum + (r.totalDistance?.value || 0), 0), // Already in miles
      totalCarrierPayment,
      netAmount: totalCarrierPayment - totalCost,
      totalGallons
    };

    res.status(200).json({
      success: true,
      data: {
        driver: {
          _id: driver._id,
          firstName: driver.firstName,
          lastName: driver.lastName,
          email: driver.email,
          phoneNumber: driver.phoneNumber
        },
        summary,
        routes,
        transportJobs,
        expenses
      }
    });
  } catch (error) {
    console.error('Error generating driver report:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate driver report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get truck report - summary of all truck activities
 */
exports.getTruckReport = async (req, res) => {
  try {
    const { truckId } = req.params;
    const { startDate, endDate } = req.query;

    // Validate truck exists
    const truck = await Truck.findById(truckId);
    if (!truck) {
      return res.status(404).json({
        success: false,
        message: 'Truck not found'
      });
    }

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.plannedStartDate = {};
      if (startDate) dateFilter.plannedStartDate.$gte = new Date(startDate);
      if (endDate) dateFilter.plannedStartDate.$lte = new Date(endDate);
    }

    // Get all routes for this truck
    const routes = await Route.find({ truckId, ...dateFilter })
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate({
        path: 'selectedTransportJobs',
        select: 'jobNumber status vehicleId carrier carrierPayment',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model'
        }
      })
      .populate({
        path: 'stops.transportJobId',
        select: 'jobNumber status vehicleId carrier carrierPayment',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model'
        }
      })
      .sort({ plannedStartDate: -1 });

    // Get all unique drivers who used this truck
    const driverIds = new Set();
    routes.forEach(route => {
      if (route.driverId) {
        const id = extractId(route.driverId);
        if (id) driverIds.add(id);
      }
    });

    const drivers = await User.find({ _id: { $in: Array.from(driverIds) } })
      .select('firstName lastName email phoneNumber');

    // Get all transport jobs for routes using this truck
    const transportJobIds = new Set();
    routes.forEach(route => {
      if (route.selectedTransportJobs) {
        route.selectedTransportJobs.forEach(jobId => {
          const id = extractId(jobId);
          if (id) transportJobIds.add(id);
        });
      }
      if (route.stops) {
        route.stops.forEach(stop => {
          if (stop.transportJobId) {
            const id = extractId(stop.transportJobId);
            if (id) transportJobIds.add(id);
          }
        });
      }
    });

    const transportJobs = await TransportJob.find({
      _id: { $in: Array.from(transportJobIds) }
    })
      .populate('vehicleId', 'vin year make model')
      .sort({ createdAt: -1 });

    // Get all expenses for this truck
    const expenseFilter = { truckId };
    if (startDate || endDate) {
      expenseFilter.createdAt = {};
      if (startDate) expenseFilter.createdAt.$gte = new Date(startDate);
      if (endDate) expenseFilter.createdAt.$lte = new Date(endDate);
    }

    const expenses = await Expense.find(expenseFilter)
      .populate('driverId', 'firstName lastName email')
      .populate('routeId', 'routeNumber plannedStartDate plannedEndDate')
      .sort({ createdAt: -1 });

    // Calculate summary statistics
    const totalCost = expenses.reduce((sum, e) => sum + (e.totalCost || 0), 0);
    const totalCarrierPayment = transportJobs.reduce((sum, tj) => sum + (tj.carrierPayment || 0), 0);
    const totalGallons = expenses.filter(e => e.type === 'fuel' && e.gallons).reduce((sum, e) => sum + (e.gallons || 0), 0);
    const summary = {
      totalRoutes: routes.length,
      totalDrivers: driverIds.size,
      totalTransportJobs: transportJobIds.size,
      totalExpenses: expenses.length,
      totalFuelExpenses: expenses.filter(e => e.type === 'fuel').length,
      totalMaintenanceExpenses: expenses.filter(e => e.type === 'maintenance').length,
      totalFuelCost: expenses.filter(e => e.type === 'fuel').reduce((sum, e) => sum + (e.totalCost || 0), 0),
      totalMaintenanceCost: expenses.filter(e => e.type === 'maintenance').reduce((sum, e) => sum + (e.totalCost || 0), 0),
      totalCost,
      totalDistance: routes.reduce((sum, r) => sum + (r.totalDistance?.value || 0), 0), // Already in miles
      totalGallons,
      totalCarrierPayment,
      netAmount: totalCarrierPayment - totalCost
    };

    res.status(200).json({
      success: true,
      data: {
        truck: {
          _id: truck._id,
          truckNumber: truck.truckNumber,
          licensePlate: truck.licensePlate,
          make: truck.make,
          model: truck.model,
          year: truck.year,
          status: truck.status
        },
        summary,
        routes,
        drivers,
        transportJobs,
        expenses
      }
    });
  } catch (error) {
    console.error('Error generating truck report:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate truck report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get route report - complete data for a single route
 */
exports.getRouteReport = async (req, res) => {
  try {
    const { routeId } = req.params;

    // Get route with all populated data
    // Note: We keep as Mongoose document to preserve all functionality
    // but will extract IDs safely from populated references
    const route = await Route.findById(routeId)
      .populate('driverId', 'firstName lastName email phoneNumber')
      .populate('truckId', 'truckNumber licensePlate make model year status')
      .populate({
        path: 'selectedTransportJobs',
        select: 'jobNumber status vehicleId carrier carrierPayment',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip'
        }
      })
      .populate({
        path: 'stops.transportJobId',
        select: 'jobNumber status vehicleId carrier carrierPayment',
        populate: {
          path: 'vehicleId',
          select: 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip'
        }
      })
      .populate('createdBy', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName email');

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Get all unique transport jobs from this route
    const transportJobIds = new Set();
    if (route.selectedTransportJobs && Array.isArray(route.selectedTransportJobs)) {
      route.selectedTransportJobs.forEach(jobId => {
        const id = extractId(jobId);
        if (id) transportJobIds.add(id);
      });
    }
    if (route.stops && Array.isArray(route.stops)) {
      route.stops.forEach(stop => {
        if (stop.transportJobId) {
          const id = extractId(stop.transportJobId);
          if (id) transportJobIds.add(id);
        }
      });
    }

    const transportJobs = await TransportJob.find({
      _id: { $in: Array.from(transportJobIds) }
    })
      .populate('vehicleId', 'vin year make model pickupLocationName pickupCity pickupState pickupZip dropLocationName dropCity dropState dropZip')
      .sort({ createdAt: -1 });

    // Get all expenses for this route
    const expenses = await Expense.find({ routeId })
      .populate('driverId', 'firstName lastName email')
      .populate('truckId', 'truckNumber licensePlate make model year')
      .sort({ createdAt: -1 });

    // Calculate summary statistics
    const totalCarrierPayment = transportJobs.reduce((sum, tj) => sum + (tj.carrierPayment || 0), 0);
    const totalCost = expenses.reduce((sum, e) => sum + (e.totalCost || 0), 0);
    const summary = {
      totalTransportJobs: transportJobIds.size,
      totalExpenses: expenses.length,
      totalFuelExpenses: expenses.filter(e => e.type === 'fuel').length,
      totalMaintenanceExpenses: expenses.filter(e => e.type === 'maintenance').length,
      totalFuelCost: expenses.filter(e => e.type === 'fuel').reduce((sum, e) => sum + (e.totalCost || 0), 0),
      totalMaintenanceCost: expenses.filter(e => e.type === 'maintenance').reduce((sum, e) => sum + (e.totalCost || 0), 0),
      totalCost,
      totalDistance: route.totalDistance?.value || 0,
      totalDuration: route.totalDuration?.value || 0,
      totalCarrierPayment,
      totalGallons: expenses.filter(e => e.type === 'fuel' && e.gallons).reduce((sum, e) => sum + (e.gallons || 0), 0),
      netAmount: totalCarrierPayment - totalCost
    };

    res.status(200).json({
      success: true,
      data: {
        route,
        summary,
        transportJobs,
        expenses
      }
    });
  } catch (error) {
    console.error('Error generating route report:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate route report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all drivers report summary
 */
exports.getAllDriversReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get all drivers
    const drivers = await User.find({ role: 'ptgDriver' })
      .select('firstName lastName email phoneNumber')
      .sort({ lastName: 1, firstName: 1 });

    // Build date filter for routes
    const routeDateFilter = {};
    if (startDate || endDate) {
      routeDateFilter.plannedStartDate = {};
      if (startDate) routeDateFilter.plannedStartDate.$gte = new Date(startDate);
      if (endDate) routeDateFilter.plannedStartDate.$lte = new Date(endDate);
    }

    // Build date filter for expenses
    const expenseDateFilter = {};
    if (startDate || endDate) {
      expenseDateFilter.createdAt = {};
      if (startDate) expenseDateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) expenseDateFilter.createdAt.$lte = new Date(endDate);
    }

    // Get summary for each driver
    const driversSummary = await Promise.all(
      drivers.map(async (driver) => {
        const routes = await Route.find({ driverId: driver._id, ...routeDateFilter });
        const routesCount = routes.length;
        const expenses = await Expense.find({ driverId: driver._id, ...expenseDateFilter });
        const totalCost = expenses.reduce((sum, e) => sum + (e.totalCost || 0), 0);
        
        // Get all transport jobs for this driver's routes
        const transportJobIds = new Set();
        routes.forEach(route => {
          if (route.selectedTransportJobs && Array.isArray(route.selectedTransportJobs)) {
            route.selectedTransportJobs.forEach(jobId => {
              const id = extractId(jobId);
              if (id) transportJobIds.add(id);
            });
          }
          if (route.stops && Array.isArray(route.stops)) {
            route.stops.forEach(stop => {
              if (stop.transportJobId) {
                const id = extractId(stop.transportJobId);
                if (id) transportJobIds.add(id);
              }
            });
          }
        });

        const transportJobs = await TransportJob.find({
          _id: { $in: Array.from(transportJobIds) }
        }).select('carrierPayment');

        const totalCarrierPayment = transportJobs.reduce((sum, tj) => sum + (tj.carrierPayment || 0), 0);

        return {
          driver: {
            _id: driver._id,
            firstName: driver.firstName,
            lastName: driver.lastName,
            email: driver.email
          },
          totalRoutes: routesCount,
          totalExpenses: expenses.length,
          totalCost,
          totalCarrierPayment
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        driversSummary,
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      }
    });
  } catch (error) {
    console.error('Error generating all drivers report:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate all drivers report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all trucks report summary
 */
exports.getAllTrucksReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get all trucks
    const trucks = await Truck.find()
      .select('truckNumber licensePlate make model year status')
      .sort({ truckNumber: 1 });

    // Build date filter for routes
    const routeDateFilter = {};
    if (startDate || endDate) {
      routeDateFilter.plannedStartDate = {};
      if (startDate) routeDateFilter.plannedStartDate.$gte = new Date(startDate);
      if (endDate) routeDateFilter.plannedStartDate.$lte = new Date(endDate);
    }

    // Build date filter for expenses
    const expenseDateFilter = {};
    if (startDate || endDate) {
      expenseDateFilter.createdAt = {};
      if (startDate) expenseDateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) expenseDateFilter.createdAt.$lte = new Date(endDate);
    }

    // Get summary for each truck
    const trucksSummary = await Promise.all(
      trucks.map(async (truck) => {
        // Get routes with populated transport jobs to calculate carrier payment
        const routes = await Route.find({ truckId: truck._id, ...routeDateFilter })
          .populate({
            path: 'selectedTransportJobs',
            select: 'carrierPayment'
          })
          .populate({
            path: 'stops.transportJobId',
            select: 'carrierPayment'
          });

        const routesCount = routes.length;

        // Get all transport job IDs for this truck's routes
        const transportJobIds = new Set();
        routes.forEach(route => {
          if (route.selectedTransportJobs && Array.isArray(route.selectedTransportJobs)) {
            route.selectedTransportJobs.forEach(jobId => {
              const id = extractId(jobId);
              if (id) transportJobIds.add(id);
            });
          }
          if (route.stops && Array.isArray(route.stops)) {
            route.stops.forEach(stop => {
              if (stop.transportJobId) {
                const id = extractId(stop.transportJobId);
                if (id) transportJobIds.add(id);
              }
            });
          }
        });

        // Get transport jobs to calculate carrier payment
        const transportJobs = await TransportJob.find({
          _id: { $in: Array.from(transportJobIds) }
        }).select('carrierPayment');

        const expenses = await Expense.find({ truckId: truck._id, ...expenseDateFilter });
        const totalCost = expenses.reduce((sum, e) => sum + (e.totalCost || 0), 0);
        const totalFuelCost = expenses.filter(e => e.type === 'fuel').reduce((sum, e) => sum + (e.totalCost || 0), 0);
        const totalMaintenanceCost = expenses.filter(e => e.type === 'maintenance').reduce((sum, e) => sum + (e.totalCost || 0), 0);
        const totalGallons = expenses.filter(e => e.type === 'fuel' && e.gallons).reduce((sum, e) => sum + (e.gallons || 0), 0);
        const totalCarrierPayment = transportJobs.reduce((sum, tj) => sum + (tj.carrierPayment || 0), 0);

        return {
          truck: {
            _id: truck._id,
            truckNumber: truck.truckNumber,
            licensePlate: truck.licensePlate,
            make: truck.make,
            model: truck.model,
            year: truck.year,
            status: truck.status
          },
          totalRoutes: routesCount,
          totalExpenses: expenses.length,
          totalFuelExpenses: expenses.filter(e => e.type === 'fuel').length,
          totalMaintenanceExpenses: expenses.filter(e => e.type === 'maintenance').length,
          totalCost,
          totalFuelCost,
          totalMaintenanceCost,
          totalGallons,
          totalCarrierPayment,
          netAmount: totalCarrierPayment - totalCost
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        trucksSummary,
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      }
    });
  } catch (error) {
    console.error('Error generating all trucks report:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate all trucks report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all routes report summary
 */
exports.getAllRoutesReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter for routes
    const routeDateFilter = {};
    if (startDate || endDate) {
      routeDateFilter.plannedStartDate = {};
      if (startDate) routeDateFilter.plannedStartDate.$gte = new Date(startDate);
      if (endDate) routeDateFilter.plannedStartDate.$lte = new Date(endDate);
    }

    // Get all routes with populated driver and truck
    const routes = await Route.find(routeDateFilter)
      .populate('driverId', 'firstName lastName email')
      .populate('truckId', 'truckNumber licensePlate make model year')
      .populate({
        path: 'selectedTransportJobs',
        select: 'carrierPayment'
      })
      .populate({
        path: 'stops.transportJobId',
        select: 'carrierPayment'
      })
      .sort({ plannedStartDate: -1 });

    // Get summary for each route
    const routesSummary = await Promise.all(
      routes.map(async (route) => {
        // Get all transport job IDs for this route
        const transportJobIds = new Set();
        if (route.selectedTransportJobs && Array.isArray(route.selectedTransportJobs)) {
          route.selectedTransportJobs.forEach(jobId => {
            const id = extractId(jobId);
            if (id) transportJobIds.add(id);
          });
        }
        if (route.stops && Array.isArray(route.stops)) {
          route.stops.forEach(stop => {
            if (stop.transportJobId) {
              const id = extractId(stop.transportJobId);
              if (id) transportJobIds.add(id);
            }
          });
        }

        // Get transport jobs to calculate carrier payment
        const transportJobs = await TransportJob.find({
          _id: { $in: Array.from(transportJobIds) }
        }).select('carrierPayment');

        const totalCarrierPayment = transportJobs.reduce((sum, tj) => sum + (tj.carrierPayment || 0), 0);

        // Get expenses for this route
        const expenses = await Expense.find({ routeId: route._id });
        const fuelExpenses = expenses.filter(e => e.type === 'fuel');
        const maintenanceExpenses = expenses.filter(e => e.type === 'maintenance');
        const totalFuelCost = fuelExpenses.reduce((sum, e) => sum + (e.totalCost || 0), 0);
        const totalMaintenanceCost = maintenanceExpenses.reduce((sum, e) => sum + (e.totalCost || 0), 0);
        const totalExpensesCost = expenses.reduce((sum, e) => sum + (e.totalCost || 0), 0);

        // Calculate net amount (carrier payment - total expenses)
        const netAmount = totalCarrierPayment - totalExpensesCost;

        return {
          route: {
            _id: route._id,
            routeNumber: route.routeNumber,
            status: route.status,
            plannedStartDate: route.plannedStartDate,
            plannedEndDate: route.plannedEndDate,
            actualStartDate: route.actualStartDate,
            actualEndDate: route.actualEndDate,
            driver: route.driverId ? {
              _id: route.driverId._id,
              firstName: route.driverId.firstName,
              lastName: route.driverId.lastName,
              email: route.driverId.email
            } : null,
            truck: route.truckId ? {
              _id: route.truckId._id,
              truckNumber: route.truckId.truckNumber,
              licensePlate: route.truckId.licensePlate,
              make: route.truckId.make,
              model: route.truckId.model,
              year: route.truckId.year
            } : null
          },
          totalTransportJobs: transportJobIds.size,
          totalExpenses: expenses.length,
          totalFuelExpenses: fuelExpenses.length,
          totalMaintenanceExpenses: maintenanceExpenses.length,
          totalFuelCost,
          totalMaintenanceCost,
          totalExpensesCost,
          totalCarrierPayment,
          netAmount
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        routesSummary,
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      }
    });
  } catch (error) {
    console.error('Error generating all routes report:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate all routes report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get overall summary report - aggregated data across all routes, expenses, and transport jobs
 */
exports.getOverallSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter for routes
    const routeDateFilter = {};
    if (startDate || endDate) {
      routeDateFilter.plannedStartDate = {};
      if (startDate) routeDateFilter.plannedStartDate.$gte = new Date(startDate);
      if (endDate) routeDateFilter.plannedStartDate.$lte = new Date(endDate);
    }

    // Build date filter for expenses
    const expenseDateFilter = {};
    if (startDate || endDate) {
      expenseDateFilter.createdAt = {};
      if (startDate) expenseDateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) expenseDateFilter.createdAt.$lte = new Date(endDate);
    }

    // Get all routes in the date range
    const routes = await Route.find(routeDateFilter)
      .populate({
        path: 'selectedTransportJobs',
        select: 'carrierPayment'
      })
      .populate({
        path: 'stops.transportJobId',
        select: 'carrierPayment'
      });

    // Get all unique transport job IDs (loads completed)
    const transportJobIds = new Set();
    routes.forEach(route => {
      if (route.selectedTransportJobs && Array.isArray(route.selectedTransportJobs)) {
        route.selectedTransportJobs.forEach(jobId => {
          const id = extractId(jobId);
          if (id) transportJobIds.add(id);
        });
      }
      if (route.stops && Array.isArray(route.stops)) {
        route.stops.forEach(stop => {
          if (stop.transportJobId) {
            const id = extractId(stop.transportJobId);
            if (id) transportJobIds.add(id);
          }
        });
      }
    });

    // Get all transport jobs to calculate total carrier payment
    const transportJobs = await TransportJob.find({
      _id: { $in: Array.from(transportJobIds) }
    }).select('carrierPayment');

    // Get all expenses in the date range
    const expenses = await Expense.find(expenseDateFilter);

    // Calculate totals
    const totalCarrierPayment = transportJobs.reduce((sum, tj) => sum + (tj.carrierPayment || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.totalCost || 0), 0);
    const netAmount = totalCarrierPayment - totalExpenses;

    // Calculate total miles driven (from routes - already in miles)
    const totalMiles = routes.reduce((sum, route) => {
      return sum + (route.totalDistance?.value || 0); // Already in miles
    }, 0);

    // Total loads completed (unique transport jobs)
    const loadsCompleted = transportJobIds.size;

    res.status(200).json({
      success: true,
      data: {
        summary: {
          netAmount,
          totalMiles: Math.round(totalMiles * 100) / 100, // Round to 2 decimal places
          totalExpenses,
          loadsCompleted,
          totalCarrierPayment
        },
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      }
    });
  } catch (error) {
    console.error('Error generating overall summary:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate overall summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


const Vehicle = require('../models/Vehicle');
const Route = require('../models/Route');
const TransportJob = require('../models/TransportJob');
const Truck = require('../models/Truck');
const User = require('../models/User');
const Expense = require('../models/Expense');
const AuditLog = require('../models/AuditLog');

/**
 * Global search across multiple entities
 */
exports.globalSearch = async (req, res) => {
  try {
    const { q: searchQuery, limit = 20 } = req.query;

    if (!searchQuery || searchQuery.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    const searchTerm = searchQuery.trim();
    const searchLimit = parseInt(limit);
    const searchRegex = new RegExp(searchTerm, 'i'); // Case-insensitive regex

    // Search across all entities in parallel for better performance
    const searchPromises = [
      // Vehicles
      Vehicle.find({
        $or: [
          { vin: searchRegex },
          { make: searchRegex },
          { model: searchRegex },
          { buyerName: searchRegex }
        ]
      })
      .select('vin year make model status buyerName createdAt')
      .populate('transportJobId', 'jobNumber status')
      .limit(searchLimit)
      .sort({ createdAt: -1 }),

      // Routes
      Route.find({
        $or: [
          { routeNumber: searchRegex }
        ]
      })
      .select('routeNumber status driverId truckId plannedStartDate actualStartDate createdAt')
      .populate('driverId', 'firstName lastName email')
      .populate('truckId', 'truckNumber licensePlate')
      .limit(searchLimit)
      .sort({ createdAt: -1 }),

      // Transport Jobs
      TransportJob.find({
        $or: [
          { jobNumber: searchRegex }
        ]
      })
      .select('jobNumber status carrier createdAt')
      .populate('vehicleId', 'vin year make model')
      .populate('routeId', 'routeNumber status')
      .limit(searchLimit)
      .sort({ createdAt: -1 }),

      // Trucks
      Truck.find({
        $or: [
          { truckNumber: searchRegex },
          { licensePlate: searchRegex },
          { make: searchRegex },
          { model: searchRegex }
        ]
      })
      .select('truckNumber licensePlate make model year status currentDriver createdAt')
      .populate('currentDriver', 'firstName lastName email')
      .limit(searchLimit)
      .sort({ createdAt: -1 }),

      // Users (Drivers, Dispatchers, Admins)
      User.find({
        role: { $in: ['ptgDriver', 'ptgDispatcher', 'ptgAdmin'] },
        $or: [
          { email: searchRegex },
          { firstName: searchRegex },
          { lastName: searchRegex },
          { phoneNumber: searchRegex }
        ]
      })
      .select('firstName lastName email phoneNumber role currentLocation createdAt')
      .limit(searchLimit)
      .sort({ createdAt: -1 }),

      // Expenses
      Expense.find({
        $or: [
          // Note: Expenses don't have direct text fields to search, but we can search by type
        ]
      })
      .select('type totalCost createdAt')
      .populate('driverId', 'firstName lastName email')
      .populate('truckId', 'truckNumber')
      .populate('routeId', 'routeNumber')
      .limit(searchLimit)
      .sort({ createdAt: -1 })
    ];

    const [
      vehicles,
      routes,
      transportJobs,
      trucks,
      users,
      expenses
    ] = await Promise.all(searchPromises);

    // Filter out empty results and format the response
    const results = {
      vehicles: vehicles.map(vehicle => ({
        _id: vehicle._id,
        type: 'vehicle',
        title: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        subtitle: `VIN: ${vehicle.vin}`,
        status: vehicle.status,
        details: {
          vin: vehicle.vin,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          buyerName: vehicle.buyerName,
          transportJob: vehicle.transportJobId
        },
        url: `/vehicles/${vehicle._id}`,
        createdAt: vehicle.createdAt
      })),
      routes: routes.map(route => ({
        _id: route._id,
        type: 'route',
        title: route.routeNumber || `Route ${route._id}`,
        subtitle: `${route.driverId ? `${route.driverId.firstName} ${route.driverId.lastName}` : 'No driver'} • ${route.truckId ? route.truckId.truckNumber : 'No truck'}`,
        status: route.status,
        details: {
          driver: route.driverId,
          truck: route.truckId,
          plannedStartDate: route.plannedStartDate,
          actualStartDate: route.actualStartDate
        },
        url: `/routes/${route._id}`,
        createdAt: route.createdAt
      })),
      transportJobs: transportJobs.map(job => ({
        _id: job._id,
        type: 'transportJob',
        title: job.jobNumber,
        subtitle: `${job.carrier || 'PTG'} • ${job.vehicleId ? `${job.vehicleId.year} ${job.vehicleId.make} ${job.vehicleId.model}` : 'No vehicle'}`,
        status: job.status,
        details: {
          jobNumber: job.jobNumber,
          carrier: job.carrier,
          vehicle: job.vehicleId,
          route: job.routeId
        },
        url: `/transport-jobs/${job._id}`,
        createdAt: job.createdAt
      })),
      trucks: trucks.map(truck => ({
        _id: truck._id,
        type: 'truck',
        title: truck.truckNumber,
        subtitle: `${truck.licensePlate} • ${truck.year} ${truck.make} ${truck.model}`,
        status: truck.status,
        details: {
          truckNumber: truck.truckNumber,
          licensePlate: truck.licensePlate,
          make: truck.make,
          model: truck.model,
          year: truck.year,
          currentDriver: truck.currentDriver
        },
        url: `/trucks/${truck._id}`,
        createdAt: truck.createdAt
      })),
      users: users.map(user => ({
        _id: user._id,
        type: 'user',
        title: `${user.firstName} ${user.lastName}`,
        subtitle: `${user.email} • ${user.role}`,
        status: user.role,
        details: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          currentLocation: user.currentLocation
        },
        url: `/users/${user._id}`,
        createdAt: user.createdAt
      })),
      expenses: expenses.filter(expense => expense.totalCost > 0).map(expense => ({
        _id: expense._id,
        type: 'expense',
        title: `${expense.type.charAt(0).toUpperCase() + expense.type.slice(1)} Expense`,
        subtitle: `$${expense.totalCost} • ${expense.driverId ? `${expense.driverId.firstName} ${expense.driverId.lastName}` : 'Unknown driver'}`,
        status: expense.type,
        details: {
          type: expense.type,
          totalCost: expense.totalCost,
          driver: expense.driverId,
          truck: expense.truckId,
          route: expense.routeId
        },
        url: `/expenses/${expense._id}`,
        createdAt: expense.createdAt
      }))
    };

    // Calculate total results
    const totalResults = Object.values(results).reduce((total, items) => total + items.length, 0);

    res.status(200).json({
      success: true,
      data: {
        query: searchTerm,
        totalResults,
        results
      }
    });
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to perform global search',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Advanced search with filters
 */
exports.advancedSearch = async (req, res) => {
  try {
    const {
      q: searchQuery,
      type, // vehicle, route, transportJob, truck, user, expense
      status,
      dateFrom,
      dateTo,
      limit = 20
    } = req.query;

    const searchLimit = parseInt(limit);
    let query = {};

    // Base search query
    if (searchQuery && searchQuery.trim().length >= 2) {
      const searchTerm = searchQuery.trim();
      const searchRegex = new RegExp(searchTerm, 'i');

      // Build search query based on type
      switch (type) {
        case 'vehicle':
          query = {
            $or: [
              { vin: searchRegex },
              { make: searchRegex },
              { model: searchRegex },
              { buyerName: searchRegex }
            ]
          };
          if (status) query.status = status;
          break;

        case 'route':
          query = {
            $or: [
              { routeNumber: searchRegex }
            ]
          };
          if (status) query.status = status;
          break;

        case 'transportJob':
          query = {
            $or: [
              { jobNumber: searchRegex }
            ]
          };
          if (status) query.status = status;
          break;

        case 'truck':
          query = {
            $or: [
              { truckNumber: searchRegex },
              { licensePlate: searchRegex },
              { make: searchRegex },
              { model: searchRegex }
            ]
          };
          if (status) query.status = status;
          break;

        case 'user':
          query = {
            role: { $in: ['ptgDriver', 'ptgDispatcher', 'ptgAdmin'] },
            $or: [
              { email: searchRegex },
              { firstName: searchRegex },
              { lastName: searchRegex },
              { phoneNumber: searchRegex }
            ]
          };
          break;

        case 'expense':
          query = {};
          if (status) query.type = status; // status maps to type for expenses
          break;

        default:
          // If no specific type, search all entities
          return exports.globalSearch(req, res);
      }
    }

    // Date range filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    // Execute search based on type
    let results = [];
    let Model;

    switch (type) {
      case 'vehicle':
        Model = Vehicle;
        results = await Vehicle.find(query)
          .populate('transportJobId', 'jobNumber status')
          .limit(searchLimit)
          .sort({ createdAt: -1 });
        break;

      case 'route':
        Model = Route;
        results = await Route.find(query)
          .populate('driverId', 'firstName lastName email')
          .populate('truckId', 'truckNumber licensePlate')
          .limit(searchLimit)
          .sort({ createdAt: -1 });
        break;

      case 'transportJob':
        Model = TransportJob;
        results = await TransportJob.find(query)
          .populate('vehicleId', 'vin year make model')
          .populate('routeId', 'routeNumber status')
          .limit(searchLimit)
          .sort({ createdAt: -1 });
        break;

      case 'truck':
        Model = Truck;
        results = await Truck.find(query)
          .populate('currentDriver', 'firstName lastName email')
          .limit(searchLimit)
          .sort({ createdAt: -1 });
        break;

      case 'user':
        Model = User;
        results = await User.find(query)
          .select('firstName lastName email phoneNumber role currentLocation createdAt')
          .limit(searchLimit)
          .sort({ createdAt: -1 });
        break;

      case 'expense':
        Model = Expense;
        results = await Expense.find(query)
          .populate('driverId', 'firstName lastName email')
          .populate('truckId', 'truckNumber')
          .populate('routeId', 'routeNumber')
          .limit(searchLimit)
          .sort({ createdAt: -1 });
        break;
    }

    res.status(200).json({
      success: true,
      data: {
        query: searchQuery,
        type,
        totalResults: results.length,
        results: results.map(item => formatSearchResult(item, type))
      }
    });
  } catch (error) {
    console.error('Advanced search error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to perform advanced search',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Helper function to format search results
 */
function formatSearchResult(item, type) {
  switch (type) {
    case 'vehicle':
      return {
        _id: item._id,
        type: 'vehicle',
        title: `${item.year} ${item.make} ${item.model}`,
        subtitle: `VIN: ${item.vin}`,
        status: item.status,
        details: {
          vin: item.vin,
          year: item.year,
          make: item.make,
          model: item.model,
          buyerName: item.buyerName,
          transportJob: item.transportJobId
        },
        url: `/vehicles/${item._id}`,
        createdAt: item.createdAt
      };

    case 'route':
      return {
        _id: item._id,
        type: 'route',
        title: item.routeNumber || `Route ${item._id}`,
        subtitle: `${item.driverId ? `${item.driverId.firstName} ${item.driverId.lastName}` : 'No driver'} • ${item.truckId ? item.truckId.truckNumber : 'No truck'}`,
        status: item.status,
        details: {
          driver: item.driverId,
          truck: item.truckId,
          plannedStartDate: item.plannedStartDate,
          actualStartDate: item.actualStartDate
        },
        url: `/routes/${item._id}`,
        createdAt: item.createdAt
      };

    case 'transportJob':
      return {
        _id: item._id,
        type: 'transportJob',
        title: item.jobNumber,
        subtitle: `${item.carrier || 'PTG'} • ${item.vehicleId ? `${item.vehicleId.year} ${item.vehicleId.make} ${item.vehicleId.model}` : 'No vehicle'}`,
        status: item.status,
        details: {
          jobNumber: item.jobNumber,
          carrier: item.carrier,
          vehicle: item.vehicleId,
          route: item.routeId
        },
        url: `/transport-jobs/${item._id}`,
        createdAt: item.createdAt
      };

    case 'truck':
      return {
        _id: item._id,
        type: 'truck',
        title: item.truckNumber,
        subtitle: `${item.licensePlate} • ${item.year} ${item.make} ${item.model}`,
        status: item.status,
        details: {
          truckNumber: item.truckNumber,
          licensePlate: item.licensePlate,
          make: item.make,
          model: item.model,
          year: item.year,
          currentDriver: item.currentDriver
        },
        url: `/trucks/${item._id}`,
        createdAt: item.createdAt
      };

    case 'user':
      return {
        _id: item._id,
        type: 'user',
        title: `${item.firstName} ${item.lastName}`,
        subtitle: `${item.email} • ${item.role}`,
        status: item.role,
        details: {
          firstName: item.firstName,
          lastName: item.lastName,
          email: item.email,
          phoneNumber: item.phoneNumber,
          role: item.role,
          currentLocation: item.currentLocation
        },
        url: `/users/${item._id}`,
        createdAt: item.createdAt
      };

    case 'expense':
      return {
        _id: item._id,
        type: 'expense',
        title: `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} Expense`,
        subtitle: `$${item.totalCost} • ${item.driverId ? `${item.driverId.firstName} ${item.driverId.lastName}` : 'Unknown driver'}`,
        status: item.type,
        details: {
          type: item.type,
          totalCost: item.totalCost,
          driver: item.driverId,
          truck: item.truckId,
          route: item.routeId
        },
        url: `/expenses/${item._id}`,
        createdAt: item.createdAt
      };

    default:
      return item;
  }
}

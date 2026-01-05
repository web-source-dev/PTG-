const Truck = require('../models/Truck');
const Expense = require('../models/Expense');
const AuditLog = require('../models/AuditLog');

/**
 * Create a new truck
 */
exports.createTruck = async (req, res) => {
  try {
    const truckData = req.body;

    // Add metadata
    if (req.user) {
      // Can track who created it if needed
    }

    // Create truck
    const truck = await Truck.create(truckData);

    res.status(201).json({
      success: true,
      message: 'Truck created successfully',
      data: {
        truck
      }
    });
  } catch (error) {
    console.error('Error creating truck:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create truck',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all trucks with pagination and filters
 */
exports.getAllTrucks = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, capacity, search } = req.query;

    // Build query
    let query = {};

    if (status) {
      query.status = status;
    }

    if (capacity) {
      query.capacity = capacity;
    }

    if (search) {
      query.$or = [
        { truckNumber: { $regex: search, $options: 'i' } },
        { licensePlate: { $regex: search, $options: 'i' } },
        { make: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } }
      ];
    }

    const trucks = await Truck.find(query)
      .sort({ createdAt: -1 })
      .populate('currentDriver', 'firstName lastName email phoneNumber')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Truck.countDocuments(query);

    res.status(200).json({
      success: true,
      data: trucks,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total: total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching trucks:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch trucks',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get single truck by ID
 */
exports.getTruckById = async (req, res) => {
  try {
    const truck = await Truck.findById(req.params.id)
      .populate('currentDriver', 'firstName lastName email phoneNumber');

    if (!truck) {
      return res.status(404).json({
        success: false,
        message: 'Truck not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        truck
      }
    });
  } catch (error) {
    console.error('Error fetching truck:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch truck',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update truck
 */
exports.updateTruck = async (req, res) => {
  try {
    const truck = await Truck.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    )
      .populate('currentDriver', 'firstName lastName email phoneNumber');

    if (!truck) {
      return res.status(404).json({
        success: false,
        message: 'Truck not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Truck updated successfully',
      data: {
        truck
      }
    });
  } catch (error) {
    console.error('Error updating truck:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update truck',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete truck
 */
exports.deleteTruck = async (req, res) => {
  try {
    const truck = await Truck.findById(req.params.id);

    if (!truck) {
      return res.status(404).json({
        success: false,
        message: 'Truck not found'
      });
    }

    // Check if truck is currently in use
    if (truck.status === 'In Use') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete truck that is currently in use. Please change the status first.'
      });
    }

    await Truck.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Truck deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting truck:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete truck',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Add fuel expense to truck
exports.addTruckFuelExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { gallons, pricePerGallon, totalCost, odometerReading, routeId, driverId } = req.body;

    // Validate required fields
    if (!gallons || !pricePerGallon || !totalCost || !odometerReading) {
      return res.status(400).json({
        success: false,
        message: 'Gallons, price per gallon, total cost, and odometer reading are required'
      });
    }

    // Find truck
    const truck = await Truck.findById(id);
    if (!truck) {
      return res.status(404).json({
        success: false,
        message: 'Truck not found'
      });
    }

    // Initialize truckStats if not exists
    if (!truck.truckStats) {
      truck.truckStats = {
        totalLoadsMoved: 0,
        totalDistanceTraveled: 0,
        fuelExpenses: [],
        maintenanceExpenses: []
      };
    }

    // Add fuel expense
    const fuelExpense = {
      date: new Date(),
      gallons: parseFloat(gallons),
      pricePerGallon: parseFloat(pricePerGallon),
      totalCost: parseFloat(totalCost),
      odometerReading: parseFloat(odometerReading),
      ...(routeId && { routeId }),
      ...(driverId && { driverId })
    };

    truck.truckStats.fuelExpenses.push(fuelExpense);
    await truck.save();

    res.status(200).json({
      success: true,
      message: 'Fuel expense added successfully',
      data: {
        truck
      }
    });
  } catch (error) {
    console.error('Add truck fuel expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Add maintenance expense to truck
exports.addTruckMaintenanceExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, cost, odometerReading, location, routeId } = req.body;

    // Validate required fields
    if (!description || !cost || !odometerReading) {
      return res.status(400).json({
        success: false,
        message: 'Description, cost, and odometer reading are required'
      });
    }

    // Find truck
    const truck = await Truck.findById(id);
    if (!truck) {
      return res.status(404).json({
        success: false,
        message: 'Truck not found'
      });
    }

    // Initialize truckStats if not exists
    if (!truck.truckStats) {
      truck.truckStats = {
        totalLoadsMoved: 0,
        totalDistanceTraveled: 0,
        fuelExpenses: [],
        maintenanceExpenses: []
      };
    }

    // Add maintenance expense
    const maintenanceExpense = {
      date: new Date(),
      description,
      cost: parseFloat(cost),
      odometerReading: parseFloat(odometerReading),
      ...(location && { location })
    };

    // Create expense directly
    const expense = await Expense.create({
      type: 'maintenance',
      description,
      totalCost: parseFloat(cost),
      odometerReading: parseFloat(odometerReading),
      location,
      routeId,
      driverId: req.user._id,
      truckId,
      createdBy: req.user._id
    });

    // Log the action directly
    await AuditLog.create({
      action: 'add_maintenance_expense',
      entityType: 'expense',
      entityId: expense._id,
      userId: req.user._id,
      driverId: req.user.role === 'ptgDriver' ? req.user._id : undefined,
      location,
      routeId,
      details: {
        description,
        cost: parseFloat(cost),
        odometerReading: parseFloat(odometerReading)
      },
      notes: `Added maintenance expense: ${description} for $${cost}`
    });

    res.status(200).json({
      success: true,
      message: 'Maintenance expense added successfully',
      data: {
        truck
      }
    });
  } catch (error) {
    console.error('Add truck maintenance expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Update truck stats
exports.updateTruckStats = async (req, res) => {
  try {
    const { id } = req.params;
    const { totalLoadsMoved, totalDistanceTraveled } = req.body;

    // Find truck
    const truck = await Truck.findById(id);
    if (!truck) {
      return res.status(404).json({
        success: false,
        message: 'Truck not found'
      });
    }

    // Initialize truckStats if not exists
    if (!truck.truckStats) {
      truck.truckStats = {
        totalLoadsMoved: 0,
        totalDistanceTraveled: 0,
        fuelExpenses: [],
        maintenanceExpenses: []
      };
    }

    // Update stats
    if (totalLoadsMoved !== undefined) {
      truck.truckStats.totalLoadsMoved = parseInt(totalLoadsMoved);
    }
    if (totalDistanceTraveled !== undefined) {
      truck.truckStats.totalDistanceTraveled = parseFloat(totalDistanceTraveled);
    }

    await truck.save();

    res.status(200).json({
      success: true,
      message: 'Truck stats updated successfully',
      data: {
        truck
      }
    });
  } catch (error) {
    console.error('Update truck stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};


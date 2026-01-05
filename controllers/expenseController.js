const Expense = require('../models/Expense');
const AuditLog = require('../models/AuditLog');
const routeTracker = require('../utils/routeTracker');

/**
 * Expense Controller
 * Handles all expense-related operations
 */

/**
 * Create fuel expense
 */
exports.createFuelExpense = async (req, res) => {
  try {
    const { driverId, routeId, ...expenseData } = req.body;

    // Create expense directly
    const expense = await Expense.create({
      type: 'fuel',
      gallons: parseFloat(expenseData.gallons),
      pricePerGallon: parseFloat(expenseData.pricePerGallon),
      totalCost: parseFloat(expenseData.totalCost),
      odometerReading: parseFloat(expenseData.odometerReading),
      location: expenseData.location,
      routeId,
      driverId,
      truckId: expenseData.truckId,
      createdBy: driverId
    });

    // Log the action
    const auditLog = await AuditLog.create({
      action: 'add_fuel_expense',
      entityType: 'expense',
      entityId: expense._id,
      userId: req.user._id,
      driverId: driverId,
      location: expenseData.location,
      routeId,
      details: {
        gallons: parseFloat(expenseData.gallons),
        pricePerGallon: parseFloat(expenseData.pricePerGallon),
        totalCost: parseFloat(expenseData.totalCost),
        odometerReading: parseFloat(expenseData.odometerReading),
        truckId: expenseData.truckId
      },
      notes: `Added fuel expense: ${expenseData.gallons} gallons for $${expenseData.totalCost}`
    });

    // Add to route tracking if routeId provided
    if (routeId) {
      await routeTracker.addActionEntry(routeId, 'add_fuel_expense', expenseData.location, auditLog._id, {
        expenseId: expense._id,
        gallons: parseFloat(expenseData.gallons),
        totalCost: parseFloat(expenseData.totalCost)
      });
    }

    res.status(201).json({
      success: true,
      message: 'Fuel expense created successfully',
      data: { expense }
    });
  } catch (error) {
    console.error('Create fuel expense error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create fuel expense'
    });
  }
};

/**
 * Create maintenance expense
 */
exports.createMaintenanceExpense = async (req, res) => {
  try {
    const { driverId, routeId, ...expenseData } = req.body;

    // Create expense directly
    const expense = await Expense.create({
      type: 'maintenance',
      description: expenseData.description,
      totalCost: parseFloat(expenseData.cost),
      odometerReading: parseFloat(expenseData.odometerReading),
      location: expenseData.location,
      routeId,
      driverId,
      truckId: expenseData.truckId,
      createdBy: driverId
    });

    // Log the action
    const auditLog = await AuditLog.create({
      action: 'add_maintenance_expense',
      entityType: 'expense',
      entityId: expense._id,
      userId: req.user._id,
      driverId: driverId,
      location: expenseData.location,
      routeId,
      details: {
        description: expenseData.description,
        cost: parseFloat(expenseData.cost),
        odometerReading: parseFloat(expenseData.odometerReading),
        truckId: expenseData.truckId
      },
      notes: `Added maintenance expense: ${expenseData.description} for $${expenseData.cost}`
    });

    // Add to route tracking if routeId provided
    if (routeId) {
      await routeTracker.addActionEntry(routeId, 'add_maintenance_expense', expenseData.location, auditLog._id, {
        expenseId: expense._id,
        description: expenseData.description,
        cost: parseFloat(expenseData.cost)
      });
    }

    res.status(201).json({
      success: true,
      message: 'Maintenance expense created successfully',
      data: { expense }
    });
  } catch (error) {
    console.error('Create maintenance expense error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create maintenance expense'
    });
  }
};

/**
 * Get expenses by driver
 */
exports.getExpensesByDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { type, limit = 50 } = req.query;

    const query = { driverId };
    if (type) query.type = type;

    const expenses = await Expense.find(query)
      .populate('routeId', 'routeNumber')
      .populate('truckId', 'truckNumber licensePlate')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: expenses
    });
  } catch (error) {
    console.error('Get expenses by driver error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get expenses'
    });
  }
};

/**
 * Get expenses by truck
 */
exports.getExpensesByTruck = async (req, res) => {
  try {
    const { truckId } = req.params;
    const { type, limit = 50 } = req.query;

    const query = { truckId };
    if (type) query.type = type;

    const expenses = await Expense.find(query)
      .populate('routeId', 'routeNumber')
      .populate('driverId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: expenses
    });
  } catch (error) {
    console.error('Get expenses by truck error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get expenses'
    });
  }
};

/**
 * Get expenses by route
 */
exports.getExpensesByRoute = async (req, res) => {
  try {
    const { routeId } = req.params;

    const expenses = await Expense.find({ routeId })
      .populate('driverId', 'firstName lastName')
      .populate('truckId', 'truckNumber')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: expenses
    });
  } catch (error) {
    console.error('Get expenses by route error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get expenses'
    });
  }
};

/**
 * Get all expenses with pagination
 */
exports.getAllExpenses = async (req, res) => {
  try {
    const { page = 1, limit = 50, type, driverId, truckId, routeId } = req.query;

    let query = {};
    if (type) query.type = type;
    if (driverId) query.driverId = driverId;
    if (truckId) query.truckId = truckId;
    if (routeId) query.routeId = routeId;

    const expenses = await Expense.find(query)
      .populate('driverId', 'firstName lastName')
      .populate('truckId', 'truckNumber licensePlate')
      .populate('routeId', 'routeNumber')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Expense.countDocuments(query);

    res.status(200).json({
      success: true,
      data: expenses,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get all expenses error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get expenses'
    });
  }
};

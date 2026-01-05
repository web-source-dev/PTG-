const Expense = require('../models/Expense');
const AuditLog = require('../models/AuditLog');

/**
 * Unified Expense Service
 * Handles all expense-related operations with proper validation and logging
 */
class ExpenseService {

  /**
   * Create fuel expense
   */
  async createFuelExpense(expenseData, driverId, routeId = null) {
    const {
      gallons,
      pricePerGallon,
      totalCost,
      odometerReading,
      truckId,
      location
    } = expenseData;

    // Validation
    if (!gallons || !pricePerGallon || !totalCost || !odometerReading || !truckId) {
      throw new Error('Missing required fuel expense fields');
    }

    // Create expense record
    const expense = await Expense.create({
      type: 'fuel',
      gallons: parseFloat(gallons),
      pricePerGallon: parseFloat(pricePerGallon),
      totalCost: parseFloat(totalCost),
      odometerReading: parseFloat(odometerReading),
      location,
      routeId,
      driverId,
      truckId,
      createdBy: driverId
    });

    // Log the action
    await AuditLog.create({
      action: 'add_fuel_expense',
      entityType: 'expense',
      entityId: expense._id,
      driverId,
      location,
      routeId,
      details: {
        gallons: parseFloat(gallons),
        totalCost: parseFloat(totalCost),
        odometerReading: parseFloat(odometerReading)
      },
      notes: `Added fuel expense: ${gallons} gallons for $${totalCost}`
    });

    return expense;
  }

  /**
   * Create maintenance expense
   */
  async createMaintenanceExpense(expenseData, driverId, routeId = null) {
    const {
      description,
      cost,
      odometerReading,
      truckId,
      location
    } = expenseData;

    // Validation
    if (!description || !cost || !odometerReading || !truckId) {
      throw new Error('Missing required maintenance expense fields');
    }

    // Create expense record
    const expense = await Expense.create({
      type: 'maintenance',
      description,
      totalCost: parseFloat(cost),
      odometerReading: parseFloat(odometerReading),
      location,
      routeId,
      driverId,
      truckId,
      createdBy: driverId
    });

    // Log the action
    await AuditLog.create({
      action: 'add_maintenance_expense',
      entityType: 'expense',
      entityId: expense._id,
      driverId,
      location,
      routeId,
      details: {
        description,
        cost: parseFloat(cost),
        odometerReading: parseFloat(odometerReading)
      },
      notes: `Added maintenance expense: ${description} for $${cost}`
    });

    return expense;
  }

  /**
   * Get expenses by driver
   */
  async getExpensesByDriver(driverId, type = null, limit = 50) {
    const query = { driverId };
    if (type) query.type = type;

    return await Expense.find(query)
      .populate('routeId', 'routeNumber')
      .populate('truckId', 'truckNumber licensePlate')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  /**
   * Get expenses by truck
   */
  async getExpensesByTruck(truckId, type = null, limit = 50) {
    const query = { truckId };
    if (type) query.type = type;

    return await Expense.find(query)
      .populate('routeId', 'routeNumber')
      .populate('driverId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  /**
   * Get expenses by route
   */
  async getExpensesByRoute(routeId) {
    return await Expense.find({ routeId })
      .populate('driverId', 'firstName lastName')
      .populate('truckId', 'truckNumber')
      .sort({ createdAt: -1 });
  }
}

module.exports = new ExpenseService();

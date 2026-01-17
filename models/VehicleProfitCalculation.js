const mongoose = require('mongoose');

const vehicleProfitCalculationSchema = new mongoose.Schema({
  // Vehicle Reference (Required - One calculation per vehicle)
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true,
    unique: true,
    index: true
  },

  // Miles Information
  milesToLocation: {
    type: Number, // Distance from start/current location to pickup
    default: 0
  },
  totalMiles: {
    type: Number, // Distance from pickup to drop
    default: 0
  },

  // Rate Information
  rate: {
    type: Number,
    default: 0
  },
  ratePerMile: {
    type: Number, // e.g., $1.50/mile
    default: 0
  },
  isRateAutoCalculated: {
    type: Boolean, // Whether rate is calculated from ratePerMile
    default: false
  },

  // Fuel Information
  mpg: {
    type: Number, // Miles Per Gallon
    default: 8
  },
  ppg: {
    type: Number, // Price Per Gallon
    default: 3.5
  },
  totalGallons: {
    type: Number, // Calculated: totalMiles / mpg
    default: 0
  },
  gasCost: {
    type: Number, // Calculated: totalGallons * ppg
    default: 0
  },

  // Other Expenses
  estimatedTolls: {
    type: Number,
    default: 0
  },
  estimatedMaintenance: {
    type: Number,
    default: 0
  },
  totalExpenses: {
    type: Number, // Calculated: gasCost + estimatedTolls + estimatedMaintenance
    default: 0
  },

  // Profit Calculation
  estimatedProfit: {
    type: Number, // Calculated: rate - totalExpenses
    default: 0
  },

  // Priority
  priority: {
    type: Boolean,
    default: false
  },

  // Audit Trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for efficient queries
vehicleProfitCalculationSchema.index({ vehicleId: 1 });
vehicleProfitCalculationSchema.index({ createdAt: -1 });

// Pre-save middleware to calculate derived fields
vehicleProfitCalculationSchema.pre('save', function(next) {
  // Calculate total gallons
  if (this.totalMiles && this.mpg) {
    this.totalGallons = this.totalMiles / this.mpg;
  } else {
    this.totalGallons = 0;
  }

  // Calculate gas cost
  if (this.totalGallons && this.ppg) {
    this.gasCost = this.totalGallons * this.ppg;
  } else {
    this.gasCost = 0;
  }

  // Calculate total expenses
  this.totalExpenses = (this.gasCost || 0) + (this.estimatedTolls || 0) + (this.estimatedMaintenance || 0);

  // Auto-calculate rate from ratePerMile if enabled
  if (this.isRateAutoCalculated && this.ratePerMile && this.totalMiles) {
    this.rate = this.ratePerMile * this.totalMiles;
  }

  // Calculate profit
  this.estimatedProfit = (this.rate || 0) - this.totalExpenses;

  next();
});

module.exports = mongoose.model('VehicleProfitCalculation', vehicleProfitCalculationSchema);


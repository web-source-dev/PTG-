const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['fuel', 'maintenance'],
    required: true
  },

  // Amount details
  gallons: Number, // For fuel expenses
  pricePerGallon: Number, // For fuel expenses
  totalCost: {
    type: Number,
    required: true
  },

  // Maintenance details
  description: String, // For maintenance expenses
  odometerReading: Number,

  // Location data
  location: {
    latitude: Number,
    longitude: Number,
    accuracy: Number
  },

  // References
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route'
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  truckId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Truck',
    required: true
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle'
  },

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
expenseSchema.index({ driverId: 1, type: 1 });
expenseSchema.index({ truckId: 1, type: 1 });
expenseSchema.index({ routeId: 1 });
expenseSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Expense', expenseSchema);

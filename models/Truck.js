const mongoose = require('mongoose');
const { TRUCK_STATUS } = require('../constants/status');

const truckSchema = new mongoose.Schema({
  // Truck Identification
  truckNumber: {
    type: String,
    trim: true
  },
  licensePlate: {
    type: String,
    trim: true
  },
  make: {
    type: String,
    trim: true
  },
  model: {
    type: String,
    trim: true
  },
  year: {
    type: Number
  },

  // Load Capacity (in lbs)
  loadCapacity: {
    type: Number,
    min: 0,
    required: true
  },

  // Status
  status: {
    type: String,
    enum: Object.values(TRUCK_STATUS),
    default: TRUCK_STATUS.AVAILABLE
  },

  // Current Assignment (optional)
  currentDriver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Notes
  notes: {
    type: String,
    trim: true
  },

  // Truck Performance Tracking
  truckStats: {
    totalLoadsMoved: { type: Number, default: 0 },
    totalDistanceTraveled: { type: Number, default: 0 } // in miles
    // Note: Expenses are now stored in separate Expense collection
  }
}, {
  timestamps: true
});

// Index for efficient queries
truckSchema.index({ truckNumber: 1 });
truckSchema.index({ status: 1 });
truckSchema.index({ capacity: 1 });
truckSchema.index({ verizonConnectDeviceId: 1 });

module.exports = mongoose.model('Truck', truckSchema);

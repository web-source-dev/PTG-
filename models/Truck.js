const mongoose = require('mongoose');
const { TRUCK_STATUS, TRUCK_CAPACITY } = require('../constants/status');

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

  // Capacity Information
  capacity: {
    type: String,
    enum: Object.values(TRUCK_CAPACITY),
    default: TRUCK_CAPACITY.SINGLE
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

  // Verizon Connect Integration
  verizonConnectDeviceId: {
    type: String,
    trim: true
  },
  verizonConnectVehicleId: {
    type: String,
    trim: true
  },
  lastKnownLocation: {
    latitude: Number,
    longitude: Number,
    timestamp: Date,
    address: String
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

const mongoose = require('mongoose');

const shipperSchema = new mongoose.Schema({
  // Shipper Identity
  shipperName: {
    type: String,
    trim: true,
    required: true
  },
  shipperCompany: {
    type: String,
    trim: true,
    required: true
  },
  shipperEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  shipperPhone: {
    type: String,
    trim: true
  },
  
  // Additional contact information
  address: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  zipCode: {
    type: String,
    trim: true
  },
  
  // Notes
  notes: {
    type: String,
    trim: true
  },
  
  // Statistics (calculated fields)
  totalVehicles: {
    type: Number,
    default: 0
  },
  totalDeliveredVehicles: {
    type: Number,
    default: 0
  },
  totalRoutes: {
    type: Number,
    default: 0
  },
  totalCompletedRoutes: {
    type: Number,
    default: 0
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster lookups
shipperSchema.index({ shipperCompany: 1, shipperEmail: 1 });
shipperSchema.index({ shipperName: 1 });

// Update updatedAt before saving
shipperSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Shipper', shipperSchema);


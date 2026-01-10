const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['fuel', 'maintenance'],
    required: true
  },

  category: {
    type: String,
    enum: [
      'diesel',
      'petrol',
      'oil_change',
      'repair',
      'tires',
      'service',
      'other'
    ],
    default: 'other'
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
  serviceProvider: {
    name: String,
    phone: String,
    address: String
  },

  // Odometer reading for fuel expenses and maintenance expenses to track mileage
  odometerReading: Number,

  // Location data when the expense was created it auto sets from the background location for verify manual location
  backgroundLocation: {
    latitude: Number,
    longitude: Number,
    accuracy: Number
  },

  // they enter the location manually when they are at the location of the expense and they can verify the location with the background location manually
  askedLocation: {
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    // Text fields for the location the user typed/selected
    formattedAddress: String,
    name: String,
    address: String,
    city: String,
    state: String,
    zipCode: String,
    placeId: String
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

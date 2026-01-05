const mongoose = require('mongoose');

const routeTrackingSchema = new mongoose.Schema({
  // Route Reference
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: true
  },
  routeNumber: {
    type: String,
    trim: true,
    required: true
  },

  // Driver Reference
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  driverName: {
    type: String,
    trim: true
  },
  driverEmail: {
    type: String,
    trim: true
  },

  // Truck Reference
  truckId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Truck',
    required: true
  },
  truckNumber: {
    type: String,
    trim: true
  },

  // Vehicles being transported on this route
  vehicles: [{
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle'
    },
    vin: {
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
    }
  }],

  // Tracking period
  trackingStartedAt: {
    type: Date,
    default: Date.now
  },
  trackingEndedAt: {
    type: Date
  },

  // Driver Location History (polled locations during the route)
  locationHistory: [{
    timestamp: {
      type: Date,
      default: Date.now,
      required: true
    },
    location: {
      latitude: {
        type: Number,
        required: true
      },
      longitude: {
        type: Number,
        required: true
      },
      accuracy: {
        type: Number // GPS accuracy in meters
      },
      altitude: Number,
      speed: Number, // Speed in m/s
      heading: Number // Direction in degrees
    },
    // Context about what was happening at this location
    context: {
      routeStatus: String, // 'Planned', 'In Progress', 'Completed', etc.
      routeState: String, // 'Started', 'Stopped', 'Resumed', etc.
      currentStopIndex: Number, // Which stop they were working on
      stopType: String, // 'pickup', 'drop', 'break', 'rest'
      stopStatus: String, // 'Pending', 'In Progress', 'Completed'
    },
  }],

  // Driver Action History (all driver actions during the route with locations)
  actionHistory: [{
    timestamp: {
      type: Date,
      default: Date.now,
      required: true
    },
    action: {
      type: String,
      required: true,
      enum: [
        // Route actions
        'start_route', 'stop_route', 'resume_route', 'complete_route',
        // Stop actions
        'start_stop', 'complete_stop', 'skip_stop',
        // Checklist actions
        'checklist_item_checked', 'checklist_submitted',
        // Photo actions
        'upload_vehicle_photo', 'upload_stop_photo',
        // Report actions
        'add_report',
        // Expense actions
        'add_fuel_expense',
        // Location updates
        'location_update'
      ]
    },
    location: {
      latitude: Number,
      longitude: Number,
      accuracy: Number
    },
    // Action-specific details
    details: {
      stopIndex: Number,
      stopType: String,
      checklistItem: String,
      photoType: String, // 'vehicle' or 'stop'
      photoUrl: String,
      reportText: String,
      expenseAmount: Number,
      expenseType: String, // 'fuel', 'maintenance'
      notes: String
    },
    // Metadata
    duration: Number, // Duration of action in milliseconds (if applicable)
    success: {
      type: Boolean,
      default: true
    },
    error: String // Error message if action failed
  }],

  // Route Statistics (computed at end of route)
  statistics: {
    totalDistance: {
      type: Number, // in meters
      default: 0
    },
    totalDuration: {
      type: Number, // in milliseconds
      default: 0
    },
    stopsCompleted: {
      type: Number,
      default: 0
    },
    photosUploaded: {
      type: Number,
      default: 0
    },
    fuelExpenses: {
      type: Number,
      default: 0
    },
    avgSpeed: Number, // Average speed in km/h
    maxSpeed: Number, // Maximum speed recorded
    idleTime: Number, // Time spent idle in milliseconds
    drivingTime: Number, // Time spent driving in milliseconds
  },

  // Route Timeline (key events)
  timeline: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    event: {
      type: String,
      enum: [
        'route_started',
        'route_stopped',
        'route_resumed',
        'route_completed',
        'stop_started',
        'stop_completed',
        'fuel_added',
        'photo_uploaded',
        'report_added'
      ]
    },
    location: {
      latitude: Number,
      longitude: Number
    },
    details: mongoose.Schema.Types.Mixed
  }],

  // Heat map data (pre-computed for performance)
  heatMapData: {
    // Binned location data for heat map visualization
    locationBins: [{
      latitude: Number,
      longitude: Number,
      count: Number, // How many times this location was visited
      avgAccuracy: Number,
      lastVisited: Date
    }],
    // Activity intensity by time of day
    hourlyActivity: [{
      hour: Number, // 0-23
      activityCount: Number
    }],
    // Activity intensity by day of week
    weeklyActivity: [{
      day: Number, // 0-6 (Sunday-Saturday)
      activityCount: Number
    }]
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'completed', 'archived'],
    default: 'active'
  },

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
routeTrackingSchema.index({ routeId: 1 });
routeTrackingSchema.index({ driverId: 1 });
routeTrackingSchema.index({ truckId: 1 });
routeTrackingSchema.index({ status: 1 });
routeTrackingSchema.index({ trackingStartedAt: 1 });
routeTrackingSchema.index({ trackingEndedAt: 1 });
routeTrackingSchema.index({ 'locationHistory.timestamp': 1 });
routeTrackingSchema.index({ 'actionHistory.timestamp': 1 });
routeTrackingSchema.index({ 'actionHistory.action': 1 });

// Compound indexes for common queries
routeTrackingSchema.index({ driverId: 1, trackingStartedAt: -1 });
routeTrackingSchema.index({ truckId: 1, trackingStartedAt: -1 });
routeTrackingSchema.index({ routeId: 1, 'locationHistory.timestamp': 1 });
routeTrackingSchema.index({ driverId: 1, truckId: 1, trackingStartedAt: -1 });

// Virtual for total locations recorded
routeTrackingSchema.virtual('totalLocations').get(function() {
  return this.locationHistory ? this.locationHistory.length : 0;
});

// Virtual for total actions recorded
routeTrackingSchema.virtual('totalActions').get(function() {
  return this.actionHistory ? this.actionHistory.length : 0;
});

// Method to add location entry
routeTrackingSchema.methods.addLocationEntry = function(locationData, context = {}) {
  this.locationHistory.push({
    timestamp: new Date(),
    location: locationData,
    context: context
  });
  return this.save();
};

// Method to add action entry
routeTrackingSchema.methods.addActionEntry = function(action, location, details = {}) {
  this.actionHistory.push({
    timestamp: new Date(),
    action: action,
    location: location,
    details: details
  });
  return this.save();
};

// Method to complete tracking
routeTrackingSchema.methods.completeTracking = function() {
  this.trackingEndedAt = new Date();
  this.status = 'completed';
  return this.save();
};

// Static method to get active tracking for a route
routeTrackingSchema.statics.getActiveTracking = function(routeId) {
  return this.findOne({ routeId: routeId, status: 'active' });
};

// Static method to get tracking history for a driver
routeTrackingSchema.statics.getDriverHistory = function(driverId, limit = 50) {
  return this.find({ driverId: driverId, status: 'completed' })
    .sort({ trackingStartedAt: -1 })
    .limit(limit)
    .populate('routeId', 'routeNumber')
    .populate('truckId', 'truckNumber');
};

// Static method to get tracking history for a truck
routeTrackingSchema.statics.getTruckHistory = function(truckId, limit = 50) {
  return this.find({ truckId: truckId, status: 'completed' })
    .sort({ trackingStartedAt: -1 })
    .limit(limit)
    .populate('routeId', 'routeNumber')
    .populate('driverId', 'firstName lastName');
};

module.exports = mongoose.model('RouteTracking', routeTrackingSchema);

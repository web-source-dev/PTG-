const mongoose = require('mongoose');
const { ROUTE_STATUS, ROUTE_STOP_STATUS, ROUTE_STATE, ROUTE_STOP_TYPE } = require('../constants/status');

const routeSchema = new mongoose.Schema({
  // Route Identification
  routeNumber: {
    type: String,
    trim: true
  },

  // Assignment
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

  // Journey Schedule
  plannedStartDate: {
    type: Date,
    required: true
  },
  plannedEndDate: {
    type: Date,
    required: true
  },
  actualStartDate: {
    type: Date
  },
  actualEndDate: {
    type: Date
  },

  // Journey Locations (Start and End of entire route)
  journeyStartLocation: {
    name: {
      type: String,
      trim: true
    },
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
    zip: {
      type: String,
      trim: true
    },
    formattedAddress: {
      type: String,
      trim: true
    },
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  journeyEndLocation: {
    name: {
      type: String,
      trim: true
    },
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
    zip: {
      type: String,
      trim: true
    },
    formattedAddress: {
      type: String,
      trim: true
    },
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },

  // Selected Transport Jobs (references only - for selection stage)
  selectedTransportJobs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransportJob'
  }],

  // Stops on this Route (start, pickup, drop, break, rest, fuel, end)
  stops: [{
    // Stop Type
    stopType: {
      type: String,
      enum: Object.values(ROUTE_STOP_TYPE),
      required: true
    },
    
    // Transport Job Reference (required for pickup and drop stops only)
    transportJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TransportJob',
      required: function() {
        return this.stopType === 'pickup' || this.stopType === 'drop';
      }
    },

    // Sequence number (order of stops in the route)
    sequence: {
      type: Number,
      required: true
    },

    // Location Details (optional for all stop types)
    // For transport stops, can override vehicle location if needed
    // For rest/break stops, provides custom location
    location: {
      name: {
        type: String,
        trim: true
      },
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
      zip: {
        type: String,
        trim: true
      },
      formattedAddress: {
        type: String,
        trim: true
      },
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },

    // Scheduled Date and Time
    scheduledDate: {
      type: Date,
      required: true
    },
    scheduledTimeStart: {
      type: Date
    },
    scheduledTimeEnd: {
      type: Date
    },

    // Actual Date and Time (filled when stop is completed)
    actualDate: {
      type: Date
    },
    actualTime: {
      type: Date
    },

    // Stop Photos (photos taken at this stop)
    photos: [{
      url: {
        type: String,
        trim: true,
        required: true
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      location: {
        latitude: Number,
        longitude: Number,
        accuracy: Number
      },
      notes: {
        type: String,
        trim: true
      },
      photoType: {
        type: String,
        enum: ['vehicle', 'stop'],
        default: 'stop'
      },
      photoCategory: {
        type: String,
        enum: [
          'vehicle-front-upper',
          'vehicle-front-lower',
          'vehicle-side-upper',
          'vehicle-side-lower',
          'vehicle-rear-driver-side-upper',
          'vehicle-rear-driver-side-lower',
          'vehicle-rear-passenger-side-upper',
          'vehicle-rear-passenger-side-lower',
          'engine',
          'vehicle-roof',
          'vehicle-bottom',
          'interior-dashboard',
          'interior-front',
          'interior-rear',
          'mirrors'
        ]
      }
    }],

    // Stop Notes
    notes: {
      type: String,
      trim: true
    },

    // Stop Checklist (filled by driver for each stop)
    checklist: [{
      item: {
        type: String,
        trim: true,
        required: true
      },
      checked: {
        type: Boolean,
        default: false
      },
      notes: {
        type: String,
        trim: true
      },
      completedAt: {
        type: Date
      },
      completedLocation: {
        latitude: Number,
        longitude: Number,
        accuracy: Number
      }
    }],

    // Distance and duration from previous stop
    distanceFromPrevious: {
      text: String,
      value: Number // miles
    },
    durationFromPrevious: {
      text: String,
      value: Number // seconds
    },

    // Stop Status
    status: {
      type: String,
      enum: Object.values(ROUTE_STOP_STATUS),
      default: ROUTE_STOP_STATUS.PENDING
    },

    // Stop Label (optional custom label for the stop)
    label: {
      type: String,
      trim: true
    }
  }],

  // Total route distance and duration
  totalDistance: {
    text: String,
    value: Number // miles
  },
  totalDuration: {
    text: String,
    value: Number // seconds
  },

  // Actual route performance (recorded by driver)
  actualDistanceTraveled: { type: Number, default: 0 }, // in miles


  // Status
  status: {
    type: String,
    enum: Object.values(ROUTE_STATUS),
    default: ROUTE_STATUS.PLANNED
  },

  // Operational state within "In Progress" status
  state: {
    type: String,
    enum: Object.values(ROUTE_STATE),
    default: null // Only set when status is "In Progress"
  },


  // Route Reports
  reports: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    report: {
      type: String,
      trim: true,
      required: true
    },
    location: {
      latitude: Number,
      longitude: Number
    }
  }],

  // Audit Trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Soft delete fields
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries
routeSchema.index({ driverId: 1 });
routeSchema.index({ truckId: 1 });
routeSchema.index({ status: 1 });
routeSchema.index({ plannedStartDate: 1 });
routeSchema.index({ 'selectedTransportJobs': 1 });
routeSchema.index({ 'stops.transportJobId': 1 });
routeSchema.index({ 'stops.sequence': 1 });
routeSchema.index({ createdAt: -1 });
routeSchema.index({ deleted: 1 });

// Pre-save middleware to generate route number, initialize checklists, and populate formattedAddress
routeSchema.pre('save', async function(next) {
  const locationService = require('../utils/locationService');
  
  if (this.isNew && !this.routeNumber) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await mongoose.model('Route').countDocuments({
      createdAt: {
        $gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        $lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      }
    });
    this.routeNumber = `RT-${dateStr}-${String(count + 1).padStart(3, '0')}`;
  }

  // Populate formattedAddress for journeyStartLocation
  if (this.journeyStartLocation) {
    locationService.populateFormattedAddress(this.journeyStartLocation);
  }

  // Populate formattedAddress for journeyEndLocation
  if (this.journeyEndLocation) {
    locationService.populateFormattedAddress(this.journeyEndLocation);
  }

  // Initialize checklists and populate formattedAddress for stops
  if (this.stops && Array.isArray(this.stops)) {
    const { getDefaultChecklist } = require('../utils/checklistDefaults');
    this.stops.forEach(stop => {
      if (!stop.checklist || stop.checklist.length === 0) {
        stop.checklist = getDefaultChecklist(stop.stopType);
      }
      // Populate formattedAddress for stop location
      if (stop.location) {
        locationService.populateFormattedAddress(stop.location);
      }
    });
  }

  next();
});

module.exports = mongoose.model('Route', routeSchema);


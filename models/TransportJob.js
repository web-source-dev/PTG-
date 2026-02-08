const mongoose = require('mongoose');
const { TRANSPORT_JOB_STATUS } = require('../constants/status');

const transportJobSchema = new mongoose.Schema({
  // Job Identification
  jobNumber: {
    type: String,
    trim: true
  },

  // Load Type - determines if this job is for a vehicle or other load
  loadType: {
    type: String,
    enum: ['vehicle', 'load'],
    default: 'vehicle'
  },
  
  // Vehicle Reference (required if loadType is 'vehicle')
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: function() {
      return this.loadType === 'vehicle';
    }
  },
  
  // Load Reference (required if loadType is 'load')
  loadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Load',
    required: function() {
      return this.loadType === 'load';
    }
  },

  // Status Tracking
  status: {
    type: String,
    enum: Object.values(TRANSPORT_JOB_STATUS),
    default: TRANSPORT_JOB_STATUS.NEEDS_DISPATCH
  },

  // Carrier Information
  carrier: {
    type: String,
    default: 'PTG'
  },
  externalCarrierName: {
    type: String,
    trim: true
  },

  // Transport Purpose (for recurring transports)
  transportPurpose: {
    type: String,
    enum: ['initial_delivery', 'relocation', 'dealer_transfer', 'auction', 'service', 'redistribution'],
    default: 'initial_delivery'
  },

  // Pickup Information
  pickupLocationName: {
    type: String,
    trim: true
  },
  pickupCity: {
    type: String,
    trim: true
  },
  pickupState: {
    type: String,
    trim: true
  },
  pickupZip: {
    type: String,
    trim: true
  },
  pickupFormattedAddress: {
    type: String,
    trim: true
  },
  pickupContactName: {
    type: String,
    trim: true
  },
  pickupContactPhone: {
    type: String,
    trim: true
  },
  pickupDateStart: {
    type: Date
  },
  pickupDateEnd: {
    type: Date
  },
  pickupTimeStart: {
    type: String,
    trim: true
  },
  pickupTimeEnd: {
    type: String,
    trim: true
  },

  // Drop Information
  dropDestinationType: {
    type: String,
    enum: ['PF', 'Auction', 'Other'],
    trim: true
  },
  dropLocationName: {
    type: String,
    trim: true
  },
  dropCity: {
    type: String,
    trim: true
  },
  dropState: {
    type: String,
    trim: true
  },
  dropZip: {
    type: String,
    trim: true
  },
  dropFormattedAddress: {
    type: String,
    trim: true
  },
  dropContactName: {
    type: String,
    trim: true
  },
  dropContactPhone: {
    type: String,
    trim: true
  },
  dropDateStart: {
    type: Date
  },
  dropDateEnd: {
    type: Date
  },
  dropTimeStart: {
    type: String,
    trim: true
  },
  dropTimeEnd: {
    type: String,
    trim: true
  },


  // Route Reference (for PTG routes)
  // DEPRECATED: Use pickupRouteId and dropRouteId instead
  // Kept for backward compatibility
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route'
  },

  // Multi-Route Support: Track which routes contain pickup and drop stops
  // A transport job can span multiple routes (pickup on Route 1, drop on Route 2)
  pickupRouteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    default: null
  },
  dropRouteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    default: null
  },

  // Driver Assignment (for tracking which driver moved this load)
  assignedDriver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },


  // Proof of Delivery - Vehicle Condition Photos
  pickupPhotos: [{
    type: String,
    trim: true
  }],
  deliveryPhotos: [{
    type: String,
    trim: true
  }],

  // Checklists for pickup and delivery operations
  pickupChecklist: [{
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
  deliveryChecklist: [{
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

  // These arrays are kept for backward compatibility but should be populated by virtuals
  billOfLading: {
    type: String,
    trim: true
  },


  // Pricing
  carrierPayment: {
    type: Number
  },

  // Deletion tracking (for vehicle deletion)
  vehicleDeleted: {
    type: Boolean,
    default: false
  },
  vehicleDeletedAt: {
    type: Date
  },
  vehicleDeletionLabel: {
    type: String,
    trim: true
  },
  
  // Deletion tracking (for load deletion)
  loadDeleted: {
    type: Boolean,
    default: false
  },
  loadDeletedAt: {
    type: Date
  },
  loadDeletionLabel: {
    type: String,
    trim: true
  },

  // Soft delete fields (for transport job deletion)
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },

  // Audit Trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  externalUserId: {
    type: String,
    trim: true
  },
  externalUserEmail: {
    type: String,
    trim: true
  },
}, {
  timestamps: true
});


// Index for efficient queries
transportJobSchema.index({ jobNumber: 1 });
transportJobSchema.index({ vehicleId: 1 });
transportJobSchema.index({ loadId: 1 });
transportJobSchema.index({ loadType: 1 });
transportJobSchema.index({ status: 1 });
transportJobSchema.index({ carrier: 1 });
transportJobSchema.index({ routeId: 1 }); // Backward compatibility
transportJobSchema.index({ pickupRouteId: 1 });
transportJobSchema.index({ dropRouteId: 1 });
transportJobSchema.index({ createdAt: -1 });
transportJobSchema.index({ deleted: 1 });

// Pre-save middleware to generate job number and populate formattedAddress fields
transportJobSchema.pre('save', async function(next) {
  const locationService = require('../utils/locationService');
  
  if (this.isNew && !this.jobNumber) {
    // Generate job number like TJ-20241222-001
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await mongoose.model('TransportJob').countDocuments({
      createdAt: {
        $gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        $lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      }
    });
    this.jobNumber = `TJ-${dateStr}-${String(count + 1).padStart(3, '0')}`;
  }

  // Populate pickupFormattedAddress if not already set
  if (!this.pickupFormattedAddress && (this.pickupLocationName || this.pickupCity || this.pickupState)) {
    const pickupLocation = {
      name: this.pickupLocationName,
      city: this.pickupCity,
      state: this.pickupState,
      zip: this.pickupZip
    };
    locationService.populateFormattedAddress(pickupLocation);
    if (pickupLocation.formattedAddress) {
      this.pickupFormattedAddress = pickupLocation.formattedAddress;
    }
  }

  // Populate dropFormattedAddress if not already set
  if (!this.dropFormattedAddress && (this.dropLocationName || this.dropCity || this.dropState)) {
    const dropLocation = {
      name: this.dropLocationName,
      city: this.dropCity,
      state: this.dropState,
      zip: this.dropZip
    };
    locationService.populateFormattedAddress(dropLocation);
    if (dropLocation.formattedAddress) {
      this.dropFormattedAddress = dropLocation.formattedAddress;
    }
  }

  next();
});

module.exports = mongoose.model('TransportJob', transportJobSchema);

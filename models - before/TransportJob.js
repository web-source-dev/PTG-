const mongoose = require('mongoose');
const { TRANSPORT_JOB_STATUS } = require('../constants/status');

const transportJobSchema = new mongoose.Schema({
  // Job Identification
  jobNumber: {
    type: String,
    trim: true
  },

  // Vehicle Reference
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle'
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

  // Central Dispatch
  centralDispatchLoadId: {
    type: String,
    trim: true
  },
  centralDispatchPosted: {
    type: Boolean,
    default: false
  },
  centralDispatchPostedAt: {
    type: Date
  },

  // Route Reference (for PTG routes)
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route'
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

  // Central Dispatch Manual Updates (for info tracking)
  centralDispatchTruckInfo: {
    type: String,
    trim: true
  },
  centralDispatchAmount: {
    type: Number
  },
  centralDispatchNotes: {
    type: String,
    trim: true
  },

  // Pricing
  carrierPayment: {
    type: Number
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
transportJobSchema.index({ status: 1 });
transportJobSchema.index({ carrier: 1 });
transportJobSchema.index({ routeId: 1 });
transportJobSchema.index({ centralDispatchLoadId: 1 });
transportJobSchema.index({ createdAt: -1 });

// Pre-save middleware to generate job number
transportJobSchema.pre('save', async function(next) {
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
  next();
});

module.exports = mongoose.model('TransportJob', transportJobSchema);

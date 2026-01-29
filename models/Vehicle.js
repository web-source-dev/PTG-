const mongoose = require('mongoose');
const { VEHICLE_STATUS } = require('../constants/status');

const vehicleSchema = new mongoose.Schema({
  // Vehicle Identity
  vin: {
    type: String,
    uppercase: true,
    trim: true
  },
  year: {
    type: Number
  },
  make: {
    type: String,
    trim: true
  },
  model: {
    type: String,
    trim: true
  },

  // Purchase Details
  purchaseSource: {
    type: String,
    trim: true
  },
  purchaseDate: {
    type: Date
  },
  purchasePrice: {
    type: Number
  },
  buyerName: {
    type: String,
    trim: true
  },

  // Documents and Images (any type of file)
  documents: [{
    url: {
      type: String,
      trim: true,
      required: true
    },
    publicId: {
      type: String,
      trim: true
    },
    fileName: {
      type: String,
      trim: true
    },
    fileType: {
      type: String,
      trim: true
    },
    fileSize: {
      type: Number
    },
    documentType: {
      type: String,
      enum: ['image', 'document', 'other'],
      default: 'document'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    description: {
      type: String,
      trim: true
    }
  }],

  // Transport History - Track all transport jobs for this vehicle
  transportJobs: [{
    transportJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TransportJob'
    },
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route'
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'cancelled']
    },
    transportPurpose: {
      type: String,
      enum: ['initial_delivery', 'relocation', 'dealer_transfer', 'auction', 'service', 'redistribution']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Transport Statistics
  totalTransports: {
    type: Number,
    default: 0
  },
  lastTransportDate: {
    type: Date
  },
  isAvailableForTransport: {
    type: Boolean,
    default: true
  },

  // Status
  status: {
    type: String,
    enum: Object.values(VEHICLE_STATUS),
    default: VEHICLE_STATUS.PURCHASED_INTAKE_NEEDED
  },

  // Delivery tracking (deprecated - kept for backward compatibility)
  deliveredAt: {
    type: Date
  },

  // Current Transport Job Reference (active transport job)
  currentTransportJobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransportJob'
  },
  createdBy: {
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
  source: {
    type: String,
    default: 'PTG'
  },
  // Notes section
  notes: {
    type: String,
    trim: true
  },
  // Delivery Priority
  deliveryPriority: {
    type: String,
    enum: ['Low', 'Normal', 'High', 'Urgent'],
    default: 'Normal'
  },
}, {
  timestamps: true
});

// Index for efficient queries
vehicleSchema.index({ vin: 1 });
vehicleSchema.index({ status: 1 });

module.exports = mongoose.model('Vehicle', vehicleSchema);

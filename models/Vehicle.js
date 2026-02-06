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

  // Shipper Details
  shipperId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shipper'
  },
  shipperName: {
    type: String,
    trim: true
  },
  shipperCompany: {
    type: String,
    trim: true
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
  submissionDate: {
    type: Date,
    default: Date.now
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
    default: VEHICLE_STATUS.INTAKE_COMPLETE
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

  // Initial Pickup Location (set during vehicle intake)
  initialPickupLocationName: {
    type: String,
    trim: true
  },
  initialPickupCity: {
    type: String,
    trim: true
  },
  initialPickupState: {
    type: String,
    trim: true
  },
  initialPickupZip: {
    type: String,
    trim: true
  },
  initialPickupFormattedAddress: {
    type: String,
    trim: true
  },
  initialPickupContactName: {
    type: String,
    trim: true
  },
  initialPickupContactPhone: {
    type: String,
    trim: true
  },

  // Initial Drop Location (set during vehicle intake)
  initialDropDestinationType: {
    type: String,
    enum: ['PF', 'Auction', 'Other'],
    default: 'Other'
  },
  initialDropLocationName: {
    type: String,
    trim: true
  },
  initialDropCity: {
    type: String,
    trim: true
  },
  initialDropState: {
    type: String,
    trim: true
  },
  initialDropZip: {
    type: String,
    trim: true
  },
  initialDropFormattedAddress: {
    type: String,
    trim: true
  },
  initialDropContactName: {
    type: String,
    trim: true
  },
  initialDropContactPhone: {
    type: String,
    trim: true
  },

  // Soft delete fields
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
}, {
  timestamps: true
});

// Pre-save middleware to populate formattedAddress fields
vehicleSchema.pre('save', function(next) {
  const locationService = require('../utils/locationService');
  
  // Populate initialPickupFormattedAddress if not already set
  if (!this.initialPickupFormattedAddress && (this.initialPickupLocationName || this.initialPickupCity || this.initialPickupState)) {
    const pickupLocation = {
      name: this.initialPickupLocationName,
      city: this.initialPickupCity,
      state: this.initialPickupState,
      zip: this.initialPickupZip
    };
    locationService.populateFormattedAddress(pickupLocation);
    if (pickupLocation.formattedAddress) {
      this.initialPickupFormattedAddress = pickupLocation.formattedAddress;
    }
  }

  // Populate initialDropFormattedAddress if not already set
  if (!this.initialDropFormattedAddress && (this.initialDropLocationName || this.initialDropCity || this.initialDropState)) {
    const dropLocation = {
      name: this.initialDropLocationName,
      city: this.initialDropCity,
      state: this.initialDropState,
      zip: this.initialDropZip
    };
    locationService.populateFormattedAddress(dropLocation);
    if (dropLocation.formattedAddress) {
      this.initialDropFormattedAddress = dropLocation.formattedAddress;
    }
  }

  next();
});

// Index for efficient queries
vehicleSchema.index({ vin: 1 });
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ deleted: 1 });

module.exports = mongoose.model('Vehicle', vehicleSchema);

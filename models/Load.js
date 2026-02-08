const mongoose = require('mongoose');
const { LOAD_STATUS } = require('../constants/status');

const loadSchema = new mongoose.Schema({
  // Load Identification
  loadNumber: {
    type: String,
    trim: true
  },
  
  // Load Type
  loadType: {
    type: String,
    required: true,
    default: 'other'
  },
  
  // Load Description
  description: {
    type: String,
    trim: true,
    required: true
  },
  
  // Physical Properties
  weight: {
    type: Number, // in lbs
    min: 0
  },
  dimensions: {
    length: Number, // in inches
    width: Number, // in inches
    height: Number // in inches
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },
  unit: {
    type: String,
    default: 'piece'
  },

  // Truck Accessories
  truckAccessories: [{
    type: String,
    trim: true
  }],

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
  
  // Initial Pickup Location (set during load intake)
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
  
  // Initial Drop Location (set during load intake)
  initialDropDestinationType: {
    type: String,
    enum: ['PF', 'Auction', 'Other'],
    trim: true
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
  
  // Documents and Images
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
  
  // Transport History - Track all transport jobs for this load
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
      enum: ['pending', 'in_progress', 'completed', 'cancelled'],
      default: 'pending'
    },
    transportPurpose: {
      type: String
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
    enum: Object.values(LOAD_STATUS),
    default: LOAD_STATUS.INTAKE_COMPLETE
  },
  currentTransportJobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransportJob'
  },
  
  // Additional Information
  source: {
    type: String,
    trim: true,
    default: 'manual'
  },
  notes: {
    type: String,
    trim: true
  },
  deliveryPriority: {
    type: String,
    enum: ['Low', 'Normal', 'High', 'Urgent'],
    default: 'Normal'
  },
  deliveredAt: {
    type: Date
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
  externalUserId: {
    type: String,
    trim: true
  },
  externalUserEmail: {
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
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
loadSchema.index({ loadNumber: 1 });
loadSchema.index({ loadType: 1 });
loadSchema.index({ status: 1 });
loadSchema.index({ shipperId: 1 });
loadSchema.index({ currentTransportJobId: 1 });
loadSchema.index({ createdAt: -1 });
loadSchema.index({ deleted: 1 });

// Pre-save middleware to generate load number, auto-create/find shipper, and populate formattedAddress
loadSchema.pre('save', async function(next) {
  const locationService = require('../utils/locationService');
  const Shipper = require('./Shipper');
  
  // Generate load number if new
  if (this.isNew && !this.loadNumber) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await mongoose.model('Load').countDocuments({
      createdAt: {
        $gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        $lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      }
    });
    this.loadNumber = `LD-${dateStr}-${String(count + 1).padStart(3, '0')}`;
  }
  
  // Auto-create or find shipper if shipper info is provided but no shipperId
  if ((this.shipperName || this.shipperCompany) && !this.shipperId) {
    try {
      let shipper = await Shipper.findOne({
        $or: [
          { shipperName: this.shipperName, shipperCompany: this.shipperCompany },
          { shipperEmail: this.shipperEmail }
        ]
      });
      
      if (!shipper) {
        shipper = await Shipper.create({
          shipperName: this.shipperName,
          shipperCompany: this.shipperCompany,
          shipperEmail: this.shipperEmail,
          shipperPhone: this.shipperPhone,
          createdBy: this.createdBy
        });
      }
      
      this.shipperId = shipper._id;
    } catch (error) {
      console.error('Error creating/finding shipper for load:', error);
    }
  }
  
  // Populate formattedAddress for initial pickup location
  if (this.initialPickupLocationName || this.initialPickupCity || this.initialPickupState) {
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
  
  // Populate formattedAddress for initial drop location
  if (this.initialDropLocationName || this.initialDropCity || this.initialDropState) {
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

module.exports = mongoose.model('Load', loadSchema);


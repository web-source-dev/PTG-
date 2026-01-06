const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema({
  // Event Identity
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },

  // Date and Time
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },

  // All Day Event
  allDay: {
    type: Boolean,
    default: false
  },

  // Color for display
  color: {
    type: String,
    enum: ['blue', 'green', 'orange', 'purple', 'red', 'teal'],
    default: 'blue'
  },

  // Associated Entities (optional)
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route'
  },
  transportJobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransportJob'
  },
  truckId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Truck'
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle'
  },

  // Creator
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Flexible data field for any additional information
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'cancelled'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
calendarEventSchema.index({ createdBy: 1, startDate: -1 });
calendarEventSchema.index({ driverId: 1, startDate: -1 });
calendarEventSchema.index({ routeId: 1 });
calendarEventSchema.index({ transportJobId: 1 });
calendarEventSchema.index({ truckId: 1 });
calendarEventSchema.index({ vehicleId: 1 });
calendarEventSchema.index({ startDate: 1, endDate: 1 });
calendarEventSchema.index({ status: 1 });

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);

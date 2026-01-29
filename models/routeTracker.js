const mongoose = require('mongoose');

const HistorySchema = new mongoose.Schema(
  {
    // Differentiates record type
    type: {
      type: String,
      enum: ["location", "action"],
      required: true,
      index: true
    },

    // Common timestamp
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },

    // 📍 Location data (available for both location and action entries)
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    formattedAddress: String, // Complete formatted address: "Address, City, State ZIP"

    // 🔗 Audit reference
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuditLog",
      default: null
    },
    refType: {
      type: String,
      default: null
    },

    meta: {
      type: Object,
      default: {}
    }
  },
  { _id: true }
);

const RouteTrackingSchema = new mongoose.Schema(
  {
    // 🔗 Required context (route must exist)
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
      required: true,
      index: true
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    truckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Truck",
      index: true
    },

    // Route lifecycle
    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active"
    },
    startedAt: Date,
    endedAt: Date,

    // 🧠 Unified history (location + actions)
    history: [HistorySchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model("RouteTracking", RouteTrackingSchema);

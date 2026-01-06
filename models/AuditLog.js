const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      // Route actions
      'start_route', 'stop_route', 'resume_route', 'complete_route', 'create_route', 'update_route', 'delete_route',
      'remove_transport_job_from_route',
      // Photo and file actions
      'upload_vehicle_photo', 'upload_stop_photo', 'upload_file', 'delete_file',
      // Checklist and report actions
      'mark_stop_completed', 'complete_checklist_item', 'add_report',
      // Expense actions
      'add_fuel_expense', 'add_maintenance_expense',
      // Transport job actions
      'create_transport_job', 'update_transport_job', 'delete_transport_job',
      // Vehicle actions
      'create_vehicle', 'update_vehicle', 'delete_vehicle',
      // Calendar actions
      'create_calendar_event', 'update_calendar_event', 'delete_calendar_event',
      // User management actions
      'create_user', 'update_user', 'update_user_role', 'delete_user',
      // Authentication actions
      'user_login', 'user_login_failed', 'password_reset_requested', 'password_reset_successful',
      // Location actions
      'update_driver_location'
    ]
  },

  entityType: {
    type: String,
    required: true,
    enum: ['route', 'transportJob', 'vehicle', 'truck', 'expense', 'user', 'file', 'location', 'calendarEvent']
  },

  entityId: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
    required: function() {
      // Not required for actions that don't have a specific entity (like bulk operations)
      return !['user_login', 'user_login_failed', 'get_all_drivers_locations'].includes(this.action);
    }
  },

  // User who performed the action (required)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Driver affected by the action (optional - for driver-specific actions)
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  location: {
    latitude: Number,
    longitude: Number,
    accuracy: Number
  },

  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  notes: String,

  // For grouping related actions
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ driverId: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ routeId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

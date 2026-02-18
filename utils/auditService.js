const AuditLog = require('../models/AuditLog');

/**
 * Centralized Audit Service
 * Handles all action logging with consistent format and validation
 */
class AuditService {

  /**
   * Log driver action
   */
  async logDriverAction(action, entityType, entityId, driverId, location = null, details = {}, routeId = null) {
    try {
      // Validate required fields
      if (!action || !entityType || !entityId || !driverId) {
        console.warn('Missing required fields for audit log:', { action, entityType, entityId, driverId });
        return;
      }

      // Create audit log entry
      const auditEntry = {
        action,
        entityType,
        entityId,
        driverId,
        routeId,
        details,
        location: location ? {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy
        } : null
      };

      // Add contextual notes based on action type
      auditEntry.notes = this.generateActionNote(action, details);

      await AuditLog.create(auditEntry);

      console.log(`Audit logged: ${action} by driver ${driverId} on ${entityType} ${entityId}`);
    } catch (error) {
      console.error('Error logging audit action:', error);
      // Don't fail the main operation if audit logging fails
    }
  }

  /**
   * Log general error
   */
  async logError(action, error, details = {}, userId = null, driverId = null, location = null, routeId = null) {
    try {
      const errorMessage = error instanceof Error ? error.message : error.toString();
      const errorStack = error instanceof Error ? error.stack : null;

      const auditEntry = {
        action,
        entityType: 'error',
        entityId: errorMessage.substring(0, 100), // Use first 100 chars of error as entityId
        userId,
        driverId,
        routeId,
        location: location ? {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy
        } : null,
        details: {
          ...details,
          errorMessage,
          errorStack: errorStack?.substring(0, 1000), // Limit stack trace
          errorName: error instanceof Error ? error.name : 'UnknownError',
          timestamp: new Date().toISOString()
        }
      };

      auditEntry.notes = this.generateErrorNote(action, errorMessage, details);

      await AuditLog.create(auditEntry);

      console.log(`Error logged: ${action} - ${errorMessage}`);
    } catch (auditError) {
      console.error('Error logging error to audit:', auditError);
      // Don't fail the main operation if audit logging fails
    }
  }

  /**
   * Log system error (no user context)
   */
  async logSystemError(action, error, details = {}) {
    return this.logError(action, error, details);
  }

  /**
   * Log user error (with user context)
   */
  async logUserError(action, error, userId, details = {}) {
    return this.logError(action, error, details, userId);
  }

  /**
   * Log driver error (with driver context)
   */
  async logDriverError(action, error, driverId, details = {}, location = null, routeId = null) {
    return this.logError(action, error, details, null, driverId, location, routeId);
  }

  /**
   * Generate human-readable notes for actions
   */
  generateActionNote(action, details) {
    switch (action) {
      case 'start_route':
        return 'Started route';
      case 'stop_route':
        return 'Stopped route';
      case 'resume_route':
        return 'Resumed route';
      case 'complete_route':
        return 'Completed route';
      case 'upload_vehicle_photo':
        return `Uploaded ${details.photoCount || 1} vehicle photo(s)`;
      case 'upload_stop_photo':
        return `Uploaded ${details.photoCount || 1} stop photo(s) for ${details.stopType} stop`;
      case 'mark_stop_completed':
        return `Marked ${details.stopType} stop as completed`;
      case 'complete_checklist_item':
        return `Completed checklist item: ${details.checklistItem}`;
      case 'add_report':
        return `Added report: ${details.reportText?.substring(0, 50)}${details.reportText?.length > 50 ? '...' : ''}`;
      case 'add_fuel_expense':
        return `Added fuel expense: ${details.gallons} gallons for $${details.totalCost}`;
      case 'add_maintenance_expense':
        return `Added maintenance expense: ${details.description} for $${details.cost}`;
      default:
        return action.replace(/_/g, ' ');
    }
  }

  /**
   * Generate notes for errors
   */
  generateErrorNote(action, errorMessage, details) {
    const baseNote = `Error in ${action.replace(/_/g, ' ')}: ${errorMessage.substring(0, 100)}`;

    if (details.context) {
      return `${baseNote} (${details.context})`;
    }

    return baseNote;
  }

  /**
   * Get audit logs for entity
   */
  async getAuditLogsForEntity(entityType, entityId, limit = 100) {
    return await AuditLog.find({ entityType, entityId })
      .populate('driverId', 'firstName lastName')
      .populate('routeId', 'routeNumber')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  /**
   * Get audit logs for driver
   */
  async getAuditLogsForDriver(driverId, limit = 100) {
    return await AuditLog.find({ driverId })
      .populate('routeId', 'routeNumber')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  /**
   * Get audit logs for route
   */
  async getAuditLogsForRoute(routeId, limit = 100) {
    return await AuditLog.find({ routeId })
      .populate('driverId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  /**
   * Get recent audit logs across system
   */
  async getRecentAuditLogs(limit = 50) {
    return await AuditLog.find({})
      .populate('driverId', 'firstName lastName')
      .populate('routeId', 'routeNumber')
      .sort({ createdAt: -1 })
      .limit(limit);
  }
}

module.exports = new AuditService();

const RouteTracking = require('../models/routeTracker');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

class RouteTrackerService {
  constructor() {
    this.activeTrackers = new Map(); // Cache for active trackers
  }

  /**
   * Initialize route tracking when route is started
   * @param {string} routeId - Route ID
   * @param {string} driverId - Driver ID
   * @param {string} truckId - Truck ID
   * @param {Object} auditLogId - Audit log ID for the start action
   */
  async initializeTracking(routeId, driverId, truckId, auditLogId = null) {
    try {
      // Check if tracking already exists
      let tracker = await RouteTracking.findOne({ routeId });

      if (tracker) {
        // Update status if it was cancelled or completed
        if (tracker.status !== 'active') {
          tracker.status = 'active';
          tracker.startedAt = new Date();
          await tracker.save();
        }
      } else {
        // Create new tracker
        tracker = new RouteTracking({
          routeId,
          driverId,
          truckId,
          status: 'active',
          startedAt: new Date(),
          history: []
        });
        await tracker.save();
      }

      // Cache the active tracker
      this.activeTrackers.set(routeId, tracker);

      console.log(`📍 Route tracking initialized for route ${routeId}`);
      return tracker;
    } catch (error) {
      console.error('Error initializing route tracking:', error);
      throw error;
    }
  }

  /**
   * Add location entry to route tracking
   * @param {string} routeId - Route ID
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @param {number} accuracy - GPS accuracy
   * @param {string} auditLogId - Audit log ID (optional)
   */
  async addLocationEntry(routeId, latitude, longitude, accuracy = null, auditLogId = null) {
    try {
      let tracker = this.activeTrackers.get(routeId);

      if (!tracker) {
        tracker = await RouteTracking.findOne({ routeId });
        if (tracker) {
          this.activeTrackers.set(routeId, tracker);
        }
      }

      if (!tracker || tracker.status !== 'active') {
        // Try to initialize tracking if it doesn't exist
        const user = await User.findOne({ currentRouteId: routeId });
        if (user && user.role === 'ptgDriver') {
          tracker = await this.initializeTracking(routeId, user._id, null, auditLogId);
        } else {
          return; // Cannot initialize without driver info
        }
      }

      const locationEntry = {
        type: 'location',
        timestamp: new Date(),
        latitude,
        longitude,
        accuracy,
        refId: auditLogId,
        refType: 'AuditLog'
      };

      tracker.history.push(locationEntry);
      const savedTracker = await tracker.save();

      console.log(`📍 Added location entry to route ${routeId}:`, locationEntry);
      console.log(`📍 Route tracker history length: ${savedTracker.history.length}`);

      return locationEntry;
    } catch (error) {
      console.error('Error adding location entry:', error);
      throw error;
    }
  }

  /**
   * Add action entry to route tracking
   * @param {string} routeId - Route ID
   * @param {string} action - Action type (start_route, stop_route, resume_route, etc.)
   * @param {Object} location - Location data {latitude, longitude, accuracy}
   * @param {Object} auditLogId - Audit log ID
   * @param {Object} meta - Additional metadata
   */
  async addActionEntry(routeId, action, location = null, auditLogId = null, meta = {}) {
    try {
      let tracker = this.activeTrackers.get(routeId);

      if (!tracker) {
        tracker = await RouteTracking.findOne({ routeId });
        if (tracker) {
          this.activeTrackers.set(routeId, tracker);
        }
      }

      if (!tracker || tracker.status !== 'active') {
        // Try to initialize tracking if it doesn't exist
        const user = await User.findOne({ currentRouteId: routeId });
        if (user && user.role === 'ptgDriver') {
          tracker = await this.initializeTracking(routeId, user._id, null, auditLogId);
        } else {
          return; // Cannot initialize without driver info
        }
      }

      const actionEntry = {
        type: 'action',
        timestamp: new Date(),
        ...(location && {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy
        }),
        refId: auditLogId,
        refType: 'AuditLog',
        meta: {
          action,
          ...meta,
          ...(location && {
            location: {
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy
            }
          })
        }
      };

      tracker.history.push(actionEntry);
      await tracker.save();

      return actionEntry;
    } catch (error) {
      console.error('Error adding action entry:', error);
      throw error;
    }
  }

  /**
   * Complete route tracking
   * @param {string} routeId - Route ID
   * @param {string} auditLogId - Audit log ID for completion
   */
  async completeTracking(routeId, auditLogId = null) {
    try {
      let tracker = this.activeTrackers.get(routeId);

      if (!tracker) {
        tracker = await RouteTracking.findOne({ routeId });
      }

      if (tracker && tracker.status === 'active') {
        tracker.status = 'completed';
        tracker.endedAt = new Date();

        // Add completion action if audit log provided
        if (auditLogId) {
          const completionEntry = {
            type: 'action',
            timestamp: new Date(),
            refId: auditLogId,
            refType: 'AuditLog',
            meta: {
              action: 'complete_route'
            }
          };
          tracker.history.push(completionEntry);
        }

        await tracker.save();

        // Remove from cache
        this.activeTrackers.delete(routeId);

        console.log(`📍 Route tracking completed for route ${routeId}`);
        return tracker;
      }
    } catch (error) {
      console.error('Error completing route tracking:', error);
      throw error;
    }
  }

  /**
   * Get route tracking data
   * @param {string} routeId - Route ID
   */
  async getTrackingData(routeId) {
    try {
      const tracker = await RouteTracking.findOne({ routeId })
        .populate('routeId')
        .populate('driverId')
        .populate('truckId');

      return tracker;
    } catch (error) {
      console.error('Error getting tracking data:', error);
      throw error;
    }
  }

  /**
   * Clean up inactive trackers from cache
   */
  cleanup() {
    // This could be called periodically to clean up memory
    const now = Date.now();
    for (const [routeId, tracker] of this.activeTrackers.entries()) {
      if (tracker.status !== 'active' || (now - tracker.startedAt.getTime()) > 24 * 60 * 60 * 1000) {
        this.activeTrackers.delete(routeId);
      }
    }
  }
}

// Export singleton instance
module.exports = new RouteTrackerService();

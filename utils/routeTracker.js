const RouteTracking = require('../models/routeTracker');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const Route = require('../models/Route');

class RouteTrackerService {
  constructor() {
    this.activeTrackers = new Map(); // Cache for active trackers
    this.saveLocks = new Map(); // Locks to prevent parallel saves for the same route
  }

  /**
   * Get or create a lock promise for a routeId
   * This ensures only one save operation happens at a time per route
   * Returns a function to release the lock
   */
  async acquireLock(routeId) {
    // If there's already a lock, wait for it (with timeout to prevent deadlocks)
    if (this.saveLocks.has(routeId)) {
      try {
        await Promise.race([
          this.saveLocks.get(routeId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Lock timeout')), 10000)
          )
        ]);
      } catch (error) {
        // If timeout, remove the lock and continue
        if (error.message === 'Lock timeout') {
          console.warn(`⚠️ Lock timeout for route ${routeId}, removing stale lock`);
          this.saveLocks.delete(routeId);
        } else {
          throw error;
        }
      }
    }
    
    // Create a new lock promise
    let resolveLock;
    const lockPromise = new Promise((resolve) => {
      resolveLock = resolve;
    });
    
    this.saveLocks.set(routeId, lockPromise);
    
    // Return a function to release the lock
    return () => {
      resolveLock();
      this.saveLocks.delete(routeId);
    };
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
    // Acquire lock to prevent parallel saves
    const releaseLock = await this.acquireLock(routeId);
    
    try {
      // Check if tracker exists and is active
      let tracker = await RouteTracking.findOne({ routeId, status: 'active' });

      if (!tracker) {
        // Try to initialize tracking if it doesn't exist
        // First try to find driver by currentRouteId
        let user = await User.findOne({ currentRouteId: routeId });
        
        // If not found, try to get driver from route
        if (!user) {
          const route = await Route.findById(routeId).populate('driverId');
          if (route && route.driverId) {
            user = route.driverId;
          }
        }
        
        if (user && (user.role === 'ptgDriver' || user.role === 'ptgDriver')) {
          tracker = await this.initializeTracking(routeId, user._id, null, auditLogId);
        } else {
          // Try to create tracker anyway with route info
          const route = await Route.findById(routeId);
          if (route && route.driverId) {
            const driverId = typeof route.driverId === 'object' ? route.driverId._id : route.driverId;
            const truckId = route.truckId ? (typeof route.truckId === 'object' ? route.truckId._id : route.truckId) : null;
            tracker = await this.initializeTracking(routeId, driverId, truckId, auditLogId);
          } else {
            releaseLock();
            return null; // Cannot initialize without driver info
          }
        }
      }

      if (!tracker) {
        console.error(`❌ Tracker still not available after initialization attempt for route ${routeId}`);
        releaseLock();
        return null;
      }

      const locationEntry = {
        type: 'location',
        timestamp: new Date(),
        latitude,
        longitude,
        accuracy: accuracy || undefined,
        refId: auditLogId || undefined,
        refType: auditLogId ? 'AuditLog' : undefined
      };

      // Use atomic update with $push to avoid parallel save issues
      // This is thread-safe and prevents ParallelSaveError
      const updatedTracker = await RouteTracking.findByIdAndUpdate(
        tracker._id,
        {
          $push: { history: locationEntry }
        },
        {
          new: true, // Return updated document
          runValidators: true
        }
      );

      // Update cache if it exists
      if (this.activeTrackers.has(routeId)) {
        this.activeTrackers.set(routeId, updatedTracker);
      }

      releaseLock();
      return locationEntry;
    } catch (error) {
      releaseLock();
      console.error('❌ Error adding location entry:', error);
      console.error('Error details:', {
        routeId,
        latitude,
        longitude,
        accuracy,
        errorMessage: error.message,
        errorStack: error.stack
      });
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
    // Acquire lock to prevent parallel saves
    const releaseLock = await this.acquireLock(routeId);
    
    try {
      let tracker = await RouteTracking.findOne({ routeId });

      if (!tracker || tracker.status !== 'active') {
        // Try to initialize tracking if it doesn't exist
        const user = await User.findOne({ currentRouteId: routeId });
        if (user && user.role === 'ptgDriver') {
          tracker = await this.initializeTracking(routeId, user._id, null, auditLogId);
        } else {
          releaseLock();
          return; // Cannot initialize without driver info
        }
      }

      if (!tracker) {
        releaseLock();
        return;
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

      // Use atomic update with $push to avoid parallel save issues
      const updatedTracker = await RouteTracking.findByIdAndUpdate(
        tracker._id,
        {
          $push: { history: actionEntry }
        },
        {
          new: true,
          runValidators: true
        }
      );

      // Update cache if it exists
      if (this.activeTrackers.has(routeId)) {
        this.activeTrackers.set(routeId, updatedTracker);
      }

      releaseLock();
      return actionEntry;
    } catch (error) {
      releaseLock();
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

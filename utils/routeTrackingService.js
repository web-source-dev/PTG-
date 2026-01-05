const RouteTracking = require('../models/RouteTracking');
const Route = require('../models/Route');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

/**
 * Route Tracking Service
 * Handles location tracking, action logging, and heat map data for routes
 */
class RouteTrackingService {
  constructor() {
    this.activeTrackings = new Map(); // Cache active trackings by routeId
  }

  /**
   * Initialize tracking for a route when driver starts it
   */
  async initializeTracking(routeId, driverId) {
    try {
      console.log(`🔄 Initializing route tracking for route ${routeId}, driver ${driverId}`);

      // Get route and driver details
      const route = await Route.findById(routeId).populate('truckId driverId');
      const driver = await User.findById(driverId);
      const truck = route?.truckId;

      if (!route || !driver) {
        throw new Error('Route or driver not found');
      }

      // Get vehicles for this route
      const vehicles = [];
      if (route.selectedTransportJobs && route.selectedTransportJobs.length > 0) {
        // Get vehicles from transport jobs
        const TransportJob = require('../models/TransportJob');
        const transportJobs = await TransportJob.find({
          _id: { $in: route.selectedTransportJobs }
        }).populate('vehicleId');

        transportJobs.forEach(job => {
          if (job.vehicleId) {
            vehicles.push({
              vehicleId: job.vehicleId._id,
              vin: job.vehicleId.vin,
              make: job.vehicleId.make,
              model: job.vehicleId.model,
              year: job.vehicleId.year
            });
          }
        });
      }

      // Check if tracking already exists
      let tracking = await RouteTracking.findOne({
        routeId: routeId,
        status: 'active'
      });

      if (!tracking) {
        // Create new tracking record
        tracking = await RouteTracking.create({
          routeId: routeId,
          routeNumber: route.routeNumber,
          driverId: driverId,
          driverName: driver.firstName && driver.lastName ? `${driver.firstName} ${driver.lastName}` : driver.firstName || driver.lastName || driver.email,
          driverEmail: driver.email,
          truckId: route.truckId,
          truckNumber: truck?.truckNumber,
          vehicles: vehicles,
          trackingStartedAt: new Date(),
          status: 'active'
        });

        console.log(`✅ Created new route tracking: ${tracking._id}`);
      } else {
        console.log(`ℹ️ Route tracking already exists: ${tracking._id}`);
      }

      // Cache active tracking
      this.activeTrackings.set(routeId, tracking);

      return tracking;
    } catch (error) {
      console.error('Error initializing route tracking:', error);
      throw error;
    }
  }

  /**
   * Add location entry to active tracking
   */
  async addLocationEntry(routeId, locationData, context = {}) {
    try {
      let tracking = this.activeTrackings.get(routeId);

      if (!tracking) {
        // Try to get from database
        tracking = await RouteTracking.findOne({
          routeId: routeId,
          status: 'active'
        });

        if (!tracking) {
          console.warn(`No active tracking found for route ${routeId}`);
          return null;
        }

        // Cache it
        this.activeTrackings.set(routeId, tracking);
      }

      const locationEntry = {
        timestamp: new Date(),
        location: locationData,
        context: context
      };

      tracking.locationHistory.push(locationEntry);
      await tracking.save();

      console.log(`📍 Added location entry for route ${routeId}: ${locationData.latitude}, ${locationData.longitude}`);

      return locationEntry;
    } catch (error) {
      console.error('Error adding location entry:', error);
      return null;
    }
  }

  /**
   * Add action entry to active tracking
   */
  async addActionEntry(routeId, action, location, details = {}) {
    try {
      let tracking = this.activeTrackings.get(routeId);

      if (!tracking) {
        // Try to get from database
        tracking = await RouteTracking.findOne({
          routeId: routeId,
          status: 'active'
        });

        if (!tracking) {
          console.warn(`No active tracking found for route ${routeId}`);
          return null;
        }

        // Cache it
        this.activeTrackings.set(routeId, tracking);
      }

      const actionEntry = {
        timestamp: new Date(),
        action: action,
        location: location,
        details: details
      };

      tracking.actionHistory.push(actionEntry);
      await tracking.save();

      console.log(`🎯 Added action entry for route ${routeId}: ${action}`);

      // Also log to audit log for backward compatibility
      try {
        await AuditLog.create({
          action: action,
          entityType: 'route',
          entityId: routeId,
          userId: tracking.driverId,
          driverId: tracking.driverId,
          location: location,
          routeId: routeId,
          details: details,
          notes: `Driver action: ${action}`
        });
      } catch (auditError) {
        console.error('Error logging to audit:', auditError);
      }

      return actionEntry;
    } catch (error) {
      console.error('Error adding action entry:', error);
      return null;
    }
  }

  /**
   * Complete tracking for a route
   */
  async completeTracking(routeId) {
    try {
      let tracking = this.activeTrackings.get(routeId);

      if (!tracking) {
        tracking = await RouteTracking.findOne({
          routeId: routeId,
          status: 'active'
        });
      }

      if (!tracking) {
        console.warn(`No active tracking found for route ${routeId} to complete`);
        return null;
      }

      // Calculate statistics
      await this.calculateTrackingStatistics(tracking);

      // Mark as completed
      tracking.trackingEndedAt = new Date();
      tracking.status = 'completed';
      await tracking.save();

      // Remove from cache
      this.activeTrackings.delete(routeId);

      console.log(`✅ Completed route tracking for route ${routeId}`);

      return tracking;
    } catch (error) {
      console.error('Error completing tracking:', error);
      throw error;
    }
  }

  /**
   * Calculate statistics for completed tracking
   */
  async calculateTrackingStatistics(tracking) {
    try {
      const locationHistory = tracking.locationHistory || [];
      const actionHistory = tracking.actionHistory || [];

      if (locationHistory.length === 0) {
        return;
      }

      // Calculate distance (simplified - in real app you'd use proper distance calculation)
      let totalDistance = 0;
      for (let i = 1; i < locationHistory.length; i++) {
        const prev = locationHistory[i - 1];
        const curr = locationHistory[i];

        // Simple distance calculation (Haversine formula approximation)
        const lat1 = prev.location.latitude * Math.PI / 180;
        const lon1 = prev.location.longitude * Math.PI / 180;
        const lat2 = curr.location.latitude * Math.PI / 180;
        const lon2 = curr.location.longitude * Math.PI / 180;

        const dLat = lat2 - lat1;
        const dLon = lon2 - lon1;

        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(dLon/2) * Math.sin(dLon/2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = 6371 * c; // Distance in km

        totalDistance += distance;
      }

      // Calculate duration
      const startTime = new Date(tracking.trackingStartedAt);
      const endTime = new Date(tracking.trackingEndedAt || Date.now());
      const totalDuration = endTime - startTime;

      // Count actions
      const stopsCompleted = actionHistory.filter(a => a.action === 'complete_stop').length;
      const photosUploaded = actionHistory.filter(a =>
        a.action === 'upload_vehicle_photo' || a.action === 'upload_stop_photo'
      ).length;

      // Update statistics
      tracking.statistics = {
        totalDistance: Math.round(totalDistance * 1000), // Convert to meters
        totalDuration: totalDuration,
        stopsCompleted: stopsCompleted,
        photosUploaded: photosUploaded,
        fuelExpenses: 0, // Would be calculated from expense data
        avgSpeed: totalDistance > 0 ? (totalDistance / (totalDuration / 3600000)) : 0, // km/h
        maxSpeed: Math.max(...locationHistory.map(l => l.location.speed || 0)),
        idleTime: 0, // Would need more complex logic
        drivingTime: totalDuration // Simplified
      };

      console.log(`📊 Calculated statistics for route ${tracking.routeId}:`, tracking.statistics);

    } catch (error) {
      console.error('Error calculating tracking statistics:', error);
    }
  }

  /**
   * Get active tracking for a driver
   */
  async getActiveTrackingForDriver(driverId) {
    try {
      // First check if driver has a currentRouteId set
      const driver = await User.findById(driverId).select('currentRouteId');
      if (!driver || !driver.currentRouteId) {
        return null;
      }

      const routeId = driver.currentRouteId.toString();

      // Get tracking for this route
      let tracking = this.activeTrackings.get(routeId);

      if (!tracking) {
        tracking = await RouteTracking.findOne({
          routeId: routeId,
          status: 'active'
        });

        if (tracking) {
          this.activeTrackings.set(routeId, tracking);
        }
      }

      return tracking;
    } catch (error) {
      console.error('Error getting active tracking for driver:', error);
      return null;
    }
  }

  /**
   * Clean up old cached trackings
   */
  cleanupCache() {
    // Remove trackings that are no longer active
    for (const [routeId, tracking] of this.activeTrackings) {
      if (tracking.status !== 'active') {
        this.activeTrackings.delete(routeId);
      }
    }
  }

  /**
   * Get tracking summary for a route
   */
  async getTrackingSummary(routeId) {
    try {
      const tracking = await RouteTracking.findOne({
        routeId: routeId,
        status: { $in: ['active', 'completed'] }
      });

      if (!tracking) {
        return null;
      }

      return {
        routeId: tracking.routeId,
        routeNumber: tracking.routeNumber,
        driverId: tracking.driverId,
        driverName: tracking.driverName,
        truckId: tracking.truckId,
        truckNumber: tracking.truckNumber,
        status: tracking.status,
        startedAt: tracking.trackingStartedAt,
        endedAt: tracking.trackingEndedAt,
        vehicleCount: tracking.vehicles?.length || 0,
        locationCount: tracking.locationHistory?.length || 0,
        actionCount: tracking.actionHistory?.length || 0,
        statistics: tracking.statistics
      };
    } catch (error) {
      console.error('Error getting tracking summary:', error);
      return null;
    }
  }
}

module.exports = new RouteTrackingService();

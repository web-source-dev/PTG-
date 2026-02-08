const locationService = require('../utils/locationService');
const Route = require('../models/Route');
const RouteTracking = require('../models/routeTracker');
const User = require('../models/User');
const routeTracker = require('../utils/routeTracker');

/**
 * Location Controller
 * Handles geocoding, directions, and location tracking operations
 */

// Geocode an address to coordinates
exports.geocodeAddress = async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Address is required'
      });
    }

    const coordinates = await locationService.geocodeAddress(address);

    res.json({
      success: true,
      data: coordinates
    });
  } catch (error) {
    console.error('Geocode address error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to geocode address'
    });
  }
};

// Calculate distance and duration between two points
exports.calculateDistance = async (req, res) => {
  try {
    const { origin, destination, mode = 'driving' } = req.body;

    if (!origin || !destination || !origin.latitude || !origin.longitude ||
        !destination.latitude || !destination.longitude) {
      return res.status(400).json({
        success: false,
        message: 'Origin and destination with coordinates are required'
      });
    }

    const result = await locationService.calculateDistance(origin, destination, mode);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Calculate distance error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to calculate distance'
    });
  }
};

// Update stop coordinates using geocoding
exports.updateStopCoordinates = async (req, res) => {
  try {
    const { routeId, stopId } = req.params;

    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    const stop = route.stops.id(stopId);
    if (!stop) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found'
      });
    }

    const updatedStop = await locationService.updateStopCoordinates(stop);

    // Update the stop in the route
    stop.location.coordinates = updatedStop.location.coordinates;
    await route.save();

    res.json({
      success: true,
      data: updatedStop,
      message: 'Stop coordinates updated successfully'
    });
  } catch (error) {
    console.error('Update stop coordinates error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update stop coordinates'
    });
  }
};

// Calculate and save route distances
exports.calculateRouteDistances = async (req, res) => {
  try {
    const { routeId } = req.params;

    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    const updatedRoute = await locationService.calculateRouteDistances(route);

    // Update the route with calculated distances
    route.stops = updatedRoute.stops;
    route.totalDistance = updatedRoute.totalDistance;
    route.totalDuration = updatedRoute.totalDuration;
    await route.save();

    res.json({
      success: true,
      data: updatedRoute,
      message: 'Route distances calculated and saved successfully'
    });
  } catch (error) {
    console.error('Calculate route distances error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to calculate route distances'
    });
  }
};

// Update driver current location
exports.updateDriverLocation = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { latitude, longitude, accuracy, routeId } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    // Check if user is a driver
    const user = await User.findById(driverId);
    if (!user || user.role !== 'ptgDriver') {
      return res.status(403).json({
        success: false,
        message: 'User is not a driver'
      });
    }

    // Update user location
    const updatedUser = await locationService.updateDriverLocation(driverId, {
      latitude,
      longitude,
      accuracy
    }, routeId);

    // If driver has a current route, add location entry to route tracking
    if (updatedUser.currentRouteId) {
      try {
        await routeTracker.addLocationEntry(
          updatedUser.currentRouteId.toString(),
          latitude,
          longitude,
          accuracy
        );
      } catch (trackingError) {
        console.error('Error adding location to route tracking:', trackingError);
        // Don't fail the request if tracking fails
      }
    }

    res.json({
      success: true,
      data: updatedUser,
      message: 'Driver location updated successfully'
    });
  } catch (error) {
    console.error('Update driver location error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update driver location'
    });
  }
};

// Get driver current location and route info
exports.getDriverLocation = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await locationService.getDriverLocation(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    res.json({
      success: true,
      data: driver
    });
  } catch (error) {
    console.error('Get driver location error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get driver location'
    });
  }
};

// Get all drivers' current locations (for dispatcher/admin)
exports.getAllDriversLocations = async (req, res) => {
  try {
    const drivers = await User.find({ role: 'ptgDriver' })
      .populate('currentRouteId', 'routeNumber status')
      .select('firstName lastName currentLocation currentRouteId');

    res.json({
      success: true,
      data: drivers
    });
  } catch (error) {
    console.error('Get all drivers locations error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get drivers locations'
    });
  }
};

// Get route tracking data
exports.getRouteTracking = async (req, res) => {
  try {
    const { routeId } = req.params;

    const tracking = await RouteTracking.findOne({ routeId }).populate('driverId', 'firstName lastName').populate('truckId', 'truckNumber');

    if (!tracking) {
      return res.status(404).json({
        success: false,
        message: 'Route tracking data not found'
      });
    }

    res.json({
      success: true,
      data: tracking
    });
  } catch (error) {
    console.error('Get route tracking error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get route tracking data'
    });
  }
};

// Update route tracking location (for automatic polling every 45 seconds)
exports.updateRouteTracking = async (req, res) => {
  try {
    const { routeId } = req.params;
    const { latitude, longitude, accuracy, driverId } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    // Find the route to get driver and truck info
    const route = await Route.findById(routeId);

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Check if route has a driver assigned
    if (!route.driverId) {
      return res.status(400).json({
        success: false,
        message: 'Route has no driver assigned'
      });
    }

    // Update user location first
    const updatedUser = await locationService.updateDriverLocation(driverId || route.driverId, {
      latitude,
      longitude,
      accuracy
    });

    // Add location entry to route tracking
    try {
      const result = await routeTracker.addLocationEntry(
        routeId,
        latitude,
        longitude,
        accuracy
      );

    } catch (trackingError) {
      console.error('Error adding location to route tracking:', trackingError);
      // Don't fail the request if tracking fails
    }

    res.json({
      success: true,
      data: updatedUser,
      message: 'Route tracking updated successfully'
    });
  } catch (error) {
    console.error('Update route tracking error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update route tracking'
    });
  }
};

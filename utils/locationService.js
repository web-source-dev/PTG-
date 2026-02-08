const axios = require('axios');
const Route = require('../models/Route');
const User = require('../models/User');
const TransportJob = require('../models/TransportJob');

// Google Maps API configuration
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Global Location Service for VOS-PTG
 * Handles geocoding, directions, and location tracking
 */
class LocationService {
  constructor() {
    this.apiKey = GOOGLE_MAPS_API_KEY;
    this.baseUrl = 'https://maps.googleapis.com/maps/api';
  }

  /**
   * Geocode an address to get latitude and longitude
   * @param {string} address - Full address string
   * @returns {Promise<{latitude: number, longitude: number}>}
   */
  async geocodeAddress(address) {
    try {
      if (!this.apiKey) {
        throw new Error('Google Maps API key not configured');
      }

      const response = await axios.get(`${this.baseUrl}/geocode/json`, {
        params: {
          address: address,
          key: this.apiKey
        }
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Geocoding failed: ${response.data.status}`);
      }

      if (!response.data.results || response.data.results.length === 0) {
        throw new Error('No geocoding results found');
      }

      const location = response.data.results[0].geometry.location;
      const coordinates = {
        latitude: location.lat,
        longitude: location.lng
      };

      return coordinates;
    } catch (error) {
      throw new Error('Failed to geocode address');
    }
  }

  /**
   * Calculate distance and duration between two points
   * @param {Object} origin - {latitude, longitude}
   * @param {Object} destination - {latitude, longitude}
   * @param {string} mode - 'driving', 'walking', 'bicycling', 'transit'
   * @returns {Promise<{distance: {text: string, value: number}, duration: {text: string, value: number}}>}
   */
  async calculateDistance(origin, destination, mode = 'driving') {
    try {
      if (!this.apiKey) {
        throw new Error('Google Maps API key not configured');
      }

      const response = await axios.get(`${this.baseUrl}/directions/json`, {
        params: {
          origin: `${origin.latitude},${origin.longitude}`,
          destination: `${destination.latitude},${destination.longitude}`,
          mode: mode,
          units: 'imperial', // Use imperial units (miles) instead of metric (kilometers)
          key: this.apiKey
        }
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Directions API failed: ${response.data.status}`);
      }

      const route = response.data.routes[0];
      const leg = route.legs[0];

      return {
        distance: {
          text: leg.distance.text,
          value: leg.distance.value / 1609.34 // Convert meters to miles
        },
        duration: {
          text: leg.duration.text,
          value: leg.duration.value // seconds
        },
        polyline: route.overview_polyline.points
      };
    } catch (error) {
      throw new Error('Failed to calculate distance and duration');
    }
  }

  /**
   * Calculate distances and times for all stops in a route
   * @param {Object} route - Route object with stops
   * @returns {Promise<Object>} Updated route with calculated distances
   */
  async calculateRouteDistances(route) {
    try {
      const updatedStops = [];
      let totalDistance = 0;
      let totalDuration = 0;

      // Sort stops by sequence
      const sortedStops = [...route.stops].sort((a, b) => a.sequence - b.sequence);

      for (let i = 0; i < sortedStops.length; i++) {
        const stop = sortedStops[i];
        let distanceFromPrevious = null;
        let durationFromPrevious = null;

        // Get coordinates for current stop
        let currentCoordinates = stop.location?.coordinates;
        // Check if coordinates are valid (not empty object and have lat/lng)
        const hasValidCoordinates = currentCoordinates &&
          typeof currentCoordinates === 'object' &&
          currentCoordinates.latitude !== undefined &&
          currentCoordinates.longitude !== undefined &&
          !isNaN(currentCoordinates.latitude) &&
          !isNaN(currentCoordinates.longitude);

        if (!hasValidCoordinates) {
          currentCoordinates = null;
        }

        // For any stop without valid coordinates, determine address to geocode
        if (!currentCoordinates) {
          let addressToGeocode = null;

          try {
            // Get address based on stop type
            if (stop.stopType === 'pickup' || stop.stopType === 'drop') {
              // Transport stops: get address from associated vehicle
              if (stop.transportJobId) {
                const transportJob = await TransportJob.findById(stop.transportJobId).populate('vehicleId');

                if (transportJob?.vehicleId) {
                  const vehicle = transportJob.vehicleId;
                  const isPickup = stop.stopType === 'pickup';

                  if ((isPickup ? vehicle.pickupCity : vehicle.dropCity) &&
                      (isPickup ? vehicle.pickupState : vehicle.dropState)) {
                    const locationName = isPickup ? vehicle.pickupLocationName : vehicle.dropLocationName;
                    const city = isPickup ? vehicle.pickupCity : vehicle.dropCity;
                    const state = isPickup ? vehicle.pickupState : vehicle.dropState;
                    const zip = isPickup ? vehicle.pickupZip : vehicle.dropZip;

                    addressToGeocode = `${locationName ? locationName + ', ' : ''}${city}, ${state}${zip ? ' ' + zip : ''}`;
                  }
                }
              }
            } else if (stop.stopType === 'rest' || stop.stopType === 'break') {
              // Rest/break stops: use stop's own location data
              if (stop.location?.city && stop.location?.state) {
                const { name, city, state, zip } = stop.location;
                addressToGeocode = `${name ? name + ', ' : ''}${city}, ${state}${zip ? ' ' + zip : ''}`;
              }
            }

            // Geocode the determined address
            if (addressToGeocode) {
              currentCoordinates = await this.geocodeAddress(addressToGeocode);
            }
          } catch (error) {
            // Geocoding failed, continue without coordinates
          }
        }

        // Calculate distance from previous location
        if (i === 0) {
          // First stop: no previous location, so distance is 0
          distanceFromPrevious = {
            text: '0 mi',
            value: 0
          };
          durationFromPrevious = {
            text: '0 min',
            value: 0
          };
        } else {
          // Subsequent stops: calculate from previous stop
          const prevStop = sortedStops[i - 1];
          let prevCoordinates = prevStop.location?.coordinates;

          // Check if previous coordinates are valid
          const hasValidPrevCoords = prevCoordinates &&
            typeof prevCoordinates === 'object' &&
            prevCoordinates.latitude !== undefined &&
            prevCoordinates.longitude !== undefined &&
            !isNaN(prevCoordinates.latitude) &&
            !isNaN(prevCoordinates.longitude);

          if (!hasValidPrevCoords) {
            prevCoordinates = null;
          }

          // For previous stop without coordinates, determine address to geocode
          if (!prevCoordinates) {
            let addressToGeocode = null;

            try {
              // Get address based on previous stop type
              if (prevStop.stopType === 'pickup' || prevStop.stopType === 'drop') {
                // Transport stops: get address from associated vehicle
                if (prevStop.transportJobId) {
                  const transportJob = await TransportJob.findById(prevStop.transportJobId).populate('vehicleId');

                  if (transportJob?.vehicleId) {
                    const vehicle = transportJob.vehicleId;
                    const isPickup = prevStop.stopType === 'pickup';

                    if ((isPickup ? vehicle.pickupCity : vehicle.dropCity) &&
                        (isPickup ? vehicle.pickupState : vehicle.dropState)) {
                      const locationName = isPickup ? vehicle.pickupLocationName : vehicle.dropLocationName;
                      const city = isPickup ? vehicle.pickupCity : vehicle.dropCity;
                      const state = isPickup ? vehicle.pickupState : vehicle.dropState;
                      const zip = isPickup ? vehicle.pickupZip : vehicle.dropZip;

                      addressToGeocode = `${locationName ? locationName + ', ' : ''}${city}, ${state}${zip ? ' ' + zip : ''}`;
                    }
                  }
                }
              } else if (prevStop.stopType === 'rest' || prevStop.stopType === 'break') {
                // Rest/break stops: use stop's own location data
                if (prevStop.location?.city && prevStop.location?.state) {
                  const { name, city, state, zip } = prevStop.location;
                  addressToGeocode = `${name ? name + ', ' : ''}${city}, ${state}${zip ? ' ' + zip : ''}`;
                }
              }

              // Geocode the determined address
              if (addressToGeocode) {
                prevCoordinates = await this.geocodeAddress(addressToGeocode);
              }
            } catch (error) {
              // Geocoding failed, continue without coordinates
            }
          }

          if (prevCoordinates && currentCoordinates) {
            try {
              const result = await this.calculateDistance(
                prevCoordinates,
                currentCoordinates
              );
              distanceFromPrevious = result.distance;
              durationFromPrevious = result.duration;
            } catch (distanceError) {
              // Set default values if distance calculation fails
              distanceFromPrevious = {
                text: 'Unknown',
                value: 0
              };
              durationFromPrevious = {
                text: 'Unknown',
                value: 0
              };
            }
          } else {
            // Set default values when coordinates are missing
            distanceFromPrevious = {
              text: 'Unknown',
              value: 0
            };
            durationFromPrevious = {
              text: 'Unknown',
              value: 0
            };
          }
        }

        // Create updated stop object with calculated data and coordinates
        const stopUpdate = {
          distanceFromPrevious,
          durationFromPrevious
        };

        // Update coordinates if we geocoded them or if they were missing
        if (currentCoordinates) {
          stopUpdate.location = {
            ...stop.location,
            coordinates: currentCoordinates
          };
        }

        // Create clean updated stop object
        const updatedStopData = {
          ...stop.toObject(),
          ...stopUpdate
        };

        // Clean up the location object to ensure no undefined coordinates
        if (updatedStopData.location) {
          // Remove coordinates if they're undefined, null, or invalid
          if (updatedStopData.location.coordinates === undefined ||
              updatedStopData.location.coordinates === null ||
              (typeof updatedStopData.location.coordinates === 'object' &&
               Object.keys(updatedStopData.location.coordinates).length === 0) ||
              (typeof updatedStopData.location.coordinates === 'object' &&
               (updatedStopData.location.coordinates.latitude === undefined ||
                updatedStopData.location.coordinates.longitude === undefined ||
                isNaN(updatedStopData.location.coordinates.latitude) ||
                isNaN(updatedStopData.location.coordinates.longitude)))) {
            delete updatedStopData.location.coordinates;
          }
        }

        const updatedStop = updatedStopData;

        // Add to totals (distance is already in miles from calculateDistance)
        if (distanceFromPrevious) {
          totalDistance += distanceFromPrevious.value; // Already in miles
          totalDuration += durationFromPrevious.value;
        }

        updatedStops.push(updatedStop);
      }

      const result = {
        ...route.toObject(),
        stops: updatedStops,
        totalDistance: {
          text: this.formatDistance(totalDistance), // totalDistance is already in miles
          value: totalDistance // Store in miles
        },
        totalDuration: {
          text: this.formatDuration(totalDuration),
          value: totalDuration
        }
      };

      return result;
    } catch (error) {
      throw new Error('Failed to calculate route distances');
    }
  }

  /**
   * Update stop coordinates using geocoding
   * @param {Object} stop - Stop object with location
   * @returns {Promise<Object>} Updated stop with coordinates
   */
  async updateStopCoordinates(stop) {
    try {
      const address = this.buildAddress(stop.location);
      const coordinates = await this.geocodeAddress(address);

      return {
        ...stop,
        location: {
          ...stop.location,
          coordinates: coordinates
        }
      };
    } catch (error) {
      throw new Error('Failed to update stop coordinates');
    }
  }

  /**
   * Update driver current location
   * @param {string} driverId - Driver user ID
   * @param {Object} location - {latitude, longitude}
   * @param {string} routeId - Current route ID (optional)
   * @returns {Promise<Object>} Updated user
   */
  async updateDriverLocation(driverId, location, routeId = null) {
    try {
      const updateData = {
        currentLocation: {
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: new Date(),
          ...(location.accuracy && { accuracy: location.accuracy })
        }
      };

      // If routeId provided, update current route
      if (routeId) {
        updateData.currentRouteId = routeId;
      }

      const user = await User.findByIdAndUpdate(
        driverId,
        { $set: updateData },
        { new: true }
      ).populate('currentRouteId');

      return user;
    } catch (error) {
      throw new Error('Failed to update driver location');
    }
  }

  /**
   * Get driver current location and route info
   * @param {string} driverId - Driver user ID
   * @returns {Promise<Object>} Driver location and route data
   */
  async getDriverLocation(driverId) {
    try {
      const user = await User.findById(driverId)
        .populate('currentRouteId')
        .select('currentLocation currentRouteId firstName lastName');

      return user;
    } catch (error) {
      throw new Error('Failed to get driver location');
    }
  }

  /**
   * Build address string from location object
   * @param {Object} location - Location object
   * @returns {string} Formatted address
   */
  /**
   * Populate formattedAddress field in a location object if not already present
   * @param {Object} location - Location object to populate
   * @returns {Object} Location object with formattedAddress populated
   */
  populateFormattedAddress(location) {
    if (!location) return location;
    
    // Normalize zipCode to zip if zipCode exists but zip doesn't
    if (location.zipCode && !location.zip) {
      location.zip = location.zipCode;
    }
    
    // Extract zip from address if zip is not provided but address contains a zip pattern
    if (!location.zip && location.address) {
      // Match US zip code pattern (5 digits or 5+4 format) at the end of address
      const zipMatch = location.address.match(/\b(\d{5}(?:-\d{4})?)\b/);
      if (zipMatch) {
        location.zip = zipMatch[1];
      }
    }
    
    // If formattedAddress already exists, keep it
    if (location.formattedAddress) return location;
    
    // Generate formattedAddress using buildAddress
    const formatted = this.buildAddress(location);
    if (formatted) {
      location.formattedAddress = formatted;
    }
    
    return location;
  }

  /**
   * Build formatted address string from location object
   * Format: "Name, City, State ZIP" or "Address, City, State ZIP" or "City, State ZIP"
   * Prioritizes name (business/location name) over address (street address)
   * @param {Object} location - Location object with address, name, city, state, zip fields
   * @returns {string} Formatted address
   */
  buildAddress(location) {
    if (!location) return '';
    
    const address = (location.address || '').trim();
    const name = (location.name || '').trim();
    const city = (location.city || '').trim();
    const state = (location.state || '').trim();
    const zip = (location.zip || location.zipCode || '').trim();
    
    // Normalize for comparison (lowercase, remove extra spaces, punctuation)
    const normalize = (str) => str.toLowerCase().replace(/[,\s]+/g, ' ').trim();
    const addressNorm = normalize(address);
    const nameNorm = normalize(name);
    const cityNorm = normalize(city);
    const stateNorm = normalize(state);
    const zipNorm = normalize(zip);
    
    // Check if address already contains city and state
    const addressContainsCity = city && addressNorm && addressNorm.includes(cityNorm);
    const addressContainsState = state && addressNorm && addressNorm.includes(stateNorm);
    const addressContainsZip = zip && addressNorm && addressNorm.includes(zipNorm);
    
    // Check if name already contains city and state
    const nameContainsCity = city && nameNorm && nameNorm.includes(cityNorm);
    const nameContainsState = state && nameNorm && nameNorm.includes(stateNorm);
    const nameContainsZip = zip && nameNorm && nameNorm.includes(zipNorm);
    
    // Check if address is a full formatted address (contains city AND state)
    const addressIsFull = address && addressContainsCity && addressContainsState;
    // Check if name is a full formatted address (contains city AND state)
    const nameIsFull = name && nameContainsCity && nameContainsState;
    
    // If address is already a full formatted address, clean it up and return
    if (addressIsFull) {
      let cleaned = address.replace(/,\s*USA\s*,?\s*$/i, '').trim();
      // Remove trailing duplicate city/state/zip if present
      if (city && state) {
        const duplicatePattern = new RegExp(`,\\s*${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,\\s*${state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*${zip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})?\\s*$`, 'i');
        cleaned = cleaned.replace(duplicatePattern, '').trim();
      }
      return cleaned;
    }
    
    // If name is already a full formatted address, return it as-is
    if (nameIsFull && !address) {
      return name;
    }
    
    // Build the result - prioritize name over address for business/location names
    const parts = [];
    
    // Determine if address is a street address (contains street number pattern)
    const isStreetAddress = address && /\d+\s+[A-Za-z]/.test(address);
    
    // Add name first if available (business/location name)
    // Only use address if it's a street address and name is not available
    if (name && !nameIsFull) {
      parts.push(name);
    } else if (address && isStreetAddress && !addressIsFull) {
      parts.push(address);
    }
    
    // Build city, state, zip part
    // Only add if they're not already in the name or address
    const shouldAddCity = city && !nameContainsCity && !addressContainsCity;
    const shouldAddState = state && !nameContainsState && !addressContainsState;
    const shouldAddZip = zip && !nameContainsZip && !addressContainsZip;
    
    if (shouldAddCity || shouldAddState || shouldAddZip) {
      // Format as "City, State ZIP" (ZIP without comma before it)
      const cityState = [shouldAddCity ? city : '', shouldAddState ? state : ''].filter(Boolean).join(', ');
      const cityStateZip = shouldAddZip && cityState ? `${cityState} ${zip}` : (shouldAddZip ? zip : cityState);
      
      if (cityStateZip) {
        parts.push(cityStateZip);
      }
    }
    
    // If we have no parts yet but have city/state/zip, use them
    if (parts.length === 0 && (city || state || zip)) {
      const cityState = [city, state].filter(Boolean).join(', ');
      const cityStateZip = zip && cityState ? `${cityState} ${zip}` : (zip || cityState);
      if (cityStateZip) {
        parts.push(cityStateZip);
      }
    }
    
    const result = parts.join(', ').trim();
    
    // Final cleanup: remove any trailing ", USA" and trim
    return result.replace(/,\s*USA\s*,?\s*$/i, '').trim();
  }

  /**
   * Format distance in meters to readable format
   * @param {number} meters - Distance in meters
   * @returns {string} Formatted distance
   */
  formatDistance(miles) {
    // Input is now in miles (not meters)
    if (miles < 0.1) {
      // For very short distances, show in feet
      const feet = miles * 5280;
      return `${Math.round(feet)} ft`;
    } else if (miles < 1) {
      // For distances less than a mile, show in decimal miles
      return `${miles.toFixed(2)} mi`;
    } else {
      // For distances 1 mile or more, show with 1 decimal place
      return `${miles.toFixed(1)} mi`;
    }
  }

  /**
   * Format duration in seconds to readable format
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   */
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours} hr ${minutes} min`;
    } else {
      return `${minutes} min`;
    }
  }
}

// Export singleton instance
module.exports = new LocationService();

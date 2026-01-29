const locationService = require('./locationService');

/**
 * Calculate distance between pickup and drop locations for a vehicle
 * @param {object} vehicle - Vehicle document
 * @returns {Promise<object|null>} Distance information or null if calculation fails
 */
async function calculateVehicleDistance(vehicle) {
  try {
    // Get transport job data from the vehicle
    let transportJob = null;
    if (vehicle.currentTransportJobId) {
      // If currentTransportJobId is populated (object), use it
      if (typeof vehicle.currentTransportJobId === 'object') {
        transportJob = vehicle.currentTransportJobId;
      }
      // Otherwise, we need to fetch it (but for now, assume it's populated)
    }

    if (!transportJob) {
      return null;
    }

    // Build pickup address from transport job
    const pickupAddress = [
      transportJob.pickupLocationName,
      transportJob.pickupCity,
      transportJob.pickupState,
      transportJob.pickupZip
    ].filter(Boolean).join(', ');

    // Build drop address from transport job
    const dropAddress = [
      transportJob.dropLocationName,
      transportJob.dropCity,
      transportJob.dropState,
      transportJob.dropZip
    ].filter(Boolean).join(', ');

    // Validate that we have enough information
    if (!pickupAddress || !dropAddress ||
        !transportJob.pickupCity || !transportJob.pickupState ||
        !transportJob.dropCity || !transportJob.dropState) {
      return null;
    }

    // Geocode both addresses
    const pickupCoords = await locationService.geocodeAddress(pickupAddress);
    const dropCoords = await locationService.geocodeAddress(dropAddress);

    // Calculate distance
    const distanceInfo = await locationService.calculateDistance(
      pickupCoords,
      dropCoords,
      'driving'
    );

    // distanceInfo.distance.value is already in miles from calculateDistance()
    return {
      distance: {
        text: distanceInfo.distance.text, // Keep text as-is (already formatted by Google Maps)
        value: distanceInfo.distance.value // Already in miles from calculateDistance()
      },
      duration: distanceInfo.duration,
      pickupCoordinates: pickupCoords,
      dropCoordinates: dropCoords
    };
  } catch (error) {
    console.error('Error calculating vehicle distance:', error.message);
    // Return null on error - don't fail the request
    return null;
  }
}

/**
 * Calculate distances for multiple vehicles (batch processing)
 * @param {array} vehicles - Array of vehicle documents
 * @returns {Promise<array>} Array of vehicles with distance information
 */
async function calculateVehiclesDistances(vehicles) {
  const vehiclesWithDistance = await Promise.all(
    vehicles.map(async (vehicle) => {
      try {
        const distanceInfo = await calculateVehicleDistance(vehicle);
        
        // Convert vehicle to plain object if it's a Mongoose document
        const vehicleObj = vehicle.toObject ? vehicle.toObject() : vehicle;
        
        return {
          ...vehicleObj,
          distanceInfo: distanceInfo ? {
            distance: distanceInfo.distance,
            duration: distanceInfo.duration
          } : null
        };
      } catch (error) {
        console.error(`Error calculating distance for vehicle ${vehicle._id}:`, error);
        const vehicleObj = vehicle.toObject ? vehicle.toObject() : vehicle;
        return {
          ...vehicleObj,
          distanceInfo: null
        };
      }
    })
  );

  return vehiclesWithDistance;
}

module.exports = {
  calculateVehicleDistance,
  calculateVehiclesDistances
};


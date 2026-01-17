const locationService = require('./locationService');

/**
 * Calculate distance between pickup and drop locations for a vehicle
 * @param {object} vehicle - Vehicle document
 * @returns {Promise<object|null>} Distance information or null if calculation fails
 */
async function calculateVehicleDistance(vehicle) {
  try {
    // Build pickup address
    const pickupAddress = [
      vehicle.pickupLocationName,
      vehicle.pickupCity,
      vehicle.pickupState,
      vehicle.pickupZip
    ].filter(Boolean).join(', ');

    // Build drop address
    const dropAddress = [
      vehicle.dropLocationName,
      vehicle.dropCity,
      vehicle.dropState,
      vehicle.dropZip
    ].filter(Boolean).join(', ');

    // Validate that we have enough information
    if (!pickupAddress || !dropAddress || 
        !vehicle.pickupCity || !vehicle.pickupState ||
        !vehicle.dropCity || !vehicle.dropState) {
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

    // Convert distance from meters to miles before storing
    const distanceInMiles = distanceInfo.distance.value / 1609.34;
    
    return {
      distance: {
        text: distanceInfo.distance.text, // Keep text as-is (already formatted by Google Maps)
        value: distanceInMiles // Store in miles
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


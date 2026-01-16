/**
 * Central Dispatch Data Formatter
 * 
 * Utilities to convert between our system's data format and Central Dispatch API format
 */

/**
 * Format vehicle data to Central Dispatch Listing Request format
 * @param {object} vehicle - Vehicle document from our system
 * @param {object} transportJob - Transport job document (optional)
 * @param {object} options - Additional options (carrierAmount, notes, etc.)
 * @returns {object} Central Dispatch Listing Request object
 */
function formatVehicleToCentralDispatchListing(vehicle, transportJob = null, options = {}) {
  // Get available date (use pickupDateStart or availableToShipDate)
  // Must not be before today or later than 30 days from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let availableDate = vehicle.pickupDateStart 
    ? new Date(vehicle.pickupDateStart)
    : vehicle.availableToShipDate 
      ? new Date(vehicle.availableToShipDate)
      : new Date();
  
  availableDate.setHours(0, 0, 0, 0);
  
  // Ensure available date is not before today
  if (availableDate < today) {
    availableDate = today;
  }
  
  // Ensure available date is not more than 30 days from today
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 30);
  if (availableDate > maxDate) {
    availableDate = maxDate;
  }
  
  const availableDateISO = availableDate.toISOString();

  // Calculate expiration date (30 days from available date, but not more than 30 days from today)
  const expirationDate = new Date(availableDate);
  expirationDate.setDate(expirationDate.getDate() + 30);
  const maxExpirationDate = new Date(today);
  maxExpirationDate.setDate(maxExpirationDate.getDate() + 30);
  if (expirationDate > maxExpirationDate) {
    expirationDate.setTime(maxExpirationDate.getTime());
  }
  const expirationDateISO = expirationDate.toISOString();

  // Get desired delivery date (use dropDateStart if available)
  // Must be equal or greater than availableDate and not before today or later than 30 days from today
  let desiredDeliveryDate = null;
  if (vehicle.dropDateStart) {
    const dropDate = new Date(vehicle.dropDateStart);
    dropDate.setHours(0, 0, 0, 0);
    
    // Must be >= availableDate
    if (dropDate >= availableDate && dropDate <= maxExpirationDate) {
      desiredDeliveryDate = dropDate.toISOString();
    }
  }

  // Format stops
  // Use locationName as address if available, otherwise use a constructed address
  // Address is required when digitalOffersEnabled is true
  const pickupAddress = vehicle.pickupLocationName || 
                       (vehicle.pickupCity && vehicle.pickupState ? `${vehicle.pickupCity}, ${vehicle.pickupState}` : null);
  
  const dropAddress = vehicle.dropLocationName || 
                      (vehicle.dropCity && vehicle.dropState ? `${vehicle.dropCity}, ${vehicle.dropState}` : null);

  const stops = [
    {
      stopNumber: 1,
      locationName: vehicle.pickupLocationName || 'Pickup Location',
      address: pickupAddress, // Use locationName or constructed address
      city: vehicle.pickupCity || '',
      state: vehicle.pickupState || '',
      postalCode: vehicle.pickupZip || '',
      country: 'US',
      phone: vehicle.pickupContactPhone || '',
      contactName: vehicle.pickupContactName || '',
      contactPhone: vehicle.pickupContactPhone || '',
      locationType: 'Dealership' // Default, can be customized
    },
    {
      stopNumber: 2,
      locationName: vehicle.dropLocationName || 'Delivery Location',
      address: dropAddress, // Use locationName or constructed address
      city: vehicle.dropCity || '',
      state: vehicle.dropState || '',
      postalCode: vehicle.dropZip || '',
      country: 'US',
      phone: vehicle.dropContactPhone || '',
      contactName: vehicle.dropContactName || '',
      contactPhone: vehicle.dropContactPhone || '',
      locationType: vehicle.dropDestinationType === 'PF' ? 'Premium Finish' : 
                    vehicle.dropDestinationType === 'Auction' ? 'Auction' : 'Other'
    }
  ];
  
  // Check if we have valid addresses for both stops
  // If not, disable digital offers (address is required when digitalOffersEnabled is true)
  const hasValidAddresses = pickupAddress && dropAddress && 
                            vehicle.pickupCity && vehicle.pickupState && 
                            vehicle.dropCity && vehicle.dropState;

  // Format vehicle data
  const vehicles = [
    {
      pickupStopNumber: 1,
      dropoffStopNumber: 2,
      externalVehicleId: vehicle._id?.toString() || vehicle.id || '',
      vin: vehicle.vin || '',
      year: vehicle.year || null,
      make: vehicle.make || '',
      model: vehicle.model || '',
      trim: '', // We don't store trim
      vehicleType: 'CAR', // Default to CAR, can be enhanced
      color: '', // We don't store color
      licensePlate: '', // We don't store license plate
      lotNumber: '', // We don't store lot number
      isInoperable: false, // Default, can be enhanced
      tariff: options.carrierAmount || 0,
      additionalInfo: options.notes || vehicle.notes || '',
      shippingSpecs: {
        height: 58, // Default values, can be enhanced
        width: 62,
        length: 143,
        weight: 2246
      }
    }
  ];

  // Format price
  const price = {
    total: options.carrierAmount || 0,
    cod: null, // Can be added if needed
    balance: null // Can be added if needed
  };

  // Build listing request
  const listingRequest = {
    shipperOrderId: transportJob?.jobNumber || null,
    externalId: transportJob?._id?.toString() || transportJob?.id || null,
    trailerType: 'OPEN', // Default, can be customized
    hasInOpVehicle: false, // Default
    loadSpecificTerms: options.notes || vehicle.notes || null,
    availableDate: availableDateISO,
    expirationDate: expirationDateISO,
    desiredDeliveryDate: desiredDeliveryDate,
    partnerReferenceId: transportJob?._id?.toString() || transportJob?.id || null,
    price: price,
    stops: stops,
    vehicles: vehicles,
    marketplaces: [
      {
        marketplaceId: options.marketplaceId || null, // Marketplace ID from config
        digitalOffersEnabled: hasValidAddresses, // Only enable if we have valid addresses
        searchable: true,
        offersAutoAcceptEnabled: false,
        autoDispatchOnOfferAccepted: false,
        predispatchNotes: options.notes || vehicle.notes || null,
        customersExcludedFromOffers: []
      }
    ],
    tags: null,
    transportationReleaseNotes: options.notes || vehicle.notes || null
  };

  return listingRequest;
}

/**
 * Format Central Dispatch Listing Response to our system format
 * @param {object} listing - Central Dispatch listing response
 * @returns {object} Formatted listing data for our system
 */
function formatCentralDispatchListingToSystem(listing) {
  if (!listing) return null;

  // Extract vehicle data (assuming first vehicle in the array)
  const vehicle = listing.vehicles && listing.vehicles.length > 0 ? listing.vehicles[0] : null;
  
  // Extract stops
  const stops = listing.stops || [];
  const pickupStop = stops.find(s => s.stopNumber === 1);
  const dropStop = stops.find(s => s.stopNumber === 2);

  // Format to our system's structure
  return {
    centralDispatchListingId: listing.id || listing.listingId || null,
    centralDispatchLoadId: listing.id || listing.listingId || null,
    status: listing.status || 'Active',
    availableDate: listing.availableDate || null,
    expirationDate: listing.expirationDate || null,
    desiredDeliveryDate: listing.desiredDeliveryDate || null,
    price: listing.price || null,
    vehicle: vehicle ? {
      externalVehicleId: vehicle.externalVehicleId || null,
      vin: vehicle.vin || null,
      year: vehicle.year || null,
      make: vehicle.make || null,
      model: vehicle.model || null,
      isInoperable: vehicle.isInoperable || false,
      tariff: vehicle.tariff || 0
    } : null,
    pickupLocation: pickupStop ? {
      locationName: pickupStop.locationName || null,
      city: pickupStop.city || null,
      state: pickupStop.state || null,
      postalCode: pickupStop.postalCode || null,
      contactName: pickupStop.contactName || null,
      contactPhone: pickupStop.contactPhone || null
    } : null,
    dropLocation: dropStop ? {
      locationName: dropStop.locationName || null,
      city: dropStop.city || null,
      state: dropStop.state || null,
      postalCode: dropStop.postalCode || null,
      contactName: dropStop.contactName || null,
      contactPhone: dropStop.contactPhone || null
    } : null,
    marketplaces: listing.marketplaces || [],
    loadSpecificTerms: listing.loadSpecificTerms || null,
    transportationReleaseNotes: listing.transportationReleaseNotes || null,
    createdAt: listing.createdAt || null,
    updatedAt: listing.updatedAt || null
  };
}

module.exports = {
  formatVehicleToCentralDispatchListing,
  formatCentralDispatchListingToSystem
};


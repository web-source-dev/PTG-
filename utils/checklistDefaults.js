/**
 * Default Checklist Items for Route Stops
 * 
 * Provides default checklist items based on stop type
 */

const { ROUTE_STOP_TYPE } = require('../constants/status');
const TransportJob = require('../models/TransportJob');

/**
 * Get default checklist items for a stop type
 * @param {string} stopType - The type of stop (pickup, drop, break, rest, fuel)
 * @param {boolean} isLoad - Whether this stop is for a load (non-vehicle cargo)
 * @returns {Array} Array of checklist items
 */
const getDefaultChecklist = (stopType, isLoad = false) => {
  switch (stopType) {
    case ROUTE_STOP_TYPE.START:
      return [
        { item: 'Verify truck is ready for departure', checked: false },
        { item: 'Check all cargo loads are secure', checked: false },
        { item: 'Confirm route and stops are loaded on device', checked: false },
        { item: 'Take initial truck condition photos', checked: false },
        { item: 'Verify emergency kit and tools are present', checked: false },
        { item: 'Check fuel levels and tire pressure', checked: false },
        { item: 'Confirm all required documentation is present', checked: false }
      ];
    case ROUTE_STOP_TYPE.PICKUP:
      if (isLoad) {
        // Load-specific pickup checklist
        return [
          { item: 'Verify load description matches paperwork', checked: false },
          { item: 'Inspect load for existing damage', checked: false },
          { item: 'Check load weight and dimensions', checked: false },
          { item: 'Take load condition photos', checked: false },
          { item: 'Verify load quantity and packaging', checked: false },
          { item: 'Collect all required paperwork', checked: false },
          { item: 'Verify pickup location matches order', checked: false },
          { item: 'Confirm contact person and obtain signature', checked: false },
          { item: 'Secure load on truck properly', checked: false },
          { item: 'Complete Bill of Lading', checked: false }
        ];
      }
      // Vehicle pickup checklist
      return [
        { item: 'Verify vehicle VIN matches paperwork', checked: false },
        { item: 'Inspect vehicle for existing damage', checked: false },
        { item: 'Take vehicle condition photos', checked: false },
        { item: 'Record odometer reading', checked: false },
        { item: 'Collect all required paperwork', checked: false },
        { item: 'Verify pickup location matches order', checked: false },
        { item: 'Confirm contact person and obtain signature', checked: false },
        { item: 'Secure vehicle on truck properly', checked: false },
        { item: 'Complete Bill of Lading', checked: false }
      ];

    case ROUTE_STOP_TYPE.DROP:
      if (isLoad) {
        // Load-specific drop checklist
        return [
          { item: 'Verify delivery location matches order', checked: false },
          { item: 'Inspect load for damage during transport', checked: false },
          { item: 'Check load weight and dimensions', checked: false },
          { item: 'Take delivery condition photos', checked: false },
          { item: 'Verify load quantity and packaging', checked: false },
          { item: 'Obtain delivery confirmation signature', checked: false },
          { item: 'Complete delivery paperwork', checked: false },
          { item: 'Unload load safely', checked: false },
          { item: 'Verify contact person identity', checked: false },
          { item: 'Confirm all paperwork is complete', checked: false }
        ];
      }
      // Vehicle drop checklist
      return [
        { item: 'Verify delivery location matches order', checked: false },
        { item: 'Inspect vehicle for damage during transport', checked: false },
        { item: 'Take delivery condition photos', checked: false },
        { item: 'Record odometer reading', checked: false },
        { item: 'Obtain delivery confirmation signature', checked: false },
        { item: 'Complete delivery paperwork', checked: false },
        { item: 'Unload vehicle safely', checked: false },
        { item: 'Verify contact person identity', checked: false },
        { item: 'Confirm all paperwork is complete', checked: false }
      ];

    case ROUTE_STOP_TYPE.BREAK:
      return [
        { item: 'Park truck in safe location', checked: false },
        { item: 'Set parking brake', checked: false },
        { item: 'Secure cargo load', checked: false },
        { item: 'Verify truck and trailer are secure', checked: false }
      ];

    case ROUTE_STOP_TYPE.REST:
      return [
        { item: 'Park truck in designated rest area', checked: false },
        { item: 'Set parking brake', checked: false },
        { item: 'Secure cargo load', checked: false },
        { item: 'Lock truck and trailer', checked: false },
        { item: 'Verify truck and trailer are secure', checked: false }
      ];

    case ROUTE_STOP_TYPE.FUEL:
      return [
        { item: 'Park truck at fuel station safely', checked: false },
        { item: 'Set parking brake', checked: false },
        { item: 'Secure cargo load', checked: false },
        { item: 'Fuel truck to required level', checked: false },
        { item: 'Check fuel levels and quality', checked: false },
        { item: 'Record fuel purchase details', checked: false },
        { item: 'Verify truck and trailer are secure', checked: false }
      ];

    case ROUTE_STOP_TYPE.END:
      return [
        { item: 'Park truck at final destination safely', checked: false },
        { item: 'Set parking brake', checked: false },
        { item: 'Secure all loads and equipment', checked: false },
        { item: 'Complete final documentation', checked: false },
        { item: 'Take final truck condition photos', checked: false },
        { item: 'Report any issues or incidents', checked: false },
        { item: 'Verify all stops completed successfully', checked: false }
      ];

    default:
      return [];
  }
};

/**
 * Initialize checklist for a stop if it doesn't exist
 * @param {Object} stop - The stop object
 * @param {Object} transportJob - Optional transport job to determine if it's a load
 * @returns {Object} Stop with initialized checklist
 */
const initializeStopChecklist = (stop, transportJob = null) => {
  if (!stop.checklist || stop.checklist.length === 0) {
    // Check if this is a load transport job
    const isLoad = transportJob && (
      (transportJob.loadId && !transportJob.vehicleId) ||
      transportJob.loadType === 'load'
    );
    stop.checklist = getDefaultChecklist(stop.stopType, isLoad);
  }
  return stop;
};

/**
 * Initialize checklists for all stops in a route
 * @param {Object} route - The route object
 * @returns {Promise<Object>} Route with initialized checklists
 */
const initializeRouteChecklists = async (route) => {
  if (route.stops && Array.isArray(route.stops)) {
    // Fetch transport jobs for all stops that have transportJobId
    const transportJobIds = route.stops
      .filter(stop => stop.transportJobId)
      .map(stop => {
        if (typeof stop.transportJobId === 'object' && stop.transportJobId !== null) {
          return stop.transportJobId._id || stop.transportJobId.id;
        }
        return stop.transportJobId;
      })
      .filter(Boolean);
    
    const transportJobs = transportJobIds.length > 0
      ? await TransportJob.find({ _id: { $in: transportJobIds } })
      : [];
    
    const transportJobMap = new Map(
      transportJobs.map(job => [job._id.toString(), job])
    );
    
    route.stops = route.stops.map(stop => {
      let transportJob = null;
      if (stop.transportJobId) {
        const jobId = typeof stop.transportJobId === 'object' && stop.transportJobId !== null
          ? (stop.transportJobId._id || stop.transportJobId.id)
          : stop.transportJobId;
        if (jobId) {
          transportJob = transportJobMap.get(jobId.toString());
        }
      }
      return initializeStopChecklist(stop, transportJob);
    });
  }
  return route;
};

module.exports = {
  getDefaultChecklist,
  initializeStopChecklist,
  initializeRouteChecklists
};


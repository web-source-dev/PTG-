/**
 * Default Checklist Items for Route Stops
 * 
 * Provides default checklist items based on stop type
 */

const { ROUTE_STOP_TYPE } = require('../constants/status');

/**
 * Get default checklist items for a stop type
 * @param {string} stopType - The type of stop (pickup, drop, break, rest)
 * @returns {Array} Array of checklist items
 */
const getDefaultChecklist = (stopType) => {
  switch (stopType) {
    case ROUTE_STOP_TYPE.PICKUP:
      return [
        { item: 'Verify vehicle VIN matches paperwork', checked: false },
        { item: 'Inspect vehicle for existing damage', checked: false },
        { item: 'Take vehicle condition photos', checked: false },
        { item: 'Collect all required paperwork', checked: false },
        { item: 'Verify pickup location matches order', checked: false },
        { item: 'Confirm contact person and obtain signature', checked: false },
        { item: 'Secure vehicle on truck properly', checked: false },
        { item: 'Complete Bill of Lading', checked: false }
      ];

    case ROUTE_STOP_TYPE.DROP:
      return [
        { item: 'Verify delivery location matches order', checked: false },
        { item: 'Inspect vehicle for damage during transport', checked: false },
        { item: 'Take delivery condition photos', checked: false },
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
        { item: 'Secure vehicle load', checked: false },
        { item: 'Verify truck and trailer are secure', checked: false }
      ];

    case ROUTE_STOP_TYPE.REST:
      return [
        { item: 'Park truck in designated rest area', checked: false },
        { item: 'Set parking brake', checked: false },
        { item: 'Secure vehicle load', checked: false },
        { item: 'Lock truck and trailer', checked: false },
        { item: 'Verify truck and trailer are secure', checked: false }
      ];

    default:
      return [];
  }
};

/**
 * Initialize checklist for a stop if it doesn't exist
 * @param {Object} stop - The stop object
 * @returns {Object} Stop with initialized checklist
 */
const initializeStopChecklist = (stop) => {
  if (!stop.checklist || stop.checklist.length === 0) {
    stop.checklist = getDefaultChecklist(stop.stopType);
  }
  return stop;
};

/**
 * Initialize checklists for all stops in a route
 * @param {Object} route - The route object
 * @returns {Object} Route with initialized checklists
 */
const initializeRouteChecklists = (route) => {
  if (route.stops && Array.isArray(route.stops)) {
    route.stops = route.stops.map(stop => initializeStopChecklist(stop));
  }
  return route;
};

module.exports = {
  getDefaultChecklist,
  initializeStopChecklist,
  initializeRouteChecklists
};


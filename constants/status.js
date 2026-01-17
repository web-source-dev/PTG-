/**
 * Status Enums for VOS-PTG System
 * 
 * This file contains all status enums used across the application.
 * Use these constants to ensure consistency across the codebase.
 */

// Route Status
const ROUTE_STATUS = {
  PLANNED: 'Planned',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

// Route Stop Status
const ROUTE_STOP_STATUS = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  SKIPPED: 'Skipped'
};

// Route Operational State (within In Progress status)
const ROUTE_STATE = {
  STARTED: 'Started',
  STOPPED: 'Stopped',
  RESUMED: 'Resumed',
  COMPLETED: 'Completed'
};

// Transport Job Status
const TRANSPORT_JOB_STATUS = {
  NEEDS_DISPATCH: 'Needs Dispatch',
  PUBLISHED_TO_CENTRAL_DISPATCH: 'Published to Central Dispatch',
  DISPATCHED: 'Dispatched',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  EXCEPTION: 'Exception'
};

// Truck Status
const TRUCK_STATUS = {
  AVAILABLE: 'Available',
  IN_USE: 'In Use',
  MAINTENANCE: 'Maintenance',
  OUT_OF_SERVICE: 'Out of Service'
};

// Vehicle Status
const VEHICLE_STATUS = {
  PURCHASED_INTAKE_NEEDED: 'Purchased – Intake Needed',
  INTAKE_COMPLETE: 'Intake Completed',
  READY_FOR_TRANSPORT: 'Ready for Transport',
  PUBLISHED_TO_CENTRAL_DISPATCH: 'Published to Central Dispatch',
  IN_TRANSPORT: 'In Transport',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled'
};

// Route Stop Type
const ROUTE_STOP_TYPE = {
  START: 'start',
  PICKUP: 'pickup',
  DROP: 'drop',
  BREAK: 'break',
  REST: 'rest',
  FUEL: 'fuel',
  END: 'end'
};

// Carrier Types
const CARRIER = {
  PTG: 'PTG',
  CENTRAL_DISPATCH: 'Central Dispatch'
};

// Get all status enums for API response
const getAllStatusEnums = () => {
  return {
    route: {
      values: Object.values(ROUTE_STATUS),
      labels: {
        [ROUTE_STATUS.PLANNED]: 'Planned',
        [ROUTE_STATUS.IN_PROGRESS]: 'In Progress',
        [ROUTE_STATUS.COMPLETED]: 'Completed',
        [ROUTE_STATUS.CANCELLED]: 'Cancelled'
      }
    },
  routeStop: {
    values: Object.values(ROUTE_STOP_STATUS),
    labels: {
      [ROUTE_STOP_STATUS.PENDING]: 'Pending',
      [ROUTE_STOP_STATUS.IN_PROGRESS]: 'In Progress',
      [ROUTE_STOP_STATUS.COMPLETED]: 'Completed',
      [ROUTE_STOP_STATUS.SKIPPED]: 'Skipped'
    }
  },
  routeStopType: {
    values: Object.values(ROUTE_STOP_TYPE),
    labels: {
      [ROUTE_STOP_TYPE.START]: 'Start',
      [ROUTE_STOP_TYPE.PICKUP]: 'Pickup',
      [ROUTE_STOP_TYPE.DROP]: 'Drop',
      [ROUTE_STOP_TYPE.BREAK]: 'Break',
      [ROUTE_STOP_TYPE.REST]: 'Rest',
      [ROUTE_STOP_TYPE.FUEL]: 'Fuel',
      [ROUTE_STOP_TYPE.END]: 'End'
    }
  },
    transportJob: {
      values: Object.values(TRANSPORT_JOB_STATUS),
      labels: {
        [TRANSPORT_JOB_STATUS.NEEDS_DISPATCH]: 'Needs Dispatch',
        [TRANSPORT_JOB_STATUS.PUBLISHED_TO_CENTRAL_DISPATCH]: 'Published to Central Dispatch',
        [TRANSPORT_JOB_STATUS.DISPATCHED]: 'Dispatched',
        [TRANSPORT_JOB_STATUS.IN_TRANSIT]: 'In Transit',
        [TRANSPORT_JOB_STATUS.DELIVERED]: 'Delivered',
        [TRANSPORT_JOB_STATUS.CANCELLED]: 'Cancelled',
        [TRANSPORT_JOB_STATUS.EXCEPTION]: 'Exception'
      }
    },
    truck: {
      values: Object.values(TRUCK_STATUS),
      labels: {
        [TRUCK_STATUS.AVAILABLE]: 'Available',
        [TRUCK_STATUS.IN_USE]: 'In Use',
        [TRUCK_STATUS.MAINTENANCE]: 'Maintenance',
        [TRUCK_STATUS.OUT_OF_SERVICE]: 'Out of Service'
      }
    },
    vehicle: {
      values: Object.values(VEHICLE_STATUS),
      labels: {
        [VEHICLE_STATUS.PURCHASED_INTAKE_NEEDED]: 'Purchased – Intake Needed',
        [VEHICLE_STATUS.INTAKE_COMPLETE]: 'Intake Completed',
        [VEHICLE_STATUS.READY_FOR_TRANSPORT]: 'Ready for Transport',
        [VEHICLE_STATUS.PUBLISHED_TO_CENTRAL_DISPATCH]: 'Published to Central Dispatch',
        [VEHICLE_STATUS.IN_TRANSPORT]: 'In Transport',
        [VEHICLE_STATUS.DELIVERED]: 'Delivered',
        [VEHICLE_STATUS.CANCELLED]: 'Cancelled'
      }
    },
    routeStopType: {
      values: Object.values(ROUTE_STOP_TYPE),
      labels: {
        [ROUTE_STOP_TYPE.PICKUP]: 'Pickup',
        [ROUTE_STOP_TYPE.DROP]: 'Drop',
        [ROUTE_STOP_TYPE.BREAK]: 'Break',
        [ROUTE_STOP_TYPE.REST]: 'Rest'
      }
    },
    carrier: {
      values: Object.values(CARRIER),
      labels: {
        [CARRIER.PTG]: 'PTG (Own Service)',
        [CARRIER.CENTRAL_DISPATCH]: 'Central Dispatch'
      }
    }
  };
};

module.exports = {
  ROUTE_STATUS,
  ROUTE_STOP_STATUS,
  ROUTE_STATE,
  TRANSPORT_JOB_STATUS,
  TRUCK_STATUS,
  VEHICLE_STATUS,
  ROUTE_STOP_TYPE,
  CARRIER,
  getAllStatusEnums
};


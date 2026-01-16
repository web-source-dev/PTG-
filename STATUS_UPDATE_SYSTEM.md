# Status Update System Documentation

This document explains how statuses are automatically updated for Vehicles and Transport Jobs based on actions performed in the system.

## Overview

The status update system ensures that Vehicle and Transport Job statuses remain consistent throughout the application lifecycle. Status updates are triggered automatically when specific actions are performed, such as creating routes, setting up stops, starting routes, completing stops, etc.

## Status Update Functions

All status update logic is centralized in `Backend/utils/statusManager.js`. The following functions handle status updates:

### 1. `updateVehicleOnCreate(vehicleId)`
**Triggered When:** A vehicle is created
**Updates:**
- Vehicle status → `"Intake Completed"`

**Called From:**
- `Backend/controllers/vehicleController.js` → `createVehicle()`

---

### 2. `updateStatusOnTransportJobCreate(transportJobId, vehicleId)`
**Triggered When:** A transport job is created
**Updates:**
- Transport Job status → `"Needs Dispatch"`
- Vehicle status → `"Ready for Transport"`

**Called From:**
- `Backend/controllers/transportJobController.js` → `createTransportJob()`

---

### 3. `updateStatusOnRouteCreate(routeId, selectedTransportJobs, truckId)`
**Triggered When:** A route is created (only driver and truck are selected)
**Updates:**
- Route status → `"Planned"` (if not already set)
- **DOES NOT** update Transport Job status
- **DOES NOT** update Vehicle status
- **DOES NOT** update Truck status (truck may be on another route, this is a future route)
- **DOES NOT** set driver currentRouteId

**Called From:**
- `Backend/controllers/routeController.js` → `createRoute()`

**Note:** 
- At route creation, only the route status is set. 
- Transport jobs and vehicles are updated later when stops are saved.
- Truck status is NEVER updated during route creation because trucks may be on other routes and these are future routes.

---

### 4. `updateStatusOnStopsSetup(routeId, stops)`
**Triggered When:** Stops are saved (after adding transport jobs to route and clicking "Save Stops" button)
**Updates:**
- Transport Job status → `"Dispatched"` (for all jobs in the route stops)
- Vehicle status → `"Ready for Transport"` (for all vehicles in the route stops)
- Route status → `"Planned"` (ensures it's set)
- Truck status → **NOT UPDATED** (remains whatever it was - may be on another route, this is a future route)

**Called From:**
- `Backend/controllers/routeController.js` → `updateRoute()` (when stops with transportJobId are saved and route is "Planned", called AFTER route is saved)

**Note:** 
- This is the key function that updates transport jobs and vehicles when stops are set up.
- Truck status is NEVER updated during route creation or stops setup because trucks may be on other routes and these are future routes.
- Truck is only updated to "In Use" when route actually starts.

---

### 5. `updateStatusOnRouteStatusChange(routeId, newStatus, oldStatus)`
**Triggered When:** Route status changes (Planned → In Progress, In Progress → Completed, etc.)
**Updates Based on New Status:**

#### When Route Status = `"In Progress"` (Route Started):
- Route status → `"In Progress"`
- Truck status → `"In Use"`
- Driver currentRouteId → Set (handled in driverController)
- **DOES NOT** update Transport Job status (remains "Dispatched")
- **DOES NOT** update Vehicle status (remains "Ready for Transport")

**Note:** Transport jobs and vehicles are updated when pickup stops are completed, not when route starts.

#### When Route Status = `"Completed"`:
- Route status → `"Completed"`
- Truck status → `"Available"` (and clears currentDriver)
- Driver currentRouteId → Removed (handled in driverController)
- All Transport Jobs in route → `"Delivered"` (if not already delivered)
- All Vehicles in route → `"Delivered"` (if not already delivered)

#### When Route Status = `"Cancelled"`:
- Transport Job status → `"Needs Dispatch"` (reverts all jobs in the route)
- Vehicle status → `"Ready for Transport"` (reverts all vehicles in the route)
- Truck status → `"Available"` (and clears currentDriver)

**Called From:**
- `Backend/controllers/routeController.js` → `updateRoute()` (when admin/dispatcher updates route status)
- `Backend/controllers/driverController.js` → `updateMyRoute()` (when driver starts/stops/completes route)

---

### 6. `updateStatusOnStopUpdate(routeId, stopIndex, newStopStatus, stopType, transportJobId)`
**Triggered When:** A stop status is updated (especially when marked as "Completed")
**Updates Based on Stop Type:**

#### When Pickup Stop is Completed:
- Transport Job status → `"In Transit"`
- Vehicle status → `"In Transport"` (if not already delivered)

#### When Drop Stop is Completed:
- Checks if ALL drop stops for the transport job are completed
- If yes:
  - Transport Job status → `"Delivered"`
  - Vehicle status → `"Delivered"`

#### When All Stops are Completed:
- Route status → `"Completed"`
- Truck status → `"Available"` (and clears currentDriver)
- All Transport Jobs in route → `"Delivered"` (if not already delivered)
- All Vehicles in route → `"Delivered"` (if not already delivered)

**Called From:**
- `Backend/controllers/driverController.js` → `updateMyRoute()` (when driver updates stops)
- `Backend/controllers/driverController.js` → `updateMyRouteStop()` (when driver updates a specific stop)
- `Backend/controllers/routeController.js` → `updateRoute()` (when admin/dispatcher updates stops)

---

### 7. `updateStatusOnTransportJobRemoved(transportJobId)`
**Triggered When:** A transport job is removed from a route
**Updates:**
- Transport Job status → `"Needs Dispatch"` (reverts status)
- Transport Job routeId → removed (unset)
- Vehicle status → `"Ready for Transport"` (reverts status)

**Called From:**
- `Backend/controllers/routeController.js` → `removeTransportJobFromRoute()`

---

### 8. `updateAllRelatedEntities(routeId)`
**Triggered When:** A route is completed
**Updates:**
- All Transport Jobs in route → `"Delivered"`
- All Vehicles in route → `"Delivered"`
- Truck status → `"Available"` (if was "In Use")

**Called From:**
- `Backend/controllers/driverController.js` → `updateMyRoute()` (when route status changes to "Completed")

---

### 9. `updateDriverStats(routeId, driverId)`
**Triggered When:** A route is completed
**Updates:**
- Driver stats (totalLoadsMoved, totalDistanceTraveled)
- Truck stats (totalLoadsMoved, totalDistanceTraveled)

**Called From:**
- `Backend/controllers/driverController.js` → `updateMyRoute()` (when route status changes to "Completed")

---

## Status Flow Diagrams

### Vehicle Status Flow:
```
Purchased → Intake Completed → Ready for Transport → In Transport → Delivered
                ↓                      ↓                    ↓              ↓
         (Vehicle Created)    (Transport Job Created)  (Stops Setup)  (Pickup Completed)
                                                      (Route Created)  (Drop Completed)
                                                                        (Route Completed)
```

### Transport Job Status Flow:
```
Needs Dispatch → Dispatched → In Transit → Delivered
      ↓              ↓            ↓            ↓
(Job Created)  (Stops Setup) (Pickup Completed) (Drop Completed)
              (Route Created)                    (Route Completed)
```

### Route Status Flow:
```
Planned → In Progress → Completed
   ↓          ↓            ↓
(Route   (Route Started) (All Stops Completed)
Created)                (Route Completed)
(Stops Setup)
```

### Truck Status Flow:
```
Available → In Use → Available
     ↓         ↓         ↓
(Route   (Route Started) (Route Completed)
Created)                (Route Cancelled)
(Stops Setup)
```

---

## Action-to-Status Mapping

| Action | Vehicle Status | Transport Job Status | Route Status | Truck Status | Driver currentRouteId |
|--------|---------------|---------------------|--------------|--------------|----------------------|
| **Vehicle Created** | Intake Completed | - | - | - | - |
| **Transport Job Created** | Ready for Transport | Needs Dispatch | - | - | - |
| **Route Created** (driver & truck only) | - | - | Planned | No change* | - |
| **Stops Setup** (save stops with transport jobs) | Ready for Transport | Dispatched | Planned | No change* | - |
| **Route Started** (start button clicked) | Ready for Transport* | Dispatched* | In Progress | In Use | Set |
| **Pickup Stop Completed** | In Transport | In Transit | In Progress | In Use | Set |
| **Drop Stop Completed** | Delivered** | Delivered** | In Progress/Completed*** | Available**** | Removed**** |
| **Route Completed** (complete button clicked) | Delivered | Delivered | Completed | Available | Removed |
| **Route Cancelled** | Ready for Transport | Needs Dispatch | Cancelled | Available | - |
| **Job Removed from Route** | Ready for Transport | Needs Dispatch | - | - | - |

\* Truck status is NOT updated during route creation or stops setup (truck may be on another route, this is a future route)  
\** Vehicle and Transport Job statuses remain unchanged when route starts - they are updated when pickup stop is completed  
\*** Only if ALL drop stops for the transport job are completed  
\**** Route becomes Completed if ALL stops are completed  
\***** Truck becomes Available and currentRouteId is removed only if route is Completed

---

## Detailed Status Update Flow

### Step 1: Route Creation
**Action:** Admin/Dispatcher creates a route and selects driver and truck
- Route status → `"Planned"`
- Truck status → Remains `"Available"`
- Transport Job status → No change
- Vehicle status → No change
- Driver currentRouteId → Not set

### Step 2: Stops Setup
**Action:** Admin/Dispatcher adds transport jobs to route stops and clicks "Save Stops"
- Transport Job status → `"Dispatched"` (for all jobs in stops)
- Vehicle status → `"Ready for Transport"` (for all vehicles in stops)
- Route status → `"Planned"` (ensured)
- Truck status → Remains `"Available"`

### Step 3: Route Started
**Action:** Driver clicks "Start Route" button
- Route status → `"In Progress"`
- Truck status → `"In Use"`
- Driver currentRouteId → Set to route ID
- Transport Job status → Remains `"Dispatched"` (NOT updated)
- Vehicle status → Remains `"Ready for Transport"` (NOT updated)

### Step 4: Pickup Stop Completed
**Action:** Driver completes pickup stop for a specific vehicle
- Transport Job status → `"In Transit"` (for that specific job)
- Vehicle status → `"In Transport"` (for that specific vehicle)
- Route status → Remains `"In Progress"`
- Truck status → Remains `"In Use"`

### Step 5: Drop Stop Completed
**Action:** Driver completes drop stop for a specific vehicle
- Transport Job status → `"Delivered"` (for that specific job, if all drop stops for that job are completed)
- Vehicle status → `"Delivered"` (for that specific vehicle, if all drop stops for that job are completed)
- Route status → `"Completed"` (if ALL stops are completed, otherwise remains "In Progress")
- Truck status → `"Available"` (if route is completed)
- Driver currentRouteId → Removed (if route is completed)

### Step 6: Route Completed
**Action:** Driver clicks "Complete Route" button (or all stops are completed)
- Route status → `"Completed"`
- Truck status → `"Available"`
- Driver currentRouteId → Removed
- All Transport Jobs → `"Delivered"` (if not already delivered)
- All Vehicles → `"Delivered"` (if not already delivered)

---

## Important Notes

1. **Status updates are automatic**: Once the proper functions are called, statuses update automatically. No manual status updates are needed.

2. **Status updates are cascading**: When a route status changes, it automatically updates all related transport jobs and vehicles (when appropriate).

3. **Status updates are idempotent**: The functions check current statuses before updating to avoid unnecessary database writes.

4. **Error handling**: All status update functions have try-catch blocks and log errors without failing the main operation.

5. **Status consistency**: The system ensures that:
   - Vehicles cannot be "Delivered" before their transport job is "Delivered"
   - Transport jobs cannot be "Delivered" before all drop stops are completed
   - Routes cannot be "Completed" before all stops are completed
   - Trucks remain "Available" until route starts
   - Transport jobs and vehicles are only updated to "Dispatched"/"Ready for Transport" when stops are saved, not when route is created

6. **Key Timing**:
   - Route creation: Only sets route to "Planned"
   - Stops setup: Updates transport jobs and vehicles
   - Route start: Updates route, truck, and driver (but NOT transport jobs/vehicles)
   - Pickup completion: Updates transport job and vehicle for that specific job
   - Drop completion: Updates transport job and vehicle for that specific job
   - Route completion: Finalizes all statuses

---

## Testing Status Updates

To verify status updates are working correctly:

1. **Create a vehicle** → Should be "Intake Completed"
2. **Create a transport job** → Vehicle should be "Ready for Transport", Job should be "Needs Dispatch"
3. **Create a route** (select driver and truck only) → Route should be "Planned", Truck should remain "Available", Job should remain "Needs Dispatch", Vehicle should remain "Ready for Transport"
4. **Save stops** (add transport jobs to route stops and save) → Vehicle should be "Ready for Transport", Job should be "Dispatched", Route should be "Planned", Truck should remain "Available"
5. **Start the route** → Vehicle should remain "Ready for Transport", Job should remain "Dispatched", Route should be "In Progress", Truck should be "In Use", Driver currentRouteId should be set
6. **Complete pickup stop** → Vehicle should be "In Transport", Job should be "In Transit", Route should be "In Progress"
7. **Complete drop stop** → Vehicle should be "Delivered", Job should be "Delivered", Route should be "Completed" (if all stops completed), Truck should be "Available", Driver currentRouteId should be removed

---

## Recent Changes (2024)

The status update flow was restructured to match the actual workflow:

1. **Route Creation**: Now only sets route to "Planned" - does NOT update truck, transport jobs, or vehicles
2. **Stops Setup**: New function `updateStatusOnStopsSetup` updates transport jobs to "Dispatched" and vehicles to "Ready for Transport" when stops are saved
3. **Route Start**: Now only updates route to "In Progress", truck to "In Use", and sets driver currentRouteId - does NOT update transport jobs or vehicles
4. **Pickup Completion**: Updates transport job to "In Transit" and vehicle to "In Transport"
5. **Drop Completion**: Updates transport job to "Delivered" and vehicle to "Delivered"
6. **Route Completion**: Updates route to "Completed", truck to "Available", removes driver currentRouteId, and ensures all jobs/vehicles are "Delivered"

These changes ensure that statuses are updated at the correct stages of the workflow, matching the actual business process.

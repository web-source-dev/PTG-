# Reports Documentation

## Overview
This document outlines all available report types, their data relationships, calculations, and visualization requirements for the VOS-PTG system.

---

## Table of Contents
1. [Driver Reports](#driver-reports)
2. [Truck Reports](#truck-reports)
3. [Route Reports](#route-reports)
4. [Transport Job Reports](#transport-job-reports)
5. [Carrier Reports](#carrier-reports)
6. [Financial Reports](#financial-reports)
7. [Data Relationships](#data-relationships)
8. [Calculations](#calculations)
9. [Graph Types](#graph-types)
10. [Examples](#examples)

---

## Driver Reports

### 1. Driver Summary Report
**Purpose**: Complete overview of a driver's performance and activities

**Data Points**:
- Driver Information (Name, Email, Phone, Role)
- Total Routes Completed/Active/Cancelled
- Total Distance Traveled (miles)
- Total Loads Moved (count of transport jobs)
- Total Expenses (fuel + maintenance)
- Date Range Filter

**Relationships**:
```
User (Driver)
  ├── Routes (driverId)
  │   ├── TransportJobs (stops.transportJobId)
  │   │   └── Vehicles (vehicleId)
  │   └── Expenses (routeId, driverId)
  │       ├── Fuel Expenses
  │       └── Maintenance Expenses
  └── Expenses (driverId, routeId: null)
      └── Truck Maintenance (truck-specific)
```

**Calculations**:
- Total Routes = Count of routes where `driverId` matches
- Total Distance = Sum of `route.actualDistanceTraveled` or `route.totalDistance.value`
- Total Loads = Count of unique `transportJobId` from all route stops
- Total Fuel Cost = Sum of `expense.totalCost` where `type = 'fuel'` and `driverId` matches
- Total Maintenance Cost = Sum of `expense.totalCost` where `type = 'maintenance'` and `driverId` matches
- Average Fuel Efficiency = Total Gallons / Total Distance (if available)

**Graphs**:
- Line Chart: Routes completed over time
- Bar Chart: Expenses by category (fuel vs maintenance)
- Pie Chart: Route status distribution (Completed/Active/Cancelled)
- Line Chart: Distance traveled per month

---

### 2. Driver Route History Report
**Purpose**: Detailed list of all routes a driver has been assigned

**Data Points**:
- Route Number
- Route Status
- Planned Start/End Dates
- Actual Start/End Dates
- Truck Assigned (Truck Number, Make, Model, Year)
- Number of Stops
- Total Distance
- Total Duration
- Transport Jobs Count
- Total Expenses for Route

**Relationships**:
```
User (Driver)
  └── Routes (driverId)
      ├── Truck (truckId)
      ├── Stops[]
      │   └── TransportJobs (transportJobId)
      └── Expenses (routeId, driverId)
```

**Calculations**:
- Stops Count = `route.stops.length`
- Transport Jobs Count = Unique count of `stop.transportJobId` in route.stops
- Route Expenses = Sum of all expenses where `routeId` and `driverId` match

**Graphs**:
- Timeline View: Routes plotted on calendar/timeline
- Bar Chart: Routes by status
- Line Chart: Distance per route

---

### 3. Driver Transport Jobs Report
**Purpose**: All vehicles/transport jobs a driver has handled

**Data Points**:
- Transport Job Number
- Vehicle VIN, Make, Model, Year
- Pickup Location & Date
- Drop Location & Date
- Route Number (if assigned)
- Status
- Carrier & Carrier Payment
- Completion Date

**Relationships**:
```
User (Driver)
  └── Routes (driverId)
      └── Stops[]
          └── TransportJobs (transportJobId)
              └── Vehicles (vehicleId)
```

**Calculations**:
- Total Jobs = Count of unique transport jobs from all route stops
- Completed Jobs = Count where `status = 'Delivered'`
- Total Carrier Payment = Sum of `transportJob.carrierPayment` for completed jobs

**Graphs**:
- Bar Chart: Jobs by status
- Map View: Pickup and drop locations
- Pie Chart: Jobs by carrier

---

### 4. Driver Expenses Report
**Purpose**: Detailed breakdown of all expenses incurred by driver

**Data Points**:
- Expense Type (Fuel/Maintenance)
- Date & Time
- Route Number (if route-related)
- Truck Number
- Location (askedLocation.formattedAddress)
- Amount Details:
  - For Fuel: Gallons, Price per Gallon, Total Cost
  - For Maintenance: Description, Service Provider, Total Cost
- Odometer Reading

**Relationships**:
```
User (Driver)
  └── Expenses (driverId)
      ├── Route (routeId) [optional]
      └── Truck (truckId)
```

**Calculations**:
- Total Fuel Expenses = Sum of `totalCost` where `type = 'fuel'`
- Total Maintenance Expenses = Sum of `totalCost` where `type = 'maintenance'`
- Total Gallons = Sum of `gallons` for fuel expenses
- Average Price per Gallon = Total Fuel Cost / Total Gallons
- Expenses by Route = Group expenses by `routeId`
- Expenses by Truck = Group expenses by `truckId`

**Graphs**:
- Line Chart: Expenses over time
- Bar Chart: Expenses by type (fuel vs maintenance)
- Bar Chart: Expenses by route
- Bar Chart: Expenses by truck
- Pie Chart: Expense distribution by category

---

### 5. Driver Performance Report
**Purpose**: Performance metrics and statistics

**Data Points**:
- Total Routes Completed
- On-Time Completion Rate
- Average Route Duration
- Total Distance Traveled
- Total Loads Moved
- Fuel Efficiency Metrics
- Expense Efficiency (cost per mile)

**Calculations**:
- On-Time Completion Rate = (Routes completed on/before plannedEndDate) / Total Routes
- Average Route Duration = Average of (actualEndDate - actualStartDate) for completed routes
- Cost per Mile = Total Expenses / Total Distance Traveled
- Fuel Efficiency = Total Distance / Total Gallons (MPG)

**Graphs**:
- Gauge Chart: On-time completion rate
- Bar Chart: Performance metrics comparison
- Line Chart: Performance trends over time

---

## Truck Reports

### 1. Truck Summary Report
**Purpose**: Complete overview of truck usage and performance

**Data Points**:
- Truck Information (Truck Number, License Plate, Make, Model, Year)
- Total Routes Assigned
- Total Distance Traveled
- Total Loads Moved
- Total Fuel Expenses
- Total Maintenance Expenses
- Current Status
- Current Driver (if assigned)

**Relationships**:
```
Truck
  ├── Routes (truckId)
  │   ├── Drivers (driverId)
  │   ├── TransportJobs (stops.transportJobId)
  │   └── Expenses (routeId, truckId)
  └── Expenses (truckId, routeId: null)
      └── Direct Truck Maintenance
```

**Calculations**:
- Total Routes = Count of routes where `truckId` matches
- Total Distance = Sum of `route.actualDistanceTraveled` or `route.totalDistance.value`
- Total Loads = Count of unique transport jobs from all route stops
- Total Fuel Cost = Sum of expenses where `type = 'fuel'` and `truckId` matches
- Total Maintenance Cost = Sum of expenses where `type = 'maintenance'` and `truckId` matches
- Fuel Efficiency = Total Distance / Total Gallons

**Graphs**:
- Line Chart: Routes over time
- Bar Chart: Expenses by type
- Pie Chart: Route status distribution
- Line Chart: Distance traveled per month

---

### 2. Truck Route History Report
**Purpose**: All routes a truck has been assigned to

**Data Points**:
- Route Number
- Driver Name & Email
- Route Status
- Planned Start/End Dates
- Actual Start/End Dates
- Number of Stops
- Total Distance
- Transport Jobs Count
- Total Expenses for Route

**Relationships**:
```
Truck
  └── Routes (truckId)
      ├── Driver (driverId)
      ├── Stops[]
      │   └── TransportJobs (transportJobId)
      └── Expenses (routeId, truckId)
```

**Calculations**:
- Routes per Driver = Group routes by `driverId`
- Average Routes per Month = Total Routes / Months in service

**Graphs**:
- Timeline View: Routes on calendar
- Bar Chart: Routes by driver
- Line Chart: Distance per route

---

### 3. Truck Transport Jobs Report
**Purpose**: All vehicles/transport jobs handled by this truck

**Data Points**:
- Transport Job Number
- Vehicle VIN, Make, Model, Year
- Driver Name
- Route Number
- Pickup/Drop Locations & Dates
- Status
- Carrier & Carrier Payment

**Relationships**:
```
Truck
  └── Routes (truckId)
      └── Stops[]
          └── TransportJobs (transportJobId)
              └── Vehicles (vehicleId)
```

**Calculations**:
- Total Jobs = Count of unique transport jobs
- Jobs by Driver = Group by route.driverId

**Graphs**:
- Bar Chart: Jobs by status
- Map View: Pickup and drop locations
- Pie Chart: Jobs by carrier

---

### 4. Truck Expenses Report
**Purpose**: Detailed breakdown of all expenses for a truck

**Data Points**:
- Expense Type (Fuel/Maintenance)
- Date & Time
- Route Number (if route-related)
- Driver Name
- Location
- Amount Details
- Odometer Reading

**Relationships**:
```
Truck
  └── Expenses (truckId)
      ├── Route (routeId) [optional]
      └── Driver (driverId)
```

**Calculations**:
- Total Fuel Expenses = Sum where `type = 'fuel'`
- Total Maintenance Expenses = Sum where `type = 'maintenance'`
- Expenses by Route = Group by `routeId`
- Expenses by Driver = Group by `driverId`
- Average Cost per Mile = Total Expenses / Total Distance

**Graphs**:
- Line Chart: Expenses over time
- Bar Chart: Expenses by type
- Bar Chart: Expenses by route
- Bar Chart: Expenses by driver
- Pie Chart: Expense distribution by category

---

### 5. Truck Performance Report
**Purpose**: Performance metrics and utilization

**Data Points**:
- Utilization Rate (days in use / total days)
- Average Routes per Month
- Total Distance Traveled
- Fuel Efficiency (MPG)
- Maintenance Frequency
- Cost per Mile

**Calculations**:
- Utilization Rate = (Days truck was on active routes) / (Total days since creation)
- Maintenance Frequency = Count of maintenance expenses / Months in service
- Cost per Mile = Total Expenses / Total Distance

**Graphs**:
- Gauge Chart: Utilization rate
- Bar Chart: Performance metrics
- Line Chart: Utilization trends

---

## Route Reports

### 1. Route Complete Report
**Purpose**: Comprehensive single route report with all details

**Data Points**:
- Route Information:
  - Route Number
  - Status
  - Planned Start/End Dates
  - Actual Start/End Dates
  - Journey Start/End Locations
- Driver Information:
  - Name, Email, Phone
- Truck Information:
  - Truck Number, License Plate, Make, Model, Year
- Stops Details:
  - Stop Type, Sequence
  - Location (Name, Address, City, State, Zip)
  - Scheduled Date/Time
  - Actual Date/Time (if completed)
  - Transport Job (if pickup/drop)
    - Job Number
    - Vehicle Details (VIN, Make, Model, Year)
    - Carrier & Carrier Payment
- Expenses:
  - Fuel Expenses (with details)
  - Maintenance Expenses (with details)
- Totals:
  - Total Distance
  - Total Duration
  - Total Expenses
  - Total Carrier Payments

**Relationships**:
```
Route
  ├── Driver (driverId)
  ├── Truck (truckId)
  ├── Stops[]
  │   └── TransportJobs (transportJobId)
  │       └── Vehicles (vehicleId)
  └── Expenses (routeId)
```

**Calculations**:
- Total Distance = `route.totalDistance.value` (meters) converted to miles
- Total Duration = `route.totalDuration.value` (seconds) converted to hours
- Total Expenses = Sum of all expenses for this route
- Total Carrier Payments = Sum of `transportJob.carrierPayment` from all stops
- Net Profit = Total Carrier Payments - Total Expenses

**Graphs**:
- Map View: Route path with stops
- Timeline View: Stops on timeline
- Bar Chart: Expenses breakdown
- Pie Chart: Carrier payment distribution

---

### 2. Route Expenses Breakdown
**Purpose**: Detailed expense analysis for a route

**Data Points**:
- Fuel Expenses:
  - Date, Location, Gallons, Price/Gallon, Total
- Maintenance Expenses:
  - Date, Location, Description, Service Provider, Total
- Summary:
  - Total Fuel Cost
  - Total Maintenance Cost
  - Total Expenses
  - Cost per Mile

**Calculations**:
- Fuel Cost = Sum of fuel expenses
- Maintenance Cost = Sum of maintenance expenses
- Cost per Mile = Total Expenses / Route Distance

**Graphs**:
- Bar Chart: Expenses by type
- Line Chart: Expenses over route timeline
- Pie Chart: Expense distribution

---

### 3. Route Transport Jobs Summary
**Purpose**: All transport jobs in a route with carrier information

**Data Points**:
- Transport Job Number
- Vehicle VIN, Make, Model, Year
- Pickup Location & Date
- Drop Location & Date
- Carrier Name
- Carrier Payment Amount
- Status

**Calculations**:
- Total Jobs = Count of unique transport jobs
- Total Carrier Payments = Sum of `carrierPayment`
- Average Carrier Payment = Total Carrier Payments / Total Jobs

**Graphs**:
- Bar Chart: Carrier payments per job
- Pie Chart: Jobs by carrier
- Map View: Pickup and drop locations

---

## Transport Job Reports

### 1. Transport Job Complete Report
**Purpose**: Full details of a transport job

**Data Points**:
- Job Information:
  - Job Number
  - Status
  - Carrier & Carrier Payment
- Vehicle Information:
  - VIN, Year, Make, Model
- Pickup Details:
  - Location, City, State, Zip
  - Contact Name, Phone
  - Date Range, Time Range
- Drop Details:
  - Location, City, State, Zip
  - Contact Name, Phone
  - Date Range, Time Range
- Route Information (if assigned):
  - Route Number
  - Driver Name
  - Truck Number
  - Stop Sequence
- Expenses Related:
  - Fuel expenses on route
  - Maintenance expenses on route

**Relationships**:
```
TransportJob
  ├── Vehicle (vehicleId)
  └── Route (routeId)
      ├── Driver (driverId)
      ├── Truck (truckId)
      └── Expenses (routeId)
```

**Calculations**:
- Route Expenses = Sum of expenses where `routeId` matches
- Net Profit = `carrierPayment` - Route Expenses (proportional)

**Graphs**:
- Map View: Pickup and drop locations
- Timeline View: Job timeline with route

---

## Carrier Reports

### 1. Carrier Summary Report
**Purpose**: Summary of all jobs by carrier

**Data Points**:
- Carrier Name
- Total Jobs
- Completed Jobs
- Total Carrier Payments
- Average Payment per Job
- Jobs by Status

**Relationships**:
```
TransportJob
  └── Group by carrier
```

**Calculations**:
- Total Jobs = Count of transport jobs by carrier
- Total Payments = Sum of `carrierPayment` by carrier
- Average Payment = Total Payments / Total Jobs

**Graphs**:
- Bar Chart: Total payments by carrier
- Pie Chart: Jobs distribution by carrier
- Line Chart: Payments over time

---

### 2. Carrier Detailed Report
**Purpose**: Detailed breakdown per carrier

**Data Points**:
- Carrier Name
- Job Number
- Vehicle Details
- Pickup/Drop Locations
- Payment Amount
- Route Information
- Status

**Calculations**:
- Jobs Count = Count per carrier
- Total Revenue = Sum of payments per carrier

**Graphs**:
- Table View: All jobs with details
- Bar Chart: Payments per job
- Map View: Job locations

---

## Financial Reports

### 1. Expense Summary Report
**Purpose**: Overall expense analysis

**Data Points**:
- Total Fuel Expenses
- Total Maintenance Expenses
- Expenses by Driver
- Expenses by Truck
- Expenses by Route
- Expenses by Date Range

**Calculations**:
- Total Expenses = Sum of all expenses
- Average Expense per Route = Total Expenses / Total Routes
- Average Expense per Mile = Total Expenses / Total Distance

**Graphs**:
- Bar Chart: Expenses by type
- Bar Chart: Expenses by driver
- Bar Chart: Expenses by truck
- Line Chart: Expenses over time
- Pie Chart: Expense distribution

---

### 2. Revenue vs Expenses Report
**Purpose**: Profitability analysis

**Data Points**:
- Total Carrier Payments (Revenue)
- Total Expenses (Costs)
- Net Profit/Loss
- Profit Margin

**Relationships**:
```
TransportJob.carrierPayment (Revenue)
  vs
Expense.totalCost (Costs)
```

**Calculations**:
- Total Revenue = Sum of all `transportJob.carrierPayment`
- Total Costs = Sum of all expenses
- Net Profit = Total Revenue - Total Costs
- Profit Margin = (Net Profit / Total Revenue) * 100

**Graphs**:
- Bar Chart: Revenue vs Expenses
- Line Chart: Profit trend over time
- Gauge Chart: Profit margin

---

## Data Relationships

### Entity Relationship Diagram

```
User (Driver)
  ├── Routes (1:N)
  │   ├── Truck (N:1)
  │   ├── Stops[] (1:N)
  │   │   └── TransportJob (N:1)
  │   │       └── Vehicle (N:1)
  │   └── Expenses (1:N)
  │       └── Truck (N:1)
  └── Expenses (1:N) [direct truck maintenance]
      └── Truck (N:1)

Truck
  ├── Routes (1:N)
  │   ├── Driver (N:1)
  │   └── Expenses (1:N)
  └── Expenses (1:N) [direct maintenance]

Route
  ├── Driver (N:1)
  ├── Truck (N:1)
  ├── Stops[] (1:N)
  │   └── TransportJob (N:1)
  └── Expenses (1:N)

TransportJob
  ├── Vehicle (N:1)
  └── Route (N:1)

Expense
  ├── Route (N:1) [optional]
  ├── Driver (N:1)
  └── Truck (N:1)
```

---

## Calculations

### Distance Calculations
- **Route Distance**: `route.totalDistance.value` (meters) → Convert to miles: `value * 0.000621371`
- **Total Distance Traveled**: Sum of `route.actualDistanceTraveled` (miles) or `route.totalDistance.value` converted

### Duration Calculations
- **Route Duration**: `route.totalDuration.value` (seconds) → Convert to hours: `value / 3600`
- **Average Route Duration**: Sum of durations / Count of routes

### Expense Calculations
- **Total Fuel Cost**: `SUM(expense.totalCost WHERE type = 'fuel')`
- **Total Maintenance Cost**: `SUM(expense.totalCost WHERE type = 'maintenance')`
- **Total Gallons**: `SUM(expense.gallons WHERE type = 'fuel')`
- **Average Price per Gallon**: `Total Fuel Cost / Total Gallons`
- **Cost per Mile**: `Total Expenses / Total Distance`

### Revenue Calculations
- **Total Carrier Payments**: `SUM(transportJob.carrierPayment)`
- **Average Payment per Job**: `Total Carrier Payments / Count of Jobs`
- **Net Profit**: `Total Carrier Payments - Total Expenses`

### Efficiency Calculations
- **Fuel Efficiency (MPG)**: `Total Distance / Total Gallons`
- **Utilization Rate**: `(Days in use) / (Total days since creation) * 100`
- **On-Time Completion Rate**: `(Routes completed on time) / (Total routes) * 100`

---

## Graph Types

### 1. Line Charts
- **Use Cases**: Trends over time (expenses, routes, distance)
- **X-Axis**: Date/Time
- **Y-Axis**: Metric value
- **Examples**: 
  - Expenses over time
  - Routes completed per month
  - Distance traveled per month

### 2. Bar Charts
- **Use Cases**: Comparisons (expenses by type, routes by status, jobs by carrier)
- **X-Axis**: Category
- **Y-Axis**: Value
- **Examples**:
  - Expenses by type (fuel vs maintenance)
  - Routes by status
  - Carrier payments comparison

### 3. Pie Charts
- **Use Cases**: Distribution/proportions
- **Examples**:
  - Route status distribution
  - Expense category distribution
  - Jobs by carrier distribution

### 4. Gauge Charts
- **Use Cases**: Single metric with target/threshold
- **Examples**:
  - On-time completion rate
  - Utilization rate
  - Profit margin

### 5. Map Views
- **Use Cases**: Geographic visualization
- **Examples**:
  - Route path with stops
  - Pickup and drop locations
  - Driver/truck locations

### 6. Timeline Views
- **Use Cases**: Chronological visualization
- **Examples**:
  - Routes on calendar
  - Stops timeline
  - Job timeline

### 7. Tables
- **Use Cases**: Detailed data listing
- **Examples**:
  - Route history table
  - Expense details table
  - Transport jobs table

---

## Examples

### Example 1: Driver Summary Report

**Driver**: John Doe (john.doe@example.com)

**Period**: January 2024 - December 2024

**Summary**:
- Total Routes: 45
  - Completed: 40
  - Active: 3
  - Cancelled: 2
- Total Distance: 12,450 miles
- Total Loads Moved: 52 vehicles
- Total Expenses: $8,450
  - Fuel: $6,200 (1,240 gallons)
  - Maintenance: $2,250
- Fuel Efficiency: 10.04 MPG
- Cost per Mile: $0.68

**Graphs**:
1. Line Chart: Routes completed per month
2. Bar Chart: Expenses by type
3. Pie Chart: Route status distribution

---

### Example 2: Truck Summary Report

**Truck**: TRUCK-001 (Ford F-150, 2020)

**Period**: January 2024 - December 2024

**Summary**:
- Total Routes: 38
- Total Distance: 15,200 miles
- Total Loads: 45 vehicles
- Total Expenses: $12,500
  - Fuel: $9,000 (1,800 gallons)
  - Maintenance: $3,500
- Utilization Rate: 78%
- Fuel Efficiency: 8.44 MPG
- Cost per Mile: $0.82

**Graphs**:
1. Line Chart: Routes over time
2. Bar Chart: Expenses by type
3. Gauge Chart: Utilization rate

---

### Example 3: Route Complete Report

**Route**: RT-20241215-001

**Details**:
- Driver: John Doe (john.doe@example.com)
- Truck: TRUCK-001 (Ford F-150, 2020)
- Status: Completed
- Planned: Dec 15, 2024 - Dec 18, 2024
- Actual: Dec 15, 2024 - Dec 17, 2024
- Total Distance: 450 miles
- Total Duration: 48 hours

**Stops**: 5
1. Start - Warehouse A
2. Pickup - Vehicle 1 (TJ-20241215-001) - Carrier: PTG - Payment: $500
3. Drop - Vehicle 1 - Location: Dealer B
4. Pickup - Vehicle 2 (TJ-20241215-002) - Carrier: PTG - Payment: $600
5. End - Warehouse A

**Expenses**:
- Fuel: $180 (45 gallons @ $4.00/gallon)
- Maintenance: $0
- Total: $180

**Summary**:
- Total Carrier Payments: $1,100
- Total Expenses: $180
- Net Profit: $920
- Profit Margin: 83.6%

**Graphs**:
1. Map View: Route path with stops
2. Timeline View: Stops timeline
3. Bar Chart: Expenses breakdown

---

### Example 4: Carrier Summary Report

**Period**: January 2024 - December 2024

**Summary by Carrier**:

| Carrier | Total Jobs | Completed | Total Payments | Average Payment |
|---------|-----------|-----------|---------------|-----------------|
| PTG     | 120       | 115       | $60,000       | $500            |
| External| 45        | 42        | $27,000       | $600            |
| **Total**| **165**   | **157**   | **$87,000**   | **$527**       |

**Graphs**:
1. Bar Chart: Total payments by carrier
2. Pie Chart: Jobs distribution by carrier
3. Line Chart: Payments over time

---

### Example 5: Financial Report

**Period**: January 2024 - December 2024

**Revenue**:
- Total Carrier Payments: $87,000

**Expenses**:
- Total Fuel: $45,000
- Total Maintenance: $18,000
- **Total Expenses**: $63,000

**Summary**:
- Net Profit: $24,000
- Profit Margin: 27.6%
- Average Expense per Route: $350
- Average Expense per Mile: $0.75

**Graphs**:
1. Bar Chart: Revenue vs Expenses
2. Line Chart: Profit trend over time
3. Gauge Chart: Profit margin

---

## Implementation Notes

### Database Queries

#### Driver Summary Query
```javascript
// Get driver routes
const routes = await Route.find({ driverId: driverId })
  .populate('truckId', 'truckNumber make model year')
  .populate('stops.transportJobId', 'jobNumber carrierPayment');

// Get driver expenses
const expenses = await Expense.find({ driverId: driverId });

// Calculate totals
const totalRoutes = routes.length;
const totalDistance = routes.reduce((sum, r) => sum + (r.actualDistanceTraveled || r.totalDistance?.value * 0.000621371 || 0), 0);
const totalExpenses = expenses.reduce((sum, e) => sum + e.totalCost, 0);
```

#### Truck Summary Query
```javascript
// Get truck routes
const routes = await Route.find({ truckId: truckId })
  .populate('driverId', 'firstName lastName email')
  .populate('stops.transportJobId', 'jobNumber carrierPayment');

// Get truck expenses
const expenses = await Expense.find({ truckId: truckId });

// Calculate totals
const totalRoutes = routes.length;
const totalDistance = routes.reduce((sum, r) => sum + (r.actualDistanceTraveled || r.totalDistance?.value * 0.000621371 || 0), 0);
const totalExpenses = expenses.reduce((sum, e) => sum + e.totalCost, 0);
```

#### Route Complete Query
```javascript
// Get route with all relationships
const route = await Route.findById(routeId)
  .populate('driverId', 'firstName lastName email phoneNumber')
  .populate('truckId', 'truckNumber licensePlate make model year')
  .populate({
    path: 'stops.transportJobId',
    populate: {
      path: 'vehicleId',
      select: 'vin year make model'
    }
  });

// Get route expenses
const expenses = await Expense.find({ routeId: routeId });

// Calculate totals
const totalExpenses = expenses.reduce((sum, e) => sum + e.totalCost, 0);
const totalCarrierPayments = route.stops
  .filter(s => s.transportJobId && s.transportJobId.carrierPayment)
  .reduce((sum, s) => sum + s.transportJobId.carrierPayment, 0);
```

### API Endpoints Structure

```
GET /api/reports/driver/:driverId/summary
GET /api/reports/driver/:driverId/routes
GET /api/reports/driver/:driverId/transport-jobs
GET /api/reports/driver/:driverId/expenses
GET /api/reports/driver/:driverId/performance

GET /api/reports/truck/:truckId/summary
GET /api/reports/truck/:truckId/routes
GET /api/reports/truck/:truckId/transport-jobs
GET /api/reports/truck/:truckId/expenses
GET /api/reports/truck/:truckId/performance

GET /api/reports/route/:routeId/complete
GET /api/reports/route/:routeId/expenses
GET /api/reports/route/:routeId/transport-jobs

GET /api/reports/transport-job/:jobId/complete

GET /api/reports/carrier/summary
GET /api/reports/carrier/:carrierName/detailed

GET /api/reports/financial/expense-summary
GET /api/reports/financial/revenue-vs-expenses
```

### Date Range Filtering

All reports should support optional date range filtering:
- `startDate`: ISO date string
- `endDate`: ISO date string

Apply filters to:
- Route creation dates
- Expense dates
- Transport job dates

---

## Conclusion

This documentation provides a comprehensive guide for implementing all report types in the VOS-PTG system. Each report type includes:
- Purpose and use case
- Data points to display
- Entity relationships
- Calculation formulas
- Graph/visualization recommendations
- Example outputs

Use this document as a reference when implementing the reporting features.


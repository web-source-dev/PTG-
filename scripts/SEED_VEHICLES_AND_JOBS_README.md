# Seed Vehicles and Transport Jobs Script

This script creates sample data for testing the PTG application. It creates shippers, vehicles, and transport jobs **without creating any routes**.

## What It Creates

1. **5 Shippers** - Various shipping companies with contact information
2. **80 Vehicles** - Mix of different makes, models, and years
   - **50 vehicles with transport jobs** - These vehicles have status "Ready for Transport" and have associated transport jobs
   - **30 vehicles without transport jobs** - These vehicles are in "Intake Complete" status
3. **50 Transport Jobs** - One for each vehicle that should have a transport job
   - **All transport jobs have status "Needs Dispatch"** - Perfect for testing the dispatch flow
   - Random carrier payments between $500-$1500
   - Different transport purposes (initial_delivery, relocation, dealer_transfer, etc.)
   - Complete pickup and drop location information

## Important Notes

- **NO ROUTES ARE CREATED** - This script only creates vehicles and transport jobs
- All vehicles are linked to shippers
- Vehicles with transport jobs have their `currentTransportJobId` set
- Transport jobs have complete pickup and drop location details
- Random VINs are generated for each vehicle
- Random dates are assigned for pickup and drop schedules

## Usage

```bash
# From the backend directory
node scripts/seedVehiclesAndJobs.js
```

Or add to `package.json`:

```json
"seed:vehicles-jobs": "node scripts/seedVehiclesAndJobs.js"
```

Then run:

```bash
npm run seed:vehicles-jobs
```

## What Gets Cleared

By default, the script clears:
- All existing vehicles
- All existing transport jobs
- All existing shippers

**Note:** Routes are NOT cleared or affected by this script.

## Output

The script will output:
- Progress messages for each shipper, vehicle, and transport job created
- A summary at the end showing:
  - Total shippers created
  - Total vehicles created (with breakdown of vehicles with/without jobs)
  - Total transport jobs created
  - Total routes (should be 0 or whatever existed before)

## Status Configuration

- **Vehicles without transport jobs**: Status = "Intake Completed"
- **Vehicles with transport jobs**: Status = "Ready for Transport"
- **All transport jobs**: Status = "Needs Dispatch"

This configuration is perfect for testing the complete dispatch and route creation flow, as all transport jobs are ready to be dispatched.

## Customization

You can modify the script to:
- Change the number of vehicles created (currently 80 total: 50 with jobs, 30 without)
- Change the ratio of vehicles with/without jobs (currently 50 with, 30 without)
- Add more shippers
- Change the makes/models available
- Adjust the date ranges for pickup/drop schedules
- Modify carrier payment ranges

## Environment Variables

Make sure your `.env` file has:
```
MONGODB_URI=your_mongodb_connection_string
```


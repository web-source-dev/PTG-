# Shipper Migration Script

This script migrates existing shipper data from Vehicle models to the new Shipper model.

## What it does

1. **Finds vehicles** with shipper information (`shipperName`, `shipperCompany`, etc.) but no `shipperId`
2. **Groups vehicles** by unique shipper (using company + email or company + name as unique key)
3. **Creates Shipper profiles** for each unique shipper found
4. **Links vehicles** to the newly created shippers by updating `shipperId` field
5. **Updates statistics** for all shippers (total vehicles, delivered vehicles, routes, completed routes)

## How to run

### Option 1: Using npm script (recommended)
```bash
cd backend
npm run migrate:shippers
```

### Option 2: Direct node command
```bash
cd backend
node utils/migrateShippers.js
```

## Prerequisites

- MongoDB connection configured in `.env` file (`MONGODB_URI`)
- All required models are available (Vehicle, Shipper, TransportJob, Route)

## What to expect

The script will:
- Show progress as it processes vehicles
- Display how many unique shippers were found
- Show which shippers were created vs. already existed
- Update vehicle links to shippers
- Calculate and update statistics for all shippers
- Display a summary at the end

## Example output

```
🚀 Starting shipper migration...

✅ Connected to MongoDB

📊 Found 150 vehicles without shipper profiles

📦 Grouped into 45 unique shippers
⏭️  Skipped 5 vehicles without company name

🔍 Found 0 existing shippers in database

✅ Created shipper: ABC Company (John Doe)
   └─ Linked 3 vehicle(s) to shipper

✅ Created shipper: XYZ Corp (Jane Smith)
   └─ Linked 5 vehicle(s) to shipper

...

📊 Updating shipper statistics...

✅ Updated statistics for 45 shippers

============================================================
📋 MIGRATION SUMMARY
============================================================
Total vehicles processed: 150
Vehicles skipped (no company): 5
Unique shippers found: 45
New shippers created: 45
Shippers already existed: 0
Vehicles linked to shippers: 145
Errors encountered: 0
============================================================

✅ Migration completed successfully!
```

## Notes

- The script is **idempotent** - you can run it multiple times safely
- It will skip vehicles that already have a `shipperId`
- It will reuse existing shippers if they match (by company + email or company + name)
- Vehicles without a company name will be skipped
- The script handles duplicate shippers intelligently by grouping them

## Troubleshooting

If you encounter errors:
1. Check your MongoDB connection string in `.env`
2. Ensure all models are properly loaded
3. Check that the Vehicle model has the shipper fields (`shipperName`, `shipperCompany`, etc.)
4. Verify the Shipper model exists and is properly configured

## After migration

After running the migration:
- All vehicles should have a `shipperId` linking them to a Shipper profile
- You can view shippers in the `/shippers` page
- Shipper statistics will be automatically calculated
- New vehicles added through the intake form will automatically create/link shippers via the Vehicle model's pre-save hook


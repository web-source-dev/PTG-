const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import models
const Shipper = require('../models/Shipper');
const Vehicle = require('../models/Vehicle');
const TransportJob = require('../models/TransportJob');
const { VEHICLE_STATUS, TRANSPORT_JOB_STATUS } = require('../constants/status');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB Connected for seeding');
  } catch (error) {
    console.error('Database connection error:', error.message);
    process.exit(1);
  }
};

// Helper function to generate random VIN
const generateVIN = (index) => {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  let vin = '';
  for (let i = 0; i < 17; i++) {
    vin += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return vin;
};

// Helper function to get random element from array
const randomElement = (array) => array[Math.floor(Math.random() * array.length)];

// Seed function
const seedDatabase = async () => {
  try {
    await connectDB();

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('Clearing existing data...');
    await Vehicle.deleteMany({});
    await TransportJob.deleteMany({});
    await Shipper.deleteMany({});
    console.log('Existing data cleared');

    // Create Shippers
    console.log('Creating shippers...');
    const shippers = [];
    
    const shipperData = [
      {
        shipperName: 'John Smith',
        shipperCompany: 'Auto Transport Co',
        shipperEmail: 'john.smith@autotransport.com',
        shipperPhone: '555-1001',
        address: '123 Main Street',
        city: 'New York',
        state: 'NY',
        zipCode: '10001'
      },
      {
        shipperName: 'Sarah Johnson',
        shipperCompany: 'Car Dealers United',
        shipperEmail: 'sarah.johnson@cardealers.com',
        shipperPhone: '555-1002',
        address: '456 Commerce Blvd',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90001'
      },
      {
        shipperName: 'Michael Brown',
        shipperCompany: 'Auction House Inc',
        shipperEmail: 'michael.brown@auction.com',
        shipperPhone: '555-1003',
        address: '789 Auction Way',
        city: 'Chicago',
        state: 'IL',
        zipCode: '60601'
      },
      {
        shipperName: 'Emily Davis',
        shipperCompany: 'Vehicle Logistics LLC',
        shipperEmail: 'emily.davis@vehiclogistics.com',
        shipperPhone: '555-1004',
        address: '321 Transport Ave',
        city: 'Houston',
        state: 'TX',
        zipCode: '77001'
      },
      {
        shipperName: 'David Wilson',
        shipperCompany: 'Fleet Management Group',
        shipperEmail: 'david.wilson@fleetmgmt.com',
        shipperPhone: '555-1005',
        address: '654 Fleet Street',
        city: 'Phoenix',
        state: 'AZ',
        zipCode: '85001'
      }
    ];

    for (const data of shipperData) {
      const shipper = await Shipper.create(data);
      shippers.push(shipper);
      console.log(`Created shipper: ${shipper.shipperName} (${shipper.shipperCompany})`);
    }

    console.log(`Created ${shippers.length} shippers`);

    // Vehicle makes and models
    const makes = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen', 'Hyundai'];
    const models = {
      'Toyota': ['Camry', 'Corolla', 'RAV4', 'Highlander', 'Prius'],
      'Honda': ['Civic', 'Accord', 'CR-V', 'Pilot', 'Odyssey'],
      'Ford': ['F-150', 'Mustang', 'Explorer', 'Escape', 'Edge'],
      'Chevrolet': ['Silverado', 'Equinox', 'Tahoe', 'Malibu', 'Traverse'],
      'Nissan': ['Altima', 'Sentra', 'Rogue', 'Pathfinder', 'Armada'],
      'BMW': ['3 Series', '5 Series', 'X3', 'X5', 'X7'],
      'Mercedes-Benz': ['C-Class', 'E-Class', 'GLC', 'GLE', 'S-Class'],
      'Audi': ['A4', 'A6', 'Q5', 'Q7', 'A3'],
      'Volkswagen': ['Jetta', 'Passat', 'Tiguan', 'Atlas', 'Golf'],
      'Hyundai': ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Palisade']
    };

    const years = [2020, 2021, 2022, 2023, 2024];
    // Only use specific statuses for testing
    // Vehicles without jobs: INTAKE_COMPLETE
    // Vehicles with jobs: READY_FOR_TRANSPORT
    // All transport jobs: NEEDS_DISPATCH

    // Cities and states for locations
    const locations = [
      { city: 'New York', state: 'NY', zip: '10001' },
      { city: 'Los Angeles', state: 'CA', zip: '90001' },
      { city: 'Chicago', state: 'IL', zip: '60601' },
      { city: 'Houston', state: 'TX', zip: '77001' },
      { city: 'Phoenix', state: 'AZ', zip: '85001' },
      { city: 'Philadelphia', state: 'PA', zip: '19101' },
      { city: 'San Antonio', state: 'TX', zip: '78201' },
      { city: 'San Diego', state: 'CA', zip: '92101' },
      { city: 'Dallas', state: 'TX', zip: '75201' },
      { city: 'San Jose', state: 'CA', zip: '95101' }
    ];

    const dropDestinationTypes = ['PF', 'Auction', 'Other'];

    // Create Vehicles
    console.log('\nCreating vehicles...');
    const vehicles = [];
    const vehiclesWithJobs = [];
    const vehiclesWithoutJobs = [];

    // Create 50 vehicles with transport jobs (status: Ready for Transport)
    for (let i = 0; i < 50; i++) {
      const make = randomElement(makes);
      const model = randomElement(models[make]);
      const year = randomElement(years);
      const shipper = randomElement(shippers);
      const pickupLocation = randomElement(locations);
      const dropLocation = randomElement(locations);
      const dropDestType = randomElement(dropDestinationTypes);
      // Vehicles with transport jobs should be "Ready for Transport"
      const status = VEHICLE_STATUS.READY_FOR_TRANSPORT;

      const vehicle = await Vehicle.create({
        vin: generateVIN(i),
        year: year,
        make: make,
        model: model,
        shipperId: shipper._id,
        shipperName: shipper.shipperName,
        shipperCompany: shipper.shipperCompany,
        shipperEmail: shipper.shipperEmail,
        shipperPhone: shipper.shipperPhone,
        submissionDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
        initialPickupLocationName: `${pickupLocation.city} Auto Center`,
        initialPickupCity: pickupLocation.city,
        initialPickupState: pickupLocation.state,
        initialPickupZip: pickupLocation.zip,
        initialPickupContactName: `Contact ${i + 1}`,
        initialPickupContactPhone: `555-${String(i + 1).padStart(4, '0')}`,
        initialDropDestinationType: dropDestType,
        initialDropLocationName: `${dropLocation.city} ${dropDestType === 'PF' ? 'Processing Facility' : dropDestType === 'Auction' ? 'Auction House' : 'Dealership'}`,
        initialDropCity: dropLocation.city,
        initialDropState: dropLocation.state,
        initialDropZip: dropLocation.zip,
        initialDropContactName: `Drop Contact ${i + 1}`,
        initialDropContactPhone: `555-${String(i + 2000 + i).padStart(4, '0')}`,
        status: status,
        notes: `Vehicle ${i + 1} notes - ${make} ${model} ${year}`
      });

      vehicles.push(vehicle);
      vehiclesWithJobs.push(vehicle);
      console.log(`Created vehicle ${i + 1}/50 with transport job: ${year} ${make} ${model} (VIN: ${vehicle.vin})`);
    }

    // Create 30 vehicles without transport jobs (status: Intake Complete)
    for (let i = 0; i < 30; i++) {
      const make = randomElement(makes);
      const model = randomElement(models[make]);
      const year = randomElement(years);
      const shipper = randomElement(shippers);
      const pickupLocation = randomElement(locations);
      const dropLocation = randomElement(locations);
      const dropDestType = randomElement(dropDestinationTypes);

      const vehicle = await Vehicle.create({
        vin: generateVIN(50 + i),
        year: year,
        make: make,
        model: model,
        shipperId: shipper._id,
        shipperName: shipper.shipperName,
        shipperCompany: shipper.shipperCompany,
        shipperEmail: shipper.shipperEmail,
        shipperPhone: shipper.shipperPhone,
        submissionDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        initialPickupLocationName: `${pickupLocation.city} Auto Center`,
        initialPickupCity: pickupLocation.city,
        initialPickupState: pickupLocation.state,
        initialPickupZip: pickupLocation.zip,
        initialPickupContactName: `Contact ${50 + i + 1}`,
        initialPickupContactPhone: `555-${String(50 + i + 1).padStart(4, '0')}`,
        initialDropDestinationType: dropDestType,
        initialDropLocationName: `${dropLocation.city} ${dropDestType === 'PF' ? 'Processing Facility' : dropDestType === 'Auction' ? 'Auction House' : 'Dealership'}`,
        initialDropCity: dropLocation.city,
        initialDropState: dropLocation.state,
        initialDropZip: dropLocation.zip,
        initialDropContactName: `Drop Contact ${50 + i + 1}`,
        initialDropContactPhone: `555-${String(3000 + i).padStart(4, '0')}`,
        status: VEHICLE_STATUS.INTAKE_COMPLETE,
        notes: `Vehicle ${50 + i + 1} notes - ${make} ${model} ${year} (No transport job)`
      });

      vehicles.push(vehicle);
      vehiclesWithoutJobs.push(vehicle);
      console.log(`Created vehicle ${50 + i + 1}/80 without transport job: ${year} ${make} ${model} (VIN: ${vehicle.vin})`);
    }

    console.log(`\nCreated ${vehicles.length} vehicles (${vehiclesWithJobs.length} with jobs, ${vehiclesWithoutJobs.length} without jobs)`);

    // Create Transport Jobs for vehicles that should have them
    console.log('\nCreating transport jobs...');
    const transportJobs = [];

    for (let i = 0; i < vehiclesWithJobs.length; i++) {
      const vehicle = vehiclesWithJobs[i];
      const pickupLocation = {
        city: vehicle.initialPickupCity,
        state: vehicle.initialPickupState,
        zip: vehicle.initialPickupZip
      };
      const dropLocation = {
        city: vehicle.initialDropCity,
        state: vehicle.initialDropState,
        zip: vehicle.initialDropZip
      };

      // Generate random dates
      const pickupDateStart = new Date(Date.now() + Math.random() * 14 * 24 * 60 * 60 * 1000); // Within next 14 days
      const pickupDateEnd = new Date(pickupDateStart.getTime() + 24 * 60 * 60 * 1000); // 1 day later
      const dropDateStart = new Date(pickupDateEnd.getTime() + Math.random() * 3 * 24 * 60 * 60 * 1000); // 1-3 days after pickup
      const dropDateEnd = new Date(dropDateStart.getTime() + 24 * 60 * 60 * 1000);

      const transportJob = await TransportJob.create({
        vehicleId: vehicle._id,
        status: TRANSPORT_JOB_STATUS.NEEDS_DISPATCH, // All transport jobs should be "Needs Dispatch"
        carrier: 'PTG',
        carrierPayment: Math.floor(Math.random() * 1000) + 500, // Random payment between 500-1500
        transportPurpose: randomElement(['initial_delivery', 'relocation', 'dealer_transfer', 'auction', 'service', 'redistribution']),
        pickupLocationName: vehicle.initialPickupLocationName,
        pickupCity: pickupLocation.city,
        pickupState: pickupLocation.state,
        pickupZip: pickupLocation.zip,
        pickupFormattedAddress: `${vehicle.initialPickupLocationName}, ${pickupLocation.city}, ${pickupLocation.state} ${pickupLocation.zip}`,
        pickupContactName: vehicle.initialPickupContactName,
        pickupContactPhone: vehicle.initialPickupContactPhone,
        pickupDateStart: pickupDateStart,
        pickupDateEnd: pickupDateEnd,
        pickupTimeStart: '09:00',
        pickupTimeEnd: '17:00',
        dropDestinationType: vehicle.initialDropDestinationType,
        dropLocationName: vehicle.initialDropLocationName,
        dropCity: dropLocation.city,
        dropState: dropLocation.state,
        dropZip: dropLocation.zip,
        dropFormattedAddress: `${vehicle.initialDropLocationName}, ${dropLocation.city}, ${dropLocation.state} ${dropLocation.zip}`,
        dropContactName: vehicle.initialDropContactName,
        dropContactPhone: vehicle.initialDropContactPhone,
        dropDateStart: dropDateStart,
        dropDateEnd: dropDateEnd,
        dropTimeStart: '09:00',
        dropTimeEnd: '17:00'
      });

      // Update vehicle to link transport job
      vehicle.currentTransportJobId = transportJob._id;
      vehicle.transportJobs = [{
        transportJobId: transportJob._id,
        status: 'pending',
        transportPurpose: transportJob.transportPurpose,
        createdAt: new Date()
      }];
      await vehicle.save();

      transportJobs.push(transportJob);
      console.log(`Created transport job ${i + 1}/${vehiclesWithJobs.length} for vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model} (Job: ${transportJob.jobNumber}, Status: ${transportJob.status})`);
    }

    console.log(`\nCreated ${transportJobs.length} transport jobs`);

    // Summary
    console.log('\n✅ Database seeded successfully!');
    console.log('\nSummary:');
    console.log(`- Shippers: ${await Shipper.countDocuments()}`);
    console.log(`- Vehicles: ${await Vehicle.countDocuments()}`);
    console.log(`  - Vehicles with transport jobs: ${vehiclesWithJobs.length}`);
    console.log(`  - Vehicles without transport jobs: ${vehiclesWithoutJobs.length}`);
    console.log(`- Transport Jobs: ${await TransportJob.countDocuments()}`);
    console.log(`- Routes: ${await mongoose.model('Route').countDocuments()}`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

// Run seed
seedDatabase();


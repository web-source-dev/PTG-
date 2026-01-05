/**
 * Database Seed Script
 * 
 * This script populates the database with sample data for testing and development.
 * Run with: node scripts/seed.js
 * 
 * To clear existing data first, run: node scripts/seed.js --clear
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

// Load environment variables
dotenv.config();

// Import models
const User = require('../models/User');
const Truck = require('../models/Truck');
const Vehicle = require('../models/Vehicle');
const TransportJob = require('../models/TransportJob');
const Route = require('../models/Route');

// Import status constants
const {
  ROUTE_STATUS,
  ROUTE_STOP_STATUS,
  ROUTE_STOP_TYPE,
  TRANSPORT_JOB_STATUS,
  TRUCK_STATUS,
  VEHICLE_STATUS,
  TRUCK_CAPACITY,
  CARRIER
} = require('../constants/status');

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    process.exit(1);
  }
};

// Clear all collections
const clearDatabase = async () => {
  try {
    console.log('🗑️  Clearing existing data...');
    await Route.deleteMany({});
    await TransportJob.deleteMany({});
    await Vehicle.deleteMany({});
    await Truck.deleteMany({});
    await User.deleteMany({});
    console.log('✅ Database cleared');
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    throw error;
  }
};

// Create sample users
const createUsers = async () => {
  try {
    console.log('👥 Creating users...');
    
    const hashedPassword = await bcrypt.hash('Password123!', 12);
    
    const users = [
      {
        email: 'admin@ptg.com',
        password: hashedPassword,
        firstName: 'John',
        lastName: 'Admin',
        phoneNumber: '555-0101',
        role: 'ptgAdmin',
        emailVerified: true
      },
      {
        email: 'dispatcher@ptg.com',
        password: hashedPassword,
        firstName: 'Sarah',
        lastName: 'Dispatcher',
        phoneNumber: '555-0102',
        role: 'ptgDispatcher',
        emailVerified: true
      },
      {
        email: 'driver1@ptg.com',
        password: hashedPassword,
        firstName: 'Mike',
        lastName: 'Driver',
        phoneNumber: '555-0201',
        role: 'ptgDriver',
        emailVerified: true
      },
      {
        email: 'driver2@ptg.com',
        password: hashedPassword,
        firstName: 'David',
        lastName: 'Smith',
        phoneNumber: '555-0202',
        role: 'ptgDriver',
        emailVerified: true
      },
      {
        email: 'driver3@ptg.com',
        password: hashedPassword,
        firstName: 'James',
        lastName: 'Wilson',
        phoneNumber: '555-0203',
        role: 'ptgDriver',
        emailVerified: true
      }
    ];

    const createdUsers = await User.insertMany(users);
    console.log(`✅ Created ${createdUsers.length} users`);
    return createdUsers;
  } catch (error) {
    console.error('❌ Error creating users:', error);
    throw error;
  }
};

// Create sample trucks
const createTrucks = async () => {
  try {
    console.log('🚚 Creating trucks...');
    
    const trucks = [
      {
        truckNumber: 'TRK-001',
        licensePlate: 'ABC-1234',
        make: 'Freightliner',
        model: 'Cascadia',
        year: 2022,
        capacity: TRUCK_CAPACITY.DOUBLE,
        status: TRUCK_STATUS.AVAILABLE
      },
      {
        truckNumber: 'TRK-002',
        licensePlate: 'XYZ-5678',
        make: 'Peterbilt',
        model: '579',
        year: 2021,
        capacity: TRUCK_CAPACITY.TRIPLE,
        status: TRUCK_STATUS.AVAILABLE
      },
      {
        truckNumber: 'TRK-003',
        licensePlate: 'DEF-9012',
        make: 'Kenworth',
        model: 'T680',
        year: 2023,
        capacity: TRUCK_CAPACITY.SINGLE,
        status: TRUCK_STATUS.IN_USE
      },
      {
        truckNumber: 'TRK-004',
        licensePlate: 'GHI-3456',
        make: 'Volvo',
        model: 'VNL',
        year: 2020,
        capacity: TRUCK_CAPACITY.QUAD,
        status: TRUCK_STATUS.AVAILABLE
      },
      {
        truckNumber: 'TRK-005',
        licensePlate: 'JKL-7890',
        make: 'Mack',
        model: 'Anthem',
        year: 2022,
        capacity: TRUCK_CAPACITY.DOUBLE,
        status: TRUCK_STATUS.MAINTENANCE
      }
    ];

    const createdTrucks = await Truck.insertMany(trucks);
    console.log(`✅ Created ${createdTrucks.length} trucks`);
    return createdTrucks;
  } catch (error) {
    console.error('❌ Error creating trucks:', error);
    throw error;
  }
};

// Create sample vehicles
const createVehicles = async () => {
  try {
    console.log('🚗 Creating vehicles...');
    
    const vehicles = [
      {
        vin: '1HGBH41JXMN109186',
        year: 2020,
        make: 'Honda',
        model: 'Civic',
        purchaseSource: 'Auction',
        purchaseDate: new Date('2024-01-15'),
        purchasePrice: 15000,
        buyerName: 'John Buyer',
        pickupLocationName: 'Auction House 1',
        pickupCity: 'Dallas',
        pickupState: 'TX',
        pickupZip: '75201',
        pickupContactName: 'Mike Contact',
        pickupContactPhone: '555-1001',
        availableToShipDate: new Date('2024-01-20'),
        twicRequired: false,
        dropDestinationType: 'Auction',
        dropLocationName: 'Auction House 2',
        dropCity: 'Phoenix',
        dropState: 'AZ',
        dropZip: '85001',
        dropContactName: 'Sarah Contact',
        dropContactPhone: '555-2001',
        status: VEHICLE_STATUS.INTAKE_COMPLETE,
        source: 'PTG'
      },
      {
        vin: '2HGFC2F59MH501234',
        year: 2021,
        make: 'Toyota',
        model: 'Camry',
        purchaseSource: 'Dealer',
        purchaseDate: new Date('2024-01-18'),
        purchasePrice: 18000,
        buyerName: 'Jane Buyer',
        pickupLocationName: 'Dealer Lot 1',
        pickupCity: 'Houston',
        pickupState: 'TX',
        pickupZip: '77001',
        pickupContactName: 'Tom Contact',
        pickupContactPhone: '555-1002',
        availableToShipDate: new Date('2024-01-22'),
        twicRequired: false,
        dropDestinationType: 'PF',
        dropLocationName: 'Port Facility 1',
        dropCity: 'Los Angeles',
        dropState: 'CA',
        dropZip: '90001',
        dropContactName: 'Lisa Contact',
        dropContactPhone: '555-2002',
        status: VEHICLE_STATUS.INTAKE_COMPLETE,
        source: 'PTG'
      },
      {
        vin: '3VW2B7AJ5HM123456',
        year: 2019,
        make: 'Volkswagen',
        model: 'Jetta',
        purchaseSource: 'Auction',
        purchaseDate: new Date('2024-01-20'),
        purchasePrice: 14000,
        buyerName: 'Bob Buyer',
        pickupLocationName: 'Auction House 3',
        pickupCity: 'Atlanta',
        pickupState: 'GA',
        pickupZip: '30301',
        pickupContactName: 'Chris Contact',
        pickupContactPhone: '555-1003',
        availableToShipDate: new Date('2024-01-25'),
        twicRequired: true,
        dropDestinationType: 'Auction',
        dropLocationName: 'Auction House 4',
        dropCity: 'Miami',
        dropState: 'FL',
        dropZip: '33101',
        dropContactName: 'Pat Contact',
        dropContactPhone: '555-2003',
        status: VEHICLE_STATUS.INTAKE_COMPLETE,
        source: 'PTG'
      },
      {
        vin: '4T1BF1FK5EU234567',
        year: 2022,
        make: 'Toyota',
        model: 'Corolla',
        purchaseSource: 'Dealer',
        purchaseDate: new Date('2024-01-22'),
        purchasePrice: 20000,
        buyerName: 'Alice Buyer',
        pickupLocationName: 'Dealer Lot 2',
        pickupCity: 'Chicago',
        pickupState: 'IL',
        pickupZip: '60601',
        pickupContactName: 'Sam Contact',
        pickupContactPhone: '555-1004',
        availableToShipDate: new Date('2024-01-27'),
        twicRequired: false,
        dropDestinationType: 'Other',
        dropLocationName: 'Custom Location',
        dropCity: 'Denver',
        dropState: 'CO',
        dropZip: '80201',
        dropContactName: 'Alex Contact',
        dropContactPhone: '555-2004',
        status: VEHICLE_STATUS.INTAKE_COMPLETE,
        source: 'PTG'
      },
      {
        vin: '5YJ3E1EB2KF345678',
        year: 2023,
        make: 'Ford',
        model: 'F-150',
        purchaseSource: 'Auction',
        purchaseDate: new Date('2024-01-25'),
        purchasePrice: 35000,
        buyerName: 'Charlie Buyer',
        pickupLocationName: 'Auction House 5',
        pickupCity: 'Seattle',
        pickupState: 'WA',
        pickupZip: '98101',
        pickupContactName: 'Rob Contact',
        pickupContactPhone: '555-1005',
        availableToShipDate: new Date('2024-01-30'),
        twicRequired: false,
        dropDestinationType: 'Auction',
        dropLocationName: 'Auction House 6',
        dropCity: 'Portland',
        dropState: 'OR',
        dropZip: '97201',
        dropContactName: 'Kim Contact',
        dropContactPhone: '555-2005',
        status: VEHICLE_STATUS.INTAKE_COMPLETE,
        source: 'PTG'
      },
      {
        vin: '6G1BF5F30JX456789',
        year: 2021,
        make: 'Chevrolet',
        model: 'Malibu',
        purchaseSource: 'Dealer',
        purchaseDate: new Date('2024-02-01'),
        purchasePrice: 16000,
        buyerName: 'Diana Buyer',
        pickupLocationName: 'Dealer Lot 3',
        pickupCity: 'Boston',
        pickupState: 'MA',
        pickupZip: '02101',
        pickupContactName: 'Dan Contact',
        pickupContactPhone: '555-1006',
        availableToShipDate: new Date('2024-02-05'),
        twicRequired: false,
        dropDestinationType: 'PF',
        dropLocationName: 'Port Facility 2',
        dropCity: 'New York',
        dropState: 'NY',
        dropZip: '10001',
        dropContactName: 'Emma Contact',
        dropContactPhone: '555-2006',
        status: VEHICLE_STATUS.INTAKE_COMPLETE,
        source: 'PTG'
      },
      {
        vin: '7G1BF5F30JX567890',
        year: 2020,
        make: 'Nissan',
        model: 'Altima',
        purchaseSource: 'Auction',
        purchaseDate: new Date('2024-02-03'),
        purchasePrice: 14500,
        buyerName: 'Frank Buyer',
        pickupLocationName: 'Auction House 7',
        pickupCity: 'Nashville',
        pickupState: 'TN',
        pickupZip: '37201',
        pickupContactName: 'Gary Contact',
        pickupContactPhone: '555-1007',
        availableToShipDate: new Date('2024-02-08'),
        twicRequired: true,
        dropDestinationType: 'Auction',
        dropLocationName: 'Auction House 8',
        dropCity: 'Charlotte',
        dropState: 'NC',
        dropZip: '28201',
        dropContactName: 'Helen Contact',
        dropContactPhone: '555-2007',
        status: VEHICLE_STATUS.INTAKE_COMPLETE,
        source: 'PTG'
      },
      {
        vin: '8G1BF5F30JX678901',
        year: 2022,
        make: 'Hyundai',
        model: 'Elantra',
        purchaseSource: 'Dealer',
        purchaseDate: new Date('2024-02-05'),
        purchasePrice: 17000,
        buyerName: 'Ivy Buyer',
        pickupLocationName: 'Dealer Lot 4',
        pickupCity: 'Detroit',
        pickupState: 'MI',
        pickupZip: '48201',
        pickupContactName: 'Ian Contact',
        pickupContactPhone: '555-1008',
        availableToShipDate: new Date('2024-02-10'),
        twicRequired: false,
        dropDestinationType: 'Other',
        dropLocationName: 'Custom Location 2',
        dropCity: 'Minneapolis',
        dropState: 'MN',
        dropZip: '55401',
        dropContactName: 'Jack Contact',
        dropContactPhone: '555-2008',
        status: VEHICLE_STATUS.INTAKE_COMPLETE,
        source: 'PTG'
      }
    ];

    const createdVehicles = await Vehicle.insertMany(vehicles);
    console.log(`✅ Created ${createdVehicles.length} vehicles`);
    return createdVehicles;
  } catch (error) {
    console.error('❌ Error creating vehicles:', error);
    throw error;
  }
};

// Create sample transport jobs
const createTransportJobs = async (vehicles) => {
  try {
    console.log('📦 Creating transport jobs...');
    
    const now = new Date();
    const transportJobs = [
      {
        vehicleId: vehicles[0]._id,
        status: TRANSPORT_JOB_STATUS.NEEDS_DISPATCH,
        carrier: CARRIER.PTG,
        plannedPickupDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        plannedPickupTimeStart: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000), // 8 AM
        plannedPickupTimeEnd: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000), // 5 PM
        plannedDeliveryDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        plannedDeliveryTimeStart: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
        plannedDeliveryTimeEnd: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000),
        carrierPayment: 1200
      },
      {
        vehicleId: vehicles[1]._id,
        status: TRANSPORT_JOB_STATUS.NEEDS_DISPATCH,
        carrier: CARRIER.PTG,
        plannedPickupDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        plannedPickupTimeStart: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000),
        plannedPickupTimeEnd: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000 + 18 * 60 * 60 * 1000),
        plannedDeliveryDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        plannedDeliveryTimeStart: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000),
        plannedDeliveryTimeEnd: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 18 * 60 * 60 * 1000),
        carrierPayment: 1500
      },
      {
        vehicleId: vehicles[2]._id,
        status: TRANSPORT_JOB_STATUS.DISPATCHED,
        carrier: CARRIER.PTG,
        plannedPickupDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
        plannedPickupTimeStart: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000),
        plannedPickupTimeEnd: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000 + 16 * 60 * 60 * 1000),
        plannedDeliveryDate: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
        plannedDeliveryTimeStart: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000),
        plannedDeliveryTimeEnd: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000 + 16 * 60 * 60 * 1000),
        carrierPayment: 1100
      },
      {
        vehicleId: vehicles[3]._id,
        status: TRANSPORT_JOB_STATUS.IN_TRANSIT,
        carrier: CARRIER.PTG,
        plannedPickupDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        plannedPickupTimeStart: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
        plannedPickupTimeEnd: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000),
        actualPickupDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        actualPickupTime: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000),
        plannedDeliveryDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        plannedDeliveryTimeStart: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
        plannedDeliveryTimeEnd: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000),
        carrierPayment: 1800
      },
      {
        vehicleId: vehicles[4]._id,
        status: TRANSPORT_JOB_STATUS.DELIVERED,
        carrier: CARRIER.PTG,
        plannedPickupDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        plannedPickupTimeStart: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
        plannedPickupTimeEnd: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000),
        actualPickupDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        actualPickupTime: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000),
        plannedDeliveryDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        plannedDeliveryTimeStart: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
        plannedDeliveryTimeEnd: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000),
        actualDeliveryDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        actualDeliveryTime: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000),
        carrierPayment: 2200
      },
      {
        vehicleId: vehicles[5]._id,
        status: TRANSPORT_JOB_STATUS.NEEDS_DISPATCH,
        carrier: CARRIER.PTG,
        plannedPickupDate: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
        plannedPickupTimeStart: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000),
        plannedPickupTimeEnd: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000 + 19 * 60 * 60 * 1000),
        plannedDeliveryDate: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
        plannedDeliveryTimeStart: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000),
        plannedDeliveryTimeEnd: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000 + 19 * 60 * 60 * 1000),
        carrierPayment: 1300
      },
      {
        vehicleId: vehicles[6]._id,
        status: TRANSPORT_JOB_STATUS.NEEDS_DISPATCH,
        carrier: CARRIER.PTG,
        plannedPickupDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
        plannedPickupTimeStart: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
        plannedPickupTimeEnd: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000),
        plannedDeliveryDate: new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000),
        plannedDeliveryTimeStart: new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
        plannedDeliveryTimeEnd: new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000),
        carrierPayment: 1400
      }
    ];

    const createdJobs = await TransportJob.insertMany(transportJobs);
    console.log(`✅ Created ${createdJobs.length} transport jobs`);
    
    // Update vehicles with transport job IDs
    for (let i = 0; i < createdJobs.length && i < vehicles.length; i++) {
      await Vehicle.findByIdAndUpdate(vehicles[i]._id, {
        transportJobId: createdJobs[i]._id,
        status: VEHICLE_STATUS.READY_FOR_TRANSPORT
      });
    }
    
    return createdJobs;
  } catch (error) {
    console.error('❌ Error creating transport jobs:', error);
    throw error;
  }
};

// Create sample routes
const createRoutes = async (users, trucks, transportJobs) => {
  try {
    console.log(' Creating routes...');
    
    const drivers = users.filter(u => u.role === 'ptgDriver');
    const admin = users.find(u => u.role === 'ptgAdmin');
    
    const now = new Date();
    
    // Route 1: Planned route with multiple jobs
    const route1StartDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const route1EndDate = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
    
    const route1 = new Route({
      driverId: drivers[0]._id,
      truckId: trucks[0]._id,
      plannedStartDate: route1StartDate,
      plannedEndDate: route1EndDate,
      journeyStartLocation: {
        city: 'Dallas',
        state: 'TX',
        zip: '75201'
      },
      journeyEndLocation: {
        city: 'Phoenix',
        state: 'AZ',
        zip: '85001'
      },
      selectedTransportJobs: [transportJobs[0]._id, transportJobs[1]._id],
      status: ROUTE_STATUS.PLANNED,
      stops: [
        {
          stopType: ROUTE_STOP_TYPE.PICKUP,
          transportJobId: transportJobs[0]._id,
          sequence: 1,
          location: {
            city: 'Dallas',
            state: 'TX',
            zip: '75201'
          },
          scheduledDate: new Date(route1StartDate.getTime() + 0 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route1StartDate.getTime() + 8 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route1StartDate.getTime() + 17 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.PENDING
        },
        {
          stopType: ROUTE_STOP_TYPE.DROP,
          transportJobId: transportJobs[0]._id,
          sequence: 2,
          location: {
            city: 'Phoenix',
            state: 'AZ',
            zip: '85001'
          },
          scheduledDate: new Date(route1StartDate.getTime() + 3 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route1StartDate.getTime() + 3 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route1StartDate.getTime() + 3 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.PENDING
        },
        {
          stopType: ROUTE_STOP_TYPE.PICKUP,
          transportJobId: transportJobs[1]._id,
          sequence: 3,
          location: {
            city: 'Houston',
            state: 'TX',
            zip: '77001'
          },
          scheduledDate: new Date(route1StartDate.getTime() + 1 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route1StartDate.getTime() + 1 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route1StartDate.getTime() + 1 * 24 * 60 * 60 * 1000 + 18 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.PENDING
        },
        {
          stopType: ROUTE_STOP_TYPE.DROP,
          transportJobId: transportJobs[1]._id,
          sequence: 4,
          location: {
            city: 'Los Angeles',
            state: 'CA',
            zip: '90001'
          },
          scheduledDate: new Date(route1StartDate.getTime() + 4 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route1StartDate.getTime() + 4 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route1StartDate.getTime() + 4 * 24 * 60 * 60 * 1000 + 18 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.PENDING
        }
      ],
      createdBy: admin?._id
    });
    await route1.save();

    // Route 2: In Progress route
    const route2StartDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const route2EndDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    
    const route2 = new Route({
      driverId: drivers[1]._id,
      truckId: trucks[2]._id,
      plannedStartDate: route2StartDate,
      plannedEndDate: route2EndDate,
      actualStartDate: route2StartDate,
      journeyStartLocation: {
        city: 'Atlanta',
        state: 'GA',
        zip: '30301'
      },
      journeyEndLocation: {
        city: 'Miami',
        state: 'FL',
        zip: '33101'
      },
      selectedTransportJobs: [transportJobs[2]._id, transportJobs[3]._id],
      status: ROUTE_STATUS.IN_PROGRESS,
      stops: [
        {
          stopType: ROUTE_STOP_TYPE.PICKUP,
          transportJobId: transportJobs[2]._id,
          sequence: 1,
          location: {
            city: 'Atlanta',
            state: 'GA',
            zip: '30301'
          },
          scheduledDate: new Date(route2StartDate.getTime() + 0 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route2StartDate.getTime() + 10 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route2StartDate.getTime() + 16 * 60 * 60 * 1000),
          actualDate: new Date(route2StartDate.getTime() + 0 * 24 * 60 * 60 * 1000),
          actualTime: new Date(route2StartDate.getTime() + 11 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.COMPLETED
        },
        {
          stopType: ROUTE_STOP_TYPE.BREAK,
          sequence: 2,
          location: {
            city: 'Jacksonville',
            state: 'FL',
            zip: '32201'
          },
          scheduledDate: new Date(route2StartDate.getTime() + 1 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route2StartDate.getTime() + 1 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route2StartDate.getTime() + 1 * 24 * 60 * 60 * 1000 + 13 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.COMPLETED,
          notes: 'Lunch break'
        },
        {
          stopType: ROUTE_STOP_TYPE.DROP,
          transportJobId: transportJobs[2]._id,
          sequence: 3,
          location: {
            city: 'Miami',
            state: 'FL',
            zip: '33101'
          },
          scheduledDate: new Date(route2StartDate.getTime() + 2 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route2StartDate.getTime() + 2 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route2StartDate.getTime() + 2 * 24 * 60 * 60 * 1000 + 16 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.IN_PROGRESS
        },
        {
          stopType: ROUTE_STOP_TYPE.PICKUP,
          transportJobId: transportJobs[3]._id,
          sequence: 4,
          location: {
            city: 'Chicago',
            state: 'IL',
            zip: '60601'
          },
          scheduledDate: new Date(route2StartDate.getTime() + 3 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route2StartDate.getTime() + 3 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route2StartDate.getTime() + 3 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.PENDING
        },
        {
          stopType: ROUTE_STOP_TYPE.DROP,
          transportJobId: transportJobs[3]._id,
          sequence: 5,
          location: {
            city: 'Denver',
            state: 'CO',
            zip: '80201'
          },
          scheduledDate: new Date(route2StartDate.getTime() + 4 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route2StartDate.getTime() + 4 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route2StartDate.getTime() + 4 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.PENDING
        }
      ],
      createdBy: admin?._id
    });
    await route2.save();

    // Route 3: Completed route
    const route3StartDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const route3EndDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    
    const route3 = new Route({
      driverId: drivers[0]._id,
      truckId: trucks[1]._id,
      plannedStartDate: route3StartDate,
      plannedEndDate: route3EndDate,
      actualStartDate: route3StartDate,
      actualEndDate: route3EndDate,
      journeyStartLocation: {
        city: 'Seattle',
        state: 'WA',
        zip: '98101'
      },
      journeyEndLocation: {
        city: 'Portland',
        state: 'OR',
        zip: '97201'
      },
      selectedTransportJobs: [transportJobs[4]._id],
      status: ROUTE_STATUS.COMPLETED,
      stops: [
        {
          stopType: ROUTE_STOP_TYPE.PICKUP,
          transportJobId: transportJobs[4]._id,
          sequence: 1,
          location: {
            city: 'Seattle',
            state: 'WA',
            zip: '98101'
          },
          scheduledDate: new Date(route3StartDate.getTime() + 0 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route3StartDate.getTime() + 8 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route3StartDate.getTime() + 17 * 60 * 60 * 1000),
          actualDate: new Date(route3StartDate.getTime() + 0 * 24 * 60 * 60 * 1000),
          actualTime: new Date(route3StartDate.getTime() + 9 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.COMPLETED
        },
        {
          stopType: ROUTE_STOP_TYPE.REST,
          sequence: 2,
          location: {
            city: 'Tacoma',
            state: 'WA',
            zip: '98401'
          },
          scheduledDate: new Date(route3StartDate.getTime() + 2 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route3StartDate.getTime() + 2 * 24 * 60 * 60 * 1000 + 20 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route3StartDate.getTime() + 2 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.COMPLETED,
          notes: 'Overnight rest'
        },
        {
          stopType: ROUTE_STOP_TYPE.DROP,
          transportJobId: transportJobs[4]._id,
          sequence: 3,
          location: {
            city: 'Portland',
            state: 'OR',
            zip: '97201'
          },
          scheduledDate: new Date(route3StartDate.getTime() + 5 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route3StartDate.getTime() + 5 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route3StartDate.getTime() + 5 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000),
          actualDate: new Date(route3StartDate.getTime() + 5 * 24 * 60 * 60 * 1000),
          actualTime: new Date(route3StartDate.getTime() + 5 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.COMPLETED
        }
      ],
      createdBy: admin?._id
    });
    await route3.save();

    // Route 4: Planned route for future
    const route4StartDate = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    const route4EndDate = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000);
    
    const route4 = new Route({
      driverId: drivers[2]._id,
      truckId: trucks[3]._id,
      plannedStartDate: route4StartDate,
      plannedEndDate: route4EndDate,
      journeyStartLocation: {
        city: 'Boston',
        state: 'MA',
        zip: '02101'
      },
      journeyEndLocation: {
        city: 'New York',
        state: 'NY',
        zip: '10001'
      },
      selectedTransportJobs: [transportJobs[5]._id],
      status: ROUTE_STATUS.PLANNED,
      stops: [
        {
          stopType: ROUTE_STOP_TYPE.PICKUP,
          transportJobId: transportJobs[5]._id,
          sequence: 1,
          location: {
            city: 'Boston',
            state: 'MA',
            zip: '02101'
          },
          scheduledDate: new Date(route4StartDate.getTime() + 0 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route4StartDate.getTime() + 7 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route4StartDate.getTime() + 19 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.PENDING
        },
        {
          stopType: ROUTE_STOP_TYPE.DROP,
          transportJobId: transportJobs[5]._id,
          sequence: 2,
          location: {
            city: 'New York',
            state: 'NY',
            zip: '10001'
          },
          scheduledDate: new Date(route4StartDate.getTime() + 5 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route4StartDate.getTime() + 5 * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route4StartDate.getTime() + 5 * 24 * 60 * 60 * 1000 + 19 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.PENDING
        }
      ],
      createdBy: admin?._id
    });
    await route4.save();

    // Route 5: Another planned route
    const route5StartDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const route5EndDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    
    const route5 = new Route({
      driverId: drivers[0]._id,
      truckId: trucks[0]._id,
      plannedStartDate: route5StartDate,
      plannedEndDate: route5EndDate,
      journeyStartLocation: {
        city: 'Nashville',
        state: 'TN',
        zip: '37201'
      },
      journeyEndLocation: {
        city: 'Charlotte',
        state: 'NC',
        zip: '28201'
      },
      selectedTransportJobs: [transportJobs[6]._id],
      status: ROUTE_STATUS.PLANNED,
      stops: [
        {
          stopType: ROUTE_STOP_TYPE.PICKUP,
          transportJobId: transportJobs[6]._id,
          sequence: 1,
          location: {
            city: 'Nashville',
            state: 'TN',
            zip: '37201'
          },
          scheduledDate: new Date(route5StartDate.getTime() + 0 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route5StartDate.getTime() + 8 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route5StartDate.getTime() + 17 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.PENDING
        },
        {
          stopType: ROUTE_STOP_TYPE.DROP,
          transportJobId: transportJobs[6]._id,
          sequence: 2,
          location: {
            city: 'Charlotte',
            state: 'NC',
            zip: '28201'
          },
          scheduledDate: new Date(route5StartDate.getTime() + 5 * 24 * 60 * 60 * 1000),
          scheduledTimeStart: new Date(route5StartDate.getTime() + 5 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
          scheduledTimeEnd: new Date(route5StartDate.getTime() + 5 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000),
          status: ROUTE_STOP_STATUS.PENDING
        }
      ],
      createdBy: admin?._id
    });
    await route5.save();

    const createdRoutes = [route1, route2, route3, route4, route5];
    console.log(`✅ Created ${createdRoutes.length} routes`);

    // Update transport jobs with route IDs
    await TransportJob.findByIdAndUpdate(transportJobs[0]._id, { routeId: route1._id });
    await TransportJob.findByIdAndUpdate(transportJobs[1]._id, { routeId: route1._id });
    await TransportJob.findByIdAndUpdate(transportJobs[2]._id, { routeId: route2._id });
    await TransportJob.findByIdAndUpdate(transportJobs[3]._id, { routeId: route2._id });
    await TransportJob.findByIdAndUpdate(transportJobs[4]._id, { routeId: route3._id });
    await TransportJob.findByIdAndUpdate(transportJobs[5]._id, { routeId: route4._id });
    await TransportJob.findByIdAndUpdate(transportJobs[6]._id, { routeId: route5._id });

    // Update truck statuses
    await Truck.findByIdAndUpdate(trucks[0]._id, { 
      status: TRUCK_STATUS.IN_USE,
      currentDriver: drivers[0]._id
    });
    await Truck.findByIdAndUpdate(trucks[2]._id, { 
      status: TRUCK_STATUS.IN_USE,
      currentDriver: drivers[1]._id
    });
    await Truck.findByIdAndUpdate(trucks[3]._id, { 
      status: TRUCK_STATUS.IN_USE,
      currentDriver: drivers[2]._id
    });

    // Update vehicle statuses based on transport jobs
    const vehicles = await Vehicle.find({ transportJobId: { $in: transportJobs.map(j => j._id) } });
    for (const vehicle of vehicles) {
      const job = transportJobs.find(j => j._id.toString() === vehicle.transportJobId?.toString());
      if (job) {
        let vehicleStatus = VEHICLE_STATUS.READY_FOR_TRANSPORT;
        if (job.status === TRANSPORT_JOB_STATUS.IN_TRANSIT || job.status === TRANSPORT_JOB_STATUS.DISPATCHED) {
          vehicleStatus = VEHICLE_STATUS.IN_TRANSPORT;
        } else if (job.status === TRANSPORT_JOB_STATUS.DELIVERED) {
          vehicleStatus = VEHICLE_STATUS.DELIVERED;
        }
        await Vehicle.findByIdAndUpdate(vehicle._id, { status: vehicleStatus });
      }
    }

    return createdRoutes;
  } catch (error) {
    console.error('❌ Error creating routes:', error);
    throw error;
  }
};

// Main seed function
const seedDatabase = async () => {
  try {
    const shouldClear = process.argv.includes('--clear');
    
    if (shouldClear) {
      await clearDatabase();
    }

    console.log('🌱 Starting database seed...\n');

    // Create data in order (respecting dependencies)
    const users = await createUsers();
    const trucks = await createTrucks();
    const vehicles = await createVehicles();
    const transportJobs = await createTransportJobs(vehicles);
    const routes = await createRoutes(users, trucks, transportJobs);

    console.log('\n✅ Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Users: ${users.length}`);
    console.log(`   - Trucks: ${trucks.length}`);
    console.log(`   - Vehicles: ${vehicles.length}`);
    console.log(`   - Transport Jobs: ${transportJobs.length}`);
    console.log(`   - Routes: ${routes.length}`);
    console.log('\n🔑 Login Credentials:');
    console.log('   Admin: admin@ptg.com / Password123!');
    console.log('   Dispatcher: dispatcher@ptg.com / Password123!');
    console.log('   Driver 1: driver1@ptg.com / Password123!');
    console.log('   Driver 2: driver2@ptg.com / Password123!');
    console.log('   Driver 3: driver3@ptg.com / Password123!');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding database:', error);
    process.exit(1);
  }
};

// Run seed if called directly
if (require.main === module) {
  connectDB().then(() => {
    seedDatabase();
  });
}

module.exports = { seedDatabase, clearDatabase };


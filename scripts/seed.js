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
const Expense = require('../models/Expense');
const CalendarEvent = require('../models/CalendarEvent');
const RouteTracking = require('../models/routeTracker');

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

// Seed function
const seedDatabase = async () => {
  try {
    await connectDB();

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('Clearing existing data...');
    await User.deleteMany({});
    await Truck.deleteMany({});
    await Vehicle.deleteMany({});
    await TransportJob.deleteMany({});
    await Route.deleteMany({});
    await Expense.deleteMany({});
    await CalendarEvent.deleteMany({});
    await RouteTracking.deleteMany({});
    console.log('Existing data cleared');

    // Create Users
    console.log('Creating users...');
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash('password123', salt);

    const admin = await User.create({
      email: 'admin@ptg.com',
      password: hashedPassword,
      firstName: 'John',
      lastName: 'Admin',
      phoneNumber: '555-0101',
      address: '123 Admin Street',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'USA',
      role: 'ptgAdmin',
      emailVerified: true
    });

    const dispatcher = await User.create({
      email: 'dispatcher@ptg.com',
      password: hashedPassword,
      firstName: 'Sarah',
      lastName: 'Dispatcher',
      phoneNumber: '555-0102',
      address: '456 Dispatch Ave',
      city: 'New York',
      state: 'NY',
      zipCode: '10002',
      country: 'USA',
      role: 'ptgDispatcher',
      emailVerified: true
    });

    const driver1 = await User.create({
      email: 'driver1@ptg.com',
      password: hashedPassword,
      firstName: 'Mike',
      lastName: 'Driver',
      phoneNumber: '555-0201',
      address: '789 Driver Lane',
      city: 'Philadelphia',
      state: 'PA',
      zipCode: '19101',
      country: 'USA',
      role: 'ptgDriver',
      emailVerified: true,
      driverStats: {
        totalLoadsMoved: 15,
        totalDistanceTraveled: 2500
      }
    });

    const driver2 = await User.create({
      email: 'driver2@ptg.com',
      password: hashedPassword,
      firstName: 'David',
      lastName: 'Smith',
      phoneNumber: '555-0202',
      address: '321 Trucker Blvd',
      city: 'Baltimore',
      state: 'MD',
      zipCode: '21201',
      country: 'USA',
      role: 'ptgDriver',
      emailVerified: true,
      driverStats: {
        totalLoadsMoved: 22,
        totalDistanceTraveled: 3800
      }
    });

    const driver3 = await User.create({
      email: 'driver3@ptg.com',
      password: hashedPassword,
      firstName: 'James',
      lastName: 'Wilson',
      phoneNumber: '555-0203',
      address: '654 Highway Road',
      city: 'Boston',
      state: 'MA',
      zipCode: '02101',
      country: 'USA',
      role: 'ptgDriver',
      emailVerified: true,
      driverStats: {
        totalLoadsMoved: 8,
        totalDistanceTraveled: 1200
      }
    });

    console.log('Users created');

    // Create Trucks
    console.log('Creating trucks...');
    const truck1 = await Truck.create({
      truckNumber: 'TRK-001',
      licensePlate: 'NY-ABC123',
      make: 'Freightliner',
      model: 'Cascadia',
      year: 2022,
      loadCapacity: 45000,
      status: 'In Use',
      currentDriver: driver1._id,
      notes: 'Well maintained, excellent condition'
    });

    const truck2 = await Truck.create({
      truckNumber: 'TRK-002',
      licensePlate: 'PA-XYZ789',
      make: 'Peterbilt',
      model: '579',
      year: 2021,
      loadCapacity: 48000,
      status: 'In Use',
      currentDriver: driver2._id,
      notes: 'New tires installed last month'
    });

    const truck3 = await Truck.create({
      truckNumber: 'TRK-003',
      licensePlate: 'MD-DEF456',
      make: 'Kenworth',
      model: 'T680',
      year: 2023,
      loadCapacity: 46000,
      status: 'Available',
      notes: 'Brand new truck'
    });

    const truck4 = await Truck.create({
      truckNumber: 'TRK-004',
      licensePlate: 'NY-GHI789',
      make: 'Volvo',
      model: 'VNL',
      year: 2020,
      loadCapacity: 44000,
      status: 'Maintenance',
      notes: 'Scheduled maintenance'
    });

    console.log('Trucks created');

    // Create Vehicles (cars to transport)
    console.log('Creating vehicles...');
    const vehicle1 = await Vehicle.create({
      vin: '1HGBH41JXMN109186',
      year: 2023,
      make: 'Honda',
      model: 'Civic',
      shipperName: 'John Shipper',
      shipperCompany: 'Honda Dealership',
      shipperEmail: 'john.shipper@honda.com',
      shipperPhone: '555-1001',
      submissionDate: new Date('2024-01-15'),
      pickupLocationName: 'Honda Dealership',
      pickupCity: 'New York',
      pickupState: 'NY',
      pickupZip: '10001',
      pickupContactName: 'Mike Sales',
      pickupContactPhone: '555-1001',
      availableToShipDate: new Date('2024-01-20'),
      pickupDateStart: new Date('2024-01-25T08:00:00Z'),
      pickupDateEnd: new Date('2024-01-25T17:00:00Z'),
      pickupTimeStart: '08:00',
      pickupTimeEnd: '17:00',
      dropLocationName: 'Customer Location',
      dropCity: 'Philadelphia',
      dropState: 'PA',
      dropZip: '19101',
      dropContactName: 'Jane Customer',
      dropContactPhone: '555-2001',
      dropDateStart: new Date('2024-01-26T08:00:00Z'),
      dropDateEnd: new Date('2024-01-26T17:00:00Z'),
      dropTimeStart: '08:00',
      dropTimeEnd: '17:00',
      status: 'In Transport'
    });

    const vehicle2 = await Vehicle.create({
      vin: '5YJ3E1EB1KF123456',
      year: 2022,
      make: 'Toyota',
      model: 'Camry',
      shipperName: 'Sarah Shipper',
      shipperCompany: 'Auction House',
      shipperEmail: 'sarah.shipper@auction.com',
      shipperPhone: '555-1002',
      submissionDate: new Date('2024-01-10'),
      pickupLocationName: 'Auction House',
      pickupCity: 'Baltimore',
      pickupState: 'MD',
      pickupZip: '21201',
      pickupContactName: 'Tom Auction',
      pickupContactPhone: '555-1002',
      availableToShipDate: new Date('2024-01-18'),
      pickupDateStart: new Date('2024-01-22T09:00:00Z'),
      pickupDateEnd: new Date('2024-01-22T18:00:00Z'),
      pickupTimeStart: '09:00',
      pickupTimeEnd: '18:00',
      dropLocationName: 'Dealership',
      dropCity: 'Boston',
      dropState: 'MA',
      dropZip: '02101',
      dropContactName: 'Bob Dealer',
      dropContactPhone: '555-2002',
      dropDateStart: new Date('2024-01-23T09:00:00Z'),
      dropDateEnd: new Date('2024-01-23T18:00:00Z'),
      dropTimeStart: '09:00',
      dropTimeEnd: '18:00',
      status: 'In Transport'
    });

    const vehicle3 = await Vehicle.create({
      vin: 'WBA3A5C59EK123789',
      year: 2024,
      make: 'BMW',
      model: '3 Series',
      shipperName: 'Robert Shipper',
      shipperCompany: 'Private Sale',
      shipperEmail: 'robert.shipper@email.com',
      shipperPhone: '555-1003',
      submissionDate: new Date('2024-01-20'),
      pickupLocationName: 'Private Residence',
      pickupCity: 'Philadelphia',
      pickupState: 'PA',
      pickupZip: '19102',
      pickupContactName: 'Owner',
      pickupContactPhone: '555-1003',
      availableToShipDate: new Date('2024-01-25'),
      pickupDateStart: new Date('2024-01-28T10:00:00Z'),
      pickupDateEnd: new Date('2024-01-28T19:00:00Z'),
      pickupTimeStart: '10:00',
      pickupTimeEnd: '19:00',
      dropLocationName: 'BMW Service Center',
      dropCity: 'New York',
      dropState: 'NY',
      dropZip: '10002',
      dropContactName: 'Service Manager',
      dropContactPhone: '555-2003',
      dropDateStart: new Date('2024-01-29T10:00:00Z'),
      dropDateEnd: new Date('2024-01-29T19:00:00Z'),
      dropTimeStart: '10:00',
      dropTimeEnd: '19:00',
      status: 'Ready for Transport'
    });

    const vehicle4 = await Vehicle.create({
      vin: '1FTFW1ET5NFC12345',
      year: 2023,
      make: 'Ford',
      model: 'F-150',
      shipperName: 'Lisa Shipper',
      shipperCompany: 'Ford Dealership',
      shipperEmail: 'lisa.shipper@ford.com',
      shipperPhone: '555-1004',
      submissionDate: new Date('2024-01-12'),
      pickupLocationName: 'Ford Dealership',
      pickupCity: 'Boston',
      pickupState: 'MA',
      pickupZip: '02102',
      pickupContactName: 'Sales Manager',
      pickupContactPhone: '555-1004',
      availableToShipDate: new Date('2024-01-22'),
      pickupDateStart: new Date('2024-01-27T08:00:00Z'),
      pickupDateEnd: new Date('2024-01-27T17:00:00Z'),
      pickupTimeStart: '08:00',
      pickupTimeEnd: '17:00',
      dropLocationName: 'Customer Home',
      dropCity: 'Baltimore',
      dropState: 'MD',
      dropZip: '21202',
      dropContactName: 'Customer',
      dropContactPhone: '555-2004',
      dropDateStart: new Date('2024-01-28T08:00:00Z'),
      dropDateEnd: new Date('2024-01-28T17:00:00Z'),
      dropTimeStart: '08:00',
      dropTimeEnd: '17:00',
      status: 'In Transport'
    });

    const vehicle5 = await Vehicle.create({
      vin: 'JM1BN1U74M1123456',
      year: 2022,
      make: 'Mazda',
      model: 'CX-5',
      shipperName: 'Michael Shipper',
      shipperCompany: 'Auction Lot',
      shipperEmail: 'michael.shipper@auction.com',
      shipperPhone: '555-1005',
      submissionDate: new Date('2024-01-18'),
      pickupLocationName: 'Auction Lot',
      pickupCity: 'New York',
      pickupState: 'NY',
      pickupZip: '10003',
      pickupContactName: 'Auction Manager',
      pickupContactPhone: '555-1005',
      availableToShipDate: new Date('2024-01-24'),
      pickupDateStart: new Date('2024-01-30T09:00:00Z'),
      pickupDateEnd: new Date('2024-01-30T18:00:00Z'),
      pickupTimeStart: '09:00',
      pickupTimeEnd: '18:00',
      dropLocationName: 'Mazda Dealer',
      dropCity: 'Philadelphia',
      dropState: 'PA',
      dropZip: '19103',
      dropContactName: 'Dealer',
      dropContactPhone: '555-2005',
      dropDateStart: new Date('2024-01-31T09:00:00Z'),
      dropDateEnd: new Date('2024-01-31T18:00:00Z'),
      dropTimeStart: '09:00',
      dropTimeEnd: '18:00',
      status: 'Ready for Transport'
    });

    console.log('Vehicles created');

    // Create Transport Jobs
    console.log('Creating transport jobs...');
    const transportJob1 = await TransportJob.create({
      vehicleId: vehicle1._id,
      status: 'In Transit',
      carrier: 'PTG',
      carrierPayment: 850,
      createdBy: dispatcher._id,
      lastUpdatedBy: dispatcher._id
    });

    const transportJob2 = await TransportJob.create({
      vehicleId: vehicle2._id,
      status: 'In Transit',
      carrier: 'PTG',
      carrierPayment: 750,
      createdBy: dispatcher._id,
      lastUpdatedBy: dispatcher._id
    });

    const transportJob3 = await TransportJob.create({
      vehicleId: vehicle3._id,
      status: 'Needs Dispatch',
      carrier: 'PTG',
      carrierPayment: 1200,
      createdBy: dispatcher._id,
      lastUpdatedBy: dispatcher._id
    });

    const transportJob4 = await TransportJob.create({
      vehicleId: vehicle4._id,
      status: 'In Transit',
      carrier: 'PTG',
      carrierPayment: 950,
      createdBy: dispatcher._id,
      lastUpdatedBy: dispatcher._id
    });

    const transportJob5 = await TransportJob.create({
      vehicleId: vehicle5._id,
      status: 'Needs Dispatch',
      carrier: 'PTG',
      carrierPayment: 680,
      createdBy: dispatcher._id,
      lastUpdatedBy: dispatcher._id
    });

    // Update vehicles with transport job IDs
    vehicle1.transportJobId = transportJob1._id;
    vehicle2.transportJobId = transportJob2._id;
    vehicle3.transportJobId = transportJob3._id;
    vehicle4.transportJobId = transportJob4._id;
    vehicle5.transportJobId = transportJob5._id;
    await vehicle1.save();
    await vehicle2.save();
    await vehicle3.save();
    await vehicle4.save();
    await vehicle5.save();

    console.log('Transport jobs created');

    // Create Routes
    console.log('Creating routes...');
    const route1 = await Route.create({
      driverId: driver1._id,
      truckId: truck1._id,
      plannedStartDate: new Date('2024-01-25T06:00:00Z'),
      plannedEndDate: new Date('2024-01-26T18:00:00Z'),
      journeyStartLocation: {
        name: 'PTG Depot',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        coordinates: { latitude: 40.7128, longitude: -74.0060 }
      },
      journeyEndLocation: {
        name: 'Customer Location',
        address: '456 Market St',
        city: 'Philadelphia',
        state: 'PA',
        zip: '19101',
        coordinates: { latitude: 39.9526, longitude: -75.1652 }
      },
      selectedTransportJobs: [transportJob1._id],
      stops: [
        {
          stopType: 'start',
          sequence: 1,
          location: {
            name: 'PTG Depot',
            address: '123 Main St',
            city: 'New York',
            state: 'NY',
            zip: '10001',
            coordinates: { latitude: 40.7128, longitude: -74.0060 }
          },
          scheduledDate: new Date('2024-01-25T06:00:00Z'),
          scheduledTimeStart: new Date('2024-01-25T06:00:00Z'),
          scheduledTimeEnd: new Date('2024-01-25T07:00:00Z'),
          status: 'Completed',
          actualDate: new Date('2024-01-25T06:15:00Z'),
          actualTime: new Date('2024-01-25T06:15:00Z')
        },
        {
          stopType: 'pickup',
          transportJobId: transportJob1._id,
          sequence: 2,
          location: {
            name: 'Honda Dealership',
            address: '789 Auto Blvd',
            city: 'New York',
            state: 'NY',
            zip: '10001',
            coordinates: { latitude: 40.7580, longitude: -73.9855 }
          },
          scheduledDate: new Date('2024-01-25T08:00:00Z'),
          scheduledTimeStart: new Date('2024-01-25T08:00:00Z'),
          scheduledTimeEnd: new Date('2024-01-25T09:00:00Z'),
          status: 'Completed',
          actualDate: new Date('2024-01-25T08:20:00Z'),
          actualTime: new Date('2024-01-25T08:20:00Z'),
          distanceFromPrevious: { text: '5.2 miles', value: 8368 },
          durationFromPrevious: { text: '15 mins', value: 900 }
        },
        {
          stopType: 'drop',
          transportJobId: transportJob1._id,
          sequence: 3,
          location: {
            name: 'Customer Location',
            address: '456 Market St',
            city: 'Philadelphia',
            state: 'PA',
            zip: '19101',
            coordinates: { latitude: 39.9526, longitude: -75.1652 }
          },
          scheduledDate: new Date('2024-01-26T14:00:00Z'),
          scheduledTimeStart: new Date('2024-01-26T14:00:00Z'),
          scheduledTimeEnd: new Date('2024-01-26T15:00:00Z'),
          status: 'In Progress',
          distanceFromPrevious: { text: '95.3 miles', value: 153400 },
          durationFromPrevious: { text: '1 hour 45 mins', value: 6300 }
        },
        {
          stopType: 'end',
          sequence: 4,
          location: {
            name: 'PTG Depot',
            address: '123 Main St',
            city: 'New York',
            state: 'NY',
            zip: '10001',
            coordinates: { latitude: 40.7128, longitude: -74.0060 }
          },
          scheduledDate: new Date('2024-01-26T18:00:00Z'),
          scheduledTimeStart: new Date('2024-01-26T18:00:00Z'),
          scheduledTimeEnd: new Date('2024-01-26T19:00:00Z'),
          status: 'Pending',
          distanceFromPrevious: { text: '95.3 miles', value: 153400 },
          durationFromPrevious: { text: '1 hour 45 mins', value: 6300 }
        }
      ],
      totalDistance: { text: '195.8 miles', value: 315168 },
      totalDuration: { text: '3 hours 45 mins', value: 13500 },
      actualDistanceTraveled: 195.8,
      status: 'In Progress',
      state: 'Started',
      createdBy: dispatcher._id,
      lastUpdatedBy: dispatcher._id
    });

    const route2 = await Route.create({
      driverId: driver2._id,
      truckId: truck2._id,
      plannedStartDate: new Date('2024-01-22T07:00:00Z'),
      plannedEndDate: new Date('2024-01-23T17:00:00Z'),
      actualStartDate: new Date('2024-01-22T07:15:00Z'),
      actualEndDate: new Date('2024-01-23T16:45:00Z'),
      journeyStartLocation: {
        name: 'PTG Depot',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        coordinates: { latitude: 40.7128, longitude: -74.0060 }
      },
      journeyEndLocation: {
        name: 'Dealership',
        address: '789 Auto Way',
        city: 'Boston',
        state: 'MA',
        zip: '02101',
        coordinates: { latitude: 42.3601, longitude: -71.0589 }
      },
      selectedTransportJobs: [transportJob2._id],
      stops: [
        {
          stopType: 'start',
          sequence: 1,
          location: {
            name: 'PTG Depot',
            address: '123 Main St',
            city: 'New York',
            state: 'NY',
            zip: '10001',
            coordinates: { latitude: 40.7128, longitude: -74.0060 }
          },
          scheduledDate: new Date('2024-01-22T07:00:00Z'),
          scheduledTimeStart: new Date('2024-01-22T07:00:00Z'),
          scheduledTimeEnd: new Date('2024-01-22T08:00:00Z'),
          status: 'Completed',
          actualDate: new Date('2024-01-22T07:15:00Z'),
          actualTime: new Date('2024-01-22T07:15:00Z')
        },
        {
          stopType: 'pickup',
          transportJobId: transportJob2._id,
          sequence: 2,
          location: {
            name: 'Auction House',
            address: '321 Auction Rd',
            city: 'Baltimore',
            state: 'MD',
            zip: '21201',
            coordinates: { latitude: 39.2904, longitude: -76.6122 }
          },
          scheduledDate: new Date('2024-01-22T09:00:00Z'),
          scheduledTimeStart: new Date('2024-01-22T09:00:00Z'),
          scheduledTimeEnd: new Date('2024-01-22T10:00:00Z'),
          status: 'Completed',
          actualDate: new Date('2024-01-22T09:25:00Z'),
          actualTime: new Date('2024-01-22T09:25:00Z'),
          distanceFromPrevious: { text: '185.5 miles', value: 298600 },
          durationFromPrevious: { text: '3 hours 10 mins', value: 11400 }
        },
        {
          stopType: 'drop',
          transportJobId: transportJob2._id,
          sequence: 3,
          location: {
            name: 'Dealership',
            address: '789 Auto Way',
            city: 'Boston',
            state: 'MA',
            zip: '02101',
            coordinates: { latitude: 42.3601, longitude: -71.0589 }
          },
          scheduledDate: new Date('2024-01-23T14:00:00Z'),
          scheduledTimeStart: new Date('2024-01-23T14:00:00Z'),
          scheduledTimeEnd: new Date('2024-01-23T15:00:00Z'),
          status: 'Completed',
          actualDate: new Date('2024-01-23T14:30:00Z'),
          actualTime: new Date('2024-01-23T14:30:00Z'),
          distanceFromPrevious: { text: '380.2 miles', value: 612200 },
          durationFromPrevious: { text: '6 hours 5 mins', value: 21900 }
        },
        {
          stopType: 'end',
          sequence: 4,
          location: {
            name: 'PTG Depot',
            address: '123 Main St',
            city: 'New York',
            state: 'NY',
            zip: '10001',
            coordinates: { latitude: 40.7128, longitude: -74.0060 }
          },
          scheduledDate: new Date('2024-01-23T17:00:00Z'),
          scheduledTimeStart: new Date('2024-01-23T17:00:00Z'),
          scheduledTimeEnd: new Date('2024-01-23T18:00:00Z'),
          status: 'Completed',
          actualDate: new Date('2024-01-23T16:45:00Z'),
          actualTime: new Date('2024-01-23T16:45:00Z'),
          distanceFromPrevious: { text: '215.3 miles', value: 346600 },
          durationFromPrevious: { text: '3 hours 30 mins', value: 12600 }
        }
      ],
      totalDistance: { text: '781.0 miles', value: 1257400 },
      totalDuration: { text: '12 hours 45 mins', value: 45900 },
      actualDistanceTraveled: 781.0,
      status: 'Completed',
      createdBy: dispatcher._id,
      lastUpdatedBy: dispatcher._id
    });

    const route3 = await Route.create({
      driverId: driver1._id,
      truckId: truck1._id,
      plannedStartDate: new Date('2024-01-27T08:00:00Z'),
      plannedEndDate: new Date('2024-01-28T18:00:00Z'),
      journeyStartLocation: {
        name: 'PTG Depot',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        coordinates: { latitude: 40.7128, longitude: -74.0060 }
      },
      journeyEndLocation: {
        name: 'Customer Home',
        address: '654 Home St',
        city: 'Baltimore',
        state: 'MD',
        zip: '21202',
        coordinates: { latitude: 39.2904, longitude: -76.6122 }
      },
      selectedTransportJobs: [transportJob4._id],
      stops: [
        {
          stopType: 'start',
          sequence: 1,
          location: {
            name: 'PTG Depot',
            address: '123 Main St',
            city: 'New York',
            state: 'NY',
            zip: '10001',
            coordinates: { latitude: 40.7128, longitude: -74.0060 }
          },
          scheduledDate: new Date('2024-01-27T08:00:00Z'),
          scheduledTimeStart: new Date('2024-01-27T08:00:00Z'),
          scheduledTimeEnd: new Date('2024-01-27T09:00:00Z'),
          status: 'Pending'
        },
        {
          stopType: 'pickup',
          transportJobId: transportJob4._id,
          sequence: 2,
          location: {
            name: 'Ford Dealership',
            address: '456 Ford Ave',
            city: 'Boston',
            state: 'MA',
            zip: '02102',
            coordinates: { latitude: 42.3601, longitude: -71.0589 }
          },
          scheduledDate: new Date('2024-01-27T08:00:00Z'),
          scheduledTimeStart: new Date('2024-01-27T08:00:00Z'),
          scheduledTimeEnd: new Date('2024-01-27T17:00:00Z'),
          status: 'Pending',
          distanceFromPrevious: { text: '215.3 miles', value: 346600 },
          durationFromPrevious: { text: '3 hours 30 mins', value: 12600 }
        },
        {
          stopType: 'drop',
          transportJobId: transportJob4._id,
          sequence: 3,
          location: {
            name: 'Customer Home',
            address: '654 Home St',
            city: 'Baltimore',
            state: 'MD',
            zip: '21202',
            coordinates: { latitude: 39.2904, longitude: -76.6122 }
          },
          scheduledDate: new Date('2024-01-28T08:00:00Z'),
          scheduledTimeStart: new Date('2024-01-28T08:00:00Z'),
          scheduledTimeEnd: new Date('2024-01-28T17:00:00Z'),
          status: 'Pending',
          distanceFromPrevious: { text: '380.2 miles', value: 612200 },
          durationFromPrevious: { text: '6 hours 5 mins', value: 21900 }
        },
        {
          stopType: 'end',
          sequence: 4,
          location: {
            name: 'PTG Depot',
            address: '123 Main St',
            city: 'New York',
            state: 'NY',
            zip: '10001',
            coordinates: { latitude: 40.7128, longitude: -74.0060 }
          },
          scheduledDate: new Date('2024-01-28T18:00:00Z'),
          scheduledTimeStart: new Date('2024-01-28T18:00:00Z'),
          scheduledTimeEnd: new Date('2024-01-28T19:00:00Z'),
          status: 'Pending',
          distanceFromPrevious: { text: '185.5 miles', value: 298600 },
          durationFromPrevious: { text: '3 hours 10 mins', value: 11400 }
        }
      ],
      totalDistance: { text: '781.0 miles', value: 1257400 },
      totalDuration: { text: '13 hours 45 mins', value: 49500 },
      status: 'Planned',
      createdBy: dispatcher._id,
      lastUpdatedBy: dispatcher._id
    });

    // Update transport jobs with route IDs
    transportJob1.routeId = route1._id;
    transportJob1.assignedDriver = driver1._id;
    transportJob2.routeId = route2._id;
    transportJob2.assignedDriver = driver2._id;
    transportJob4.routeId = route3._id;
    transportJob4.assignedDriver = driver1._id;
    await transportJob1.save();
    await transportJob2.save();
    await transportJob4.save();

    console.log('Routes created');

    // Create Expenses
    console.log('Creating expenses...');
    await Expense.create({
      type: 'fuel',
      category: 'diesel',
      gallons: 45.5,
      pricePerGallon: 3.85,
      totalCost: 175.18,
      odometerReading: 125000,
      backgroundLocation: {
        latitude: 40.7580,
        longitude: -73.9855,
        accuracy: 10
      },
      askedLocation: {
        latitude: 40.7580,
        longitude: -73.9855,
        accuracy: 10,
        formattedAddress: '123 Gas Station, New York, NY 10001',
        name: 'Shell Gas Station',
        address: '123 Gas Station',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4'
      },
      routeId: route1._id,
      driverId: driver1._id,
      truckId: truck1._id,
      createdBy: driver1._id
    });

    await Expense.create({
      type: 'fuel',
      category: 'diesel',
      gallons: 52.3,
      pricePerGallon: 3.92,
      totalCost: 205.02,
      odometerReading: 125185,
      backgroundLocation: {
        latitude: 39.2904,
        longitude: -76.6122,
        accuracy: 12
      },
      askedLocation: {
        latitude: 39.2904,
        longitude: -76.6122,
        accuracy: 12,
        formattedAddress: '456 Fuel Stop, Baltimore, MD 21201',
        name: 'BP Gas Station',
        address: '456 Fuel Stop',
        city: 'Baltimore',
        state: 'MD',
        zipCode: '21201',
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY5'
      },
      routeId: route2._id,
      driverId: driver2._id,
      truckId: truck2._id,
      createdBy: driver2._id
    });

    await Expense.create({
      type: 'maintenance',
      category: 'oil_change',
      description: 'Regular oil change and filter replacement',
      totalCost: 125.50,
      odometerReading: 124500,
      serviceProvider: {
        name: 'Quick Lube Service',
        phone: '555-3001',
        address: '789 Service Rd, New York, NY 10001'
      },
      backgroundLocation: {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 8
      },
      askedLocation: {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 8,
        formattedAddress: '789 Service Rd, New York, NY 10001',
        name: 'Quick Lube Service',
        address: '789 Service Rd',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY6'
      },
      routeId: null,
      driverId: driver1._id,
      truckId: truck1._id,
      createdBy: driver1._id
    });

    await Expense.create({
      type: 'maintenance',
      category: 'tires',
      description: 'Replaced two front tires',
      totalCost: 450.00,
      odometerReading: 124800,
      serviceProvider: {
        name: 'Tire Shop',
        phone: '555-3002',
        address: '321 Tire Ave, Philadelphia, PA 19101'
      },
      backgroundLocation: {
        latitude: 39.9526,
        longitude: -75.1652,
        accuracy: 15
      },
      askedLocation: {
        latitude: 39.9526,
        longitude: -75.1652,
        accuracy: 15,
        formattedAddress: '321 Tire Ave, Philadelphia, PA 19101',
        name: 'Tire Shop',
        address: '321 Tire Ave',
        city: 'Philadelphia',
        state: 'PA',
        zipCode: '19101',
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY7'
      },
      routeId: route1._id,
      driverId: driver1._id,
      truckId: truck1._id,
      createdBy: driver1._id
    });

    await Expense.create({
      type: 'fuel',
      category: 'diesel',
      gallons: 48.2,
      pricePerGallon: 3.88,
      totalCost: 186.82,
      odometerReading: 125380,
      backgroundLocation: {
        latitude: 42.3601,
        longitude: -71.0589,
        accuracy: 11
      },
      askedLocation: {
        latitude: 42.3601,
        longitude: -71.0589,
        accuracy: 11,
        formattedAddress: '789 Highway Fuel, Boston, MA 02101',
        name: 'Exxon Station',
        address: '789 Highway Fuel',
        city: 'Boston',
        state: 'MA',
        zipCode: '02101',
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY8'
      },
      routeId: route2._id,
      driverId: driver2._id,
      truckId: truck2._id,
      createdBy: driver2._id
    });

    await Expense.create({
      type: 'maintenance',
      category: 'repair',
      description: 'Brake pad replacement',
      totalCost: 320.00,
      odometerReading: 124200,
      serviceProvider: {
        name: 'Auto Repair Shop',
        phone: '555-3003',
        address: '654 Repair Blvd, Baltimore, MD 21201'
      },
      backgroundLocation: {
        latitude: 39.2904,
        longitude: -76.6122,
        accuracy: 9
      },
      askedLocation: {
        latitude: 39.2904,
        longitude: -76.6122,
        accuracy: 9,
        formattedAddress: '654 Repair Blvd, Baltimore, MD 21201',
        name: 'Auto Repair Shop',
        address: '654 Repair Blvd',
        city: 'Baltimore',
        state: 'MD',
        zipCode: '21201',
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY9'
      },
      routeId: null,
      driverId: driver2._id,
      truckId: truck2._id,
      createdBy: driver2._id
    });

    console.log('Expenses created');

    // Create Calendar Events
    console.log('Creating calendar events...');
    await CalendarEvent.create({
      title: `Route ${route1.routeNumber}`,
      description: `Truck: ${truck1.truckNumber}, Driver: ${driver1.firstName} ${driver1.lastName} (${driver1.email}), Truck: ${truck1.make} ${truck1.model} ${truck1.year}, Route: ${route1.routeNumber}`,
      startDate: route1.plannedStartDate,
      endDate: route1.plannedEndDate,
      allDay: false,
      color: 'blue',
      driverId: driver1._id,
      routeId: route1._id,
      truckId: truck1._id,
      createdBy: dispatcher._id,
      status: 'active'
    });

    await CalendarEvent.create({
      title: `Route ${route2.routeNumber}`,
      description: `Truck: ${truck2.truckNumber}, Driver: ${driver2.firstName} ${driver2.lastName} (${driver2.email}), Truck: ${truck2.make} ${truck2.model} ${truck2.year}, Route: ${route2.routeNumber}`,
      startDate: route2.plannedStartDate,
      endDate: route2.plannedEndDate,
      allDay: false,
      color: 'green',
      driverId: driver2._id,
      routeId: route2._id,
      truckId: truck2._id,
      createdBy: dispatcher._id,
      status: 'active'
    });

    await CalendarEvent.create({
      title: `Route ${route3.routeNumber}`,
      description: `Truck: ${truck1.truckNumber}, Driver: ${driver1.firstName} ${driver1.lastName} (${driver1.email}), Truck: ${truck1.make} ${truck1.model} ${truck1.year}, Route: ${route3.routeNumber}`,
      startDate: route3.plannedStartDate,
      endDate: route3.plannedEndDate,
      allDay: false,
      color: 'orange',
      driverId: driver1._id,
      routeId: route3._id,
      truckId: truck1._id,
      createdBy: dispatcher._id,
      status: 'active'
    });

    console.log('Calendar events created');

    // Create Route Tracking
    console.log('Creating route tracking...');
    await RouteTracking.create({
      routeId: route1._id,
      driverId: driver1._id,
      truckId: truck1._id,
      status: 'active',
      startedAt: route1.actualStartDate || route1.plannedStartDate,
      history: [
        {
          type: 'location',
          timestamp: new Date('2024-01-25T06:15:00Z'),
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10
        },
        {
          type: 'action',
          timestamp: new Date('2024-01-25T06:20:00Z'),
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
          refType: 'route_start',
          meta: { action: 'Route started' }
        },
        {
          type: 'location',
          timestamp: new Date('2024-01-25T08:20:00Z'),
          latitude: 40.7580,
          longitude: -73.9855,
          accuracy: 12
        },
        {
          type: 'action',
          timestamp: new Date('2024-01-25T08:25:00Z'),
          latitude: 40.7580,
          longitude: -73.9855,
          accuracy: 12,
          refType: 'pickup_completed',
          meta: { action: 'Pickup completed' }
        }
      ]
    });

    await RouteTracking.create({
      routeId: route2._id,
      driverId: driver2._id,
      truckId: truck2._id,
      status: 'completed',
      startedAt: route2.actualStartDate,
      endedAt: route2.actualEndDate,
      history: [
        {
          type: 'location',
          timestamp: new Date('2024-01-22T07:15:00Z'),
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10
        },
        {
          type: 'action',
          timestamp: new Date('2024-01-22T07:20:00Z'),
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
          refType: 'route_start',
          meta: { action: 'Route started' }
        },
        {
          type: 'location',
          timestamp: new Date('2024-01-22T09:25:00Z'),
          latitude: 39.2904,
          longitude: -76.6122,
          accuracy: 11
        },
        {
          type: 'action',
          timestamp: new Date('2024-01-22T09:30:00Z'),
          latitude: 39.2904,
          longitude: -76.6122,
          accuracy: 11,
          refType: 'pickup_completed',
          meta: { action: 'Pickup completed' }
        },
        {
          type: 'location',
          timestamp: new Date('2024-01-23T14:30:00Z'),
          latitude: 42.3601,
          longitude: -71.0589,
          accuracy: 9
        },
        {
          type: 'action',
          timestamp: new Date('2024-01-23T14:35:00Z'),
          latitude: 42.3601,
          longitude: -71.0589,
          accuracy: 9,
          refType: 'drop_completed',
          meta: { action: 'Drop completed' }
        },
        {
          type: 'location',
          timestamp: new Date('2024-01-23T16:45:00Z'),
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10
        },
        {
          type: 'action',
          timestamp: new Date('2024-01-23T16:50:00Z'),
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
          refType: 'route_completed',
          meta: { action: 'Route completed' }
        }
      ]
    });

    console.log('Route tracking created');

    console.log('\n✅ Database seeded successfully!');
    console.log('\nSummary:');
    console.log(`- Users: ${await User.countDocuments()}`);
    console.log(`- Trucks: ${await Truck.countDocuments()}`);
    console.log(`- Vehicles: ${await Vehicle.countDocuments()}`);
    console.log(`- Transport Jobs: ${await TransportJob.countDocuments()}`);
    console.log(`- Routes: ${await Route.countDocuments()}`);
    console.log(`- Expenses: ${await Expense.countDocuments()}`);
    console.log(`- Calendar Events: ${await CalendarEvent.countDocuments()}`);
    console.log(`- Route Tracking: ${await RouteTracking.countDocuments()}`);
    console.log('\nTest credentials:');
    console.log('Admin: admin@ptg.com / password123');
    console.log('Dispatcher: dispatcher@ptg.com / password123');
    console.log('Driver 1: driver1@ptg.com / password123');
    console.log('Driver 2: driver2@ptg.com / password123');
    console.log('Driver 3: driver3@ptg.com / password123');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

// Run seed
seedDatabase();


const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/database');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
// CORS configuration
const corsOptions = {
  origin: [
    'https://ptg-khaki.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://192.168.1.2:3000',
    'https://dashboard.premiumtransportgroup.com',
    'https://premiumtransportgroup.com',
    'https://shawnee-audible-mariann.ngrok-free.dev',
    'http://192.168.1.3:8000',
    'http://192.168.1.3:3001',
    'http://localhost:5173',
    process.env.FRONTEND_URL
  ].filter(Boolean), // Remove undefined values
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' })); // Increase limit for base64 images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vehicles', require('./routes/vehicle'));
app.use('/api/trucks', require('./routes/truck'));
app.use('/api/transport-jobs', require('./routes/transportJob'));
app.use('/api/routes', require('./routes/route'));
app.use('/api/driver', require('./routes/driver'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/status', require('./routes/status'));
app.use('/api/location', require('./routes/location'));
app.use('/api/expenses', require('./routes/expense'));
app.use('/api/search', require('./routes/search'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/reports', require('./routes/report'));
app.use('/api/vehicle-profit-calculations', require('./routes/vehicleProfitCalculation'));
app.use('/api/shippers', require('./routes/shipper'));
app.use('/api/loads', require('./routes/load'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'POS-e7d24e7a-18bb-4e4e-99e5-a8d020bc0a67',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint to check if routes are working
app.get('/api/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Test endpoint working',
    timestamp: new Date().toISOString()
  });
});

// 404 handler - must be last
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware - must be after 404 handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`PTG Server running on port ${PORT}`);
});

const nodemailer = require('nodemailer');

// Email configuration
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' || false,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
  // Additional options for better deliverability
  tls: {
    rejectUnauthorized: false
  },
  // Connection timeout
  connectionTimeout: 60000,
  greetingTimeout: 30000,
  socketTimeout: 60000
};

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport(emailConfig);
};

// Test email configuration
const testEmailConnection = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('Email server connection successful');
    return true;
  } catch (error) {
    console.error('Email server connection failed:', error.message);
    return false;
  }
};

// Email defaults
const emailDefaults = {
  from: {
    name: process.env.FROM_NAME || 'Apex',
    address: process.env.FROM_EMAIL || 'noreply@apex.com'
  },
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000'
};

module.exports = {
  emailConfig,
  createTransporter,
  testEmailConnection,
  emailDefaults
};

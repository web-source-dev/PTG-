const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  password: {
    type: String
  },
  firstName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  zipCode: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    trim: true
  },
  profilePicture: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    enum: ['ptgAdmin', 'ptgDispatcher', 'ptgDriver'],
    default: 'ptgDriver'
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,

  // Driver location tracking (only for ptgDriver role)
  currentLocation: {
    latitude: Number,
    longitude: Number,
    timestamp: Date,
    accuracy: { type: Number, default: null } // GPS accuracy in meters
  },
  currentRouteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route'
  },

  // Driver Performance Tracking (only for ptgDriver role)
  driverStats: {
    totalLoadsMoved: { type: Number, default: 0 },
    totalDistanceTraveled: { type: Number, default: 0 } // in miles
    // Note: Expenses are now stored in separate Expense collection
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if user has specific role
userSchema.methods.hasRole = function(role) {
  return this.role === role;
};

// Check if user has any of the specified roles
userSchema.methods.hasAnyRole = function(...roles) {
  return roles.includes(this.role);
};

// Check if user is PTG Admin
userSchema.methods.isPTG_Admin = function() {
  return this.role === 'ptgAdmin';
};

// Check if user is PTG Dispatcher
userSchema.methods.isPTG_Dispatcher = function() {
  return this.role === 'ptgDispatcher';
};

// Check if user is PTG Driver
userSchema.methods.isPTG_Driver = function() {
  return this.role === 'ptgDriver';
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.resetPasswordToken;
  delete userObject.resetPasswordExpires;
  delete userObject.emailVerificationToken;
  delete userObject.emailVerificationExpires;
  return userObject;
};

module.exports = mongoose.model('User', userSchema);

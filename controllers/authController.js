const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const Expense = require('../models/Expense');
const AuditLog = require('../models/AuditLog');
const {
  generateToken,
  generateResetToken,
  sendPasswordResetEmail,
  sendWelcomeEmail
} = require('../utils/auth');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Create user
    const user = await User.create({
      email,
      password,
      firstName,
      lastName
    });

    // Generate token
    const token = generateToken(user);

    // Send welcome email (optional - you can remove this if not needed)
    try {
      const displayName = user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.firstName || user.lastName || user.email.split('@')[0];
      await sendWelcomeEmail(user.email, displayName);
    } catch (emailError) {
      console.log('Welcome email failed:', emailError);
      // Don't fail registration if email fails
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user,
        token
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists and get password field
    const user = await User.findOne({ email }).select('+password');
    if (!user) {

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Log failed login attempt
      await AuditLog.create({
        action: 'user_login_failed',
        entityType: 'user',
        entityId: user._id,
        userId: user._id, // The user who attempted to log in
        driverId: user.role === 'ptgDriver' ? user._id : undefined,
        details: {
          email,
          reason: 'invalid_password',
          ip: req.ip,
          userAgent: req.get('User-Agent')
        },
        notes: `Failed login attempt for ${email} - invalid password`
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken(user);

    // Log successful login
    await AuditLog.create({
      action: 'user_login',
      entityType: 'user',
      entityId: user._id,
      userId: user._id,
      driverId: user.role === 'ptgDriver' ? user._id : undefined,
      details: {
        email,
        role: user.role,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      },
      notes: `User ${email} logged in successfully`
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const { resetToken, hashedToken } = generateResetToken();

    // Save hashed token to user
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send email
    try {
      await sendPasswordResetEmail(user.email, resetToken);

      // Log password reset request
      await AuditLog.create({
        action: 'password_reset_requested',
        entityType: 'user',
        entityId: user._id,
        userId: user._id,
        driverId: user.role === 'ptgDriver' ? user._id : undefined,
        details: {
          email: user.email,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        },
        notes: `Password reset requested for ${user.email}`
      });

      res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    } catch (emailError) {
      console.error('Email send error:', emailError);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      return res.status(500).json({
        success: false,
        message: 'Email could not be sent'
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset request'
    });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    // Hash the token from request
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Generate new token for immediate login
    const newToken = generateToken(user);

    // Log successful password reset
    await AuditLog.create({
      action: 'password_reset_successful',
      entityType: 'user',
      entityId: user._id,
      userId: user._id,
      driverId: user.role === 'ptgDriver' ? user._id : undefined,
      details: {
        email: user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      },
      notes: `Password reset successful for ${user.email}`
    });

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
      data: {
        user,
        token: newToken
      }
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset'
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/profile
// @access  Private
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    res.status(200).json({
      success: true,
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const { email, firstName, lastName } = req.body;

    const updateData = {};
    if (email !== undefined) updateData.email = email;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create user (Admin or Dispatcher)
// @route   POST /api/auth/users
// @access  Private/Admin or Dispatcher
const createUser = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    // If dispatcher, can only create drivers
    const userRole = req.user.role === 'ptgDispatcher' 
      ? 'ptgDriver' 
      : (role || 'ptgDriver');

    // Create user
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      role: userRole
    });

    // Log user creation
    await AuditLog.create({
      action: 'create_user',
      entityType: 'user',
      entityId: user._id,
      userId: req.user._id,
      driverId: userRole === 'ptgDriver' ? user._id : undefined,
      details: {
        email,
        firstName,
        lastName,
        role: userRole
      },
      notes: `Created user ${email} with role ${userRole}`
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during user creation'
    });
  }
};

// @desc    Get all users
// @route   GET /api/auth/users
// @access  Private/Admin or Dispatcher
const getAllUsers = async (req, res) => {
  try {
    // If dispatcher, only return drivers
    // If admin, return all users
    const query = req.user.role === 'ptgDispatcher' 
      ? { role: 'ptgDriver' }
      : {};

    const users = await User.find(query).select('-password -resetPasswordToken -resetPasswordExpires -emailVerificationToken -emailVerificationExpires');

    res.status(200).json({
      success: true,
      data: {
        users,
        count: users.length
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update user
// @route   PUT /api/auth/users/:id
// @access  Private/Admin or Dispatcher
const updateUser = async (req, res) => {
  try {
    const { email, firstName, lastName, phoneNumber, address, city, state, zipCode, country, role } = req.body;
    const userId = req.params.id;

    // Check if user exists and if dispatcher can access it
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // If dispatcher, can only update drivers
    if (req.user.role === 'ptgDispatcher' && existingUser.role !== 'ptgDriver') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update drivers.'
      });
    }

    const updateData = {};
    if (email !== undefined) updateData.email = email;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (zipCode !== undefined) updateData.zipCode = zipCode;
    if (country !== undefined) updateData.country = country;
    
    // Only admin can update role
    if (role !== undefined && req.user.role === 'ptgAdmin') {
      updateData.role = role;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    );

    // Log user update
    await AuditLog.create({
      action: 'update_user',
      entityType: 'user',
      entityId: userId,
      userId: req.user._id,
      driverId: existingUser.role === 'ptgDriver' ? userId : undefined,
      details: updateData,
      notes: `Updated user ${existingUser.email}`
    });

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update user role
// @route   PUT /api/auth/users/:id/role
// @access  Private/Admin
const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.params.id;

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Log role update
    await AuditLog.create({
      action: 'update_user_role',
      entityType: 'user',
      entityId: userId,
      userId: req.user._id,
      driverId: role === 'ptgDriver' ? userId : undefined,
      details: {
        oldRole: existingUser.role,
        newRole: role
      },
      notes: `Changed user role from ${existingUser.role} to ${role} for ${existingUser.email}`
    });

    res.status(200).json({
      success: true,
      message: 'User role updated successfully',
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Add fuel expense to driver
// @route   POST /api/auth/users/:id/fuel-expense
// @access  Private/Admin or Dispatcher
const addDriverFuelExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { gallons, pricePerGallon, totalCost, odometerReading, truckId, routeId, location } = req.body;

    // Validate required fields
    if (!gallons || !pricePerGallon || !totalCost || !odometerReading) {
      return res.status(400).json({
        success: false,
        message: 'Gallons, price per gallon, total cost, and odometer reading are required'
      });
    }

    // Find user
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is a driver
    if (user.role !== 'ptgDriver') {
      return res.status(400).json({
        success: false,
        message: 'User is not a driver'
      });
    }

    // Initialize driverStats if not exists
    if (!user.driverStats) {
      user.driverStats = {
        totalLoadsMoved: 0,
        totalDistanceTraveled: 0,
        fuelExpenses: []
      };
    }

    // Add fuel expense
    const fuelExpense = {
      date: new Date(),
      gallons: parseFloat(gallons),
      pricePerGallon: parseFloat(pricePerGallon),
      totalCost: parseFloat(totalCost),
      odometerReading: parseFloat(odometerReading),
      ...(location && { location }),
      ...(truckId && { truckId }),
      ...(routeId && { routeId })
    };

    // Create expense directly
    const expense = await Expense.create({
      type: 'fuel',
      gallons: parseFloat(gallons),
      pricePerGallon: parseFloat(pricePerGallon),
      totalCost: parseFloat(totalCost),
      odometerReading: parseFloat(odometerReading),
      location,
      routeId,
      driverId: req.user._id,
      truckId,
      createdBy: req.user._id
    });

    // Log the action directly
    await AuditLog.create({
      action: 'add_fuel_expense',
      entityType: 'expense',
      entityId: expense._id,
      userId: req.user._id,
      driverId: req.user._id, // This is a driver action
      location,
      routeId,
      details: {
        gallons: parseFloat(gallons),
        totalCost: parseFloat(totalCost),
        odometerReading: parseFloat(odometerReading)
      },
      notes: `Added fuel expense: ${gallons} gallons for $${totalCost}`
    });

    res.status(200).json({
      success: true,
      message: 'Fuel expense added successfully',
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Add driver fuel expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update driver stats
// @route   PUT /api/auth/users/:id/stats
// @access  Private/Admin or Dispatcher
const updateDriverStats = async (req, res) => {
  try {
    const { id } = req.params;
    const { totalLoadsMoved, totalDistanceTraveled } = req.body;

    // Find user
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is a driver
    if (user.role !== 'ptgDriver') {
      return res.status(400).json({
        success: false,
        message: 'User is not a driver'
      });
    }

    // Initialize driverStats if not exists
    if (!user.driverStats) {
      user.driverStats = {
        totalLoadsMoved: 0,
        totalDistanceTraveled: 0,
        fuelExpenses: []
      };
    }

    // Update stats
    if (totalLoadsMoved !== undefined) {
      user.driverStats.totalLoadsMoved = parseInt(totalLoadsMoved);
    }
    if (totalDistanceTraveled !== undefined) {
      user.driverStats.totalDistanceTraveled = parseFloat(totalDistanceTraveled);
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Driver stats updated successfully',
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Update driver stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/auth/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent admin from deleting themselves
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Log user deletion
    await AuditLog.create({
      action: 'delete_user',
      entityType: 'user',
      entityId: userId,
      userId: req.user._id,
      driverId: user.role === 'ptgDriver' ? userId : undefined,
      details: {
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      },
      notes: `Deleted user ${user.email} (${user.role})`
    });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  createUser,
  getAllUsers,
  updateUser,
  updateUserRole,
  deleteUser,
  addDriverFuelExpense,
  updateDriverStats
};

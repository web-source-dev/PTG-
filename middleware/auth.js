const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - require authentication
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this resource'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      next();
    } catch (error) {
      // Check if token is expired
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      // Check if token is invalid
      if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
          code: 'TOKEN_INVALID'
        });
      }

      // Other errors
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this resource',
        code: 'AUTH_ERROR'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Optional authentication - doesn't fail if no token or API key
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    let apiKey;

    // Check for JWT token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check for API key in headers (for VOS integration)
    if (req.headers['x-api-key'] || req.headers['api-key']) {
      apiKey = req.headers['x-api-key'] || req.headers['api-key'];
    }

    // Try JWT authentication first
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
        req.authType = 'jwt';
        return next();
      } catch (error) {
        // Token is invalid but we don't fail the request
        req.user = null;
      }
    }

    // Try API key authentication (for external systems like VOS)
    if (apiKey) {
      // Validate API key - check against environment variables
      const validApiKeys = process.env.VALID_API_KEYS ? process.env.VALID_API_KEYS.split(',') : [];
      // Add default VOS integration key
      validApiKeys.push('vos-integration-key-2024');

      if (validApiKeys.includes(apiKey)) {
        // Extract external user information from headers
        const externalUserId = req.headers['x-external-user-id'] || req.headers['external-user-id'];
        const externalUserEmail = req.headers['x-external-user-email'] || req.headers['external-user-email'];
        const externalUserName = req.headers['x-external-user-name'] || req.headers['external-user-name'];

        // Create external user context for API key requests
        req.user = {
          _id: externalUserId || 'external-user',
          id: externalUserId || 'external-user',
          email: externalUserEmail || 'external@vos.local',
          firstName: externalUserName || 'External',
          lastName: 'User',
          role: 'ptgAdmin', // API key has admin privileges
          isApiUser: true,
          externalUserId: externalUserId,
          externalUserEmail: externalUserEmail
        };
        req.authType = 'api-key';
        req.externalUser = {
          id: externalUserId,
          email: externalUserEmail,
          name: externalUserName
        };
        return next();
      } else {
        console.warn('Invalid API key attempt:', apiKey.substring(0, 8) + '...');
      }
    }

    // No valid authentication found
    req.user = null;
    req.authType = 'none';
    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    req.user = null;
    req.authType = 'none';
    next();
  }
};


// Check if user is PTG Admin
const isPTG_Admin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this resource'
    });
  }

  if (req.user.role !== 'ptgAdmin') {
    return res.status(403).json({
      success: false,
      message: 'PTG Admin access required'
    });
  }

  next();
};

// Check if user is PTG Dispatcher
const isPTG_Dispatcher = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this resource'
    });
  }

  if (req.user.role !== 'ptgDispatcher') {
    return res.status(403).json({
      success: false,
      message: 'PTG Dispatcher access required'
    });
  }

  next();
};

// Check if user is PTG Driver
const isPTG_Driver = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this resource'
    });
  }

  if (req.user.role !== 'ptgDriver') {
    return res.status(403).json({
      success: false,
      message: 'PTG Driver access required'
    });
  }

  next();
};

// Authorize specific roles (takes array of allowed roles)
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this resource'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${roles.join(', ')}`
      });
    }

    next();
  };
};

module.exports = {
  protect,
  optionalAuth,
  isPTG_Admin,
  isPTG_Dispatcher,
  isPTG_Driver,
  authorizeRoles
};

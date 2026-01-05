const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
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
} = require('../controllers/authController');

const { protect, isPTG_Admin, authorizeRoles } = require('../middleware/auth');

// Validation rules removed for flexible data saving

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);

// User management routes (Admin and Dispatcher)
router.post('/users', protect, authorizeRoles('ptgAdmin', 'ptgDispatcher'), createUser);
router.get('/users', protect, authorizeRoles('ptgAdmin', 'ptgDispatcher'), getAllUsers);
router.put('/users/:id', protect, authorizeRoles('ptgAdmin', 'ptgDispatcher'), updateUser);

// Driver performance tracking routes (Admin and Dispatcher)
router.post('/users/:id/fuel-expense', protect, authorizeRoles('ptgAdmin', 'ptgDispatcher'), addDriverFuelExpense);
router.put('/users/:id/stats', protect, authorizeRoles('ptgAdmin', 'ptgDispatcher'), updateDriverStats);

// Admin-only routes
router.put('/users/:id/role', protect, isPTG_Admin, updateUserRole);
router.delete('/users/:id', protect, isPTG_Admin, deleteUser);

module.exports = router;

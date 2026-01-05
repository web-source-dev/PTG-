const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { protect, authorizeRoles } = require('../middleware/auth');

// All expense routes require authentication
router.use(protect);

// Routes for expenses
router.post('/fuel', expenseController.createFuelExpense);
router.post('/maintenance', expenseController.createMaintenanceExpense);
router.get('/driver/:driverId', expenseController.getExpensesByDriver);
router.get('/truck/:truckId', expenseController.getExpensesByTruck);
router.get('/route/:routeId', expenseController.getExpensesByRoute);
router.get('/', authorizeRoles('ptgAdmin', 'ptgDispatcher'), expenseController.getAllExpenses);

module.exports = router;

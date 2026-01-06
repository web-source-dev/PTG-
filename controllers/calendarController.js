const CalendarEvent = require('../models/CalendarEvent');
const AuditLog = require('../models/AuditLog');

// Get all calendar events with filters
const getAllCalendarEvents = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      createdBy,
      driverId,
      routeId,
      transportJobId,
      truckId,
      vehicleId,
      status = 'active'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build filter object
    const filter = { status };

    if (startDate || endDate) {
      filter.$or = [];

      if (startDate && endDate) {
        // Events that overlap with the date range
        filter.$or.push({
          startDate: { $lte: new Date(endDate) },
          endDate: { $gte: new Date(startDate) }
        });
      } else if (startDate) {
        filter.startDate = { $gte: new Date(startDate) };
      } else if (endDate) {
        filter.endDate = { $lte: new Date(endDate) };
      }
    }

    // Add optional filters
    if (createdBy) filter.createdBy = createdBy;
    if (driverId) filter.driverId = driverId;
    if (routeId) filter.routeId = routeId;
    if (transportJobId) filter.transportJobId = transportJobId;
    if (truckId) filter.truckId = truckId;
    if (vehicleId) filter.vehicleId = vehicleId;

    const events = await CalendarEvent.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .populate('driverId', 'firstName lastName email')
      .populate('routeId', 'routeNumber')
      .populate('transportJobId', 'jobNumber')
      .populate('truckId', 'truckNumber')
      .populate('vehicleId', 'vin make model')
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(limitNum);

    const total = await CalendarEvent.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        events,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error getting calendar events:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve calendar events',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get single calendar event by ID
const getCalendarEventById = async (req, res) => {
  try {
    const { id } = req.params;

    const event = await CalendarEvent.findById(id)
      .populate('createdBy', 'firstName lastName email')
      .populate('driverId', 'firstName lastName email')
      .populate('routeId', 'routeNumber')
      .populate('transportJobId', 'jobNumber')
      .populate('truckId', 'truckNumber')
      .populate('vehicleId', 'vin make model');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Calendar event not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { event }
    });
  } catch (error) {
    console.error('Error getting calendar event:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve calendar event',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create new calendar event
const createCalendarEvent = async (req, res) => {
  try {
    const eventData = {
      ...req.body,
      createdBy: req.user._id
    };

    // Validate dates
    if (new Date(eventData.startDate) >= new Date(eventData.endDate)) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    const event = new CalendarEvent(eventData);
    await event.save();

    // Populate the created event
    await event.populate([
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'driverId', select: 'firstName lastName email' },
      { path: 'routeId', select: 'routeNumber' },
      { path: 'transportJobId', select: 'jobNumber' },
      { path: 'truckId', select: 'truckNumber' },
      { path: 'vehicleId', select: 'vin make model' }
    ]);

    // Log calendar event creation
    await AuditLog.create({
      action: 'create_calendar_event',
      entityType: 'calendarEvent',
      entityId: event._id,
      userId: req.user._id,
      driverId: eventData.driverId,
      details: {
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        color: event.color
      },
      notes: `Created calendar event "${event.title}"`
    });

    res.status(201).json({
      success: true,
      message: 'Calendar event created successfully',
      data: { event }
    });
  } catch (error) {
    console.error('Error creating calendar event:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create calendar event',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update calendar event
const updateCalendarEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validate dates if they're being updated
    if (updates.startDate && updates.endDate) {
      if (new Date(updates.startDate) >= new Date(updates.endDate)) {
        return res.status(400).json({
          success: false,
          message: 'End date must be after start date'
        });
      }
    }

    const event = await CalendarEvent.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    )
    .populate('createdBy', 'firstName lastName email')
    .populate('driverId', 'firstName lastName email')
    .populate('routeId', 'routeNumber')
    .populate('transportJobId', 'jobNumber')
    .populate('truckId', 'truckNumber')
    .populate('vehicleId', 'vin make model');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Calendar event not found'
      });
    }

    // Log calendar event update
    await AuditLog.create({
      action: 'update_calendar_event',
      entityType: 'calendarEvent',
      entityId: id,
      userId: req.user._id,
      driverId: event.driverId,
      details: updates,
      notes: `Updated calendar event "${event.title}"`
    });

    res.status(200).json({
      success: true,
      message: 'Calendar event updated successfully',
      data: { event }
    });
  } catch (error) {
    console.error('Error updating calendar event:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update calendar event',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete calendar event
const deleteCalendarEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const event = await CalendarEvent.findByIdAndDelete(id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Calendar event not found'
      });
    }

    // Log calendar event deletion
    await AuditLog.create({
      action: 'delete_calendar_event',
      entityType: 'calendarEvent',
      entityId: id,
      userId: req.user._id,
      driverId: event.driverId,
      details: {
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate
      },
      notes: `Deleted calendar event "${event.title}"`
    });

    res.status(200).json({
      success: true,
      message: 'Calendar event deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete calendar event',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get calendar events for current user (including events they created or are assigned to as driver)
const getMyCalendarEvents = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      status = 'active'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build filter object - show events created by user OR assigned to user as driver
    const filter = {
      status,
      $or: [
        { createdBy: userId },
        { driverId: userId }
      ]
    };

    if (startDate || endDate) {
      const dateFilter = {};

      if (startDate && endDate) {
        // Events that overlap with the date range
        dateFilter.$or = [{
          startDate: { $lte: new Date(endDate) },
          endDate: { $gte: new Date(startDate) }
        }];
      } else if (startDate) {
        dateFilter.startDate = { $gte: new Date(startDate) };
      } else if (endDate) {
        dateFilter.endDate = { $lte: new Date(endDate) };
      }

      filter.$and = [dateFilter];
    }

    const events = await CalendarEvent.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .populate('driverId', 'firstName lastName email')
      .populate('routeId', 'routeNumber')
      .populate('transportJobId', 'jobNumber')
      .populate('truckId', 'truckNumber')
      .populate('vehicleId', 'vin make model')
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(limitNum);

    const total = await CalendarEvent.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        events,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error getting my calendar events:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve calendar events',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getAllCalendarEvents,
  getCalendarEventById,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getMyCalendarEvents
};

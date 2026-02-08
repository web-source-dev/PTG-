const mongoose = require('mongoose');
const Load = require('../models/Load');
const TransportJob = require('../models/TransportJob');
const AuditLog = require('../models/AuditLog');
const Shipper = require('../models/Shipper');
const { LOAD_STATUS } = require('../constants/status');
const { updateLoadOnCreate } = require('../utils/statusManager');

/**
 * Create a new load
 */
exports.createLoad = async (req, res) => {
  try {
    const loadData = req.body;

    // Add metadata
    if (req.user) {
      loadData.createdBy = req.user._id;
      loadData.lastUpdatedBy = req.user._id;
    }

    // Auto-create or find shipper if shipper details are provided
    if (loadData.shipperName && loadData.shipperCompany && !loadData.shipperId) {
      try {
        let shipper = null;
        if (loadData.shipperEmail) {
          shipper = await Shipper.findOne({
            shipperCompany: loadData.shipperCompany.trim(),
            shipperEmail: loadData.shipperEmail.toLowerCase().trim()
          });
        } else {
          shipper = await Shipper.findOne({
            shipperCompany: loadData.shipperCompany.trim(),
            shipperName: loadData.shipperName.trim()
          });
        }

        if (!shipper) {
          // Create new shipper
          shipper = await Shipper.create({
            shipperName: loadData.shipperName.trim(),
            shipperCompany: loadData.shipperCompany.trim(),
            shipperEmail: loadData.shipperEmail ? loadData.shipperEmail.toLowerCase().trim() : undefined,
            shipperPhone: loadData.shipperPhone ? loadData.shipperPhone.trim() : undefined,
            createdBy: req.user?._id,
            lastUpdatedBy: req.user?._id
          });

          // Log shipper creation
          await AuditLog.create({
            action: 'create_shipper',
            entityType: 'shipper',
            entityId: shipper._id,
            userId: req.user?._id,
            details: {
              shipperName: shipper.shipperName,
              shipperCompany: shipper.shipperCompany,
              shipperEmail: shipper.shipperEmail
            },
            notes: `Auto-created shipper ${shipper.shipperCompany} from load creation`
          });
        }

        loadData.shipperId = shipper._id;
      } catch (shipperError) {
        console.error('Error creating/finding shipper:', shipperError);
        // Continue with load creation even if shipper creation fails
      }
    }

    // Create load
    const load = await Load.create(loadData);

    // Log load creation
    await AuditLog.create({
      action: 'create_load',
      entityType: 'load',
      entityId: load._id,
      userId: req.user?._id,
      details: {
        loadNumber: load.loadNumber,
        loadType: load.loadType,
        description: load.description,
        shipperName: loadData.shipperName,
        shipperCompany: loadData.shipperCompany
      },
      notes: `Created load ${load.loadNumber} (${load.loadType})`
    });

    // Update load status to "Intake Completed" when load is created
    await updateLoadOnCreate(load._id);

    // Reload load to get updated status
    const updatedLoad = await Load.findById(load._id);

    res.status(201).json({
      success: true,
      data: updatedLoad,
      message: 'Load created successfully'
    });
  } catch (error) {
    console.error('Error creating load:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create load'
    });
  }
};

/**
 * Get all loads with pagination and filters
 */
exports.getAllLoads = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, loadType, search, startDate, endDate } = req.query;

    // Build query - exclude deleted loads
    let query = { deleted: { $ne: true } };

    if (status) {
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else if (status.includes(',')) {
        const statusArray = status.split(',').map(s => s.trim());
        query.status = { $in: statusArray };
      } else {
        query.status = status;
      }
    }

    if (loadType) {
      if (Array.isArray(loadType)) {
        query.loadType = { $in: loadType };
      } else if (loadType.includes(',')) {
        const loadTypeArray = loadType.split(',').map(t => t.trim());
        query.loadType = { $in: loadTypeArray };
      } else {
        query.loadType = loadType;
      }
    }

    if (search) {
      query.$or = [
        { loadNumber: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { shipperName: { $regex: search, $options: 'i' } },
        { shipperCompany: { $regex: search, $options: 'i' } }
      ];
    }

    // Date range filtering
    if (startDate || endDate) {
      query.submissionDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.submissionDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.submissionDate.$lte = end;
      }
    }

    const loads = await Load.find(query)
      .populate('shipperId', 'shipperName shipperCompany shipperEmail shipperPhone')
      .populate('currentTransportJobId', 'jobNumber status pickupLocationName pickupCity pickupState pickupZip pickupFormattedAddress dropLocationName dropCity dropState dropZip dropFormattedAddress dropDestinationType')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Load.countDocuments(query);

    res.status(200).json({
      success: true,
      data: loads,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total: total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching loads:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch loads'
    });
  }
};

/**
 * Get single load by ID
 */
exports.getLoadById = async (req, res) => {
  try {
    const load = await Load.findById(req.params.id)
      .populate('shipperId', 'shipperName shipperCompany shipperEmail shipperPhone')
      .populate('currentTransportJobId')
      .populate('createdBy', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName email');

    if (!load) {
      return res.status(404).json({
        success: false,
        message: 'Load not found'
      });
    }

    // If load has a transport job, include the photos and checklists from it
    let transportJobData = null;
    if (load.currentTransportJobId) {
      const transportJob = await TransportJob.findById(load.currentTransportJobId._id)
        .select('pickupPhotos deliveryPhotos pickupChecklist deliveryChecklist status');

      if (transportJob) {
        transportJobData = {
          _id: transportJob._id,
          pickupPhotos: transportJob.pickupPhotos || [],
          deliveryPhotos: transportJob.deliveryPhotos || [],
          pickupChecklist: transportJob.pickupChecklist || [],
          deliveryChecklist: transportJob.deliveryChecklist || [],
          status: transportJob.status
        };
      }
    }

    res.status(200).json({
      success: true,
      data: {
        load,
        transportJobData
      }
    });
  } catch (error) {
    console.error('Error fetching load:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch load'
    });
  }
};

/**
 * Update load
 */
exports.updateLoad = async (req, res) => {
  try {
    const updateData = req.body;
    const loadId = req.params.id;

    // Add update metadata
    updateData.lastUpdatedBy = req.user ? req.user._id : null;

    // Auto-create or find shipper if shipper details are provided and shipperId is not set
    if (updateData.shipperName && updateData.shipperCompany && !updateData.shipperId) {
      try {
        let shipper = null;
        if (updateData.shipperEmail) {
          shipper = await Shipper.findOne({
            shipperCompany: updateData.shipperCompany.trim(),
            shipperEmail: updateData.shipperEmail.toLowerCase().trim()
          });
        } else {
          shipper = await Shipper.findOne({
            shipperCompany: updateData.shipperCompany.trim(),
            shipperName: updateData.shipperName.trim()
          });
        }

        if (!shipper) {
          shipper = await Shipper.create({
            shipperName: updateData.shipperName.trim(),
            shipperCompany: updateData.shipperCompany.trim(),
            shipperEmail: updateData.shipperEmail ? updateData.shipperEmail.toLowerCase().trim() : undefined,
            shipperPhone: updateData.shipperPhone ? updateData.shipperPhone.trim() : undefined,
            createdBy: req.user?._id,
            lastUpdatedBy: req.user?._id
          });
        }

        updateData.shipperId = shipper._id;
      } catch (shipperError) {
        console.error('Error creating/finding shipper:', shipperError);
      }
    }

    const updatedLoad = await Load.findByIdAndUpdate(
      loadId,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('shipperId', 'shipperName shipperCompany shipperEmail shipperPhone')
      .populate('currentTransportJobId', 'jobNumber status pickupLocationName pickupCity pickupState pickupZip pickupFormattedAddress dropLocationName dropCity dropState dropZip dropFormattedAddress dropDestinationType');

    if (!updatedLoad) {
      return res.status(404).json({
        success: false,
        message: 'Load not found'
      });
    }

    // Log load update
    await AuditLog.create({
      action: 'update_load',
      entityType: 'load',
      entityId: loadId,
      userId: req.user?._id,
      details: updateData,
      notes: `Updated load ${updatedLoad.loadNumber}`
    });

    res.status(200).json({
      success: true,
      data: updatedLoad,
      message: 'Load updated successfully'
    });
  } catch (error) {
    console.error('Error updating load:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update load'
    });
  }
};

/**
 * Delete load (soft delete)
 */
exports.deleteLoad = async (req, res) => {
  try {
    const { id } = req.params;
    const { confirm } = req.body;

    const load = await Load.findById(id);
    if (!load) {
      return res.status(404).json({
        success: false,
        message: 'Load not found'
      });
    }

    // Check for associated transport jobs
    const associatedTransportJobs = await TransportJob.find({ loadId: id, deleted: { $ne: true } });
    const effects = [];

    if (associatedTransportJobs.length > 0) {
      effects.push(`This load is associated with ${associatedTransportJobs.length} active transport job(s). These transport jobs will be marked as 'load deleted' but will not be removed.`);
    }

    if (effects.length > 0 && !confirm) {
      return res.status(400).json({
        success: false,
        message: 'This action requires confirmation due to associated data.',
        requiresConfirmation: true,
        effects: effects
      });
    }

    // Add labels to transport jobs indicating load was deleted
    const deletionTime = new Date();
    const deletionLabel = `Load was deleted at ${deletionTime.toLocaleString()}`;
    
    for (const job of associatedTransportJobs) {
      await TransportJob.findByIdAndUpdate(job._id, {
        $set: { 
          loadDeleted: true,
          loadDeletedAt: deletionTime,
          loadDeletionLabel: deletionLabel
        }
      });
    }

    // Soft delete the load
    await Load.findByIdAndUpdate(id, {
      deleted: true,
      deletedAt: deletionTime,
      $unset: { currentTransportJobId: 1 }
    });

    // Log load deletion
    await AuditLog.create({
      action: 'delete_load',
      entityType: 'load',
      entityId: id,
      userId: req.user?._id,
      details: { loadNumber: load.loadNumber, loadType: load.loadType, description: load.description },
      notes: `Soft deleted load ${load.loadNumber}`
    });

    res.status(200).json({
      success: true,
      message: 'Load soft deleted successfully.'
    });
  } catch (error) {
    console.error('Error soft deleting load:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to soft delete load'
    });
  }
};


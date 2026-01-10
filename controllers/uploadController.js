const mongoose = require('mongoose');
const { uploadFromBase64, deleteImage } = require('../config/cloudinary');
const AuditLog = require('../models/AuditLog');

/**
 * Upload single image or document from base64
 * POST /api/upload/image
 */
exports.uploadImage = async (req, res) => {
  try {
    const { base64, folder, photoType, documentType, fileName, description } = req.body;

    if (!base64) {
      return res.status(400).json({
        success: false,
        message: 'Base64 file data is required'
      });
    }

    // Validate base64 string - allow images, PDFs, and other documents
    const isValidFormat = base64.startsWith('data:') || base64.match(/^[A-Za-z0-9+/=]+$/);
    if (!isValidFormat) {
      return res.status(400).json({
        success: false,
        message: 'Invalid base64 file format'
      });
    }

    // Determine folder based on photo type or use provided folder
    let uploadFolder = folder || 'vos-ptg';
    if (photoType === 'vehicle') {
      uploadFolder = 'vos-ptg/vehicles';
    } else if (photoType === 'stop') {
      uploadFolder = 'vos-ptg/stops';
    } else if (documentType === 'vehicle-document') {
      uploadFolder = 'vos-ptg/vehicles/documents';
    }

    // Detect file type from base64
    const mimeType = base64.includes(',') 
      ? base64.split(',')[0].split(':')[1].split(';')[0]
      : 'image/jpeg';
    
    const isImage = mimeType.startsWith('image/');
    const isPdf = mimeType === 'application/pdf';
    const detectedDocumentType = isImage ? 'image' : (isPdf ? 'document' : 'other');

    // Upload to Cloudinary
    const result = await uploadFromBase64(base64, uploadFolder, {
      // Add metadata
      context: {
        uploaded_by: req.user?._id?.toString() || 'unknown',
        photo_type: photoType || 'general',
        document_type: documentType || detectedDocumentType,
        file_name: fileName || 'uploaded-file',
        description: description || '',
        timestamp: new Date().toISOString()
      }
    });

    // Log file upload (only if user ID is valid ObjectId)
    const isValidObjectId = req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id);
    await AuditLog.create({
      action: 'upload_file',
      entityType: 'file',
      entityId: result.public_id,
      userId: isValidObjectId ? req.user._id : null,
      driverId: (isValidObjectId && req.user.role === 'ptgDriver') ? req.user._id : undefined,
      details: {
        publicId: result.public_id,
        url: result.url,
        photoType,
        documentType: detectedDocumentType,
        fileName,
        fileSize: result.bytes,
        format: result.format
      },
      notes: `Uploaded ${detectedDocumentType}: ${fileName || 'unnamed file'} (${(result.bytes / 1024).toFixed(1)} KB)`
    });

    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        url: result.url,
        public_id: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
        resource_type: result.resource_type,
        fileName: fileName,
        fileType: mimeType,
        documentType: detectedDocumentType
      }
    });
  } catch (error) {
    console.error('Upload image error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload image',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Upload multiple images from base64 array
 * POST /api/upload/images
 */
exports.uploadImages = async (req, res) => {
  try {
    const { images, folder, photoType } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Images array is required'
      });
    }

    // Determine folder based on photo type or use provided folder
    let uploadFolder = folder || 'vos-ptg';
    if (photoType === 'vehicle') {
      uploadFolder = 'vos-ptg/vehicles';
    } else if (photoType === 'stop') {
      uploadFolder = 'vos-ptg/stops';
    }

    // Upload all images
    const uploadPromises = images.map((base64, index) => {
      if (!base64) {
        throw new Error(`Image at index ${index} is missing base64 data`);
      }
      return uploadFromBase64(base64, uploadFolder, {
        context: {
          uploaded_by: req.user?._id?.toString() || 'unknown',
          photo_type: photoType || 'general',
          timestamp: new Date().toISOString(),
          index: index.toString()
        }
      });
    });

    const results = await Promise.all(uploadPromises);

    // Log multiple file uploads (only if user ID is valid ObjectId)
    const isValidObjectId = req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id);
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      await AuditLog.create({
        action: 'upload_file',
        entityType: 'file',
        entityId: result.public_id,
        userId: isValidObjectId ? req.user._id : null,
        driverId: (isValidObjectId && req.user.role === 'ptgDriver') ? req.user._id : undefined,
        details: {
          publicId: result.public_id,
          url: result.url,
          photoType,
          fileSize: result.bytes,
          format: result.format,
          batchIndex: i
        },
        notes: `Uploaded image ${i + 1}/${results.length}: ${(result.bytes / 1024).toFixed(1)} KB`
      });
    }

    res.status(200).json({
      success: true,
      message: `${results.length} image(s) uploaded successfully`,
      data: {
        images: results.map(result => ({
          url: result.url,
          public_id: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes
        }))
      }
    });
  } catch (error) {
    console.error('Upload images error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload images',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete image from Cloudinary
 * DELETE /api/upload/image/:publicId
 */
exports.deleteImage = async (req, res) => {
  try {
    const { publicId } = req.params;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: 'Public ID is required'
      });
    }

    const result = await deleteImage(publicId);

    // Log file deletion (only if user ID is valid ObjectId)
    const isValidObjectId = req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id);
    await AuditLog.create({
      action: 'delete_file',
      entityType: 'file',
      entityId: publicId,
      userId: isValidObjectId ? req.user._id : null,
      driverId: (isValidObjectId && req.user.role === 'ptgDriver') ? req.user._id : undefined,
      details: {
        publicId,
        result
      },
      notes: `Deleted file: ${publicId}`
    });

    res.status(200).json({
      success: true,
      message: 'Image deleted successfully',
      data: result
    });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete image',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


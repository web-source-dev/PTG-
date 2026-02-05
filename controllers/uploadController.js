const mongoose = require('mongoose');
const { uploadFromBase64, deleteImage } = require('../config/cloudinary');
const AuditLog = require('../models/AuditLog');

/**
 * Upload single image or document from base64
 * POST /api/upload/image
 */
exports.uploadImage = async (req, res) => {
  const startTime = Date.now();
  const requestId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Log request received
    console.log(`[${requestId}] 📤 Upload request received:`, {
      timestamp: new Date().toISOString(),
      user: req.user ? {
        id: req.user._id,
        email: req.user.email,
        role: req.user.role
      } : 'No user',
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      contentType: req.get('content-type'),
      contentLength: req.get('content-length'),
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : []
    });

    const { base64, folder, photoType, documentType, fileName, description } = req.body;

    // Log request body details (without full base64 to avoid log spam)
    console.log(`[${requestId}] 📋 Request body details:`, {
      hasBase64: !!base64,
      base64Length: base64 ? base64.length : 0,
      base64Preview: base64 ? `${base64.substring(0, 50)}...` : null,
      folder,
      photoType,
      documentType,
      fileName,
      description,
      base64StartsWith: base64 ? base64.substring(0, 20) : null
    });

    if (!base64) {
      console.error(`[${requestId}] ❌ Missing base64 data`);
      return res.status(400).json({
        success: false,
        message: 'Base64 file data is required'
      });
    }

    // Validate base64 string - allow images, PDFs, and other documents
    console.log(`[${requestId}] 🔍 Validating base64 format...`);
    const isValidFormat = base64.startsWith('data:') || base64.match(/^[A-Za-z0-9+/=]+$/);
    console.log(`[${requestId}] ✅ Base64 validation result:`, {
      isValid: isValidFormat,
      startsWithData: base64.startsWith('data:'),
      matchesPattern: !!base64.match(/^[A-Za-z0-9+/=]+$/)
    });
    
    if (!isValidFormat) {
      console.error(`[${requestId}] ❌ Invalid base64 format`);
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

    console.log(`[${requestId}] 📁 Folder determination:`, {
      providedFolder: folder,
      photoType,
      documentType,
      finalFolder: uploadFolder
    });

    // Detect file type from base64
    const mimeType = base64.includes(',') 
      ? base64.split(',')[0].split(':')[1].split(';')[0]
      : 'image/jpeg';
    
    const isImage = mimeType.startsWith('image/');
    const isPdf = mimeType === 'application/pdf';
    const detectedDocumentType = isImage ? 'image' : (isPdf ? 'document' : 'other');

    console.log(`[${requestId}] 📄 File type detection:`, {
      mimeType,
      isImage,
      isPdf,
      detectedDocumentType,
      hasComma: base64.includes(',')
    });

    // Upload to Cloudinary
    console.log(`[${requestId}] ☁️ Starting Cloudinary upload...`, {
      folder: uploadFolder,
      fileName,
      photoType,
      documentType,
      base64Size: `${(base64.length / 1024).toFixed(2)} KB`
    });

    const cloudinaryStartTime = Date.now();
    let result;
    try {
      result = await uploadFromBase64(base64, uploadFolder, {
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
      const cloudinaryDuration = Date.now() - cloudinaryStartTime;
      console.log(`[${requestId}] ✅ Cloudinary upload successful:`, {
        duration: `${cloudinaryDuration}ms`,
        publicId: result.public_id,
        url: result.url,
        size: `${(result.bytes / 1024).toFixed(2)} KB`,
        format: result.format,
        dimensions: result.width && result.height ? `${result.width}x${result.height}` : 'N/A'
      });
    } catch (cloudinaryError) {
      const cloudinaryDuration = Date.now() - cloudinaryStartTime;
      console.error(`[${requestId}] ❌ Cloudinary upload failed:`, {
        duration: `${cloudinaryDuration}ms`,
        error: cloudinaryError.message,
        stack: cloudinaryError.stack,
        errorName: cloudinaryError.name,
        errorCode: cloudinaryError.http_code || cloudinaryError.code
      });
      throw cloudinaryError;
    }

    // Log file upload (only if user ID is valid ObjectId)
    console.log(`[${requestId}] 📝 Creating audit log...`);
    const isValidObjectId = req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id);
    try {
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
      console.log(`[${requestId}] ✅ Audit log created`);
    } catch (auditError) {
      console.error(`[${requestId}] ⚠️ Failed to create audit log (non-critical):`, auditError.message);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[${requestId}] ✅ Upload completed successfully:`, {
      totalDuration: `${totalDuration}ms`,
      fileSize: `${(result.bytes / 1024).toFixed(2)} KB`,
      publicId: result.public_id
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
    const totalDuration = Date.now() - startTime;
    console.error(`[${requestId}] ❌ Upload failed:`, {
      duration: `${totalDuration}ms`,
      error: error.message,
      errorName: error.name,
      stack: error.stack,
      errorCode: error.code || error.http_code,
      errorStatus: error.status
    });
    
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
  const startTime = Date.now();
  const requestId = `batch_upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`[${requestId}] 📤 Batch upload request received:`, {
      timestamp: new Date().toISOString(),
      user: req.user ? {
        id: req.user._id,
        email: req.user.email,
        role: req.user.role
      } : 'No user',
      ip: req.ip || req.connection.remoteAddress,
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : []
    });

    const { images, folder, photoType } = req.body;

    console.log(`[${requestId}] 📋 Batch upload details:`, {
      hasImages: !!images,
      isArray: Array.isArray(images),
      imageCount: Array.isArray(images) ? images.length : 0,
      folder,
      photoType
    });

    if (!images || !Array.isArray(images) || images.length === 0) {
      console.error(`[${requestId}] ❌ Invalid images array`);
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
    console.log(`[${requestId}] 🚀 Starting batch upload of ${images.length} images...`);
    const uploadStartTime = Date.now();
    
    const uploadPromises = images.map((base64, index) => {
      if (!base64) {
        console.error(`[${requestId}] ❌ Image at index ${index} is missing base64 data`);
        throw new Error(`Image at index ${index} is missing base64 data`);
      }
      console.log(`[${requestId}] 📤 Uploading image ${index + 1}/${images.length}...`, {
        index,
        base64Length: base64.length
      });
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
    const uploadDuration = Date.now() - uploadStartTime;
    console.log(`[${requestId}] ✅ Batch upload completed:`, {
      duration: `${uploadDuration}ms`,
      successCount: results.length,
      averageTimePerImage: `${(uploadDuration / results.length).toFixed(0)}ms`
    });

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

    const totalDuration = Date.now() - startTime;
    console.log(`[${requestId}] ✅ Batch upload request completed successfully:`, {
      totalDuration: `${totalDuration}ms`,
      imageCount: results.length
    });

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
    const totalDuration = Date.now() - startTime;
    console.error(`[${requestId}] ❌ Batch upload failed:`, {
      duration: `${totalDuration}ms`,
      error: error.message,
      errorName: error.name,
      stack: error.stack,
      errorCode: error.code || error.http_code
    });
    
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


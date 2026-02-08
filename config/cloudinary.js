const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Create storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'vos-ptg', // Folder name in Cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [
      {
        width: 1200,
        height: 1200,
        crop: 'limit',
        quality: 'auto',
        fetch_format: 'auto'
      }
    ]
  }
});

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

/**
 * Upload image from base64 string to Cloudinary
 * @param {string} base64String - Base64 encoded image string
 * @param {string} folder - Optional folder name
 * @param {object} options - Optional upload options
 * @returns {Promise<object>} Cloudinary upload result
 */
const uploadFromBase64 = async (base64String, folder = 'vos-ptg', options = {}) => {
  const uploadId = `cloudinary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  
  try {
    console.log(`[${uploadId}] ☁️ Cloudinary upload started:`, {
      folder,
      base64Length: base64String.length,
      hasOptions: !!options,
      optionsContext: options.context || null
    });

    // Remove data URL prefix if present
    const base64Data = base64String.includes(',') 
      ? base64String.split(',')[1] 
      : base64String;
    
    console.log(`[${uploadId}] 📊 Base64 processing:`, {
      originalLength: base64String.length,
      processedLength: base64Data.length,
      hasDataPrefix: base64String.includes(',')
    });

    // Detect file type from data URL or options
    const mimeType = base64String.includes(',') 
      ? base64String.split(',')[0].split(':')[1].split(';')[0]
      : 'image/jpeg';
    
    const isImage = mimeType.startsWith('image/');
    const isPdf = mimeType === 'application/pdf';
    const resourceType = isPdf ? 'raw' : (isImage ? 'image' : 'auto');

    // Extract filename from options context and ensure proper extension
    let publicId = null;
    if (options.context && options.context.file_name) {
      const fileName = options.context.file_name;
      // Get extension from original filename
      const extensionMatch = fileName.match(/\.[^/.]+$/);
      const extension = extensionMatch ? extensionMatch[0] : '';
      
      // Remove extension to get base name
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
      
      // For PDFs, always ensure .pdf extension
      if (isPdf) {
        const pdfExt = extension.toLowerCase() === '.pdf' ? extension : '.pdf';
        // Use timestamp to ensure uniqueness while preserving filename
        const timestamp = Date.now();
        publicId = `${folder}/${nameWithoutExt}_${timestamp}${pdfExt}`;
      } else if (isImage && extension) {
        // For images, preserve original extension
        const timestamp = Date.now();
        publicId = `${folder}/${nameWithoutExt}_${timestamp}${extension}`;
      } else if (isImage) {
        // If no extension for image, add based on mime type
        const imgExt = mimeType === 'image/png' ? '.png' : 
                      mimeType === 'image/gif' ? '.gif' : 
                      mimeType === 'image/webp' ? '.webp' : '.jpg';
        const timestamp = Date.now();
        publicId = `${folder}/${nameWithoutExt}_${timestamp}${imgExt}`;
      }
    }

    const uploadOptions = {
      // Don't set folder if public_id already includes it (to avoid duplication)
      ...(publicId ? {} : { folder: folder }),
      resource_type: resourceType,
      // Add public_id with extension to preserve filename (especially for PDFs)
      // The public_id with .pdf extension ensures Cloudinary preserves it
      ...(publicId ? { public_id: publicId } : {}),
      ...(isImage ? {
        transformation: [
          {
            width: 1200,
            height: 1200,
            crop: 'limit',
            quality: 'auto',
            fetch_format: 'auto'
          }
        ]
      } : {}),
      ...options
    };

    console.log(`[${uploadId}] ⚙️ Upload options:`, {
      folder,
      resourceType,
      publicId: publicId || 'auto-generated',
      hasTransformation: isImage,
      optionsKeys: Object.keys(uploadOptions)
    });

    const dataUrl = isPdf 
      ? `data:application/pdf;base64,${base64Data}`
      : `data:image/jpeg;base64,${base64Data}`;

    console.log(`[${uploadId}] 🚀 Calling Cloudinary API...`, {
      dataUrlLength: dataUrl.length,
      dataUrlPreview: `${dataUrl.substring(0, 50)}...`
    });

    const cloudinaryCallStart = Date.now();
    const result = await cloudinary.uploader.upload(dataUrl, uploadOptions);
    const cloudinaryCallDuration = Date.now() - cloudinaryCallStart;
    
    console.log(`[${uploadId}] ✅ Cloudinary API call successful:`, {
      duration: `${cloudinaryCallDuration}ms`,
      publicId: result.public_id,
      url: result.secure_url,
      bytes: result.bytes,
      format: result.format,
      resourceType: result.resource_type
    });

    // For PDFs, ensure the URL includes the .pdf extension
    // Cloudinary sometimes strips extensions from raw file URLs, so we need to add it back
    let finalUrl = result.secure_url;
    if (isPdf) {
      // Check if URL already has .pdf extension
      const urlWithoutParams = finalUrl.split('?')[0];
      if (!urlWithoutParams.toLowerCase().endsWith('.pdf')) {
        // Insert .pdf before any query parameters or fragments
        const urlParts = finalUrl.split('?');
        finalUrl = urlParts[0] + '.pdf' + (urlParts[1] ? '?' + urlParts[1] : '');
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[${uploadId}] ✅ Cloudinary upload completed:`, {
      totalDuration: `${totalDuration}ms`,
      finalUrl,
      publicId: result.public_id,
      fileSize: `${(result.bytes / 1024).toFixed(2)} KB`
    });

    return {
      url: finalUrl,
      public_id: result.public_id,
      width: result.width || null,
      height: result.height || null,
      format: result.format,
      bytes: result.bytes,
      resource_type: result.resource_type
    };
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[${uploadId}] ❌ Cloudinary upload error:`, {
      duration: `${totalDuration}ms`,
      error: error.message,
      errorName: error.name,
      errorCode: error.http_code || error.code,
      errorStatus: error.status,
      stack: error.stack,
      errorDetails: error.error || null,
      cloudinaryConfig: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'MISSING',
        apiKey: process.env.CLOUDINARY_API_KEY ? 'SET' : 'MISSING',
        apiSecret: process.env.CLOUDINARY_API_SECRET ? 'SET' : 'MISSING'
      }
    });
    throw new Error(`Failed to upload file to Cloudinary: ${error.message}`);
  }
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<object>} Deletion result
 */
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error(`Failed to delete image from Cloudinary: ${error.message}`);
  }
};

module.exports = {
  cloudinary,
  upload,
  uploadFromBase64,
  deleteImage
};


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
  try {
    // Remove data URL prefix if present
    const base64Data = base64String.includes(',') 
      ? base64String.split(',')[1] 
      : base64String;

    // Detect file type from data URL or options
    const mimeType = base64String.includes(',') 
      ? base64String.split(',')[0].split(':')[1].split(';')[0]
      : 'image/jpeg';
    
    const isImage = mimeType.startsWith('image/');
    const isPdf = mimeType === 'application/pdf';
    const resourceType = isPdf ? 'raw' : (isImage ? 'image' : 'auto');

    const uploadOptions = {
      folder: folder,
      resource_type: resourceType,
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

    const dataUrl = isPdf 
      ? `data:application/pdf;base64,${base64Data}`
      : `data:image/jpeg;base64,${base64Data}`;

    const result = await cloudinary.uploader.upload(dataUrl, uploadOptions);

    return {
      url: result.secure_url,
      public_id: result.public_id,
      width: result.width || null,
      height: result.height || null,
      format: result.format,
      bytes: result.bytes,
      resource_type: result.resource_type
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
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


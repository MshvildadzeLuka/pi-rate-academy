const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Custom Multer storage (using memory storage)
const storage = multer.memoryStorage();

// File filter to validate uploaded file types
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.txt', '.zip'];
  const extension = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(extension)) {
    cb(null, true);
  } else {
    cb(new Error(`File type with extension ${extension} is not allowed for assignments`), false);
  }
};

// Configure Multer with the custom storage engine
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // Max 5 files per upload
  }
});

// Middleware to handle file uploads to Cloudinary
const uploadToCloudinary = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  try {
    const uploadPromises = req.files.map(async (file) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const publicId = `pi-rate-academy/assignments/${file.fieldname}-${uniqueSuffix}`;

      // Upload to Cloudinary using streamifier
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'pi-rate-academy/assignments',
            public_id: publicId,
            resource_type: 'auto',
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt', 'zip']
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(file.buffer).pipe(uploadStream);
      });

      return {
        public_id: result.public_id,
        url: result.secure_url,
        fileName: file.originalname,
        fileType: file.mimetype
      };
    });

    // Wait for all uploads to complete
    req.files = await Promise.all(uploadPromises);
    next();
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload files to Cloudinary'
    });
  }
};

// Middleware to handle specific Multer errors gracefully
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: 'File size is too large (max 10MB).'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({
        success: false,
        message: 'Too many files uploaded (max 5).'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(413).json({
        success: false,
        message: 'Unexpected field name for file upload.'
      });
    }
  } else if (err) {
    // Handle file filter errors
    return res.status(415).json({
      success: false,
      message: err.message || 'File upload failed due to an unsupported file type.'
    });
  }
  next();
};

// Utility function to delete files from Cloudinary
const deleteCloudinaryFile = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting file from Cloudinary:', error);
    throw error;
  }
};

// Utility function to delete multiple files
const deleteCloudinaryFiles = async (publicIds) => {
  try {
    const result = await cloudinary.api.delete_resources(publicIds);
    return result;
  } catch (error) {
    console.error('Error deleting files from Cloudinary:', error);
    throw error;
  }
};

module.exports = {
  upload,
  uploadToCloudinary,
  handleUploadErrors,
  deleteCloudinaryFile,
  deleteCloudinaryFiles,
  cloudinary
};
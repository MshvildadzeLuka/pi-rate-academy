const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const ErrorResponse = require('../utils/errorResponse');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer configuration for memory storage
const storage = multer.memoryStorage();

// File filter to validate uploaded file types
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.txt', '.zip'];
  const extension = require('path').extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(extension)) {
    cb(null, true);
  } else {
    cb(new Error(`File type with extension ${extension} is not allowed`), false);
  }
};

// Configure Multer with the custom storage engine
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5000 * 1024 * 1024, // 5000MB
    files: 1
  }
});

// Function for raw PDF uploads
const uploadRawToCloudinary = (file, folder) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder: `pi-rate-academy/${folder}`,
        type: 'upload',
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
};

/**
 * This is a middleware factory. It creates and returns a middleware function
 * that is configured to upload to a specific Cloudinary folder.
 * @param {string} folderName - The name of the Cloudinary folder to upload to.
 * @returns {function} Express middleware.
 */
const createCloudinaryUploader = (folderName) => {
  return async (req, res, next) => {
    const filesToUpload = req.files || (req.file ? [req.file] : []);

    if (filesToUpload.length === 0) {
      return next();
    }

    try {
      const uploadPromises = filesToUpload.map(async (file) => {
        // Use raw upload for PDFs, regular upload for other files
        if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
          const result = await uploadRawToCloudinary(file, folderName);
          return {
            ...file,
            url: result.secure_url,
            public_id: result.public_id,
            resource_type: result.resource_type
          };
        } else {
          return new Promise((resolve, reject) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const publicId = `pi-rate-academy/${folderName}/${file.fieldname}-${uniqueSuffix}`;
            
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: `pi-rate-academy/${folderName}`,
                public_id: publicId,
                resource_type: 'auto',
                type: 'upload',
                allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'doc', 'docx', 'txt', 'zip']
              },
              (error, result) => {
                if (error) reject(error);
                else resolve({
                  ...file,
                  url: result.secure_url,
                  public_id: result.public_id,
                  resource_type: result.resource_type
                });
              }
            );
            streamifier.createReadStream(file.buffer).pipe(uploadStream);
          });
        }
      });

      const uploadedFiles = await Promise.all(uploadPromises);

      // Re-attach the processed files back to the request object
      if (req.files) {
        req.files = uploadedFiles;
      } else {
        req.file = uploadedFiles[0];
      }
      
      next();
    } catch (error) {
      console.error('Cloudinary Upload Error:', error);
      return next(new ErrorResponse('Failed to upload files to Cloudinary.', 500));
    }
  };
};

// Middleware to handle specific Multer errors gracefully
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: 'File size is too large (max 50MB).'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({
        success: false,
        message: 'Too many files uploaded (max 1).'
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
const deleteCloudinaryFile = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    console.error('Error deleting file from Cloudinary:', error);
    throw error;
  }
};

// Utility function to delete multiple files
const deleteCloudinaryFiles = async (publicIds, resourceType = 'image') => {
  try {
    const result = await cloudinary.api.delete_resources(publicIds, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    console.error('Error deleting files from Cloudinary:', error);
    throw error;
  }
};

module.exports = {
  upload,
  createCloudinaryUploader,
  handleUploadErrors,
  deleteCloudinaryFile,
  deleteCloudinaryFiles,
  cloudinary,
  uploadRawToCloudinary
};

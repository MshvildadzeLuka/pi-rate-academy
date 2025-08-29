const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary with your credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

class CloudinaryStorage {
  _handleFile(req, file, cb) {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'lecture-notes',
      },
      (error, result) => {
        if (error) {
          return cb(error);
        }
        file.cloudinary = result;
        cb(null, {
          path: result.secure_url,
          size: result.bytes,
        });
      }
    );
    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  }

  _removeFile(req, file, cb) {
    if (file.cloudinary) {
      cloudinary.uploader.destroy(file.cloudinary.public_id, (error) => {
        cb(error);
      });
    } else {
      cb(null);
    }
  }
}

module.exports = () => {
  return new CloudinaryStorage();
};
// authMiddleware.js (No changes needed, but provided full for completeness)
const jwt = require('jsonwebtoken');
const User = require('../models/userModel.js');
const asyncHandler = require('express-async-handler');
const ErrorResponse = require('../utils/errorResponse');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      
      // Skip authentication for OPTIONS requests (preflight)
      if (req.method === 'OPTIONS') {
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      req.user = await User.findById(decoded.id)
        .select('-password -refreshToken -resetPasswordToken -resetPasswordExpire')
        .populate('groups');

      if (!req.user || !req.user.isActive) {
        return next(new ErrorResponse('Not authorized, user not found or inactive', 401));
      }

      if (req.user.passwordChangedAt && decoded.iat < Math.floor(req.user.passwordChangedAt.getTime() / 1000)) {
        return next(new ErrorResponse('User recently changed password, please login again', 401));
      }

      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return next(new ErrorResponse('Not authorized, token failed', 401));
    }
  }

  // Allow OPTIONS requests without token (for preflight)
  if (req.method === 'OPTIONS') {
    return next();
  }

  // For file uploads, we might need to handle multipart forms differently
  // Check if this is a multipart form (file upload)
  const contentType = req.headers['content-type'];
  if (contentType && contentType.includes('multipart/form-data')) {
    // For file uploads, we might get the token in a different way
    // Try to get token from query string or body if not in headers
    token = req.query.token || (req.body && req.body.token);
    
    if (!token) {
      return next(new ErrorResponse('Not authorized, no token provided', 401));
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id)
        .select('-password -refreshToken -resetPasswordToken -resetPasswordExpire')
        .populate('groups');
      
      if (!req.user || !req.user.isActive) {
        return next(new ErrorResponse('Not authorized, user not found or inactive', 401));
      }
      
      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return next(new ErrorResponse('Not authorized, token failed', 401));
    }
  } else if (!token) {
    return next(new ErrorResponse('Not authorized, no token provided', 401));
  }
});

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ErrorResponse(`Forbidden. Your role (${req.user ? req.user.role : 'Guest'}) is not authorized for this resource.`, 403));
    }
    next();
  };
};

const checkOwnership = (modelName, ownerField = 'createdBy', paramName = 'id') => {
  return asyncHandler(async (req, res, next) => {
    const Model = require(`../models/${modelName}Model`);
    const doc = await Model.findById(req.params[paramName]);
    
    if (!doc) {
      return next(new ErrorResponse('Resource not found', 404));
    }

    if (req.user.role === 'Admin') {
        return next();
    }
    
    if (doc[ownerField] && doc[ownerField].toString() !== req.user._id.toString()) {
      return next(new ErrorResponse('Not authorized to access this resource', 403));
    }

    next();
  });
};

module.exports = { 
  protect, 
  restrictTo,
  checkOwnership
};
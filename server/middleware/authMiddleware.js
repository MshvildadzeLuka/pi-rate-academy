const jwt = require('jsonwebtoken');
const User = require('../models/userModel.js');
const asyncHandler = require('express-async-handler');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];
      
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from token
      req.user = await User.findById(decoded.id).select('-password -refreshToken -resetPasswordToken -resetPasswordExpire');

      if (!req.user || !req.user.isActive) {
        res.status(401);
        throw new Error('Not authorized, user not found or inactive');
      }

      // Check if user changed password after token was issued
      if (req.user.passwordChangedAt && decoded.iat < Math.floor(req.user.passwordChangedAt.getTime() / 1000)) {
        res.status(401);
        throw new Error('User recently changed password, please login again');
      }

      next();
    } catch (error) {
      console.error('JWT Verification Error:', error.message);
      res.status(401).json({ 
        success: false,
        message: 'Not authorized, token failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  if (!token) {
    res.status(401).json({ 
      success: false,
      message: 'Not authorized, no token provided' 
    });
  }
});

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Your role (${req.user ? req.user.role : 'Guest'}) is not authorized for this resource.`,
        requiredRoles: roles
      });
    }
    next();
  };
};

const checkOwnership = (modelName, ownerField = 'createdBy', paramName = 'id') => {
  return asyncHandler(async (req, res, next) => {
    const Model = require(`../models/${modelName}Model`);
    const doc = await Model.findById(req.params[paramName]);
    
    if (!doc) {
      res.status(404);
      throw new Error('Resource not found');
    }

    // Admins can access anything
    if (req.user.role === 'Admin') return next();
    
    // Check ownership using the specified field
    if (doc[ownerField] && doc[ownerField].toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Not authorized to access this resource');
    }

    next();
  });
};

module.exports = { 
  protect, 
  restrictTo,
  checkOwnership
};
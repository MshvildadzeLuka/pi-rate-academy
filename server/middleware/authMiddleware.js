// authMiddleware.js (PRODUCTION-READY & FULLY COMMENTED)
const jwt = require('jsonwebtoken');
const User = require('../models/userModel.js');
const asyncHandler = require('express-async-handler');
const ErrorResponse = require('../utils/errorResponse');

/**
 * @desc    Middleware to protect routes by verifying a JSON Web Token (JWT).
 * This function is the single, reliable source of truth for authenticating
 * ALL API requests in the application. It follows the industry-standard
 * approach of checking the Authorization header.
 */
const protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1. Check for the token in the Authorization header.
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // 2. Extract the token from the header (format: "Bearer <token>").
      token = req.headers.authorization.split(' ')[1];

      // 3. Verify the token's signature and expiration.
      // If the token is invalid or expired, jwt.verify will throw an error.
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // 4. Find the user from the database using the ID stored in the token.
      //    We exclude sensitive fields like password for security.
      req.user = await User.findById(decoded.id)
        .select('-password -refreshToken -resetPasswordToken -resetPasswordExpire')
        .populate('groups');

      // 5. Security Checks: Ensure the user still exists and is active.
      if (!req.user) {
        return next(new ErrorResponse('The user belonging to this token no longer exists.', 401));
      }
      if (!req.user.isActive) {
        return next(new ErrorResponse('User is not active. Please contact support.', 401));
      }

      // 6. If all checks pass, proceed to the next middleware or the route handler.
      return next();

    } catch (error) {
      // 7. Handle specific JWT errors for clearer client-side feedback.
      console.error('Authentication Error:', error.name, '-', error.message);

      if (error.name === 'TokenExpiredError') {
        return next(new ErrorResponse('Your session has expired. Please log in again.', 401));
      }
      
      if (error.name === 'JsonWebTokenError') {
          return next(new ErrorResponse('Invalid token. Please log in again.', 401));
      }
      
      // Fallback for any other errors during token verification.
      return next(new ErrorResponse('Not authorized to access this route.', 401));
    }
  }

  // 8. If no token is found in the header, deny access immediately.
  if (!token) {
    return next(new ErrorResponse('Not authorized, no token provided.', 401));
  }
});

/**
 * @desc    Middleware to restrict access to a route to specific user roles.
 * @param   {...string} roles - An array of roles that are permitted access (e.g., 'Admin', 'Teacher').
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    // This middleware must run AFTER the 'protect' middleware, which sets req.user.
    if (!req.user || !roles.includes(req.user.role)) {
      // If the user's role is not in the allowed list, send a 403 Forbidden error.
      return next(new ErrorResponse(`Forbidden. Your role (${req.user ? req.user.role : 'Guest'}) does not have permission to perform this action.`, 403));
    }
    // If the user has the correct role, proceed.
    next();
  };
};

/**
 * @desc    Middleware to check if the current user is the owner of a specific document.
 * @param   {string} modelName - The file name of the Mongoose model (e.g., 'quizTemplate').
 * @param   {string} [ownerField='creatorId'] - The field in the document that stores the owner's user ID.
 * @param   {string} [paramName='id'] - The name of the URL parameter containing the document's ID (e.g., '/quizzes/:id').
 */
const checkOwnership = (modelName, ownerField = 'creatorId', paramName = 'id') => {
  return asyncHandler(async (req, res, next) => {
    // Dynamically require the model based on the provided name.
    const Model = require(`../models/${modelName}Model`);
    const doc = await Model.findById(req.params[paramName]);
    
    if (!doc) {
      return next(new ErrorResponse('Resource not found with that ID.', 404));
    }

    // Admins are always authorized and can bypass the ownership check.
    if (req.user.role === 'Admin') {
        return next();
    }
    
    // Check if the document's owner ID matches the logged-in user's ID.
    if (doc[ownerField] && doc[ownerField].toString() !== req.user._id.toString()) {
      return next(new ErrorResponse('You do not have permission to perform this action on this resource.', 403));
    }

    // If the user is the owner, proceed.
    next();
  });
};

module.exports = { 
  protect, 
  restrictTo,
  checkOwnership
};


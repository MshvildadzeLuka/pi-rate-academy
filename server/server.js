// Load environment variables immediately
const dotenv = require('dotenv');
dotenv.config();

// Standard library imports
const path = require('path');

// Third-party package imports
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = 'express-rate-limit';

// Local module imports
const validateEnv = require('./validateEnv');
const assignmentStatusUpdater = require('./utils/assignmentStatusUpdater');
const quizStatusUpdater = require('./utils/quizStatusUpdater');

// --- INITIALIZATION & CONFIGURATION ---

// Validate all required environment variables before starting
validateEnv();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5001;

// --- DATABASE CONNECTION ---

// Asynchronous function to connect to MongoDB
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully.');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    // Exit process with failure code if database connection fails
    process.exit(1);
  }
})();

// --- CORE MIDDLEWARE ---

// Define allowed origins for CORS
const allowedOrigins = [
    'http://127.0.0.1:5500',
    'http://localhost:5500'
];

// Add the production frontend URL from environment variables if it exists
if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}

// CORS configuration to allow requests only from whitelisted origins
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Set security-related HTTP headers
app.use(helmet());

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Sanitize user-supplied data to prevent MongoDB operator injection
app.use(mongoSanitize());

// Middleware for parsing JSON and urlencoded data with increased limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- API ROUTES ---

// Import and use all API route handlers
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/groups', require('./routes/groupRoutes'));
app.use('/api/notes', require('./routes/noteRoutes'));
app.use('/api/videos', require('./routes/videoRoutes'));
app.use('/api/assignments', require('./routes/assignmentRoutes'));
app.use('/api/lectures', require('./routes/lectureRoutes'));
app.use('/api/ratings', require('./routes/ratingRoutes'));
app.use('/api/quizzes', require('./routes/quizRoutes'));
app.use('/api/calendar-events', require('./routes/calendarRoutes'));

// --- FRONTEND SERVING ---

// Define the absolute path to the client folder for serving static assets
const clientPath = path.join(__dirname, 'client');
app.use(express.static(clientPath));

// For any GET request that doesn't match an API route or a static file,
// send the login.html page. This is the entry point for your application.
app.get('*', (req, res) => {
  res.sendFile(path.join(clientPath, 'login', 'login.html'));
});

// --- ERROR HANDLING MIDDLEWARE ---

// Custom error handler to catch all errors from routes
app.use((err, req, res, next) => {
  console.error(err.stack);
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Customize error messages for specific Mongoose errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(val => val.message).join(', ');
  } else if (err.name === 'CastError') {
    statusCode = 404;
    message = 'Resource not found';
  } else if (err.code === 11000) {
    statusCode = 400;
    message = 'Duplicate field value entered';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication failed. Please log in again.';
  }

  res.status(statusCode).json({
    success: false,
    message,
    // Only show the detailed error stack in development mode for security
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// --- SERVER STARTUP ---

// Start the server and listen on the specified port and network interface
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

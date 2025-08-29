// Load environment variables
const dotenv = require('dotenv');
dotenv.config();

// Validate environment
const validateEnv = require('./config/validateEnv');
validateEnv();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const cloudinary = require('cloudinary').v2;
const assignmentStatusUpdater = require('./utils/assignmentStatusUpdater');
const quizStatusUpdater = require('./utils/quizStatusUpdater');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Initialize Express
const app = express();
const PORT = process.env.PORT || 5001;

// =================================================================
// !!! THE CORS FIX IS HERE !!!
// =================================================================
const allowedOrigins = [
    'http://localhost:3000', // Your default frontend URL
    'http://127.0.0.1:5500', // A common Live Server address
    'http://127.0.0.1:8080'  // Another common dev server address
    // Add any other local addresses you might use
];

if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// =================================================================

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(helmet());
app.use(hpp());
app.use(mongoSanitize());

// Rate limiting
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests, please try again later'
}));

// Connect DB
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully.');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
})();

// Import Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/groups', require('./routes/groupRoutes'));
app.use('/api/notes', require('./routes/noteRoutes'));
app.use('/api/videos', require('./routes/videoRoutes'));
app.use('/api/assignments', require('./routes/assignmentRoutes'));
app.use('/api/lectures', require('./routes/lectureRoutes'));
app.use('/api/ratings', require('./routes/ratingRoutes'));
app.use('/api/quizzes', require('./routes/quizRoutes'));

console.log('Starting assignment status updater...');
console.log('Starting quiz status updater...');

// Serve frontend
app.use(express.static(path.join(__dirname, '../client')));
app.get('/api', (req, res) => res.json({ success: true, message: 'Pi-Rate Academy Server is running!' }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../client', 'home', 'home.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Server Error';
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(val => val.message).join(', ');
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid resource ID';
  } else if (err.code === 11000) {
    statusCode = 400;
    message = 'Duplicate field value entered';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }
  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start Server
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Handle crashes
process.on('unhandledRejection', err => {
  console.error(`Unhandled Rejection:`, err.message);
  server.close(() => process.exit(1));
});
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err.message);
  server.close(() => process.exit(1));
});
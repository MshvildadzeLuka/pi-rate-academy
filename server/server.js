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
const videoRoutes = require('./routes/videoRoutes');

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
// TRUST PROXY SETTING (FIX FOR DEPLOYMENT)
// =================================================================
// This tells Express to trust the 'X-Forwarded-For' header from the proxy
// which is essential for express-rate-limit to work correctly on Render.
app.set('trust proxy', 1);
// =================================================================

// =================================================================
// IMPROVED CORS CONFIGURATION
// =================================================================
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:8080',
    'http://localhost:5500',
    'http://localhost:8080',
    'http://192.168.0.102:5001'
];

// Add environment-specific origins
if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}

// Add the server's own origin for direct access
if (process.env.NODE_ENV === 'development') {
    allowedOrigins.push(`http://localhost:${PORT}`);
    allowedOrigins.push(`http://127.0.0.1:${PORT}`);
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
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

// API routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/groups', require('./routes/groupRoutes'));
app.use('/api/notes', require('./routes/noteRoutes'));
app.use('/api/videos', videoRoutes);
app.use('/api/assignments', require('./routes/assignmentRoutes'));
app.use('/api/lectures', require('./routes/lectureRoutes'));
app.use('/api/ratings', require('./routes/ratingRoutes'));
app.use('/api/quizzes', require('./routes/quizRoutes'));
app.use('/api/calendar-events', require('./routes/calendarRoutes'));

console.log('Starting assignment status updater...');
console.log('Starting quiz status updater...');

// Serve frontend
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));
console.log(`Serving static files from: ${clientPath}`);

// API status check
app.get('/api', (req, res) => res.json({ success: true, message: 'Pi-Rate Academy Server is running!' }));

// SPA fallback for client-side routing
app.get('*', (req, res) => {
  // Check if the request is for an API route
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ message: 'API route not found' });
  }
  // Otherwise, serve the main HTML file for the frontend
  res.sendFile(path.resolve(clientPath, 'home', 'home.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Server Error';

  if(err.code === 'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR') {
    statusCode = 429;
    message = "Rate limit error due to configuration. Please try again shortly."
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(val => val.message).join(', ');
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid resource ID';
  } else if (err.code === 11000) {
    statusCode = 400;
    message = 'Duplicate field value entered';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired. Please log in again.';
  }
  
  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start Server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} and accessible on your local network`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', err => {
  console.error(`Unhandled Rejection:`, err.message);
  server.close(() => process.exit(1));
});
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err.message);
  server.close(() => process.exit(1));
});

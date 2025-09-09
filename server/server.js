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
// ✅ FIX: TRUST PROXY SETTING (CRITICAL FOR RENDER DEPLOYMENT)
// =================================================================
// This tells Express to trust the 'X-Forwarded-For' header from the proxy.
// This is essential for express-rate-limit to work correctly on Render,
// as it ensures the rate limiter sees the user's real IP, not the proxy's.
app.set('trust proxy', 1);
// =================================================================

// =================================================================
// ✅ FIX: ROBUST CORS CONFIGURATION FOR PRODUCTION
// =================================================================
// This configuration is more secure and flexible for deployment.
const allowedOrigins = [
    // Add local development URLs
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:8080',
];

// Add the production frontend URL from the environment variables.
// This is the key change to make it work on Render.
if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
// =================================================================

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// =================================================================
// ✅ FIX: HELMET CONFIGURATION FOR CSP
// This new configuration allows for external resources
// like fonts, scripts, and images.
// =================================================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "https://res.cloudinary.com", "https://placehold.co"],
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "connect-src": ["'self'", "https://api.cloudinary.com"],
      },
    },
  })
);
// =================================================================
app.use(hpp());
app.use(mongoSanitize());

// Rate limiting
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
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
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ message: 'API route not found' });
  }
  // All non-API requests will serve the main entry point of your frontend.
  res.sendFile(path.resolve(clientPath, 'home', 'home.html'));
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

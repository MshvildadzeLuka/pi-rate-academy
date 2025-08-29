const mongoose = require('mongoose');
const { Schema } = mongoose;
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

// Storage Quota Sub-Schema
const storageSchema = new Schema({
  total: { type: Number, default: 1073741824 }, // 1GB default
  used: { type: Number, default: 0 },
  lastReset: { type: Date, default: Date.now },
  files: { type: Number, default: 0 }
}, { _id: false });

// API Rate Limit Sub-Schema
const apiLimitSchema = new Schema({
  windowMs: { type: Number, default: 15 * 60 * 1000 }, // 15 minutes
  max: { type: Number, default: 100 }, // 100 requests per window
  current: { type: Number, default: 0 },
  lastHit: Date
}, { _id: false });

// Main User Schema
const userSchema = new Schema({
  // Basic Info
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  photoUrl: {
    type: String,
    default: '',
  },
  aboutMe: {
    type: String,
    default: '',
  },
  socials: {
    twitter: String,
    linkedin: String,
    github: String,
  },
  
  // Authentication & Role
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email']
  },
  password: {
    type: String,
    required: true,
    minlength: 8 // Lowered for development, consider increasing for production
  },
  role: {
    type: String,
    enum: ['Student', 'Teacher', 'Admin'],
    default: 'Student',
  },
  isActive: { // <-- ADDED THIS FIELD
    type: Boolean,
    default: true,
  },
  
  // Teacher Ratings
  ratings: [
    {
      student: { type: Schema.Types.ObjectId, ref: 'User' },
      rating: { type: Number, required: true },
    },
  ],
  averageRating: {
    type: Number,
    default: 0,
  },
  totalRatings: {
    type: Number,
    default: 0,
  },

  // Storage Management
  storage: storageSchema,
  apiLimits: {
    global: apiLimitSchema,
    endpoints: {
      upload: { ...apiLimitSchema.obj, max: { type: Number, default: 20 } },
      download: { ...apiLimitSchema.obj, max: { type: Number, default: 50 } }
    }
  },
  
  // Security
  lastLogin: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  mfa: {
    enabled: { type: Boolean, default: false },
    secret: { type: String }
  },
  
  // Metadata
  meta: {
    creationIP: String,
    lastIP: String,
    devices: [{
      id: { type: String, default: uuidv4 },
      name: String,
      lastUsed: Date,
      os: String,
      browser: String
    }]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Password Hashing
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with the hashed password in the database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Rate Limiting Middleware
userSchema.methods.checkRateLimit = function(endpoint = 'global') {
  const limit = this.apiLimits[endpoint] || this.apiLimits.global;
  
  if (limit.lastHit && 
      Date.now() - limit.lastHit < limit.windowMs && 
      limit.current >= limit.max) {
    throw new Error('Rate limit exceeded');
  }
  
  limit.current += 1;
  limit.lastHit = Date.now();
  return this.save();
};

// Storage Management
userSchema.methods.checkStorage = function(fileSize) {
  if (this.storage.used + fileSize > this.storage.total) {
    throw new Error('Storage quota exceeded');
  }
  
  this.storage.used += fileSize;
  this.storage.files += 1;
  return this.save();
};

// Indexes
userSchema.index({ 'meta.devices.id': 1 });

// Model
const User = mongoose.model('User', userSchema);
module.exports = User;
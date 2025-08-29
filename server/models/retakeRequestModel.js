const mongoose = require('mongoose');
const { Schema } = mongoose;

const retakeRequestSchema = new Schema({
  // Polymorphic association to link to either a Quiz or StudentAssignment
  requestableId: {
    type: Schema.Types.ObjectId,
    required: true,
    refPath: 'requestableType'
  },
  requestableType: {
    type: String,
    required: true,
    enum: ['Quiz', 'StudentAssignment']
  },
  studentId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  courseId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Group', 
    required: true 
  },
  reason: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 2000
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied'],
    default: 'pending',
    index: true
  },
  reviewedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  },
  reviewedAt: Date,
  reviewNotes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  // For tracking communication
  messages: [{
    senderId: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    read: {
      type: Boolean,
      default: false
    }
  }],
  // For tracking urgency
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  // For automatic escalation
  escalationLevel: {
    type: Number,
    min: 0,
    max: 3,
    default: 0
  },
  // For tracking response time
  responseTimeHours: Number
}, { 
  timestamps: true 
});

// ===== INDEXES FOR PERFORMANCE AND DATA INTEGRITY =====

// General indexes for faster queries
retakeRequestSchema.index({ studentId: 1, status: 1 });
retakeRequestSchema.index({ courseId: 1, createdAt: -1 });
retakeRequestSchema.index({ requestableType: 1, requestableId: 1 });
retakeRequestSchema.index({ reviewedBy: 1 }); // Added for queries by reviewer

// ** [CORRECTED] Partial Unique Index to prevent duplicate pending requests **
// This is the key change to fix the E11000 error permanently.
// It ensures that a student can only have ONE request with a 'pending' status
// for a specific assignment (requestableId). Once the request is 'approved' or
// 'denied', they could theoretically submit another one if needed.
retakeRequestSchema.index(
  { requestableId: 1, studentId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' }
  }
);

// Virtual for calculating response time
retakeRequestSchema.virtual('timeToResponse').get(function() {
  if (!this.reviewedAt || !this.createdAt) return null;
  return (this.reviewedAt - this.createdAt) / (1000 * 60 * 60); // Hours
});

// Pre-save middleware to calculate response time
retakeRequestSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status !== 'pending' && !this.reviewedAt) {
    this.reviewedAt = new Date();
  }
  
  if (this.isModified('reviewedAt') && this.reviewedAt && this.createdAt) {
    this.responseTimeHours = (this.reviewedAt - this.createdAt) / (1000 * 60 * 60);
  }
  
  next();
});

// Pre-save middleware to check for duplicate pending requests
retakeRequestSchema.pre('save', async function(next) {
  if (this.isNew && this.status === 'pending') {
    const RetakeRequest = mongoose.model('RetakeRequest');
    const existingRequest = await RetakeRequest.findOne({
      requestableId: this.requestableId,
      studentId: this.studentId,
      status: 'pending'
    });
    
    if (existingRequest) {
      const error = new Error('A pending retake request already exists for this assignment');
      error.name = 'DuplicateRequestError';
      return next(error);
    }
  }
  next();
});

// Method to add a message to the request
retakeRequestSchema.methods.addMessage = function(senderId, message) {
  this.messages.push({
    senderId,
    message,
    sentAt: new Date()
  });
  return this.save();
};

// Static method to get stats for a course
retakeRequestSchema.statics.getCourseStats = function(courseId) {
  return this.aggregate([
    { $match: { courseId: mongoose.Types.ObjectId(courseId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgResponseTime: { $avg: '$responseTimeHours' }
      }
    }
  ]);
};

// Static method to get stats with default values
retakeRequestSchema.statics.getCourseStatsWithDefaults = async function(courseId) {
  try {
    const stats = await this.getCourseStats(courseId);
    
    // Ensure all statuses are represented with defaults
    const statuses = ['pending', 'approved', 'denied'];
    const result = {};
    
    statuses.forEach(status => {
      const stat = stats.find(s => s._id === status);
      result[status] = {
        count: stat ? stat.count : 0,
        avgResponseTime: stat ? stat.avgResponseTime : 0
      };
    });
    
    return result;
  } catch (error) {
    // Return default values on error
    return {
      pending: { count: 0, avgResponseTime: 0 },
      approved: { count: 0, avgResponseTime: 0 },
      denied: { count: 0, avgResponseTime: 0 }
    };
  }
};

const RetakeRequest = mongoose.models.RetakeRequest || mongoose.model('RetakeRequest', retakeRequestSchema);

module.exports = RetakeRequest;
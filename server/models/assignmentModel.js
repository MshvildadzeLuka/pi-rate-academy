const mongoose = require('mongoose');
const { Schema } = mongoose;
const { isURL, isISO8601 } = require('validator');
const diff = require('deep-diff');
const { v4: uuidv4 } = require('uuid');

// Rubric Criteria Sub-Schema
const rubricCriteriaSchema = new Schema({
  _id: {
    type: String,
    default: () => uuidv4()
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  maxPoints: {
    type: Number,
    required: true,
    min: 0,
    max: 1000
  },
  weight: {
    type: Number,
    default: 1,
    min: 0.1,
    max: 10
  }
}, { _id: false });

// File Attachment Sub-Schema
const fileAttachmentSchema = new Schema({
  cloudId: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true,
    validate: [isURL, 'Invalid URL']
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  size: {
    type: Number,
    min: 0
  },
  type: {
    type: String,
    enum: ['document', 'image', 'video', 'archive', 'code'],
    required: true
  },
  virusScanned: {
    type: Boolean,
    default: false
  },
  scanResults: {
    threats: [String],
    clean: Boolean
  }
}, { _id: false });

// Annotation Sub-Schema
const annotationSchema = new Schema({
  _id: {
    type: String,
    default: () => uuidv4()
  },
  page: {
    type: Number,
    required: true,
    min: 1
  },
  coordinates: {
    x: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    y: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    width: {
      type: Number,
      min: 1,
      max: 100
    },
    height: {
      type: Number,
      min: 1,
      max: 100
    }
  },
  type: {
    type: String,
    enum: ['highlight', 'comment', 'strikeout', 'drawing'],
    required: true
  },
  content: {
    text: String,
    color: String,
    style: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  resolved: {
    type: Boolean,
    default: false
  },
  resolution: {
    note: String,
    resolvedBy: Schema.Types.ObjectId,
    resolvedAt: Date
  }
}, { _id: false });

// Submission Version Sub-Schema
const submissionVersionSchema = new Schema({
  version: {
    type: Number,
    required: true,
    min: 1
  },
  submittedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  files: [fileAttachmentSchema],
  comments: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  diff: {
    type: Schema.Types.Mixed // Stores deep-diff object
  },
  ipAddress: String,
  userAgent: String,
  late: {
    type: Boolean,
    default: false
  },
  lateMinutes: {
    type: Number,
    min: 0
  }
}, { _id: false });

// Peer Review Sub-Schema
const peerReviewSchema = new Schema({
  reviewer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  feedback: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  helpful: {
    type: Boolean,
    default: null
  }
}, { _id: false });

// Main Assignment Schema
const assignmentSchema = new Schema({
  title: {
    type: String,
    required: [true, 'Assignment title is required'],
    trim: true,
    maxlength: [120, 'Title cannot exceed 120 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  instructions: {
    type: String,
    trim: true,
    maxlength: [5000, 'Instructions cannot exceed 5000 characters']
  },
  creator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  course: {
    type: Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  dueDate: {
    type: Date,
    required: true,
    validate: [isISO8601, 'Invalid ISO 8601 timestamp'],
    index: true
  },
  availableFrom: {
    type: Date,
    validate: [isISO8601, 'Invalid ISO 8601 timestamp']
  },
  points: {
    type: Number,
    required: true,
    min: 0,
    max: 1000,
    default: 100,
    validate: {
      validator: Number.isInteger,
      message: 'Points must be an integer'
    }
  },
  attachments: [fileAttachmentSchema],
  rubric: [rubricCriteriaSchema],
  submissionSettings: {
    maxFiles: {
      type: Number,
      min: 1,
      max: 20,
      default: 5
    },
    maxSizePerFile: { // in MB
      type: Number,
      min: 1,
      max: 500,
      default: 100
    },
    allowedTypes: [String],
    allowLateSubmissions: {
      type: Boolean,
      default: false
    },
    latePenalty: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    maxSubmissions: {
      type: Number,
      min: 1,
      max: 50,
      default: 3
    },
  },
  submissions: [{
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    versions: [submissionVersionSchema],
    currentVersion: {
      type: Number,
      min: 1
    },
    grade: {
      score: {
        type: Number,
        min: 0
      },
      feedback: {
        type: String,
        trim: true,
        maxlength: 5000
      },
      rubricScores: [{
        criteriaId: String,
        score: Number,
        comments: String
      }],
      gradedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      gradedAt: Date,
      released: {
        type: Boolean,
        default: false
      }
    },
    annotations: [annotationSchema],
    peerReviews: [peerReviewSchema],
    discussion: [{
      _id: {
        type: String,
        default: () => uuidv4()
      },
      author: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      replies: [{
        _id: {
          type: String,
          default: () => uuidv4()
        },
        author: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        content: {
          type: String,
          required: true,
          trim: true,
          maxlength: 2000
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }]
    }]
  }],
  settings: {
    allowPeerReview: {
      type: Boolean,
      default: false
    },
    peerReviewDeadline: Date,
    anonymousGrading: {
      type: Boolean,
      default: false
    },
    groupSubmission: {
      type: Boolean,
      default: false
    },
    maxGroupSize: {
      type: Number,
      min: 2,
      max: 10
    }
  },
  metadata: {
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    ipAddress: String,
    userAgent: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  optimisticConcurrency: true
});

// Virtual for submission status
assignmentSchema.virtual('status').get(function() {
  const now = new Date();
  if (this.availableFrom && now < this.availableFrom) return 'scheduled';
  if (now > this.dueDate) return 'closed';
  return 'open';
});

// Virtual for time remaining (in hours)
assignmentSchema.virtual('hoursRemaining').get(function() {
  return Math.max(0, (this.dueDate - new Date()) / (1000 * 60 * 60));
});

// Pre-save hook for version diffs (removed because we handle it in the route)

// Static method for bulk operations
assignmentSchema.statics.updateDueDates = async function(assignmentIds, newDueDate) {
  return this.updateMany(
    { _id: { $in: assignmentIds } },
    { $set: { dueDate: newDueDate } }
  );
};

// Query helpers
assignmentSchema.query.byCourse = function(courseId) {
  return this.where('course').equals(courseId);
};

assignmentSchema.query.open = function() {
  const now = new Date();
  return this.where('dueDate').gt(now);
};

// Indexes
assignmentSchema.index({ course: 1, dueDate: 1 });
assignmentSchema.index({ creator: 1, dueDate: 1 });
assignmentSchema.index({ 'submissions.student': 1 });
assignmentSchema.index({ dueDate: 1, status: 1 });

const Assignment = mongoose.model('Assignment', assignmentSchema);

module.exports = Assignment;
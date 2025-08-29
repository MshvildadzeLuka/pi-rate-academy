const mongoose = require('mongoose');
const { Schema } = mongoose;

const pointsLedgerSchema = new Schema({
  studentId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  courseId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Group', 
    required: true 
  },
  sourceType: { 
    type: String, 
    enum: ['assignment', 'quiz'], 
    required: true 
  },
  sourceId: { 
    type: Schema.Types.ObjectId, 
    required: true 
  }, // ID of the specific StudentAssignment or QuizAttempt
  pointsEarned: { 
    type: Number, 
    required: true 
  },
  pointsPossible: { 
    type: Number, 
    required: true 
  },
  awardedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

// Index for efficient querying of a student's total points in a course
pointsLedgerSchema.index({ studentId: 1, courseId: 1 });

const PointsLedger = mongoose.model('PointsLedger', pointsLedgerSchema);
module.exports = PointsLedger;
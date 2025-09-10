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
  sourceTitle: {
    type: String,
    required: true,
    trim: true
  },
  pointsEarned: { 
    type: Number, 
    required: true 
  },
  pointsPossible: { 
    type: Number, 
    required: true 
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  awardedAt: { 
    type: Date, 
    default: Date.now 
  },
  gradedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, { 
  timestamps: true 
});

// Index for efficient querying of a student's total points in a course
pointsLedgerSchema.index({ studentId: 1, courseId: 1 });
pointsLedgerSchema.index({ studentId: 1, sourceType: 1 });
pointsLedgerSchema.index({ courseId: 1, awardedAt: -1 });

// Pre-save middleware to calculate percentage
pointsLedgerSchema.pre('save', function(next) {
  if (this.pointsPossible > 0) {
    this.percentage = (this.pointsEarned / this.pointsPossible) * 100;
  } else {
    this.percentage = 0;
  }
  next();
});

// Static method to get student's total points in a course
pointsLedgerSchema.statics.getStudentTotalPoints = function(studentId, courseId) {
  return this.aggregate([
    { $match: { studentId: mongoose.Types.ObjectId(studentId), courseId: mongoose.Types.ObjectId(courseId) } },
    {
      $group: {
        _id: '$studentId',
        totalPointsEarned: { $sum: '$pointsEarned' },
        totalPointsPossible: { $sum: '$pointsPossible' },
        averagePercentage: { $avg: '$percentage' }
      }
    }
  ]);
};

// Static method to get course leaderboard
pointsLedgerSchema.statics.getCourseLeaderboard = function(courseId, limit = 10) {
  return this.aggregate([
    { $match: { courseId: mongoose.Types.ObjectId(courseId) } },
    {
      $group: {
        _id: '$studentId',
        totalPointsEarned: { $sum: '$pointsEarned' },
        totalPointsPossible: { $sum: '$pointsPossible' },
        averagePercentage: { $avg: '$percentage' }
      }
    },
    { $sort: { averagePercentage: -1, totalPointsEarned: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'student'
      }
    },
    { $unwind: '$student' },
    {
      $project: {
        'student.password': 0,
        'student.email': 0,
        'student.__v': 0
      }
    }
  ]);
};

// NEW: Static method to get a student's weekly points history
pointsLedgerSchema.statics.getStudentWeeklyPoints = function(studentId) {
  return this.aggregate([
    { $match: { studentId: studentId } },
    { $sort: { awardedAt: 1 } },
    {
      $group: {
        _id: {
          year: { $year: '$awardedAt' },
          week: { $week: '$awardedAt' }
        },
        activities: {
          $push: {
            sourceId: '$sourceId',
            sourceType: '$sourceType',
            sourceTitle: '$sourceTitle',
            pointsEarned: '$pointsEarned',
            pointsPossible: '$pointsPossible',
            percentage: '$percentage',
            awardedAt: '$awardedAt'
          }
        },
        totalPointsEarned: { $sum: '$pointsEarned' },
        totalPointsPossible: { $sum: '$pointsPossible' },
        averagePercentage: { $avg: '$percentage' }
      }
    },
    { $sort: { '_id.year': -1, '_id.week': -1 } }
  ]);
};

const PointsLedger = mongoose.model('PointsLedger', pointsLedgerSchema);

module.exports = PointsLedger;

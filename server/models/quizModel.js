const mongoose = require('mongoose');
const { Schema } = mongoose;
const mongoosePaginate = require('mongoose-paginate-v2');

const quizSchema = new Schema({
  title: {
    type: String,
    required: [true, 'A quiz must have a title'],
    trim: true,
    maxlength: [120, 'Quiz title cannot exceed 120 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Quiz description cannot exceed 500 characters']
  },
  instructions: {
    type: String,
    trim: true,
    maxlength: [2000, 'Quiz instructions cannot exceed 2000 characters']
  },
  group: {
    type: Schema.Types.ObjectId,
    ref: 'Group',
    required: [true, 'A quiz must be assigned to a group']
  },
  questions: [{
    type: Schema.Types.ObjectId,
    ref: 'Question'
  }],
  totalPoints: {
    type: Number,
    default: 1,
    min: [1, 'Total points must be at least 1']
  },
  timeLimit: { // New field for the quiz timer
    type: Number, // in minutes
    min: [1, 'Time limit must be at least 1 minute']
  },
  shuffleQuestions: {
    type: Boolean,
    default: false
  },
  shuffleOptions: {
    type: Boolean,
    default: false
  },
  showResults: {
    type: String,
    enum: ['immediately', 'after-submission', 'after-deadline', 'never'],
    default: 'after-submission'
  },
  allowRetakes: {
    type: Boolean,
    default: false
  },
  maxAttempts: {
    type: Number,
    default: 1,
    min: [1, 'Maximum attempts must be at least 1']
  },
  startTime: {
    type: Date,
    required: [true, 'A quiz must have a start time']
  },
  endTime: {
    type: Date,
    required: [true, 'A quiz must have an end time'],
    validate: {
      validator: function(value) {
        return value > this.startTime;
      },
      message: 'End time must be after start time'
    }
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'A quiz must have a creator']
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  requiresPassword: {
    type: Boolean,
    default: false
  },
  password: {
    type: String,
    select: false,
    validate: {
      validator: function(value) {
        if (this.requiresPassword) {
          return value && value.length >= 4;
        }
        return true;
      },
      message: 'Password must be at least 4 characters when required'
    }
  },
  metadata: {
    averageScore: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    totalAttempts: { type: Number, default: 0 }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
quizSchema.index({ group: 1, startTime: 1 });
quizSchema.index({ createdBy: 1, createdAt: -1 });
quizSchema.index({ startTime: 1, endTime: 1 });
quizSchema.index({ questions: 1 });

// Virtuals for computed properties
quizSchema.virtual('isActive').get(function() {
  const now = new Date();
  if (!this.startTime || !this.endTime) return false;
  return now >= this.startTime && now <= this.endTime;
});

quizSchema.virtual('questionCount').get(function() {
  return this.questions.length;
});

// Pre-save middleware to automatically calculate total points
quizSchema.pre('save', async function(next) {
  if (this.isModified('questions')) {
    try {
      // Guard against empty questions array
      if (!this.questions || this.questions.length === 0) {
        this.totalPoints = 1;
        return next();
      }
      
      await this.populate('questions');
      this.totalPoints = this.questions.reduce((sum, question) => sum + (question.points || 0), 0);
      if (this.totalPoints === 0) this.totalPoints = 1; // Ensure totalPoints is at least 1
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Static method to update quiz statistics
quizSchema.statics.updateQuizStatistics = async function(quizId) {
  const QuizAttempt = mongoose.model('QuizAttempt');
  
  const stats = await QuizAttempt.aggregate([
    { $match: { quiz: quizId, status: { $in: ['submitted', 'graded'] } } },
    {
      $group: {
        _id: '$quiz',
        averageScore: { $avg: '$score' },
        totalAttempts: { $sum: 1 }
      }
    }
  ]);
  
  if (stats.length > 0) {
    // Get the quiz with populated group
    const quiz = await this.findById(quizId).populate('group');
    if (!quiz || !quiz.group) {
      throw new Error('Quiz or group not found');
    }
    
    const studentCount = quiz.group.users.filter(user => user.role === 'Student').length;
    
    return this.findByIdAndUpdate(quizId, {
      'metadata.averageScore': stats[0].averageScore || 0,
      'metadata.totalAttempts': stats[0].totalAttempts || 0,
      'metadata.completionRate': studentCount > 0 ? (stats[0].totalAttempts / studentCount) * 100 : 0
    });
  }
  
  return this;
};

// Attach the pagination plugin to the schema
quizSchema.plugin(mongoosePaginate);

const Quiz = mongoose.models.Quiz || mongoose.model('Quiz', quizSchema);

module.exports = Quiz;
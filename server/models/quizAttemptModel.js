const mongoose = require('mongoose');
const { Schema } = mongoose;

const answerSchema = new Schema({
  question: {
    type: Schema.Types.ObjectId,
    ref: 'Question',
    required: [true, 'Answer must reference a question']
  },
  selectedOptionIndex: {
    type: Number,
    validate: {
      validator: function(value) {
        return value >= 0;
      },
      message: 'Selected option index must be a non-negative number'
    }
  },
  textAnswer: {
    type: String,
    trim: true,
    maxlength: [5000, 'Text answer cannot exceed 5000 characters']
  },
  isCorrect: {
    type: Boolean,
    default: false
  },
  pointsAwarded: {
    type: Number,
    default: 0,
    min: [0, 'Points awarded cannot be negative']
  },
  timeTaken: {
    type: Number, // in seconds
    default: 0,
    min: [0, 'Time taken cannot be negative']
  },
  answeredAt: {
    type: Date,
    default: Date.now
  },
  reviewedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  teacherFeedback: {
    type: String,
    trim: true,
    maxlength: [1000, 'Teacher feedback cannot exceed 1000 characters']
  }
}, { _id: true });

const quizAttemptSchema = new Schema({
  quiz: {
    type: Schema.Types.ObjectId,
    ref: 'Quiz',
    required: [true, 'Attempt must reference a quiz']
  },
  student: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Attempt must have a student']
  },
  attemptNumber: {
    type: Number,
    required: [true, 'Attempt must have a number'],
    min: [1, 'Attempt number must be at least 1']
  },
  startTime: {
    type: Date,
    required: [true, 'Attempt must have a start time'],
    default: Date.now
  },
  endTime: {
    type: Date,
    validate: {
      validator: function(value) {
        return !value || value >= this.startTime;
      },
      message: 'End time must be after start time'
    }
  },
  status: {
    type: String,
    enum: ['in-progress', 'submitted', 'graded', 'completed', 'abandoned'],
    default: 'in-progress'
  },
  answers: [answerSchema],
  score: {
    type: Number,
    default: 0,
    min: [0, 'Score cannot be negative']
  },
  timeTaken: {
    type: Number, // in seconds
    default: 0,
    min: [0, 'Time taken cannot be negative']
  },
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  },
  isLate: {
    type: Boolean,
    default: false
  },
  teacherNotes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Teacher notes cannot exceed 2000 characters']
  },
  metadata: {
    tabChanges: {
      type: Number,
      default: 0
    },
    fullscreenExits: {
      type: Number,
      default: 0
    },
    questionsViewed: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
quizAttemptSchema.index({ quiz: 1, student: 1 });
quizAttemptSchema.index({ student: 1, status: 1 });
quizAttemptSchema.index({ quiz: 1, createdAt: -1 });
quizAttemptSchema.index({ quiz: 1, status: 1 });

// Virtual for completion percentage
quizAttemptSchema.virtual('completionPercentage').get(function() {
  if (!this.quiz) return 0;
  return this.populated('quiz') ? 
    (this.answers.length / this.quiz.questions.length) * 100 :
    0;
});

// Virtual for time remaining
quizAttemptSchema.virtual('timeRemaining').get(function() {
  if (!this.endTime || !this.quiz) return 0;
  
  const now = new Date();
  const quizTimeLimit = this.quiz.timeLimit * 60; // Convert to seconds
  const timeElapsed = (now - this.startTime) / 1000;
  
  return Math.max(0, quizTimeLimit - timeElapsed);
});

// Pre-save middleware to calculate score and time taken
quizAttemptSchema.pre('save', function(next) {
  if (this.isModified('answers') || this.isModified('endTime')) {
    // Calculate total score
    this.score = this.answers.reduce((sum, answer) => sum + (answer.pointsAwarded || 0), 0);
    
    // Calculate total time taken if attempt is completed
    if (this.endTime && this.status !== 'in-progress') {
      this.timeTaken = (this.endTime - this.startTime) / 1000; // Convert to seconds
    }
  }
  
  next();
});

// Pre-save middleware to check if attempt is late
quizAttemptSchema.pre('save', function(next) {
  if (this.endTime && this.quiz && this.populated('quiz')) {
    const quiz = this.quiz;
    if (this.endTime > quiz.endTime) {
      this.isLate = true;
    }
  } else if (this.endTime && this.quiz && typeof this.quiz === 'object' && this.quiz.endTime) {
    // Handle case where quiz is not populated but we have the endTime
    if (this.endTime > this.quiz.endTime) {
      this.isLate = true;
    }
  }
  next();
});

// Method to submit attempt
quizAttemptSchema.methods.submit = function() {
  this.endTime = new Date();
  this.status = 'submitted';
  return this.save();
};

// Method to auto-grade multiple choice questions
quizAttemptSchema.methods.autoGrade = async function() {
  try {
    // Correctly populate the quiz and its nested questions
    await this.populate({
      path: 'quiz',
      populate: {
        path: 'questions',
        model: 'Question'
      }
    });

    if (!this.quiz || !this.quiz.questions) {
      throw new Error('Could not populate quiz questions for grading.');
    }
    
    this.answers.forEach(answer => {
      // Find the full question object from the now-populated quiz
      const question = this.quiz.questions.find(q => q._id.equals(answer.question));
      if (question && question.type === 'multiple-choice') {
        // Find the index of the correct option
        const correctOptionIndex = question.options.findIndex(opt => opt.isCorrect);
        answer.isCorrect = (answer.selectedOptionIndex === correctOptionIndex);
        answer.pointsAwarded = answer.isCorrect ? question.points : 0;
      }
    });

    this.score = this.answers.reduce((sum, answer) => sum + (answer.pointsAwarded || 0), 0);
    this.status = 'graded';
    
    return this.save();
  } catch (error) {
    console.error('Error in autoGrade method:', error);
    throw error;
  }
};

// Static method to get student's best attempt
quizAttemptSchema.statics.getBestAttempt = function(quizId, studentId) {
  return this.findOne({ quiz: quizId, student: studentId, status: { $in: ['submitted', 'graded', 'completed'] } })
    .sort({ score: -1, timeTaken: 1 })
    .limit(1);
};

// Static method to get quiz statistics
quizAttemptSchema.statics.getQuizStatistics = function(quizId) {
  return this.aggregate([
    { $match: { quiz: mongoose.Types.ObjectId(quizId), status: { $in: ['submitted', 'graded', 'completed'] } } },
    {
      $group: {
        _id: '$quiz',
        averageScore: { $avg: '$score' },
        highestScore: { $max: '$score' },
        lowestScore: { $min: '$score' },
        attemptCount: { $sum: 1 },
        averageTime: { $avg: '$timeTaken' }
      }
    }
  ]);
};

const QuizAttempt = mongoose.model('QuizAttempt', quizAttemptSchema);

module.exports = QuizAttempt;
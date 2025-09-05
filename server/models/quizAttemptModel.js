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
  studentQuiz: {
    type: Schema.Types.ObjectId,
    ref: 'StudentQuiz',
    required: [true, 'Attempt must reference a student quiz']
  },
  template: {
    type: Schema.Types.ObjectId,
    ref: 'QuizTemplate'
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
    },
    timePerQuestion: {
      type: Map,
      of: Number // questionId -> time in seconds
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
quizAttemptSchema.index({ studentQuiz: 1, student: 1 });
quizAttemptSchema.index({ student: 1, status: 1 });
quizAttemptSchema.index({ template: 1, createdAt: -1 });
quizAttemptSchema.index({ template: 1, status: 1 });

// Virtual for completion percentage
quizAttemptSchema.virtual('completionPercentage').get(function() {
  if (!this.template || !this.template.questions) return 0;
  return (this.answers.length / this.template.questions.length) * 100;
});

// Virtual for time remaining
quizAttemptSchema.virtual('timeRemaining').get(function() {
  if (!this.endTime || !this.template) return 0;
  
  const now = new Date();
  const quizTimeLimit = this.template.timeLimit * 60; // Convert to seconds
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

// Method to submit attempt
quizAttemptSchema.methods.submit = function() {
  this.endTime = new Date();
  this.status = 'submitted';
  return this.save();
};

// Method to auto-grade multiple choice questions
quizAttemptSchema.methods.autoGrade = async function() {
  try {
    // Populate the template and questions
    await this.populate({
      path: 'template',
      populate: {
        path: 'questions',
        model: 'Question'
      }
    });

    if (!this.template || !this.template.questions) {
      throw new Error('Could not populate quiz template or questions for grading');
    }
    
    const questions = this.template.questions;
    
    // Reset score before grading
    this.score = 0;
    
    this.answers.forEach(answer => {
      // Find the full question document that corresponds to the student's answer
      const question = questions.find(q => q._id.equals(answer.question));
      
      if (question) {
        // Grade multiple-choice and true/false questions
        if ((question.type === 'multiple-choice' || question.type === 'true-false') && 
            answer.selectedOptionIndex != null) {
          
          const correctOptionIndex = question.options.findIndex(opt => opt.isCorrect);
          answer.isCorrect = (answer.selectedOptionIndex === correctOptionIndex);
          
          // Award points based on correctness
          answer.pointsAwarded = answer.isCorrect ? (Number(question.points) || 0) : 0;
        } else {
          // For non-auto-graded questions, set default values
          answer.isCorrect = false;
          answer.pointsAwarded = 0;
        }
        
        // Add to total score
        this.score += answer.pointsAwarded;
      }
    });

    // Set the final status
    this.status = 'graded';
    
    return this;
  } catch (error) {
    console.error(`Error in autoGrade for attempt ${this._id}:`, error);
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
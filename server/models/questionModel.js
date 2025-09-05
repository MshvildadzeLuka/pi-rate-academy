const mongoose = require('mongoose');
const { Schema } = mongoose;
const mongoosePaginate = require('mongoose-paginate-v2');

const optionSchema = new Schema({
  text: {
    type: String,
    required: [true, 'Option text is required'],
    trim: true,
    maxlength: [500, 'Option text cannot exceed 500 characters']
  },
  isCorrect: {
    type: Boolean,
    default: false
  },
  explanation: {
    type: String,
    trim: true,
    maxlength: [1000, 'Explanation cannot exceed 1000 characters']
  }
}, { _id: true });

const questionSchema = new Schema({
  text: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true,
    maxlength: [2000, 'Question text cannot exceed 2000 characters']
  },
  options: [optionSchema],
  type: {
    type: String,
    enum: ['multiple-choice', 'true-false', 'short-answer', 'essay'],
    default: 'multiple-choice'
  },
  timeLimit: {
    type: Number, // in seconds
    default: 60,
    min: [10, 'Time limit must be at least 10 seconds'],
    max: [600, 'Time limit cannot exceed 600 seconds (10 minutes)']
  },
  points: {
    type: Number,
    default: 1,
    min: [0, 'Points cannot be negative']
  },
  solution: {
    type: String,
    trim: true,
    maxlength: [5000, 'Solution cannot exceed 5000 characters']
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  imageUrl: {
    type: String,
    trim: true
  },
  imagePublicId: {
    type: String,
    trim: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'A question must have a creator']
  },
  tags: [{
    type: String,
    trim: true
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  usageCount: {
    type: Number,
    default: 0
  },
  correctAnswerRate: {
    type: Number,
    default: 0,
    min: [0, 'Correct answer rate cannot be negative'],
    max: [1, 'Correct answer rate cannot exceed 1']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
questionSchema.index({ createdBy: 1, createdAt: -1 });
questionSchema.index({ type: 1 });
questionSchema.index({ difficulty: 1 });
questionSchema.index({ tags: 1 });

// Virtual for correct option index
questionSchema.virtual('correctOptionIndex').get(function() {
  if (!this.options || this.options.length === 0) return -1;
  const correctIndex = this.options.findIndex(opt => opt.isCorrect);
  return correctIndex;
});

// Pre-save middleware to ensure at least one correct option for multiple-choice
questionSchema.pre('save', function(next) {
  if (this.type === 'multiple-choice' && this.options && this.options.length > 0) {
    const hasCorrectOption = this.options.some(opt => opt.isCorrect);
    if (!hasCorrectOption) {
      return next(new Error('Multiple choice questions must have at least one correct option'));
    }
  }
  
  // Ensure at least two options for multiple-choice
  if (this.type === 'multiple-choice' && this.options && this.options.length < 2) {
    return next(new Error('Multiple choice questions must have at least two options'));
  }
  
  next();
});

// Method to get correct option index
questionSchema.methods.getCorrectIndex = function() {
  if (!this.options || this.options.length === 0) return -1;
  return this.options.findIndex(opt => opt.isCorrect);
};

// Method to shuffle options
questionSchema.methods.shuffleOptions = function() {
  if (this.options && this.options.length > 0) {
    // Store the correct option index before shuffling
    const correctIndex = this.getCorrectIndex();
    
    // Fisher-Yates shuffle algorithm
    for (let i = this.options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.options[i], this.options[j]] = [this.options[j], this.options[i]];
    }
    
    // Return the new index of the correct option
    return this.options.findIndex(opt => opt.isCorrect);
  }
  return -1;
};

// Static method to get questions by difficulty
questionSchema.statics.getByDifficulty = function(difficulty, limit = 10) {
  return this.find({ difficulty, isPublic: true })
    .limit(limit)
    .exec();
};

// Method to update usage statistics
questionSchema.methods.updateStats = function(isCorrect) {
  this.usageCount += 1;
  
  if (isCorrect) {
    this.correctAnswerRate = ((this.correctAnswerRate * (this.usageCount - 1)) + 1) / this.usageCount;
  } else {
    this.correctAnswerRate = (this.correctAnswerRate * (this.usageCount - 1)) / this.usageCount;
  }
  
  return this.save();
};

// Attach the pagination plugin to the schema
questionSchema.plugin(mongoosePaginate);

const Question = mongoose.models.Question || mongoose.model('Question', questionSchema);

module.exports = Question;
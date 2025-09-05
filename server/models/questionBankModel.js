const mongoose = require('mongoose');
const { Schema } = mongoose;

const questionBankSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Question bank must have a name'],
    trim: true,
    maxlength: [100, 'Question bank name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Question bank description cannot exceed 500 characters']
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Question bank must have an owner']
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization'
  },
  questions: [{
    type: Schema.Types.ObjectId,
    ref: 'Question'
  }],
  categories: [{
    type: String,
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters']
  }],
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  accessLevel: {
    type: String,
    enum: ['private', 'organization', 'public'],
    default: 'private'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    questionCount: {
      type: Number,
      default: 0
    },
    averageDifficulty: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
questionBankSchema.index({ owner: 1, isActive: 1 });
questionBankSchema.index({ organization: 1, accessLevel: 1 });
questionBankSchema.index({ categories: 1 });
questionBankSchema.index({ tags: 1 });

// Virtual for easy, medium, hard question counts
questionBankSchema.virtual('difficultyStats').get(async function() {
  await this.populate('questions');
  
  const stats = {
    easy: 0,
    medium: 0,
    hard: 0
  };
  
  this.questions.forEach(question => {
    if (question.difficulty in stats) {
      stats[question.difficulty]++;
    }
  });
  
  return stats;
});

// Pre-save middleware to update question count and difficulty
questionBankSchema.pre('save', async function(next) {
  if (this.isModified('questions')) {
    try {
      await this.populate('questions');
      
      this.metadata.questionCount = this.questions.length;
      
      // Calculate average difficulty (easy=0.3, medium=0.6, hard=0.9)
      if (this.questions.length > 0) {
        const difficultyValues = {
          easy: 0.3,
          medium: 0.6,
          hard: 0.9
        };
        
        const total = this.questions.reduce((sum, question) => {
          return sum + (difficultyValues[question.difficulty] || 0.6);
        }, 0);
        
        this.metadata.averageDifficulty = total / this.questions.length;
      }
      
      this.metadata.lastUpdated = new Date();
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Method to add question to bank
questionBankSchema.methods.addQuestion = function(questionId) {
  if (!this.questions.includes(questionId)) {
    this.questions.push(questionId);
  }
  return this.save();
};

// Method to remove question from bank
questionBankSchema.methods.removeQuestion = function(questionId) {
  this.questions = this.questions.filter(id => !id.equals(questionId));
  return this.save();
};

// Method to get questions by criteria
questionBankSchema.methods.getQuestions = function(criteria = {}, limit = 10) {
  const Question = mongoose.model('Question');
  let query = Question.find({ _id: { $in: this.questions }, ...criteria });
  
  if (limit) {
    query = query.limit(limit);
  }
  
  return query;
};

// Static method to search question banks
questionBankSchema.statics.search = function(searchTerm, filters = {}) {
  const query = {
    $or: [
      { name: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { categories: { $in: [new RegExp(searchTerm, 'i')] } },
      { tags: { $in: [new RegExp(searchTerm, 'i')] } }
    ],
    ...filters
  };
  
  return this.find(query).populate('questions', 'text type difficulty points');
};

// Static method to get organization banks
questionBankSchema.statics.getOrganizationBanks = function(organizationId) {
  return this.find({
    $or: [
      { organization: organizationId, accessLevel: { $in: ['organization', 'public'] } },
      { accessLevel: 'public' }
    ],
    isActive: true
  }).populate('owner', 'name email');
};

const QuestionBank = mongoose.model('QuestionBank', questionBankSchema);

module.exports = QuestionBank;
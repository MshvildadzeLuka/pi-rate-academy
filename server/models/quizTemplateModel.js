const mongoose = require('mongoose');
const { Schema } = mongoose;

const quizTemplateSchema = new Schema({
  title: { 
    type: String, 
    required: true, 
    trim: true,
    maxlength: 120
  },
  description: { 
    type: String, 
    trim: true,
    maxlength: 2000
  },
  points: { 
    type: Number, 
    default: 0,
    min: 0
  },
  courseId: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'Group', 
    required: true 
  }],
  creatorId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  questions: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'Question' 
  }],
  startTime: { 
    type: Date, 
    required: true 
  },
  endTime: { 
    type: Date, 
    required: true 
  },
  timeLimit: { 
    type: Number // in minutes
  },
  shuffleQuestions: { 
    type: Boolean, 
    default: false 
  },
  shuffleOptions: { 
    type: Boolean, 
    default: false 
  }
}, { 
  timestamps: true
});

quizTemplateSchema.index({ courseId: 1, createdAt: -1 });

quizTemplateSchema.virtual('questionCount').get(function() {
  return this.questions ? this.questions.length : 0;
});

// ✅ FIX: The entire pre-save hook that was here has been REMOVED.

const QuizTemplate = mongoose.model('QuizTemplate', quizTemplateSchema);

module.exports = QuizTemplate;
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Quiz = require('../models/quizModel');
const QuizAttempt = require('../models/quizAttemptModel');
const Question = require('../models/questionModel');
const PointsLedger = require('../models/pointsLedgerModel');
const Group = require('../models/groupModel');
const { protect, restrictTo, checkOwnership } = require('../middleware/authMiddleware');
const asyncHandler = require('express-async-handler');
const { upload, uploadToCloudinary, handleUploadErrors } = require('../middleware/uploadMiddleware');

// Import the controller functions
const {
  createQuiz,
  getQuizById,
  getQuizzesForGroup,
  getStudentQuizzes,
  updateQuiz,
  deleteQuiz,
  startQuizAttempt,
  submitAnswer,
  submitQuizAttempt,
  getQuizAttemptResults,
  getQuizAnalytics,
  uploadQuestionImage,
  getQuestionBanksForGroup,
} = require('../controllers/quizController');

// Apply authentication middleware to all routes
router.use(protect);

// @route   POST /api/quizzes
// @desc    Create a new quiz
// @access  Private/Teacher,Admin
router.post('/', restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res) => {
  const {
    title,
    description,
    instructions,
    groupId,
    startTime,
    endTime,
    questions,
    shuffleQuestions,
    shuffleOptions,
    showResults,
    allowRetakes,
    maxAttempts,
    requiresPassword,
    password
  } = req.body;

  // Validate required fields
  if (!title || !groupId || !startTime || !endTime) {
    return res.status(400).json({
      success: false,
      message: 'A quiz must have a title, group, start time, and end time'
    });
  }

  // Validate questions
  if (!questions || questions.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one question is required'
    });
  }

  // Validate each question
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    if (!question.text || question.text.trim() === '') {
      return res.status(400).json({
        success: false,
        message: `Question ${i + 1} text is required`
      });
    }
    
    if (!question.options || question.options.length < 2) {
      return res.status(400).json({
        success: false,
        message: `Question ${i + 1} must have at least 2 options`
      });
    }
    
    const hasCorrectOption = question.options.some(opt => opt.isCorrect);
    if (!hasCorrectOption) {
      return res.status(400).json({
        success: false,
        message: `Question ${i + 1} must have at least one correct option`
      });
    }
  }

  // Create the quiz
  const quiz = new Quiz({
    title,
    description,
    instructions,
    group: groupId,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    shuffleQuestions: shuffleQuestions || false,
    shuffleOptions: shuffleOptions || false,
    showResults: showResults || 'after-submission',
    allowRetakes: allowRetakes || false,
    maxAttempts: maxAttempts || 1,
    requiresPassword: requiresPassword || false,
    password: requiresPassword ? password : undefined,
    createdBy: req.user._id
  });

  // Save questions first
  const questionIds = [];
  for (const questionData of questions) {
    const question = new Question({
      text: questionData.text,
      options: questionData.options,
      points: questionData.points || 1,
      solution: questionData.solution || '',
      type: 'multiple-choice',
      difficulty: questionData.difficulty || 'medium',
      imageUrl: questionData.imageUrl || null,
      createdBy: req.user._id
    });
    
    const savedQuestion = await question.save();
    questionIds.push(savedQuestion._id);
  }

  // Add questions to quiz
  quiz.questions = questionIds;

  // Calculate total points
  await quiz.populate('questions');
  quiz.totalPoints = quiz.questions.reduce((sum, q) => sum + (q.points || 0), 0);
  if (quiz.totalPoints === 0) quiz.totalPoints = 1;

  const savedQuiz = await quiz.save();
  await savedQuiz.populate('group', 'name users');
  await savedQuiz.populate('questions');

  res.status(201).json({
    success: true,
    data: savedQuiz
  });
}));

// @route   GET /api/quizzes
// @desc    Get all quizzes for a teacher/admin
// @access  Private/Teacher,Admin
router.get('/teacher/:groupId', restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { status } = req.query;
  
  // Validate groupId
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid group ID'
    });
  }
  
  let filter = { group: groupId };
  
  // Add status filter if provided
  if (status && status !== 'all') {
    const now = new Date();
    
    switch (status) {
      case 'active':
        filter.startTime = { $lte: now };
        filter.endTime = { $gte: now };
        break;
      case 'upcoming':
        filter.startTime = { $gt: now };
        break;
      case 'completed':
        filter.endTime = { $lt: now };
        break;
      case 'past-due':
        filter.endTime = { $lt: now };
        break;
    }
  }
  
  const quizzes = await Quiz.find(filter)
    .populate('group', 'name')
    .populate('questions', 'text points')
    .sort({ createdAt: -1 });
    
  res.json({
    success: true,
    data: quizzes
  });
}));

// @route   GET /api/quizzes/student
// @desc    Get all quizzes for a student (OPTIMIZED)
// @access  Private/Student
router.get('/student', restrictTo('Student'), asyncHandler(async (req, res) => {
  const { status } = req.query;
  const now = new Date();
  const studentId = req.user._id;
  
  // Get groups where the student is enrolled
  const groups = await Group.find({ users: studentId });
  const groupIds = groups.map(g => g._id);
  
  // Build the base filter
  let filter = { group: { $in: groupIds } };
  
  // Add status filter if provided
  if (status && status !== 'all') {
    switch (status) {
      case 'active':
        filter.startTime = { $lte: now };
        filter.endTime = { $gte: now };
        break;
      case 'upcoming':
        filter.startTime = { $gt: now };
        break;
      case 'completed':
        filter.endTime = { $lt: now };
        break;
      case 'past-due':
        filter.endTime = { $lt: now };
        break;
    }
  }
  
  // Use aggregation to get all data in a single query
  const quizzes = await Quiz.aggregate([
    { $match: filter },
    {
      $lookup: {
        from: 'quizattempts',
        let: { quizId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$quiz', '$$quizId'] },
                  { $eq: ['$student', new mongoose.Types.ObjectId(studentId)] }
                ]
              }
            }
          },
          { $sort: { attemptNumber: -1 } },
          { $limit: 1 }
        ],
        as: 'latestAttempt'
      }
    },
    {
      $addFields: {
        attemptStatus: {
          $cond: {
            if: { $gt: [{ $size: '$latestAttempt' }, 0] },
            then: { $arrayElemAt: ['$latestAttempt.status', 0] },
            else: 'not attempted'
          }
        },
        score: {
          $cond: {
            if: { $gt: [{ $size: '$latestAttempt' }, 0] },
            then: { $arrayElemAt: ['$latestAttempt.score', 0] },
            else: null
          }
        }
      }
    },
    {
      $project: {
        latestAttempt: 0
      }
    }
  ]);
  
  // Populate group and questions
  await Quiz.populate(quizzes, [
    { path: 'group', select: 'name' },
    { path: 'questions', select: 'text points' }
  ]);
  
  // Add quiz status based on time
  const quizzesWithStatus = quizzes.map(quiz => {
    const quizObj = quiz.toObject ? quiz.toObject() : { ...quiz };
    
    if (now < quiz.startTime) {
      quizObj.status = 'upcoming';
    } else if (now > quiz.endTime) {
      quizObj.status = 'completed';
    } else {
      quizObj.status = 'active';
    }
    
    return quizObj;
  });
  
  res.json({
    success: true,
    data: quizzesWithStatus
  });
}));

// @route   GET /api/quizzes/:id
// @desc    Get quiz by ID
// @access  Private
router.get('/:id', asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid quiz ID'
    });
  }
  
  const quiz = await Quiz.findById(req.params.id)
    .populate('group', 'name users')
    .populate('questions')
    .populate('createdBy', 'firstName lastName');
    
  if (!quiz) {
    return res.status(404).json({
      success: false,
      message: 'Quiz not found'
    });
  }
  
  // Check if user has access to this quiz
  const isTeacherOrAdmin = ['Teacher', 'Admin'].includes(req.user.role);
  const isInGroup = quiz.group.users.some(user => user._id.toString() === req.user._id.toString());
  
  if (!isTeacherOrAdmin && !isInGroup) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access this quiz'
    });
  }
  
  res.json({
    success: true,
    data: quiz
  });
}));

// @route   PUT /api/quizzes/:id
// @desc    Update a quiz
// @access  Private/Teacher,Admin
router.put('/:id', restrictTo('Teacher', 'Admin'), checkOwnership('quiz', 'createdBy'), asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid quiz ID'
    });
  }
  
  const {
    title,
    description,
    instructions,
    groupId,
    startTime,
    endTime,
    questions,
    shuffleQuestions,
    shuffleOptions,
    showResults,
    allowRetakes,
    maxAttempts,
    requiresPassword,
    password
  } = req.body;

  const quiz = await Quiz.findById(req.params.id);
  
  if (!quiz) {
    return res.status(404).json({
      success: false,
      message: 'Quiz not found'
    });
  }
  
  // Update fields
  if (title) quiz.title = title;
  if (description !== undefined) quiz.description = description;
  if (instructions !== undefined) quiz.instructions = instructions;
  if (groupId) quiz.group = groupId;
  if (startTime) quiz.startTime = new Date(startTime);
  if (endTime) quiz.endTime = new Date(endTime);
  if (shuffleQuestions !== undefined) quiz.shuffleQuestions = shuffleQuestions;
  if (shuffleOptions !== undefined) quiz.shuffleOptions = shuffleOptions;
  if (showResults) quiz.showResults = showResults;
  if (allowRetakes !== undefined) quiz.allowRetakes = allowRetakes;
  if (maxAttempts) quiz.maxAttempts = maxAttempts;
  if (requiresPassword !== undefined) quiz.requiresPassword = requiresPassword;
  if (password && requiresPassword) quiz.password = password;
  
  // Handle questions if provided
  if (questions && questions.length > 0) {
    // Delete existing questions
    await Question.deleteMany({ _id: { $in: quiz.questions } });
    
    // Create new questions
    const questionIds = [];
    for (const questionData of questions) {
      const question = new Question({
        text: questionData.text,
        options: questionData.options,
        points: questionData.points || 1,
        solution: questionData.solution || '',
        type: 'multiple-choice',
        difficulty: questionData.difficulty || 'medium',
        imageUrl: questionData.imageUrl || null,
        createdBy: req.user._id
      });
      
      const savedQuestion = await question.save();
      questionIds.push(savedQuestion._id);
    }
    
    quiz.questions = questionIds;
  }
  
  // Calculate total points
  await quiz.populate('questions');
  quiz.totalPoints = quiz.questions.reduce((sum, q) => sum + (q.points || 0), 0);
  if (quiz.totalPoints === 0) quiz.totalPoints = 1;
  
  const updatedQuiz = await quiz.save();
  await updatedQuiz.populate('group', 'name');
  await updatedQuiz.populate('questions');
  
  res.json({
    success: true,
    data: updatedQuiz
  });
}));

// @route   DELETE /api/quizzes/:id
// @desc    Delete a quiz
// @access  Private/Teacher,Admin
router.delete('/:id', restrictTo('Teacher', 'Admin'), checkOwnership('quiz', 'createdBy'), asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid quiz ID'
    });
  }
  
  const quiz = await Quiz.findById(req.params.id);
  
  if (!quiz) {
    return res.status(404).json({
      success: false,
      message: 'Quiz not found'
    });
  }
  
  // Delete associated questions
  await Question.deleteMany({ _id: { $in: quiz.questions } });
  
  // Delete associated attempts
  await QuizAttempt.deleteMany({ quiz: quiz._id });
  
  await Quiz.findByIdAndDelete(req.params.id);
  
  res.json({
    success: true,
    message: 'Quiz deleted successfully'
  });
}));

// @route   POST /api/quizzes/:id/start
// @desc    Start a quiz attempt (FIXED)
// @access  Private
router.post('/:id/start', asyncHandler(async (req, res) => {
  const { password } = req.body;
  
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid quiz ID'
    });
  }
  
  const quiz = await Quiz.findById(req.params.id)
    .populate('group', 'name users')
    .populate('questions');
  
  if (!quiz) {
    return res.status(404).json({
      success: false,
      message: 'Quiz not found'
    });
  }
  
  // Check if user is in the group
  const isInGroup = quiz.group.users.some(user => user._id.toString() === req.user._id.toString());
  
  if (!isInGroup) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to take this quiz'
    });
  }
  
  // Check if quiz requires password
  if (quiz.requiresPassword) {
    if (!password || password !== quiz.password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid quiz password'
      });
    }
  }
  
  // Check if quiz is active
  const now = new Date();
  if (now < quiz.startTime) {
    return res.status(400).json({
      success: false,
      message: 'Quiz has not started yet'
    });
  }
  
  if (now > quiz.endTime) {
    return res.status(400).json({
      success: false,
      message: 'Quiz has already ended'
    });
  }
  
  // Check for existing in-progress attempts first
  const existingInProgressAttempt = await QuizAttempt.findOne({
    quiz: quiz._id,
    student: req.user._id,
    status: 'in-progress'
  });
  
  if (existingInProgressAttempt) {
    return res.status(200).json({
      success: true,
      data: existingInProgressAttempt,
      message: 'Existing in-progress attempt found'
    });
  }
  
  // Check if student has already attempted this quiz (only count submitted attempts)
  const existingAttempts = await QuizAttempt.find({
    quiz: quiz._id,
    student: req.user._id,
    status: { $in: ['submitted', 'graded', 'completed'] }
  });
  
  if (existingAttempts.length >= quiz.maxAttempts && !quiz.allowRetakes) {
    return res.status(400).json({
      success: false,
      message: 'Maximum attempts reached for this quiz'
    });
  }
  
  // Create a new attempt
  const attempt = new QuizAttempt({
    quiz: quiz._id,
    student: req.user._id,
    attemptNumber: existingAttempts.length + 1,
    startTime: now,
    endTime: quiz.endTime, // Set to quiz's end time instead of calculating with timeLimit
    status: 'in-progress'
  });
  
  const savedAttempt = await attempt.save();
  await savedAttempt.populate('quiz');
  
  res.status(201).json({
    success: true,
    data: savedAttempt
  });
}));

// @route   POST /api/quizzes/attempt/:attemptId/answer
// @desc    Submit an answer for a question
// @access  Private
router.post('/attempt/:attemptId/answer', submitAnswer);

// @route   POST /api/quizzes/attempt/:attemptId/submit
// @desc    Submit a quiz attempt
// @access  Private
router.post('/attempt/:attemptId/submit', asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.attemptId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid attempt ID'
    });
  }
  
  const attempt = await QuizAttempt.findById(req.params.attemptId)
    .populate('quiz');
  
  if (!attempt) {
    return res.status(404).json({
      success: false,
      message: 'Attempt not found'
    });
  }
  
  // Check if attempt belongs to user
  if (attempt.student.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access this attempt'
    });
  }
  
  // Check if attempt is still in progress
  if (attempt.status !== 'in-progress') {
    return res.status(400).json({
      success: false,
      message: 'Attempt is already submitted'
    });
  }
  
  // Update attempt status and end time
  attempt.status = 'submitted';
  attempt.endTime = new Date();
  
  // Calculate score
  attempt.score = attempt.answers.reduce((sum, answer) => sum + answer.pointsAwarded, 0);
  
  const submittedAttempt = await attempt.save();
  
  // Record points in ledger
  await PointsLedger.findOneAndUpdate(
    { sourceId: attempt._id, sourceType: 'quiz' },
    {
      studentId: attempt.student,
      courseId: attempt.quiz.group,
      pointsEarned: attempt.score,
      pointsPossible: attempt.quiz.totalPoints,
      awardedAt: new Date()
    },
    { upsert: true, new: true }
  );
  
  res.json({
    success: true,
    data: submittedAttempt
  });
}));

// @route   GET /api/quizzes/attempt/:attemptId/results
// @desc    Get quiz results
// @access  Private
router.get('/attempt/:attemptId/results', asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.attemptId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid attempt ID'
    });
  }
  
  const attempt = await QuizAttempt.findById(req.params.attemptId)
    .populate('quiz')
    .populate('student', 'firstName lastName')
    .populate({
      path: 'answers.question',
      model: 'Question'
    });
  
  if (!attempt) {
    return res.status(404).json({
      success: false,
      message: 'Attempt not found'
    });
  }
  
  // Check if user has access to these results
  const isOwner = attempt.student._id.toString() === req.user._id.toString();
  const isTeacherOrAdmin = ['Teacher', 'Admin'].includes(req.user.role);
  
  if (!isOwner && !isTeacherOrAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access these results'
    });
  }
  
  // Check if results should be shown based on quiz settings
  const now = new Date();
  const canSeeResults = 
    attempt.quiz.showResults === 'immediately' ||
    (attempt.quiz.showResults === 'after-submission' && attempt.status === 'submitted') ||
    (attempt.quiz.showResults === 'after-deadline' && now > attempt.quiz.endTime);
  
  if (!canSeeResults && !isTeacherOrAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Results are not available yet'
    });
  }
  
  res.json({
    success: true,
    data: attempt
  });
}));

// @route   GET /api/quizzes/:id/analytics
// @desc    Get quiz analytics
// @access  Private/Teacher,Admin
router.get('/:id/analytics', restrictTo('Teacher', 'Admin'), checkOwnership('quiz', 'createdBy'), asyncHandler(async (req, res) => {
  // Enhanced ID validation
  if (!req.params.id || !mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid quiz ID format'
    });
  }
  
  const quizId = new mongoose.Types.ObjectId(req.params.id);
  const quiz = await Quiz.findById(quizId)
    .populate('group', 'name users');
  
  if (!quiz) {
    return res.status(404).json({
      success: false,
      message: 'Quiz not found'
    });
  }
  
  // Get all attempts for this quiz
  const attempts = await QuizAttempt.find({ quiz: quizId })
    .populate('student', 'firstName lastName email')
    .sort({ score: -1 });
  
  // Calculate analytics
  const totalStudents = quiz.group.users.filter(u => u.role === 'Student').length;
  const attemptedCount = attempts.length;
  const completedCount = attempts.filter(a => a.status === 'submitted' || a.status === 'graded').length;
  
  const scores = attempts.map(a => a.score);
  const averageScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
  const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
  const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
  
  const completionRate = totalStudents > 0 ? (attemptedCount / totalStudents) * 100 : 0;
  
  res.json({
    success: true,
    data: {
      participation: {
        totalStudents,
        attemptedCount,
        completedCount,
        completionRate
      },
      performance: {
        averageScore,
        highestScore,
        lowestScore,
        scores
      },
      attempts
    }
  });
}));

// @route   POST /api/quizzes/questions/image-upload
// @desc    Upload an image for a question
// @access  Private/Teacher,Admin
router.post('/questions/image-upload', restrictTo('Teacher', 'Admin'), upload.single('image'), uploadToCloudinary, handleUploadErrors, asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No image file provided'
    });
  }
  
  res.json({
    success: true,
    data: {
      imageUrl: req.file.url,
      publicId: req.file.public_id
    }
  });
}));

// @route   GET /api/quizzes/question-banks/:groupId
// @desc    Get question banks for a group
// @access  Private/Teacher,Admin
router.get('/question-banks/:groupId', restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid group ID'
    });
  }
  
  // Get question banks owned by the user or shared with the organization
  const QuestionBank = require('../models/questionBankModel');
  const questionBanks = await QuestionBank.find({
    $or: [
      { owner: req.user._id },
      { accessLevel: 'organization', organization: req.user.organization },
      { accessLevel: 'public' }
    ]
  }).populate('questions');
  
  res.json({
    success: true,
    data: questionBanks
  });
}));

module.exports = router;
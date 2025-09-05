// Central export for all models
const User = require('./userModel');
const Group = require('./groupModel');
const QuizTemplate = require('./quizTemplateModel');
const StudentQuiz = require('./studentQuizModel');
const QuizAttempt = require('./quizAttemptModel');
const Question = require('./questionModel');
const QuestionBank = require('./questionBankModel');
const RetakeRequest = require('./retakeRequestModel');
const PointsLedger = require('./pointsLedgerModel');
const Notification = require('./notificationModel');

module.exports = {
  User,
  Group,
  QuizTemplate,
  StudentQuiz,
  QuizAttempt,
  Question,
  QuestionBank,
  RetakeRequest,
  PointsLedger,
  Notification
};
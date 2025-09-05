const cron = require('node-cron');
const Quiz = require('../models/quizModel');
const QuizAttempt = require('../models/quizAttemptModel');

// Run every minute to check for quiz status changes
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    console.log('Running scheduled quiz status update...');

    // Update quizzes that have started and are now active
    const activeResult = await Quiz.updateMany(
      {
        startTime: { $lte: now },
        endTime: { $gte: now },
        status: 'upcoming'
      },
      { status: 'active' }
    );

    // Update quizzes that have ended
    const completedResult = await Quiz.updateMany(
      {
        endTime: { $lt: now },
        status: { $in: ['upcoming', 'active'] }
      },
      { status: 'completed' }
    );

    // Auto-submit any in-progress attempts for completed quizzes
    const completedQuizzes = await Quiz.find({
      endTime: { $lt: now },
      status: 'completed'
    });

    for (const quiz of completedQuizzes) {
      try {
        const inProgressAttempts = await QuizAttempt.find({
          quiz: quiz._id,
          status: 'in-progress'
        });

        for (const attempt of inProgressAttempts) {
          attempt.status = 'submitted';
          attempt.endTime = new Date();
          await attempt.save();
          
          // Calculate final score
          attempt.score = attempt.answers.reduce((sum, answer) => sum + answer.pointsAwarded, 0);
          await attempt.save();
        }
      } catch (error) {
        console.error(`Error processing quiz ${quiz._id}:`, error);
        // Continue with other quizzes even if one fails
        continue;
      }
    }

    console.log(`Quiz status update completed. Activated: ${activeResult.modifiedCount}, Completed: ${completedResult.modifiedCount}`);
  } catch (error) {
    console.error('Error in scheduled quiz status update:', error);
  }
});

module.exports = cron;
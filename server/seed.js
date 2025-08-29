const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Import all models to be reset
const User = require('./models/userModel.js');
const Assignment = require('./models/assignmentModel.js');
const Group = require('./models/groupModel.js');
const Lecture = require('./models/lectureModel.js');
const Note = require('./models/noteModel.js');
const Question = require('./models/questionModel.js');
const Quiz = require('./models/quizModel.js');
const QuizAttempt = require('./models/quizAttemptModel.js');
const Video = require('./models/videoModel.js');

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected for seeding.');
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const importData = async () => {
  try {
    if (!process.env.ADMIN_SEED_PASSWORD) {
      console.error('Error: Please set ADMIN_SEED_PASSWORD in your .env file');
      process.exit(1);
    }
    
    console.log('Clearing old data from all collections...');
    await Assignment.deleteMany();
    await Group.deleteMany();
    await Lecture.deleteMany();
    await Note.deleteMany();
    await Question.deleteMany();
    await Quiz.deleteMany();
    await QuizAttempt.deleteMany();
    await Video.deleteMany();
    await User.deleteMany();
    console.log('All collections cleared.');

    const adminUser = {
      firstName: 'Admin',
      lastName: 'User',
      email: 'newadmin@example.com',
      password: process.env.ADMIN_SEED_PASSWORD,
      role: 'Admin',
    };

    await User.create(adminUser);

    console.log('✅ Admin user created successfully!');
    process.exit();
  } catch (error) {
    console.error(`Error seeding data: ${error.message}`);
    process.exit(1);
  }
};

const runSeeder = async () => {
  await connectDB();
  await importData();
};

runSeeder();
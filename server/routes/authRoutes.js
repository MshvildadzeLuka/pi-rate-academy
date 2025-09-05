// 1. Imports
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel.js');

// 2. Helper Function to Generate JWT
/**
 * Signs a user ID into a JSON Web Token.
 * @param {string} id - The MongoDB document ID of the user.
 * @returns {string} The generated JWT.
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// 3. Router Setup
const router = express.Router();

// 4. Registration Route
/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create a new user. The password will be automatically hashed by the
    // pre-save middleware defined in the userModel.js file.
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
    });

    // If user was created successfully, send back user data and a token
    if (user) {
      res.status(201).json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// 5. Login Route
/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });

    // Check if user exists and if the password matches.
    // The 'matchPassword' method is a custom method defined in userModel.js
    // that uses bcrypt to compare the plain text password with the stored hash.
    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        photoUrl: user.photoUrl,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// 6. Export
module.exports = router;
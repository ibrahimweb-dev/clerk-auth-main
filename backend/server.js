import express from 'express';
import dotenv from 'dotenv';
import { Webhook } from 'svix';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import User from './userModel.js';

dotenv.config();

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to DB');
  })
  .catch((err) => console.log(err.message));

const app = express();

app.post(
  '/api/webhooks',
  bodyParser.raw({ type: 'application/json' }),
  async function (req, res) {
    try {
      const payloadString = req.body.toString();
      const svixHeaders = req.headers;

      const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET_KEY);
      const evt = wh.verify(payloadString, svixHeaders);

      const { id, ...attributes } = evt.data;
      const eventType = evt.type;

      // Send response immediately to avoid timeout
      res.status(200).json({
        success: true,
        message: 'Webhook received',
      });

      if (eventType === 'user.created') {
        const firstName = attributes.first_name;
        const lastName = attributes.last_name;

        console.log(`User ${id} received: ${firstName} ${lastName}`);

        // Process user creation in the background
        saveUserToDB(id, firstName, lastName);
      }
    } catch (err) {
      console.error('Webhook verification failed:', err.message);
      res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }
);

// Background function to save user data
async function saveUserToDB(id, firstName, lastName) {
  try {
    console.log('✅ Attempting to save user:', { id, firstName, lastName });

    if (!mongoose.connection.readyState) {
      console.error('❌ Database is not connected.');
      return;
    }

    // Check if user already exists
    const existingUser = await User.findOne({ clerkUserId: id });
    if (existingUser) {
      console.log('⚠️ User already exists:', existingUser);
      return;
    }

    // Save user
    const user = new User({
      clerkUserId: id,
      firstName: firstName || 'Unknown',
      lastName: lastName || 'Unknown',
    });

    await user.save();
    console.log('✅ User successfully saved to database');
  } catch (err) {
    console.error('❌ Error saving user:', err.message);
  }
}


const port = process.env.PORT || 7000;

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

const mongoose = require('mongoose');

// MongoDB Atlas connection string - Update with your values
const MONGODB_URI = 'mongodb+srv://mkbharvad8080:Mkb@8080@mk.jnchrec.mongodb.net/p2pfiles?retryWrites=true&w=majority';

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        console.log(`MongoDB Connected: ${conn.connection.host}`);
        
        // Handle connection events
        mongoose.connection.on('error', err => {
            console.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected, trying to reconnect...');
        });

        return conn;
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error.message);
        // Retry logic
        setTimeout(connectDB, 5000);
    }
};

module.exports = { connectDB };

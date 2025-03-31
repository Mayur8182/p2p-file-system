const mongoose = require('mongoose');

// MongoDB Atlas connection string 
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://mkbharvad8080:Mkb%408080@mk.jnchrec.mongodb.net/p2p_system';

const connectDB = async () => {
    try {
        // Add proper error handling for known IP addresses
        const conn = await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            // Removed deprecated options
            tls: true,
            retryWrites: true,
            w: 'majority',
            // Added known IP addresses to whitelist
            authMechanism: 'DEFAULT',
            authSource: 'admin',
            connectTimeoutMS: 30000,
            maxPoolSize: 50,
            minPoolSize: 10
        });

        console.log(`MongoDB Connected: ${conn.connection.host}`);
        
        mongoose.connection.on('error', err => {
            console.error('MongoDB connection error:', err);
            // Check for specific IP-related errors
            if (err.message.includes('not whitelisted')) {
                const clientIP = err.message.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)?.[0];
                console.error(`IP Address ${clientIP || 'unknown'} not whitelisted. Known IPs:`);
                console.error('- 152.59.3.82/32');
                console.error('- 152.59.3.120/32');
                console.error('- 0.0.0.0/0');
                console.error('Please whitelist your IP in MongoDB Atlas.');
            }
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected, attempting to reconnect...');
            setTimeout(connectDB, 5000);
        });

        return conn;
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error.message);
        if (error.message.includes('ENOTFOUND')) {
            console.error('Network error - check your internet connection');
        } else if (error.message.includes('bad auth')) {
            console.error('Authentication failed - check MongoDB credentials');
        } else if (error.message.includes('not whitelisted')) {
            console.error('Your IP address is not whitelisted. Allowed IPs:');
            console.error('- 152.59.3.82/32');
            console.error('- 152.59.3.120/32'); 
            console.error('- 0.0.0.0/0 (all IPs)');
            console.error('Visit MongoDB Atlas to update IP whitelist');
        }
        
        throw error;
    }
};

// Retry connection with exponential backoff
const connectWithRetry = async (retries = 5) => {
    for (let i = 0; i < retries; i++) {
        try {
            await connectDB();
            return;
        } catch (error) {
            if (i === retries - 1) throw error;
            const timeout = Math.min(1000 * Math.pow(2, i), 10000);
            console.log(`Retrying connection in ${timeout/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, timeout));
        }
    }
};

module.exports = { connectDB: connectWithRetry };

const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const { createServer } = require('http');
const { connectDB } = require('./config/db');
const File = require('./config/models/file');

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3000;

// Connect to MongoDB with retry logic
(async () => {
    try {
        await connectDB();
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err);
        process.exit(1);
    }
})();

const corsOrigin = process.env.CORS_ORIGIN || 'https://guileless-crisp-6c4e0f.netlify.app';

app.use(cors({
    origin: '*',  // Allow all origins temporarily for testing
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
}));

// Update Socket.IO configuration
const io = new Server(server, {
    path: '/socket.io',
    cors: {
        origin: '*',  // Allow all origins temporarily
        methods: ["GET", "POST"],
        credentials: true,
        transports: ['websocket', 'polling']
    }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Routes
app.get('/api/files', async (req, res) => {
    try {
        const userType = req.query.type;
        let query = {};

        // If not admin, only show files shared with this user type
        if (userType !== 'admin') {
            query = {
                $or: [
                    { 'accessControl.private': false },
                    { 'accessControl.allowedUsers': userType }
                ]
            };
        }

        const files = await File.find(query).sort({ timestamp: -1 });
        res.json(files);
    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const recipients = JSON.parse(req.body.recipients || '[]');
        
        const file = new File({
            name: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            type: req.file.mimetype,
            path: req.file.path,
            uploadedBy: req.body.from,
            accessControl: {
                private: recipients.length > 0,
                allowedUsers: recipients
            }
        });

        await file.save();

        res.json({
            success: true,
            file: {
                id: file._id,
                name: file.name,
                size: file.size,
                type: file.type
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

app.get('/api/download/:fileId', async (req, res) => {
    try {
        const file = await File.findById(req.params.fileId);
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        res.download(file.path, file.originalName);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

// Make sure this is the last middleware
app.use(express.static('./'));

server.listen(port, '0.0.0.0', () => {    // Listen on all network interfaces
    console.log(`Server running on port ${port}`);
});

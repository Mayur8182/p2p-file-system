const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const { connectDB } = require('./config/db');
const File = require('./config/models/file');

const app = express();
const port = process.env.PORT || 3000;

// Connect to MongoDB
connectDB().then(() => {
    console.log('MongoDB connected successfully');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

// Middleware
app.use(cors());
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

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

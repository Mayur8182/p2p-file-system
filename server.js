require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const server = http.createServer(app);

const corsOrigin = process.env.CORS_ORIGIN || 'https://guileless-crisp-6c4e0f.netlify.app';

app.use(cors({
    origin: [corsOrigin, 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
}));

// Update Socket.IO configuration
const io = new Server(server, {
    path: '/socket.io',
    cors: {
        origin: [corsOrigin, 'http://localhost:3000'],
        methods: ["GET", "POST"],
        credentials: true
    }
});

const SECRET_KEY = 'your-secret-key';

const peers = new Set();
const activePeers = new Map();

// Setup email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-app-password'
    }
});

// Replace mongoose connection with MongoDB Atlas
const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error("MongoDB URI is not defined!");
    process.exit(1);
}

// Create a MongoClient with a MongoClientOptions object
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function connectDB() {
    try {
        await client.connect();
        console.log("Connected to MongoDB Atlas!");
        
        // Initialize the database
        const db = client.db("p2p_system");
        global.FileCollection = db.collection("files");
        
        await client.db("admin").command({ ping: 1 });
        console.log("MongoDB connection verified!");
        
    } catch (error) {
        console.error("MongoDB connection error:", error);
        process.exit(1);
    }
}

// Call connection at startup
connectDB().catch(console.dir);

// Update the File model to use MongoDB native operations
const File = global.FileCollection;

// Add authentication middleware
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join', (userData) => {
        console.log('User joining:', userData);
        socket.userData = userData;
        socket.join(userData.type);
        
        // Add to active peers
        activePeers.set(socket.id, {
            id: socket.id,
            ...userData
        });

        io.emit('userConnected', {
            id: socket.id,
            ...userData
        });
    });

    socket.on('fileShared', (data) => {
        console.log('File share request:', data);
        // Send to specific recipient room
        io.to(data.recipient).emit('fileShared', {
            fileId: data.fileId,
            fileName: data.fileName,
            from: data.from,
            recipient: data.recipient
        });
    });

    socket.on('disconnect', () => {
        activePeers.delete(socket.id);
        io.emit('userDisconnected', socket.id);
        io.emit('peerCount', activePeers.size);
    });
});

// Add email sending endpoint
app.post('/api/send-email', async (req, res) => {
    const { to, subject, body } = req.body;
    
    try {
        await transporter.sendMail({
            from: 'your-email@gmail.com',
            to: to,
            subject: subject,
            text: body
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// Add email notification endpoint
app.post('/api/notify', async (req, res) => {
    try {
        const { to, subject, text } = req.body;
        await transporter.sendMail({
            from: 'your-email@gmail.com',
            to,
            subject,
            text
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

// Add file sharing endpoint
app.post('/api/share', async (req, res) => {
    try {
        const { fileId, email, from } = req.body;
        const file = await File.findOne({ _id: fileId });
        
        if (!file) {
            throw new Error('File not found');
        }

        // Send email notification
        await transporter.sendMail({
            from: 'your-email@gmail.com',
            to: email,
            subject: 'File Shared with You',
            text: `
                ${from} has shared a file with you:
                Name: ${file.name}
                Size: ${file.size} bytes
                Access it at: ${process.env.APP_URL}/shared/${fileId}
            `
        });

        // Notify through Socket.IO
        io.emit('fileShared', {
            from,
            fileName: file.name,
            recipient: email
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update file sharing endpoint
app.post('/api/share-private', express.json(), async (req, res) => {
    try {
        console.log('Share request body:', req.body);
        
        if (!req.body) {
            return res.status(400).json({
                success: false,
                error: 'Missing request body'
            });
        }

        const fileId = req.body.fileId || req.body.id;
        const recipients = req.body.recipients || [];
        const from = req.body.from;

        if (!fileId || !recipients.length) {
            return res.status(400).json({
                success: false,
                error: 'Missing fileId or recipients'
            });
        }

        console.log('Processing share request:', { fileId, recipients, from });

        // Find and validate file
        const file = await File.findOne({ _id: fileId });
        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Update file permissions
        file.accessControl = {
            private: true,
            allowedUsers: Array.from(new Set([
                ...(file.accessControl?.allowedUsers || []),
                ...recipients
            ]))
        };

        await File.updateOne({ _id: fileId }, { $set: { accessControl: file.accessControl } });
        console.log('Updated file permissions:', file.accessControl);

        // Notify recipients
        recipients.forEach(recipient => {
            io.to(recipient).emit('fileShared', {
                fileId: file._id,
                fileName: file.name,
                from: from,
                recipient: recipient,
                timestamp: new Date()
            });
            console.log(`Notification sent to ${recipient}`);
        });

        res.json({
            success: true,
            message: `File shared with ${recipients.join(', ')}`,
            file: {
                id: file._id,
                name: file.name
            }
        });

    } catch (error) {
        console.error('Share error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to share file'
        });
    }
});

// Enable CORS and JSON parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Enable CORS for Socket.IO
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

// Update CORS settings to allow all headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
});

// Simple file upload configuration
const UPLOAD_DIR = path.join(__dirname, 'uploads');
// Create uploads directory if it doesn't exist
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log('Created uploads directory:', UPLOAD_DIR);
}

// Update storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        // Create a safe unique filename
        const uniqueName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        console.log('Generated filename:', uniqueName);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

// Update file upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No file uploaded');
        }

        console.log('File upload:', {
            originalName: req.file.originalname,
            filename: req.file.filename,
            path: req.file.path
        });

        const fileDoc = {
            name: req.file.originalname,
            filename: req.file.filename, // Store actual filename
            path: req.file.path, // Store full path
            uploadedBy: req.body.from || 'anonymous',
            timestamp: new Date(),
            size: req.file.size,
            type: req.file.mimetype,
            accessControl: {
                private: req.body.recipients ? JSON.parse(req.body.recipients).length > 0 : false,
                allowedUsers: req.body.recipients ? JSON.parse(req.body.recipients) : []
            }
        };

        await File.insertOne(fileDoc);
        console.log('File saved:', {
            id: fileDoc._id,
            name: fileDoc.name,
            filename: fileDoc.filename,
            path: fileDoc.path
        });

        res.json({
            success: true,
            file: {
                id: fileDoc._id,
                name: fileDoc.name,
                size: fileDoc.size,
                type: fileDoc.type,
                timestamp: fileDoc.timestamp,
                accessControl: fileDoc.accessControl
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Update files endpoint to better handle user types
app.get('/api/files', async (req, res) => {
    try {
        const userType = req.query.type?.toLowerCase();
        let query = {};

        // Build query based on user type
        if (userType && userType !== 'admin') {
            query = {
                $or: [
                    { 'accessControl.private': false },
                    { 'accessControl.allowedUsers': userType },
                    { uploadedBy: userType }
                ]
            };
        }

        const files = await File.find(query)
            .sort({ timestamp: -1 })
            .toArray();

        console.log(`Found ${files.length} files for ${userType}`);
        res.json(files);
    } catch (error) {
        console.error('Files fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});

// Update download endpoint to fix file retrieval
app.get('/api/download/:fileId', async (req, res) => {
    try {
        console.log('Download request for:', req.params.fileId);
        
        const file = await File.findOne({ _id: req.params.fileId });
        if (!file) {
            console.error('File not found in database:', req.params.fileId);
            return res.status(404).json({ error: 'File not found in database' });
        }

        // Use stored filename to get file path
        const filePath = path.join(UPLOAD_DIR, file.filename);
        console.log('Download path:', {
            id: file._id,
            name: file.name,
            storedName: file.filename,
            path: filePath
        });

        // Verify file exists
        if (!fs.existsSync(filePath)) {
            console.error('File not found on disk:', filePath);
            return res.status(404).json({ error: 'File not found on disk' });
        }

        // Set download headers
        res.setHeader('Content-Type', file.type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);

        // Stream file with error handling
        const fileStream = fs.createReadStream(filePath);
        fileStream.on('error', (error) => {
            console.error('Stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to read file' });
            }
        });

        fileStream.pipe(res);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// Add new endpoints for P2P functionality
app.post('/api/p2p/initiate', authenticateToken, async (req, res) => {
    try {
        const { targetPeerId, fileId } = req.body;
        const sourcePeer = peers.get(req.user.id);
        
        if (!sourcePeer || !peers.has(targetPeerId)) {
            return res.status(404).json({ error: 'Peer not found' });
        }

        const file = await File.findOne({ _id: fileId });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        io.to(targetPeerId).emit('p2pRequest', {
            from: sourcePeer,
            fileInfo: {
                id: file._id,
                name: file.name,
                size: file.size
            }
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Make sure this is the last middleware
app.use(express.static('./'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

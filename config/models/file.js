const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    originalName: String,
    size: Number,
    type: String,
    path: String,
    uploadedBy: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    accessControl: {
        private: {
            type: Boolean,
            default: false
        },
        allowedUsers: [{
            type: String
        }]
    }
});

module.exports = mongoose.model('File', fileSchema);

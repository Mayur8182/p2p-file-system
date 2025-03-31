# P2P File Sharing System

A secure peer-to-peer file sharing system with user authentication and organization-specific access controls.

## Features

- Multi-user authentication (Admin, NASA, DRDO, University)
- Secure file upload and sharing
- Real-time file transfer notifications
- Organization-specific dashboards
- MongoDB Atlas integration for file storage
- Drag-and-drop file upload support
- File sharing controls and permissions

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js
- Database: MongoDB Atlas
- Real-time: Socket.IO
- File Storage: GridFS

## Recent Changes

- Added MongoDB Atlas integration
- Improved file upload reliability
- Added retry mechanism for failed uploads
- Enhanced error handling
- Added proper database schemas
- Improved security with access controls

## Setup Instructions

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Set up MongoDB Atlas:
- Create account at MongoDB Atlas
- Create new cluster
- Add database user
- Whitelist IP addresses
- Get connection string

4. Configure environment:
- Create .env file
- Add MongoDB connection string
- Set other environment variables

5. Run the application:
```bash
npm start
```

## Project Structure

```
oss - Copy/
├── app.js              # Main application file
├── config/
│   └── db.js          # Database configuration
├── models/
│   └── File.js        # File schema definition
├── .gitignore         # Git ignore rules
└── README.md          # Project documentation
```

## Usage

1. Login with credentials:
- Admin: admin/admin123
- NASA: nasa/nasa123
- DRDO: drdo/drdo123
- University: university/univ123

2. Upload files:
- Drag and drop files
- Select recipients
- Share files securely

3. Access Controls:
- Admin can share with any organization
- Organizations can only access shared files
- File access logs maintained

## Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open pull request

## License

MIT License - feel free to use for personal or commercial projects.

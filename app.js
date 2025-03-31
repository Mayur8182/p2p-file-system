const USERS = {
    admin: {
        username: 'admin',
        password: 'admin123',
        type: 'admin',
        dashboard: 'adminDashboard'
    },
    nasa_user: {
        username: 'nasa',
        password: 'nasa123',
        type: 'nasa',
        dashboard: 'nasaDashboard'
    },
    drdo_user: {
        username: 'drdo',
        password: 'drdo123',
        type: 'drdo',
        dashboard: 'drdoDashboard'
    },
    university_user: {
        username: 'university',
        password: 'univ123',
        type: 'university',
        dashboard: 'universityDashboard'
    }
};

const EMAIL_CONFIG = {
    defaultEmail: 'mkbharvad8080@gmail.com',
    emailSubject: 'New File Shared - P2P System'
};

class P2PFileSystem {
    constructor() {
        this.peers = new Set();
        this.files = new Map();
        this.uploadedFiles = [];
        this.socket = null;
        this.init();
        this.setupDragAndDrop();
        this.setupSearch();
        this.setupFileSystem();
        this.setupAuth();
    }

    init() {
        // Initialize socket connection
        this.socket = io(config.API_URL, {
            path: config.SOCKET_PATH,
            transports: ['websocket', 'polling'],
            credentials: true
        });

        this.setupSocketListeners();
        this.setupEventListeners();
        this.connectToPeers();
    }

    setupEventListeners() {
        window.addEventListener('load', () => this.updateFileList());
    }

    connectToPeers() {
        // Simulated peer connection
        console.log('Connecting to peers...');
    }

    setupDragAndDrop() {
        const dropZone = document.getElementById('dropZone');
        
        if (!dropZone) return;

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
            
            // Check login before accepting files
            if (!this.currentUser) {
                this.showToast('Please log in first', 'error');
                return;
            }
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                Array.from(files).forEach(file => {
                    if (this.validateFile(file)) {
                        this.processFileUpload(file);
                    }
                });
            }
        });

        // Fix file input handling
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (!this.currentUser) {
                    this.showToast('Please log in first', 'error');
                    return;
                }
                const files = e.target.files;
                if (files.length > 0) {
                    Array.from(files).forEach(file => {
                        if (this.validateFile(file)) {
                            this.processFileUpload(file);
                        }
                    });
                }
            });
        }
    }

    setupSearch() {
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase();
            this.updateFileList(query);
        });
    }

    handleFiles(files) {
        Array.from(files).forEach(file => this.uploadFile(file));
    }

    async uploadFile(file) {
        try {
            // Get progress element from current dashboard
            const currentDashboard = document.querySelector(`#${this.currentUser.type}Dashboard`);
            const progress = currentDashboard.querySelector('#uploadProgress');
            const progressBar = progress?.querySelector('.progress-bar');
            
            if (progress && progressBar) {
                progress.classList.remove('d-none');
                progressBar.style.width = '0%';
            }

            // Show selected recipients if admin
            let recipients = [];
            if (this.currentUser?.type === 'admin') {
                const recipientSelect = document.getElementById('recipientSelect');
                if (recipientSelect) {
                    recipients = Array.from(recipientSelect.selectedOptions).map(opt => opt.value);
                }
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('from', this.currentUser?.username || 'Anonymous');
            formData.append('recipients', JSON.stringify(recipients));

            const response = await fetch('https://p2p-file-system.onrender.com/api/upload', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const responseData = await response.json();

            if (responseData.success) {
                // Add to local list
                this.uploadedFiles.push({
                    id: responseData.file.id,
                    name: file.name,
                    size: file.size,
                    timestamp: new Date(),
                    type: file.type
                });

                this.showToast('File uploaded successfully!', 'success');
                this.updateFileDisplay();

                // Notify recipient if sharing
                const shareEmail = document.getElementById('shareEmail')?.value;
                if (shareEmail) {
                    await this.shareFileWithUser(responseData.file.id, shareEmail);
                }
            }

        } catch (error) {
            this.showToast(`Upload failed: ${error.message}`, 'error');
        } finally {
            if (progress) {
                progress.classList.add('d-none');
            }
        }
    }

    setupFileSystem() {
        // Only initialize file display after login
        this.updateFileDisplay();
    }

    async processFileUpload(file) {
        try {
            const MAX_CHUNK_SIZE = 1024 * 1024 * 5; // 5MB chunks for better handling
            const totalChunks = Math.ceil(file.size / MAX_CHUNK_SIZE);
            
            // Show progress
            const progress = document.getElementById('uploadProgress');
            const progressBar = progress.querySelector('.progress-bar');
            progress.style.display = 'block';
            progress.classList.remove('d-none');
            
            // Validate file size
            if (!this.validateFile(file)) {
                return false;
            }

            // Get recipients if admin
            const recipients = this.currentUser?.type === 'admin' 
                ? Array.from(document.querySelectorAll('.recipient-options input:checked'))
                    .map(input => input.value)
                : [];

            // Upload metadata first
            const metadataResponse = await fetch('https://p2p-file-system.onrender.com/api/upload/init', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filename: file.name,
                    totalSize: file.size,
                    totalChunks,
                    type: file.type,
                    from: this.currentUser.type,
                    recipients
                })
            });

            if (!metadataResponse.ok) throw new Error('Failed to initialize upload');
            const { uploadId } = await metadataResponse.json();

            // Upload chunks
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * MAX_CHUNK_SIZE;
                const end = Math.min(start + MAX_CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);

                const formData = new FormData();
                formData.append('chunk', chunk);
                formData.append('uploadId', uploadId);
                formData.append('chunkIndex', chunkIndex);

                const response = await fetch('https://p2p-file-system.onrender.com/api/upload/chunk', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) throw new Error(`Failed to upload chunk ${chunkIndex}`);

                // Update progress
                const percentComplete = ((chunkIndex + 1) / totalChunks) * 100;
                progressBar.style.width = `${percentComplete}%`;
            }

            // Complete upload
            const completeResponse = await fetch('https://p2p-file-system.onrender.com/api/upload/complete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    uploadId,
                    recipients
                })
            });

            if (!completeResponse.ok) throw new Error('Failed to complete upload');
            const finalResult = await completeResponse.json();

            // Add to file list and update UI
            this.uploadedFiles.push({
                _id: finalResult.fileId,
                id: finalResult.fileId,
                name: file.name,
                size: file.size,
                type: file.type,
                timestamp: new Date(),
                uploadedBy: this.currentUser.type,
                accessControl: {
                    private: recipients.length > 0,
                    allowedUsers: recipients
                }
            });

            this.showToast(`File ${file.name} uploaded successfully!`, 'success');
            this.updateFileDisplay();

            return true;
        } catch (error) {
            console.error('Upload failed:', error);
            this.showToast(`Upload failed: ${error.message}`, 'error');
            return false;
        } finally {
            // Hide progress
            const progress = document.getElementById('uploadProgress');
            progress.style.display = 'none';
            progress.classList.add('d-none');
        }
    }

    validateFile(file) {
        const MAX_FILE_SIZE = 1024 * 1024 * 1024 * 10; // 10GB max file size
        const ALLOWED_TYPES = [
            'video/', 'image/', 'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument',
            'application/zip',
            'application/x-zip-compressed',
            'video/mp4',
            'video/mpeg',
            'video/quicktime',
            'application/octet-stream'
        ];

        if (file.size > MAX_FILE_SIZE) {
            this.showToast('File size exceeds 10GB limit', 'error');
            return false;
        }

        if (!ALLOWED_TYPES.some(type => file.type.startsWith(type))) {
            this.showToast('File type not supported', 'error');
            return false;
        }

        return true;
    }

    async shareFileWithUser(fileId, recipient) {
        try {
            console.log('Sharing file:', { fileId, recipient });
            
            const response = await fetch('/api/share-private', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileId,
                    recipients: [recipient],
                    from: this.currentUser.type
                })
            });

            if (!response.ok) {
                throw new Error('Failed to share file');
            }

            const result = await response.json();
            if (result.success) {
                this.showToast(`File shared with ${recipient}`, 'success');
            }
        } catch (error) {
            console.error('Share error:', error);
            this.showToast(`Failed to share with ${recipient}: ${error.message}`, 'error');
        }
    }

    async sharePrivateFile(fileId, recipients) {
        if (!fileId || !recipients?.length) return;

        try {
            console.log('Sharing file:', { fileId, recipients });

            const response = await fetch('/api/share-private', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileId: fileId,
                    recipients: recipients,
                    from: this.currentUser.type
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Share failed');
            }

            return data;
        } catch (error) {
            console.error('Share failed:', error);
            throw error;
        }
    }

    updateFileList(searchQuery = '') {
        if (!this.currentUser?.type) {
            console.log('No active user session');
            return Promise.resolve();
        }

        const userType = this.currentUser.type;
        console.log('Fetching files for user type:', userType);

        const retryFetch = async (attempts = 3) => {
            for (let i = 0; i < attempts; i++) {
                try {
                    const response = await fetch(`https://p2p-file-system.onrender.com/api/files?type=${userType}`, {
                        credentials: 'include',
                        headers: {
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache'
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`Server returned ${response.status}`);
                    }

                    const files = await response.json();
                    console.log('Fetched files:', files);
                    this.uploadedFiles = Array.isArray(files) ? files : [];
                    this.updateFileDisplay();
                    return;
                } catch (error) {
                    console.error(`Attempt ${i + 1} failed:`, error);
                    if (i === attempts - 1) {
                        throw error;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                }
            }
        };

        return retryFetch()
            .catch(error => {
                console.error('Error fetching files:', error);
                if (this.currentUser) {
                    this.showToast(`Failed to fetch files: ${error.message}. Please try refreshing the page.`, 'error');
                }
                // Set empty array on error to prevent undefined errors
                this.uploadedFiles = [];
                this.updateFileDisplay();
            });
    }

    updateFileDisplay() {
        // Check if user is logged in
        if (!this.currentUser?.type) {
            console.log('Cannot display files - no active user');
            return;
        }

        // Get the current dashboard's file list
        const currentDashboard = document.querySelector(`#${this.currentUser.type}Dashboard`);
        const fileList = currentDashboard?.querySelector('#fileList');
        if (!fileList) return;

        fileList.innerHTML = '';
        
        if (!this.uploadedFiles.length) {
            fileList.innerHTML = `
                <div class="col-12 text-center">
                    <p class="text-muted">No files available</p>
                </div>
            `;
            return;
        }

        this.uploadedFiles.forEach(file => {
            const col = document.createElement('div');
            col.className = 'col-md-4 mb-3';
            col.innerHTML = `
                <div class="card h-100">
                    <div class="card-header">
                        <i class="fas ${this.getFileIcon(file.type)}"></i> 
                        ${file.name}
                    </div>
                    <div class="card-body">
                        <p class="card-text">
                            <small class="text-muted">
                                Size: ${this.formatFileSize(file.size)}<br>
                                Uploaded: ${new Date(file.timestamp).toLocaleString()}<br>
                                By: ${file.uploadedBy || 'Unknown'}<br>
                                ${file.accessControl?.allowedUsers?.length ? 
                                    `Shared with: ${file.accessControl.allowedUsers.join(', ')}` : 
                                    'Public'}
                            </small>
                        </p>
                        <div class="btn-group w-100">
                            <button class="btn btn-primary btn-sm" onclick="fileSystem.downloadFile('${file._id}')">
                                <i class="fas fa-download"></i> Download
                            </button>
                            ${this.currentUser?.type === 'admin' ? `
                                <button class="btn btn-success btn-sm" onclick="fileSystem.showShareModal('${file._id}')">
                                    <i class="fas fa-share"></i> Share
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
            fileList.appendChild(col);
        });

        // Update file count in the current dashboard
        const fileCount = currentDashboard.querySelector(`#${this.currentUser.type}FileCount`);
        if (fileCount) {
            fileCount.textContent = this.uploadedFiles.length;
        }
    }

    formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
    }

    getFileIcon(type = '') {
        // Add default check to prevent undefined error
        if (!type) return 'fa-file';
        
        if (type.startsWith('image/')) return 'fa-image';
        if (type.startsWith('video/')) return 'fa-video';
        if (type.includes('pdf')) return 'fa-file-pdf';
        if (type.includes('word')) return 'fa-file-word';
        if (type.includes('excel')) return 'fa-file-excel';
        return 'fa-file';
    }

    downloadFile(fileId) {
        if (!fileId) return;
        
        const file = this.uploadedFiles.find(f => f._id === fileId || f.id === fileId);
        if (file) {
            window.open(`https://p2p-file-system.onrender.com/api/download/${fileId}`, '_blank');
        }
    }

    shareFile(fileId) {
        const file = this.uploadedFiles.find(f => f.id === fileId);
        if (file) {
            this.socket.emit('shareFile', { fileId, fileName: file.name });
            this.showNotification(`Sharing file: ${file.name}`);
        }
    }

    generatePeerId() {
        return 'peer_' + Math.random().toString(36).substr(2, 9);
    }

    setupPeerSystem() {
        // Add peer connection UI elements
        const statsSection = document.querySelector('.stats-section');
        statsSection.innerHTML += `
            <div class="peer-controls">
                <input type="text" id="peerName" placeholder="Your Name">
                <select id="peerType">
                    <option value="NASA">NASA</option>
                    <option value="DRDO">DRDO</option>
                    <option value="University">University</option>
                    <option value="Guest">Guest</option>
                </select>
                <button onclick="fileSystem.connectAsPeer()">Connect</button>
            </div>
            <div id="peerList" class="peer-list"></div>
        `;
    }

    setupWebSocket() {
        this.ws = new WebSocket(`ws://${window.location.hostname}:3000`);
        this.ws.onmessage = (event) => this.handlePeerMessage(JSON.parse(event.data));
        this.ws.onopen = () => this.announcePresence();
    }

    announcePresence() {
        this.ws.send(JSON.stringify({
            type: 'announce',
            peer: this.currentPeer
        }));
    }

    connectAsPeer() {
        const name = document.getElementById('peerName').value || 'Anonymous';
        const type = document.getElementById('peerType').value;
        
        this.socket.emit('join', {
            username: name,
            type: type
        });

        this.showNotification(`Connected as ${type}`);
    }

    handlePeerMessage(message) {
        switch(message.type) {
            case 'announce':
                this.activePeers.set(message.peer.id, message.peer);
                this.updatePeerList();
                break;
            case 'request_file':
                this.handleFileRequest(message);
                break;
        }
    }

    updatePeerList() {
        const peerList = document.getElementById('peerList');
        peerList.innerHTML = '';
        this.activePeers.forEach(peer => {
            const peerDiv = document.createElement('div');
            peerDiv.className = 'peer-item';
            peerDiv.innerHTML = `
                <span>${peer.name} (${peer.type})</span>
                <span class="peer-status online"></span>
            `;
            peerList.appendChild(peerDiv);
        });
        document.getElementById('peerCount').textContent = 
            `${this.activePeers.size} Peers`;
    }

    setupAuth() {
        this.login = () => {
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value.trim();
            const userType = document.getElementById('userType').value;

            console.log('Login attempt:', { username, userType });  // Debug log

            // Input validation
            if (!username || !password) {
                this.showToast('Please enter username and password', 'error');
                return;
            }

            // Map userType to the correct user object key
            const userKey = userType === 'admin' ? 'admin' : `${userType}_user`;
            const userData = USERS[userKey];

            if (!userData) {
                this.showToast('Invalid user type', 'error');
                return;
            }

            // Validate credentials
            if (username === userData.username && password === userData.password) {
                console.log('Login successful');  // Debug log
                
                // Store user data
                this.currentUser = { ...userData };
                this.showToast('Login successful!', 'success');
                
                // Hide login section
                document.getElementById('loginSection').style.display = 'none';

                // Show correct dashboard
                const dashboardId = `${userType}Dashboard`;
                const dashboard = document.getElementById(dashboardId);
                
                if (dashboard) {
                    // Hide all dashboards first
                    document.querySelectorAll('.dashboard').forEach(d => d.style.display = 'none');
                    
                    // Show and setup the correct dashboard
                    dashboard.style.display = 'block';
                    dashboard.classList.add('active');
                    this.setupDashboardControls(userType);
                    this.updateFileList();
                    
                    if (userType === 'admin') {
                        this.refreshDashboard();
                    }
                } else {
                    console.error('Dashboard not found:', dashboardId);  // Debug log
                    this.showToast('Dashboard not found', 'error');
                }
            } else {
                console.log('Invalid credentials');  // Debug log
                this.showToast('Invalid username or password', 'error');
            }
        };
    }

    refreshDashboard() {
        if (!this.currentUser) return;
        
        // Refresh file list
        this.updateFileList();
        
        // Update stats based on dashboard type
        const dashboardType = this.currentUser.type;
        const fileCount = this.uploadedFiles.length;
        
        document.getElementById(`${dashboardType}FileCount`).textContent = fileCount;
        
        switch(dashboardType) {
            case 'admin':
                document.getElementById('adminUserCount').textContent = 
                    Math.floor(Math.random() * 10) + 5;
                document.getElementById('adminStorageCount').textContent = 
                    `${(Math.random() * 10).toFixed(1)} GB`;
                break;
                
            case 'nasa':
                document.getElementById('nasaPeerCount').textContent = 
                    Math.floor(Math.random() * 5) + 2;
                document.getElementById('nasaDownloadCount').textContent = 
                    Math.floor(Math.random() * 100);
                break;
                
            case 'drdo':
                document.getElementById('drdoPeerCount').textContent = 
                    Math.floor(Math.random() * 5) + 2;
                document.getElementById('drdoDownloadCount').textContent = 
                    Math.floor(Math.random() * 100);
                break;
                
            case 'university':
                document.getElementById('universityPeerCount').textContent = 
                    Math.floor(Math.random() * 5) + 2;
                document.getElementById('universityDownloadCount').textContent = 
                    Math.floor(Math.random() * 100);
                break;
        }
        
        this.showToast('Dashboard refreshed!', 'success');
    }

    setupDashboardControls(type) {
        // Setup dashboard specific controls
        switch(type) {
            case 'admin':
                this.setupAdminControls();
                break;
            case 'nasa':
                this.setupNASAControls();
                break;
            case 'drdo':
                this.setupDRDOControls();
                break;
            case 'university':
                this.setupUniversityControls();
                break;
        }
    }

    // Add these helper methods
    setupAdminControls() {
        const uploadSection = document.querySelector('.upload-section');
        if (!uploadSection) return;

        // Clear any existing recipient selector
        const existingSelector = uploadSection.querySelector('.recipient-selector');
        if (existingSelector) existingSelector.remove();

        // Add recipient selector
        const recipientContainer = document.createElement('div');
        recipientContainer.className = 'recipient-selector mb-3';
        recipientContainer.innerHTML = `
            <h4 class="mb-3">Share Files with Organizations</h4>
            <div class="recipient-options">
                <div class="form-check custom-checkbox">
                    <input type="checkbox" class="form-check-input" id="nasaCheck" value="nasa">
                    <label class="form-check-label" for="nasaCheck">
                        <i class="fas fa-rocket"></i> NASA
                    </label>
                </div>
                <div class="form-check custom-checkbox">
                    <input type="checkbox" class="form-check-input" id="drdoCheck" value="drdo">
                    <label class="form-check-label" for="drdoCheck">
                        <i class="fas fa-shield-alt"></i> DRDO
                    </label>
                </div>
                <div class="form-check custom-checkbox">
                    <input type="checkbox" class="form-check-input" id="universityCheck" value="university">
                    <label class="form-check-label" for="universityCheck">
                        <i class="fas fa-university"></i> University
                    </label>
                </div>
            </div>
        `;
        
        uploadSection.insertBefore(recipientContainer, uploadSection.firstChild);

        // Override processFileUpload for admin
        this.processFileUpload = async (file) => {
            try {
                // Get selected recipients
                const recipients = Array.from(document.querySelectorAll('.recipient-options input:checked'))
                    .map(input => input.value);

                console.log('Upload attempt:', {
                    file: file.name,
                    recipients: recipients
                });

                // Show progress
                const progress = document.getElementById('uploadProgress');
                if (progress) {
                    progress.style.display = 'block';
                    progress.classList.remove('d-none');
                    const progressBar = progress.querySelector('.progress-bar');
                    if (progressBar) progressBar.style.width = '0%';
                }

                // Create form data
                const formData = new FormData();
                formData.append('file', file);
                formData.append('from', 'admin');
                formData.append('recipients', JSON.stringify(recipients));

                // Upload file
                const response = await fetch('https://p2p-file-system.onrender.com/api/upload', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) throw new Error('Upload failed');

                const data = await response.json();
                
                if (data.success) {
                    // Add to local list with recipient info
                    const newFile = {
                        _id: data.file.id,
                        id: data.file.id,
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        timestamp: new Date(),
                        uploadedBy: 'admin',
                        accessControl: {
                            private: recipients.length > 0,
                            allowedUsers: recipients
                        }
                    };

                    this.uploadedFiles.push(newFile);
                    
                    // Share with selected recipients
                    if (recipients.length > 0) {
                        await this.sharePrivateFile(data.file.id, recipients);
                        this.showToast(`File shared with: ${recipients.join(', ')}`, 'success');
                    }

                    this.showToast('File uploaded successfully!', 'success');
                    this.updateFileDisplay();

                    // Clear checkboxes
                    document.querySelectorAll('.recipient-options input[type="checkbox"]')
                        .forEach(cb => cb.checked = false);
                }

            } catch (error) {
                console.error('Upload error:', error);
                this.showToast(`Upload failed: ${error.message}`, 'error');
            } finally {
                // Hide progress
                const progress = document.getElementById('uploadProgress');
                if (progress) {
                    progress.style.display = 'none';
                    progress.classList.add('d-none');
                }
            }
        };
    }

    setupNASAControls() {
        // NASA specific setup
        const missionSelector = document.getElementById('missionType');
        if (missionSelector) {
            missionSelector.addEventListener('change', (e) => {
                this.updateFileList(e.target.value);
            });
        }
    }

    setupDRDOControls() {
        // DRDO specific setup
    }

    setupUniversityControls() {
        // University specific setup
    }

    canAccessFile(file) {
        if (!this.currentUser) return false;
        if (this.currentUser.type === 'admin') return true;
        return file.allowedUsers.some(pattern => 
            file.name.startsWith(pattern) || pattern === '*');
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            if (this.currentUser) {
                this.socket.emit('join', {
                    username: this.currentUser.username,
                    type: this.currentUser.type
                });
            }
        });

        this.socket.on('fileShared', (data) => {
            console.log('File shared event:', data);
            if (this.currentUser && data.recipient === this.currentUser.type) {
                this.showToast(`New file shared by ${data.from}: ${data.fileName}`, 'success');
                // Refresh file list to show new file
                this.updateFileList();
            }
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showToast('Connection error: ' + (error.message || 'Unknown error'), 'error');
        });
    }

    updatePeerCount() {
        const peerCount = document.getElementById('peerCount');
        if (peerCount && this.activePeers) {
            peerCount.textContent = `${this.activePeers.size} Peers`;
        }
    }

    setupSocketHandlers() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('userConnected', (user) => {
            console.log('User connected:', user);
            this.showNotification(`${user.username} connected as ${user.type}`);
            this.updatePeerList();
        });

        this.socket.on('fileReceived', (data) => {
            this.showNotification(`Received file from ${data.from}: ${data.file.name}`);
            this.uploadedFiles.push(data.file);
            this.updateFileDisplay();
        });

        this.socket.on('error', (error) => {
            alert(error.message);
        });
    }

    sendFileToPeer(fileId, targetUser) {
        const file = this.uploadedFiles.find(f => f.id === fileId);
        if (file) {
            this.socket.emit('sendFile', {
                targetUser,
                fileInfo: file
            });
            this.showNotification(`File sent to ${targetUser}`);
        }
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.innerHTML = `
            <i class="fas fa-info-circle"></i>
            <span>${message}</span>
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    showShareModal(fileId) {
        const file = this.uploadedFiles.find(f => f.id === fileId);
        if (!file) {
            this.showToast('File not found', 'error');
            return;
        }

        const modal = document.getElementById('accessControlModal');
        if (!modal) {
            this.showToast('Share modal not found', 'error');
            return;
        }

        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Share File: ${file.name}</h2>
                <div class="recipient-options">
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input" id="nasaCheck" value="nasa">
                        <label class="form-check-label" for="nasaCheck">NASA</label>
                    </div>
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input" id="drdoCheck" value="drdo">
                        <label class="form-check-label" for="drdoCheck">DRDO</label>
                    </div>
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input" id="universityCheck" value="university">
                        <label class="form-check-label" for="universityCheck">University</label>
                    </div>
                </div>
                <button onclick="fileSystem.confirmShare('${fileId}')">Share</button>
                <button onclick="document.getElementById('accessControlModal').style.display='none'">Cancel</button>
            </div>
        `;
    }

    async confirmShare(fileId) {
        const recipients = Array.from(document.querySelectorAll('.recipient-options input:checked'))
            .map(input => input.value);

        if (recipients.length === 0) {
            this.showToast('Please select at least one recipient', 'error');
            return;
        }

        try {
            await this.sharePrivateFile(fileId, recipients);
            document.getElementById('accessControlModal').style.display = 'none';
        } catch (error) {
            console.error('Share failed:', error);
        }
    }

    async sharePrivateFile(file, progress) {
        try {
            const response = await fetch('/api/share-private', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileId: file.id,
                    recipients: this.selectedRecipients
                })
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Share failed:', error);
            throw new Error('Failed to share file. Please check your connection and try again.');
        }
    }

    showToast(message, type = 'success') {
        // Remove any existing toasts first
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(toast => toast.remove());

        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center text-white bg-${type === 'success' ? 'success' : 'danger'} border-0`;
        toastEl.setAttribute('role', 'alert');
        toastEl.style.position = 'fixed';
        toastEl.style.top = '20px';
        toastEl.style.right = '20px';
        toastEl.style.zIndex = '9999';
        toastEl.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;
        document.body.appendChild(toastEl);
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
        setTimeout(() => toastEl.remove(), 3000);
    }

    showError(message) {
        // Add error display functionality
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }
}

// Make P2PFileSystem available globally
window.P2PFileSystem = P2PFileSystem;

// Initialize system
window.addEventListener('DOMContentLoaded', () => {
    // Create system instance
    const system = new P2PFileSystem();
    window.fileSystem = system;
});

function uploadFile() {
    fileSystem.uploadFile();
}

function downloadFile(fileId) {
    fileSystem.downloadFile(fileId);
}

// Add missing admin dashboard functions
function showUserManagement() {
    console.log('User management');
    alert('User management feature coming soon');  
}

function showSystemLogs() {
    console.log('System logs');
    alert('System logs feature coming soon');
}

function showEncryptionKeys() {
    console.log('Encryption keys');
    alert('Encryption keys feature coming soon');
}

// Make functions globally available
window.showUserManagement = showUserManagement;
window.showSystemLogs = showSystemLogs;
window.showEncryptionKeys = showEncryptionKeys;

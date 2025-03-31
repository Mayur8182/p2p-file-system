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
        this.init();
        this.setupDragAndDrop();
        this.setupSearch();
        this.setupFileSystem();
        this.socket = io();
        this.setupSocketListeners();
        this.setupAuth(); // Make sure this gets called
    }

    init() {
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
                Array.from(files).forEach(file => this.processFileUpload(file));
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
                    Array.from(files).forEach(file => this.processFileUpload(file));
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
            const progress = document.getElementById('uploadProgress');
            const progressBar = progress.querySelector('.progress-bar');
            
            progress.style.display = 'block';
            progressBar.style.width = '0%';

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

            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/upload', true);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = (e.loaded / e.total) * 100;
                    progressBar.style.width = percent + '%';
                }
            };

            const response = await new Promise((resolve, reject) => {
                xhr.onload = () => {
                    if (xhr.status === 200) {
                        resolve(JSON.parse(xhr.responseText));
                    } else {
                        reject(new Error(xhr.responseText));
                    }
                };
                xhr.onerror = () => reject(new Error('Network error'));
                xhr.send(formData);
            });

            if (response.success) {
                // Add to local list
                this.uploadedFiles.push({
                    id: response.file.id,
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
                    await this.shareFileWithUser(response.file.id, shareEmail);
                }
            }

        } catch (error) {
            this.showToast(`Upload failed: ${error.message}`, 'error');
        } finally {
            progress.style.display = 'none';
        }
    }

    setupFileSystem() {
        // Only initialize file display after login
        this.updateFileDisplay();
    }

    uploadFile() {
        if (!this.currentUser) {
            this.showToast('Please log in first', 'error');
            return;
        }

        const fileInput = document.getElementById('fileInput');
        const files = fileInput.files;
        
        if (files.length > 0) {
            Array.from(files).forEach(file => {
                this.processFileUpload(file);
            });
        } else {
            this.showToast('Please select files to upload', 'error');
        }
    }

    async processFileUpload(file) {
        let currentDashboard, progressBar;
        try {
            // Validate user and get dashboard
            if (!this.currentUser?.type) {
                throw new Error('Please log in first');
            }

            currentDashboard = document.querySelector(`#${this.currentUser.type}Dashboard`);
            if (!currentDashboard) {
                throw new Error('Dashboard not found');
            }

            // Get selected recipients
            const recipients = Array.from(currentDashboard.querySelectorAll('.recipient-options input:checked'))
                .map(input => input.value);

            console.log('Upload attempt:', {
                file: file.name,
                from: this.currentUser.type,
                recipients: recipients
            });

            // Create and show progress bar
            const progress = currentDashboard.querySelector('.progress');
            if (progress) {
                progress.style.display = 'block';
                progress.classList.remove('d-none');
                progressBar = progress.querySelector('.progress-bar');
                if (progressBar) progressBar.style.width = '0%';
            }

            // Upload the file
            const formData = new FormData();
            formData.append('file', file);
            formData.append('from', this.currentUser.type);
            formData.append('recipients', JSON.stringify(recipients));

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const data = await response.json();
            if (data.success) {
                // Add file to local list
                const newFile = {
                    _id: data.file.id,
                    id: data.file.id,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    timestamp: new Date(),
                    uploadedBy: this.currentUser.type,
                    accessControl: {
                        private: recipients.length > 0,
                        allowedUsers: recipients
                    }
                };

                this.uploadedFiles.push(newFile);

                // Share with recipients if any selected
                if (recipients.length > 0) {
                    await this.sharePrivateFile(data.file.id, recipients);
                }

                this.showToast(`File ${file.name} uploaded successfully!`, 'success');
                if (recipients.length > 0) {
                    this.showToast(`File shared with: ${recipients.join(', ')}`, 'success');
                }

                await this.updateFileList();
                
                // Clear checkboxes
                currentDashboard.querySelectorAll('.recipient-options input[type="checkbox"]')
                    .forEach(cb => cb.checked = false);
            }

        } catch (error) {
            console.error('Upload error:', error);
            this.showToast(`Upload failed: ${error.message}`, 'error');
        } finally {
            if (progress) {
                progress.style.display = 'none';
                progress.classList.add('d-none');
            }
        }
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
        const userType = this.currentUser?.type || 'guest';
        console.log('Fetching files for user type:', userType);
        
        fetch(`/api/files?type=${userType}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch files');
                }
                return response.json();
            })
            .then(files => {
                console.log('Fetched files:', files);
                this.uploadedFiles = files;
                this.updateFileDisplay();
            })
            .catch(error => {
                console.error('Error fetching files:', error);
                this.showToast('Failed to fetch files', 'error');
            });
    }

    updateFileList() {
        // Don't fetch files if no user is logged in
        if (!this.currentUser?.type) {
            console.log('No active user session');
            return Promise.resolve();
        }

        const userType = this.currentUser.type;
        console.log('Fetching files for user type:', userType);
        
        return fetch(`/api/files?type=${userType}`)
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch files');
                return response.json();
            })
            .then(files => {
                console.log('Fetched files:', files);
                this.uploadedFiles = files;
                this.updateFileDisplay();
            })
            .catch(error => {
                console.error('Error fetching files:', error);
                if (this.currentUser) {
                    this.showToast('Failed to fetch files: ' + error.message, 'error');
                }
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
            window.open(`/api/download/${fileId}`, '_blank');
        }
    }

    shareFile(fileId) {
        const file = this.uploadedFiles.find(f => f.id === fileId);
        if (file) {
            this.socket.emit('shareFile', { fileId, fileName: file.name });
            this.showNotification(`Sharing file: ${file.name}`);
        }
    }

    async shareFileWithUser(fileId, email) {
        try {
            const response = await fetch('/api/share', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileId,
                    email,
                    from: this.currentUser?.username
                })
            });

            if (response.ok) {
                this.showToast(`File shared with ${email}`, 'success');
                document.getElementById('shareEmail').value = '';
            } else {
                throw new Error('Failed to share file');
            }
        } catch (error) {
            this.showToast(`Sharing failed: ${error.message}`, 'error');
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
        // Bind login method to this instance
        this.login = () => {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const userType = document.getElementById('userType').value;

            console.log('Login attempt:', { username, userType });

            if (!username || !password) {
                this.showToast('Please enter username and password', 'error');
                return;
            }

            if (this.authenticateUser(username, password, userType)) {
                this.showToast('Login successful!', 'success');
                this.showDashboard(userType);
            } else {
                this.showToast('Invalid credentials!', 'error');
            }
        };

        // Ensure fileSystem instance is available globally
        window.fileSystem = this;
    }

    authenticateUser(username, password, type) {
        // Convert admin to admin_user for key lookup
        const userKey = type === 'admin' ? 'admin' : `${type}_user`;
        const user = USERS[userKey];

        console.log('Auth attempt:', { username, type, userKey, found: !!user });

        if (user && user.username === username && user.password === password) {
            this.currentUser = {
                username: user.username,
                type: user.type,
                dashboard: `${type}Dashboard` // Directly use type for dashboard ID
            };
            console.log('Auth success:', this.currentUser);
            return true;
        }
        return false;
    }

    refreshDashboard() {
        if (!this.currentUser) return;
        
        // Refresh file list
        this.updateFileList();
        
        // Update stats
        if (this.currentUser.type === 'admin') {
            // Simulate stats update
            document.getElementById('adminFileCount').textContent = this.uploadedFiles.length;
            document.getElementById('adminUserCount').textContent = 
                Math.floor(Math.random() * 10) + 5; // Simulated active users
            document.getElementById('adminStorageCount').textContent = 
                `${(Math.random() * 10).toFixed(1)} GB`; // Simulated storage
        }
        
        this.showToast('Dashboard refreshed!', 'success');
    }

    showDashboard(type) {
        try {
            // Hide all dashboards and login
            document.getElementById('loginSection').style.display = 'none';
            
            // Hide all dashboards first
            ['adminDashboard', 'nasaDashboard', 'drdoDashboard', 'universityDashboard'].forEach(id => {
                const dashboard = document.getElementById(id);
                if (dashboard) {
                    dashboard.style.display = 'none';
                }
            });

            // Show the correct dashboard
            const dashboardId = `${type}Dashboard`;
            const dashboard = document.getElementById(dashboardId);
            
            console.log('Showing dashboard:', dashboardId, !!dashboard);
            
            if (!dashboard) {
                throw new Error(`Dashboard not found: ${dashboardId}`);
            }

            dashboard.style.display = 'block';
            dashboard.classList.add('active');
            
            this.showToast(`Welcome ${this.currentUser.username}!`, 'success');
            
            // Initialize dashboard features only after showing dashboard
            this.setupDashboardControls(type);
            this.updateFileList(); // Move this here after dashboard is shown
            
            // If admin, update stats immediately
            if (type === 'admin') {
                this.refreshDashboard();
            }
            
        } catch (error) {
            console.error('Dashboard error:', error);
            this.showToast('Error loading dashboard', 'error');
        }
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
                const response = await fetch('/api/upload', {
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
        if (!this.socket) {
            this.socket = io({
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5
            });
        }

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

// Initialize system
window.addEventListener('DOMContentLoaded', () => {
    window.fileSystem = new P2PFileSystem();
    // Ensure login function is available after initialization
    if (!window.login) {
        window.login = window.fileSystem.login.bind(window.fileSystem);
    }
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

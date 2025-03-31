import config from '../config.js';

export const apiService = {
    async uploadFile(file, userType) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('from', userType);

        const response = await fetch(`${config.API_URL}/api/upload`, {
            method: 'POST',
            body: formData
        });

        return response.json();
    },

    async getFiles(userType) {
        const response = await fetch(`${config.API_URL}/api/files?type=${userType}`);
        return response.json();
    },

    async downloadFile(fileId) {
        window.open(`${config.API_URL}/api/download/${fileId}`);
    }
};

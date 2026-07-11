document.addEventListener('DOMContentLoaded', () => {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    
    // UI States
    const uploadContent = document.querySelector('.upload-content');
    const processingState = document.getElementById('processingState');
    const successState = document.getElementById('successState');
    const errorState = document.getElementById('errorState');
    
    // Result elements
    const sizeValue = document.getElementById('sizeValue');
    const downloadBtn = document.getElementById('downloadBtn');
    const errorMessage = document.getElementById('errorMessage');
    
    // Reset buttons
    const resetBtn = document.getElementById('resetBtn');
    const errorResetBtn = document.getElementById('errorResetBtn');

    // Store URL object to prevent memory leaks
    let currentDownloadUrl = null;

    // Setup Event Listeners
    browseBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // Drag and Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.remove('drag-over');
        }, false);
    });

    uploadArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    }, false);

    // Reset Flow
    [resetBtn, errorResetBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            fileInput.value = '';
            if (currentDownloadUrl) {
                URL.revokeObjectURL(currentDownloadUrl);
                currentDownloadUrl = null;
            }
            showState(uploadContent);
            uploadArea.style.cursor = 'pointer';
        });
    });

    // Main Logic
    function handleFile(file) {
        if (!file.type.match('image/gif')) {
            showError('Please upload a valid GIF file.');
            return;
        }

        // 50MB limit
        if (file.size > 50 * 1024 * 1024) {
            showError('File is too large. Maximum size is 50MB.');
            return;
        }

        uploadFile(file);
    }

    function uploadFile(file) {
        showState(processingState);
        uploadArea.style.cursor = 'default';

        const formData = new FormData();
        formData.append('file', file);

        fetch('/api/process', {
            method: 'POST',
            body: formData
        })
        .then(async response => {
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Server error');
            }
            
            // Read custom header for file size
            const sizeHeader = response.headers.get('X-Final-Size-KB');
            const finalSize = sizeHeader ? sizeHeader : "Unknown";
            
            // Extract filename from Content-Disposition if present
            let filename = 'optimized.gif';
            const disposition = response.headers.get('Content-Disposition');
            if (disposition && disposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(disposition);
                if (matches != null && matches[1]) { 
                    filename = matches[1].replace(/['"]/g, '');
                }
            }

            const blob = await response.blob();
            return { blob, finalSize, filename };
        })
        .then(data => {
            showSuccess(data.blob, data.finalSize, data.filename);
        })
        .catch(error => {
            showError(error.message || 'A network error occurred while processing the file.');
            console.error('Error:', error);
        });
    }

    function showState(stateElement) {
        uploadContent.classList.add('hidden');
        processingState.classList.add('hidden');
        successState.classList.add('hidden');
        errorState.classList.add('hidden');
        
        stateElement.classList.remove('hidden');
    }

    function showSuccess(blob, finalSize, filename) {
        sizeValue.textContent = finalSize;
        
        // Clean up previous URL
        if (currentDownloadUrl) {
            URL.revokeObjectURL(currentDownloadUrl);
        }
        
        currentDownloadUrl = URL.createObjectURL(blob);
        downloadBtn.href = currentDownloadUrl;
        downloadBtn.download = filename;
        
        showState(successState);
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        showState(errorState);
    }
});

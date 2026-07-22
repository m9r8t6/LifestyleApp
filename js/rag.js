(function() {
    'use strict';

    let accessToken = null;
    let driveFolderId = null;
    let vectors = []; 
    // Format: [{ text: "chunk", embedding: [0.1, 0.2, ...] }, ...]

    function init() {
        // Try auto-connect if previously connected
        if (localStorage.getItem('lifeos_drive_auto_connect') === 'true') {
            setTimeout(() => {
                const clientId = localStorage.getItem('lifeos_google_client_id');
                if (clientId) authGoogle(true);
            }, 1000);
        }
    }

    // --- MATH: Cosine Similarity ---
    function dotProduct(vecA, vecB) {
        let dot = 0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
        }
        return dot;
    }
    
    function magnitude(vec) {
        let sum = 0;
        for (let i = 0; i < vec.length; i++) {
            sum += vec[i] * vec[i];
        }
        return Math.sqrt(sum);
    }
    
    function cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB || vecA.length === 0) return 0;
        return dotProduct(vecA, vecB) / (magnitude(vecA) * magnitude(vecB));
    }

    // --- HUGGINGFACE EMBEDDINGS ---
    async function getEmbedding(text) {
        const hfToken = localStorage.getItem('lifeos_hf_token');
        if (!hfToken) throw new Error('HuggingFace token not set.');

        // Using a fast, standard Sentence Transformers model
        const response = await fetch(
            "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2",
            {
                headers: { Authorization: `Bearer ${hfToken}`, "Content-Type": "application/json" },
                method: "POST",
                body: JSON.stringify({ inputs: text }),
            }
        );
        
        if (!response.ok) throw new Error('Failed to get embeddings from HuggingFace');
        const result = await response.json();
        
        // The API returns an array (if single string input) or array of arrays
        return Array.isArray(result[0]) ? result[0] : result;
    }

    // --- GOOGLE DRIVE AUTH ---
    function authGoogle(isAuto = false) {
        const clientId = localStorage.getItem('lifeos_google_client_id');
        if (!clientId) {
            if (!isAuto && window.App) window.App.showToast('Please set Google Client ID first.', 'error');
            return;
        }

        const client = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events',
            callback: (response) => {
                if (response.error !== undefined) {
                    if (isAuto) console.warn('Auto-auth failed:', response.error);
                    throw (response);
                }
                accessToken = response.access_token;
                
                // Remember that we connected successfully
                localStorage.setItem('lifeos_drive_auto_connect', 'true');

                if (!isAuto && window.App) window.App.showToast('Connected to Google Drive!', 'success');
                else if (isAuto && window.App) window.App.showToast('Auto-connected to Drive', 'success');
                
                // Show sync and restore buttons
                const btnSync = document.getElementById('btn-sync-drive');
                if (btnSync) btnSync.style.display = 'block';
                const btnRestore = document.getElementById('btn-restore-drive');
                if (btnRestore) btnRestore.style.display = 'block';
                const btnAuth = document.getElementById('btn-auth-drive');
                if (btnAuth) btnAuth.textContent = 'Drive Connected ✅';

                ensureDriveFolder().then(() => loadVectorsFromDrive());
            },
            error_callback: (err) => {
                if (isAuto) console.warn('Auto-auth error. Popup blocked?', err);
            }
        });

        // Trigger the auth
        if (isAuto) {
            client.requestAccessToken({ prompt: '' });
        } else {
            client.requestAccessToken();
        }
    }

    async function gFetch(path, options = {}) {
        if (!accessToken) throw new Error('Not authenticated');
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${accessToken}`
        };
        const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, options);
        if (!res.ok) throw new Error(`Drive API error: ${res.statusText}`);
        return res;
    }

    // Find or create 'LifeOS_Data' folder
    async function ensureDriveFolder() {
        const query = encodeURIComponent(`name='LifeOS_Data' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
        let res = await gFetch(`/files?q=${query}&fields=files(id,name)`);
        let data = await res.json();

        if (data.files && data.files.length > 0) {
            driveFolderId = data.files[0].id;
        } else {
            const meta = {
                name: 'LifeOS_Data',
                mimeType: 'application/vnd.google-apps.folder'
            };
            res = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(meta)
            });
            data = await res.json();
            driveFolderId = data.id;
        }
    }

    // Find file in folder by name
    async function findFileInDrive(filename) {
        if (!driveFolderId) return null;
        const query = encodeURIComponent(`name='${filename}' and '${driveFolderId}' in parents and trashed=false`);
        const res = await gFetch(`/files?q=${query}&fields=files(id)`);
        const data = await res.json();
        return (data.files && data.files.length > 0) ? data.files[0].id : null;
    }

    async function loadVectorsFromDrive() {
        try {
            const fileId = await findFileInDrive('vectors.json');
            if (fileId) {
                const res = await gFetch(`/files/${fileId}?alt=media`);
                vectors = await res.json();
                console.log(`Loaded ${vectors.length} vectors from Drive.`);
            }
        } catch (e) {
            console.error('Failed to load vectors', e);
        }
    }

    async function saveVectorsToDrive() {
        if (!driveFolderId) return;
        const filename = 'vectors.json';
        const fileId = await findFileInDrive(filename);
        const fileContent = JSON.stringify(vectors);

        const metadata = { name: filename, parents: [driveFolderId], mimeType: 'application/json' };
        
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([fileContent], { type: 'application/json' }));

        const url = fileId ? 
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart` : 
            `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

        await fetch(url, {
            method: fileId ? 'PATCH' : 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: form
        });
    }

    async function syncToDrive(silent = false) {
        if (!accessToken || !driveFolderId) {
            if (!silent && window.App) window.App.showToast('Please connect to Drive first', 'error');
            return;
        }
        try {
            // Backup ALL lifeos_ keys
            const backup = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('lifeos_')) {
                    backup[key] = localStorage.getItem(key);
                }
            }

            const filename = 'lifeos_backup.json';
            const fileId = await findFileInDrive(filename);
            const metadata = { name: filename, parents: [driveFolderId], mimeType: 'application/json' };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([JSON.stringify(backup)], { type: 'application/json' }));

            const url = fileId ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart` : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
            
            await fetch(url, {
                method: fileId ? 'PATCH' : 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: form
            });

            if (!silent && window.App) window.App.showToast('All LifeOS data securely synced to Drive!', 'success');
        } catch(e) {
            console.error(e);
            if (!silent && window.App) window.App.showToast('Failed to sync', 'error');
        }
    }

    async function restoreFromDrive() {
        if (!accessToken || !driveFolderId) {
            window.App.showToast('Please connect to Drive first', 'error');
            return;
        }
        if (!confirm("This will overwrite your current local data with the Drive backup. Proceed?")) return;
        
        try {
            const fileId = await findFileInDrive('lifeos_backup.json');
            if (!fileId) {
                window.App.showToast('No backup found in Drive.', 'error');
                return;
            }
            
            const res = await gFetch(`/files/${fileId}?alt=media`);
            const backup = await res.json();
            
            for (const key in backup) {
                if (key.startsWith('lifeos_')) {
                    localStorage.setItem(key, backup[key]);
                }
            }
            
            window.App.showToast('Data restored! Reloading app...', 'success');
            setTimeout(() => window.location.reload(), 1500);
        } catch(e) {
            console.error(e);
            window.App.showToast('Failed to restore data', 'error');
        }
    }

    // --- RAG INGESTION ---
    async function ingestText(filename, textContent) {
        if (!accessToken) {
            window.App.showToast('Please connect to Drive first', 'error');
            return;
        }
        
        // Extremely simple chunking: split by paragraphs
        const chunks = textContent.split(/\n\s*\n/).map(c => c.trim()).filter(c => c.length > 40);
        
        window.App.showToast(`Embedding ${chunks.length} chunks...`, 'info');

        let added = 0;
        for (const chunk of chunks) {
            try {
                const emb = await getEmbedding(chunk);
                vectors.push({
                    source: filename,
                    text: chunk,
                    embedding: emb
                });
                added++;
            } catch (e) {
                console.error("Embedding error on chunk", chunk, e);
            }
        }

        await saveVectorsToDrive();
        window.App.showToast(`Added ${added} chunks to Drive Vector DB!`, 'success');
    }

    // A mock UI flow to pick a file (in a real app you'd use Google Picker API)
    // For simplicity, we just ask the user for a Drive File ID or use a direct query
    async function pickAndIngestDriveFile() {
        if (!accessToken) {
            window.App.showToast('Please connect to Drive first in Settings', 'error');
            return;
        }

        const fileId = prompt("Enter the Google Drive File ID you want to ingest (must be .txt, .md, or Google Doc):");
        if (!fileId) return;

        try {
            window.App.showToast('Downloading file...', 'info');
            // First get metadata to see mimeType
            const metaRes = await gFetch(`/files/${fileId}?fields=name,mimeType`);
            const meta = await metaRes.json();
            
            let text = '';
            if (meta.mimeType === 'application/vnd.google-apps.document') {
                // Export Google Doc to text
                const expRes = await gFetch(`/files/${fileId}/export?mimeType=text/plain`);
                text = await expRes.text();
            } else if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
                // Export Sheet to CSV
                const expRes = await gFetch(`/files/${fileId}/export?mimeType=text/csv`);
                text = await expRes.text();
            } else {
                // Try direct download for txt/md
                const dlRes = await gFetch(`/files/${fileId}?alt=media`);
                text = await dlRes.text();
            }

            if(text) {
                await ingestText(meta.name, text);
            }
        } catch (e) {
            console.error(e);
            window.App.showToast('Failed to read file from Drive', 'error');
        }
    }

    // --- RAG SEARCH ---
    async function search(queryText, topK = 3) {
        if (vectors.length === 0) return [];
        
        try {
            const queryEmb = await getEmbedding(queryText);
            
            // Score all vectors
            const scored = vectors.map(v => ({
                text: v.text,
                source: v.source,
                score: cosineSimilarity(queryEmb, v.embedding)
            }));

            // Sort descending
            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, topK);
        } catch (e) {
            console.error("Vector search error", e);
            return [];
        }
    }

    window.RAGModule = { 
        init, 
        authGoogle, 
        syncToDrive, 
        restoreFromDrive,
        pickAndIngestDriveFile,
        search,
        getAccessToken: () => accessToken,
        get isReady() { return accessToken !== null; },
        get hasVectors() { return vectors.length > 0; }
    };

})();

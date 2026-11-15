import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence, collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy, deleteDoc, getDocs, limit, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import Fuse from "https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.esm.js";
import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.esm.js";
const firebaseConfig = {
    apiKey: "AIzaSyBrcWWcFJiiGDNwmtHfC06on07yjV01Xvo",
    authDomain: "cifraceros.firebaseapp.com",
    projectId: "cifraceros",
    storageBucket: "cifraceros.firebasestorage.app",
    messagingSenderId: "64746643957",
    appId: "1:64746643957:web:fff80c22e795e1410180bc"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
try {
    enableIndexedDbPersistence(db).catch(err => console.warn("Offline cache error:", err));
} catch (e) {}
const auth = getAuth(app);

let songsData = [];
let songsDataCifras = [];
let songsDataLetras = [];
let isCifrasLoaded = false;
let isLetrasLoaded = false;
let unsubCifras = null;
let unsubLetras = null;

let localPlaylists = new Set();
window.appMode = null;
window.letrasRole = null;
let unsubChat = null;
let unsubLetrasSync = null;
let pendingSyncSongId = null;
let selectedPlaylistFilter = 'all';
let isAdmin = false;
let editingSongId = null;
let currentFontSize = 1.15;
let isScrolling = false;
let scrollSpeed = 0.5;
let scrollInterval = null;
let scrollPos = 0;
let isInitialLoad = true;
let isDataLoaded = false;
let currentActiveSongId = null;
let lastSyncToastTime = 0;
let lastKnownSongsCount = 0;

const fuseOptions = {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.4, 
    keys: [
        { name: 'title', weight: 0.6 },
        { name: 'lyrics', weight: 0.4 } 
    ]
};

onAuthStateChanged(auth, (user) => {
    isAdmin = !!user;
    updateAdminUI();
    filterAndRender();
});

function updateAdminUI() {
    const statusIndicator = document.getElementById('admin-status-indicator');
    const logoutBtn = document.getElementById('btn-logout-inside');
    const loginSection = document.getElementById('login-section');
    const uploadSection = document.getElementById('upload-section');
    const playlistZone = document.getElementById('playlist-creation-zone');
    const btnAdminGate = document.getElementById('btn-admin-gate');

    if (isAdmin) {
        if (statusIndicator) statusIndicator.textContent = "Status: Administrador";
        if (logoutBtn) logoutBtn.style.display = 'block';
        if (loginSection) loginSection.style.display = 'none';
        if (uploadSection) uploadSection.style.display = 'block';
        if (playlistZone) playlistZone.style.display = 'flex';
        if (btnAdminGate) {
            btnAdminGate.style.display = 'block';
            btnAdminGate.textContent = "Painel Admin";
            btnAdminGate.style.backgroundColor = "var(--primary-color)";
            btnAdminGate.style.color = "white";
        }
    } else {
        if (statusIndicator) statusIndicator.textContent = "Status: Leitura";
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (loginSection) loginSection.style.display = 'block';
        if (uploadSection) uploadSection.style.display = 'none';
        if (playlistZone) playlistZone.style.display = 'none';
        if (btnAdminGate) {
            btnAdminGate.style.display = 'block';
            btnAdminGate.textContent = "logar para editar";
            btnAdminGate.style.backgroundColor = "";
            btnAdminGate.style.color = "";
        }
    }
}

window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('mobile-overlay').classList.toggle('open');
};

window.closeSidebar = function() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('mobile-overlay').classList.remove('open');
    const dockBtnSongs = document.getElementById('dock-btn-songs');
    if (dockBtnSongs) dockBtnSongs.classList.remove('active');
};

/* Modo Foco / Palco: Tela cheia para a cifra/letra no tablet */
window.toggleFocusMode = function(forceState) {
    const isFocus = typeof forceState === 'boolean' 
        ? forceState 
        : !document.body.classList.contains('focus-mode');

    document.body.classList.toggle('focus-mode', isFocus);
    document.getElementById('main-app-container')?.classList.toggle('focus-mode', isFocus);

    const btn = document.getElementById('btn-toggle-focus');
    if (btn) {
        btn.innerHTML = isFocus ? '🗗 Painéis' : '⛶ Expandir';
        btn.classList.toggle('active', isFocus);
        btn.title = isFocus ? 'Restaurar painéis laterais' : 'Expandir cifra na tela inteira (Modo Palco)';
    }

    setTimeout(() => {
        if (typeof window.triggerResponsiveAutoFit === 'function') {
            window.triggerResponsiveAutoFit();
        }
    }, 150);
};

/* Recolhimento individual da barra de repertório */
window.toggleLeftSidebar = function(forceOpen) {
    const container = document.getElementById('main-app-container');
    if (!container) return;

    if (window.innerWidth <= 960) {
        window.toggleSidebar();
        return;
    }

    if (container.classList.contains('focus-mode')) {
        window.toggleFocusMode(false);
        return;
    }

    const isCollapsed = container.classList.contains('sidebar-left-collapsed');
    const shouldCollapse = typeof forceOpen === 'boolean' ? !forceOpen : !isCollapsed;

    container.classList.toggle('sidebar-left-collapsed', shouldCollapse);

    setTimeout(() => {
        if (typeof window.triggerResponsiveAutoFit === 'function') {
            window.triggerResponsiveAutoFit();
        }
    }, 150);
};

/* Recolhimento individual da barra de setlist */
window.toggleRightSidebar = function(forceOpen) {
    const container = document.getElementById('main-app-container');
    if (!container) return;

    if (window.innerWidth <= 960) {
        if (typeof window.toggleMobileSetlist === 'function') {
            window.toggleMobileSetlist();
        }
        return;
    }

    if (container.classList.contains('focus-mode')) {
        window.toggleFocusMode(false);
        return;
    }

    const isCollapsed = container.classList.contains('sidebar-right-collapsed');
    const shouldCollapse = typeof forceOpen === 'boolean' ? !forceOpen : !isCollapsed;

    container.classList.toggle('sidebar-right-collapsed', shouldCollapse);

    setTimeout(() => {
        if (typeof window.triggerResponsiveAutoFit === 'function') {
            window.triggerResponsiveAutoFit();
        }
    }, 150);
};

window.openAdminPanelDirectly = function() {
    hideAll();
    closeSidebar();
    document.body.classList.add('admin-active');
    document.getElementById('main-app-container')?.classList.add('admin-active');
    document.getElementById('admin-panel').style.display = 'block';
    if (typeof window.pushNavigationState === 'function') window.pushNavigationState('admin');
};

window.openAdminForCreation = function() {
    editingSongId = null;
    hideAll();
    closeSidebar();
    document.body.classList.add('admin-active');
    document.getElementById('main-app-container')?.classList.add('admin-active');
    document.getElementById('admin-panel').style.display = 'block';
    if (typeof window.pushNavigationState === 'function') window.pushNavigationState('admin');
    document.getElementById('upload-form').reset();
    document.getElementById('form-title').textContent = "Adicionar Nova Música";
    document.getElementById('btn-submit-song').textContent = "Salvar Música";
    document.getElementById('upload-msg').style.display = 'none';
};

window.triggerLogout = async function() {
    if (confirm("Deseja encerrar a sessão?")) {
        try {
            await signOut(auth);
            closeAdmin();
        } catch (err) {
            console.error(err);
        }
    }
};

function renderSkeletons() {
    const container = document.getElementById('results-container');
    if (!container) return;
    let skeletonsHtml = '';
    for(let i=0; i<8; i++) {
        skeletonsHtml += `
            <div class="skeleton-item">
                <div class="skeleton-bar title"></div>
                <div class="skeleton-bar tag" style="margin-left: auto;"></div>
            </div>
        `;
    }
    container.innerHTML = skeletonsHtml;
}

function startListeningToSongs(mode) {
    if (!mode) return;

    const resultsContainer = document.getElementById('results-container');

    if (mode === 'cifras' && unsubCifras) {
        if (isCifrasLoaded) {
            songsData = songsDataCifras;
            updateDataAndRender();
        } else {
            renderSkeletons();
        }
        return;
    }

    if (mode === 'letras' && unsubLetras) {
        if (isLetrasLoaded) {
            songsData = songsDataLetras;
            updateDataAndRender();
        } else {
            renderSkeletons();
        }
        return;
    }

    renderSkeletons();
    const collectionName = mode === 'letras' ? "repertorio_letras" : "repertorio";

    const listener = onSnapshot(collection(db, collectionName), (querySnapshot) => {
        const fromCache = querySnapshot.metadata.fromCache;
        const newData = querySnapshot.docs.map(d => {
            const data = d.data();
            let pList = [];
            if (data.playlists) {
                pList = Array.isArray(data.playlists) ? data.playlists : [data.playlists];
            }
            return { id: d.id, ...data, playlists: pList };
        });
        
        newData.sort((a, b) => a.title.localeCompare(b.title));

        const now = new Date();
        const formattedDate = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const formattedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const hasPendingWrites = querySnapshot.metadata.hasPendingWrites;
        if (!fromCache && !hasPendingWrites) {
            // Atualização recebida fresca da nuvem em tempo real
            const syncInfo = {
                timestamp: now.getTime(),
                dateStr: `${formattedDate} às ${formattedTime}`,
                count: newData.length
            };
            localStorage.setItem(`cifraceros_last_sync_${mode}`, JSON.stringify(syncInfo));
            
            const nowTime = now.getTime();
            const countChanged = lastKnownSongsCount !== 0 && lastKnownSongsCount !== newData.length;
            const timePassed = (nowTime - lastSyncToastTime) > 30000;
            
            if (!isInitialLoad && isDataLoaded && (countChanged || timePassed)) {
                lastSyncToastTime = nowTime;
                lastKnownSongsCount = newData.length;
                window.showToast('✨ Repertório Atualizado', `${newData.length} músicas sincronizadas em tempo real.`);
            } else if (lastKnownSongsCount === 0) {
                lastKnownSongsCount = newData.length;
            }
        } else if (fromCache) {
            // Carregado da memória offline (IndexedDB local)
            window.notifyOfflineState(mode, newData.length);
        }
        
        if (mode === 'cifras') {
            songsDataCifras = newData;
            isCifrasLoaded = true;
            if (window.appMode === 'cifras') {
                songsData = songsDataCifras;
                updateDataAndRender();
            }
        } else {
            songsDataLetras = newData;
            isLetrasLoaded = true;
            if (window.appMode === 'letras') {
                songsData = songsDataLetras;
                updateDataAndRender();
            }
        }
    }, (error) => {
        console.error("Erro ao escutar mudanças: ", error);
        if (window.appMode === mode) {
            resultsContainer.innerHTML = '<p style="text-align:center; color:var(--error-color);">Erro ao carregar dados. Verifique sua conexão.</p>';
        }
    });

    if (mode === 'cifras') unsubCifras = listener;
    else unsubLetras = listener;
}

function updateDataAndRender() {
    localPlaylists.clear();
    songsData.forEach(s => s.playlists.forEach(p => localPlaylists.add(p)));
    
    if (isInitialLoad) {
        isInitialLoad = false;
        document.getElementById('admin-status-indicator').textContent = isAdmin ? "Status: Administrador" : "Status: Leitura";
    }
    
    isDataLoaded = true;

    renderPlaylistChips();
    filterAndRender();
    renderSetlist();
    renderSongViewPlaylists();
    if (typeof window.renderMobilePlaylists === 'function') window.renderMobilePlaylists();
    
    if (pendingSyncSongId) {
        const song = songsData.find(s => s.id === pendingSyncSongId);
        if (song && song.id !== currentActiveSongId) {
            window.showToast('📡 Sincronização', 'Música ativada pelo sistema!');
            window.openSong(song);
        }
        pendingSyncSongId = null;
    }
}

window.selectAppMode = function(mode) {
    if (mode === 'letras') {
        document.getElementById('main-mode-box').style.display = 'none';
        document.getElementById('role-selection-box').style.display = 'block';
        return;
    }
    
    finalizeAppModeSelection(mode);
};

window.cancelRoleSelection = function() {
    document.getElementById('role-selection-box').style.display = 'none';
    document.getElementById('main-mode-box').style.display = 'block';
};

window.confirmLetrasRole = function(role) {
    window.letrasRole = role;
    finalizeAppModeSelection('letras');
};

function finalizeAppModeSelection(mode) {
    window.appMode = mode;
    try {
        localStorage.setItem('cifraceros_saved_app_mode', mode);
        if (mode === 'letras' && window.letrasRole) {
            localStorage.setItem('cifraceros_saved_letras_role', window.letrasRole);
        }
    } catch (e) {}

    document.getElementById('mode-selection-overlay').style.display = 'none';
    document.getElementById('main-app-container').style.display = 'flex';
    
    // No celular ou tablet portrait sem música aberta, abrir o repertório para evitar tela preta inicial
    if (window.innerWidth <= 960 && !currentActiveSongId) {
        document.getElementById('sidebar')?.classList.add('open');
        document.getElementById('mobile-overlay')?.classList.add('open');
        const dockBtnSongs = document.getElementById('dock-btn-songs');
        if (dockBtnSongs) dockBtnSongs.classList.add('active');
    }
    
    // Toggle UI elements specific to Letras mode
    const transposeGroup = document.querySelector('input#m-transpose')?.closest('.form-group');
    const chatPopup = document.getElementById('letras-chat-popup');
    const btnFloatingChat = document.getElementById('btn-floating-chat');
    const svChatContainer = document.getElementById('sv-chat-btn-container');
    const chatRoleIndicator = document.getElementById('chat-role-indicator');
    const btnDisparoMobile = document.getElementById('btn-mobile-disparo');
    const btnSetlistMobile = document.getElementById('btn-mobile-setlist');
    
    if (mode === 'letras') {
        document.body.classList.add('letras-mode');
        if (transposeGroup) transposeGroup.style.display = 'none';
        
        const notesContainer = document.getElementById('sv-notes-container');
        if (notesContainer) notesContainer.style.display = 'none';
        const cultoWidget = document.getElementById('culto-notes-widget');
        if (cultoWidget) cultoWidget.style.display = 'none';
        const welcomeNotes = document.querySelector('.welcome-notes-box');
        if (welcomeNotes) welcomeNotes.style.display = 'none';
        
        if (btnFloatingChat) btnFloatingChat.style.display = 'flex';
        if (svChatContainer) svChatContainer.style.display = 'flex';
        if (chatRoleIndicator) {
            chatRoleIndicator.textContent = window.letrasRole === 'teclado' ? '🎹 Teclado' : '🗣️ Bolha';
        }
        if (chatPopup) chatPopup.style.display = 'none'; // Inicia discreto/fechado
        
        window.applyLyricsColumnsState();
        
        if (window.letrasRole === 'bolha') {
            if (btnDisparoMobile) {
                btnDisparoMobile.style.display = 'inline-block';
                if (btnSetlistMobile) btnSetlistMobile.style.marginLeft = '10px';
            }
        } else {
            if (btnDisparoMobile) {
                btnDisparoMobile.style.display = 'none';
                if (btnSetlistMobile) btnSetlistMobile.style.marginLeft = 'auto';
            }
        }
        
        startListeningToChat();
        
        const syncContainer = document.getElementById('teclado-sync-toggle-container');
        const btnSyncMobile = document.getElementById('btn-mobile-sync-toggle');
        const btnSyncDesktop = document.getElementById('btn-desktop-sync-toggle');
        if (window.letrasRole === 'teclado') {
            if (syncContainer) syncContainer.style.display = 'block';
            if (btnSyncMobile) btnSyncMobile.style.display = 'inline-block';
            if (btnSyncDesktop) btnSyncDesktop.style.display = 'inline-block';
            window.updateSyncButtonsUI(false);
            startListeningToLetrasSync();
        } else {
            if (syncContainer) syncContainer.style.display = 'none';
            if (btnSyncMobile) btnSyncMobile.style.display = 'none';
            if (btnSyncDesktop) btnSyncDesktop.style.display = 'none';
        }
    } else {
        document.body.classList.remove('letras-mode');
        if (transposeGroup) transposeGroup.style.display = 'block';
        if (chatPopup) chatPopup.style.display = 'none';
        if (btnFloatingChat) btnFloatingChat.style.display = 'none';
        if (svChatContainer) svChatContainer.style.display = 'none';
        
        const notesContainer = document.getElementById('sv-notes-container');
        if (notesContainer) notesContainer.style.display = 'flex';
        const welcomeNotes = document.querySelector('.welcome-notes-box');
        if (welcomeNotes) welcomeNotes.style.display = 'flex';
        
        window.applyLyricsColumnsState();
        if (unsubChat) {
            unsubChat();
            unsubChat = null;
        }
        if (typeof unsubLetrasSync === 'function') {
            unsubLetrasSync();
            unsubLetrasSync = null;
        }
    }
    startListeningToSetlist(mode);
    startListeningToSongs(mode);
}

window.openModeSelectionModal = function() {
    document.getElementById('role-selection-box').style.display = 'none';
    document.getElementById('main-mode-box').style.display = 'block';
    document.getElementById('mode-selection-overlay').style.display = 'flex';
};

// Auto-restauração silenciosa do último modo utilizado pelo músico (elimina popup repetitivo a cada abertura)
try {
    const savedAppMode = localStorage.getItem('cifraceros_saved_app_mode');
    if (savedAppMode === 'cifras' || savedAppMode === 'letras') {
        if (savedAppMode === 'letras') {
            window.letrasRole = localStorage.getItem('cifraceros_saved_letras_role') || 'bolha';
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => finalizeAppModeSelection(savedAppMode));
        } else {
            finalizeAppModeSelection(savedAppMode);
        }
    }
} catch (e) {}

function renderPlaylistChips() {
    const container = document.getElementById('playlist-chips-container');
    container.innerHTML = '';
    
    const btnTodas = document.createElement('button');
    btnTodas.className = `chip ${selectedPlaylistFilter === 'all' ? 'active' : ''}`;
    btnTodas.textContent = 'Todas';
    btnTodas.onclick = () => {
        selectedPlaylistFilter = 'all';
        renderPlaylistChips();
        filterAndRender();
    };
    container.appendChild(btnTodas);
    
    Array.from(localPlaylists).sort().forEach(p => {
        const btn = document.createElement('button');
        btn.className = `chip ${selectedPlaylistFilter === p ? 'active' : ''}`;
        btn.textContent = p;
        btn.onclick = () => {
            selectedPlaylistFilter = p;
            renderPlaylistChips();
            filterAndRender();
        };
        container.appendChild(btn);
    });
}

window.createNewPlaylistGroup = function() {
    const input = document.getElementById('new-playlist-name');
    const name = input.value.trim();
    if(name === '') return;
    
    localPlaylists.add(name);
    renderPlaylistChips();
    filterAndRender(); 
    input.value = '';
};

// Search Debouncing
let searchTimeout = null;
const searchInput = document.getElementById('search-input');
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        filterAndRender();
        const sidebarContent = document.querySelector('.sidebar-content');
        if (sidebarContent) sidebarContent.scrollTop = 0;
    }, 300);
});

function removeAccents(str) {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function extractLyricsSnippet(lyrics, query) {
    if (!lyrics || !query) return null;
    
    const normQuery = removeAccents(query.trim());
    if (!normQuery) return null;

    const lines = lyrics.split('\n');
    let matchedLine = null;

    for (let line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const normLine = removeAccents(trimmed);
        if (normLine.includes(normQuery)) {
            matchedLine = trimmed;
            break;
        }
    }

    if (!matchedLine) {
        const normLyrics = removeAccents(lyrics);
        const idx = normLyrics.indexOf(normQuery);
        if (idx !== -1) {
            const start = Math.max(0, idx - 20);
            const end = Math.min(lyrics.length, idx + normQuery.length + 30);
            matchedLine = lyrics.substring(start, end).replace(/\s+/g, ' ').trim();
        }
    }

    if (!matchedLine) return null;

    const normMatchedLine = removeAccents(matchedLine);
    const pos = normMatchedLine.indexOf(normQuery);
    if (pos !== -1) {
        const originalMatch = matchedLine.substring(pos, pos + normQuery.length);
        const before = escapeHTML(matchedLine.substring(0, pos));
        const matchStr = escapeHTML(originalMatch);
        const after = escapeHTML(matchedLine.substring(pos + normQuery.length));
        return `${before}<mark class="search-snippet-match">${matchStr}</mark>${after}`;
    }

    return escapeHTML(matchedLine);
}

function filterAndRender() {
    if (!isDataLoaded) return;
    
    let currentList = songsData;

    if (selectedPlaylistFilter !== 'all') {
        currentList = currentList.filter(s => s.playlists.includes(selectedPlaylistFilter));
    }

    const query = searchInput.value.trim();
    if (query) {
        const normQuery = removeAccents(query);
        const titleMatches = [];
        const lyricsDirectMatches = [];
        const remaining = [];
        const seenIds = new Set();

        currentList.forEach(song => {
            const normTitle = removeAccents(song.title);
            const normLyrics = removeAccents(song.lyrics);
            
            const isTitleMatch = normTitle.includes(normQuery);
            const isLyricsMatch = normLyrics.includes(normQuery);

            let snippet = null;
            if (isLyricsMatch) {
                snippet = extractLyricsSnippet(song.lyrics, query);
            }

            const songObj = { ...song, snippet };

            if (isTitleMatch) {
                titleMatches.push(songObj);
                seenIds.add(song.id);
            } else if (isLyricsMatch) {
                lyricsDirectMatches.push(songObj);
                seenIds.add(song.id);
            } else {
                remaining.push(song);
            }
        });

        let fuzzyMatches = [];
        if (remaining.length > 0) {
            const localFuse = new Fuse(remaining, fuseOptions);
            const fuseResults = localFuse.search(query);
            fuseResults.forEach(r => {
                const song = r.item;
                if (!seenIds.has(song.id)) {
                    const snippet = extractLyricsSnippet(song.lyrics, query);
                    fuzzyMatches.push({ ...song, snippet });
                    seenIds.add(song.id);
                }
            });
        }

        currentList = [...titleMatches, ...lyricsDirectMatches, ...fuzzyMatches];
    } else {
        currentList = currentList.map(s => ({ ...s, snippet: null }));
    }

    renderResults(currentList);
}

function renderResults(songs) {
    const container = document.getElementById('results-container');
    container.innerHTML = '';
    
    if(songs.length === 0 && !isInitialLoad) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    <line x1="11" y1="8" x2="11" y2="14"></line>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
                <p>Nenhuma música encontrada.</p>
                <span style="font-size:0.85rem;">Tente buscar por outro título ou trecho da letra.</span>
            </div>
        `;
        return;
    }

    songs.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = 'song-item song-item-animated';
        item.style.animationDelay = `${index * 0.03}s`;
        item.dataset.id = song.id;
        
        const clickableArea = document.createElement('div');
        clickableArea.className = 'song-clickable';
        
        const safeTitle = escapeHTML(song.title);
        const safeTranspose = escapeHTML(song.transpose || 'Orig');
        const transposeHtml = window.appMode === 'letras' ? '' : `<span class="song-transpose-tag">Tom: ${safeTranspose}</span>`;

        if (song.snippet) {
            clickableArea.innerHTML = `
                <div class="song-info-wrapper">
                    <div class="song-main-line">
                        <span class="song-title-text">${safeTitle}</span>
                        ${transposeHtml}
                    </div>
                    <div class="song-snippet-preview">...${song.snippet}...</div>
                </div>
            `;
        } else {
            clickableArea.innerHTML = `
                <span class="song-title-text">${safeTitle}</span>
                ${transposeHtml}
            `;
        }

        clickableArea.onclick = () => openSong(song);
        
        item.appendChild(clickableArea);

        if (isAdmin) {
            const dotsBtn = document.createElement('button');
            dotsBtn.className = 'three-dots-btn';
            dotsBtn.innerHTML = '⋮';
            dotsBtn.onclick = (e) => {
                e.stopPropagation();
                toggleDropdownMenu(song.id, dropdown);
            };
            
            const dropdown = document.createElement('div');
            dropdown.className = 'dropdown-menu';
            dropdown.id = `dropdown-${song.id}`;
            
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Editar Música';
            editBtn.onclick = () => triggerEditMode(song);
            dropdown.appendChild(editBtn);
            
            if(localPlaylists.size > 0) {
                dropdown.appendChild(document.createElement('div')).className = 'dropdown-divider';
                
                localPlaylists.forEach(p => {
                    const hasPlaylist = song.playlists.includes(p);
                    const pBtn = document.createElement('button');
                    pBtn.textContent = hasPlaylist ? `✓ Remover de: ${p}` : `+ Adicionar a: ${p}`;
                    pBtn.style.color = hasPlaylist ? 'var(--chord-color)' : 'var(--text-color)';
                    pBtn.onclick = () => window.toggleSongPlaylistAssignment(song.id, p);
                    dropdown.appendChild(pBtn);
                });
            }

            item.appendChild(dotsBtn);
            item.appendChild(dropdown);
        }

        container.appendChild(item);
    });

    if (Sortable) {
        if (window.resultsSortable) {
            window.resultsSortable.destroy();
            window.resultsSortable = null;
        }
        // Desativa drag no repertório em telas touch (evita prender a rolagem vertical de toque)
        const isTouchDevice = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (!isTouchDevice) {
            window.resultsSortable = new Sortable(container, {
                group: {
                    name: 'shared',
                    pull: 'clone',
                    put: false
                },
                sort: false,
                animation: 250,
                filter: '.three-dots-btn, .dropdown-menu',
                preventOnFilter: false
            });
        }
    }
}

window.toggleDropdownMenu = function(songId, targetElement = null) {
    const menus = document.querySelectorAll('.dropdown-menu');
    const targetId = `dropdown-${songId}`;
    menus.forEach(m => {
        if(m.id !== targetId) {
            m.style.display = 'none';
            if (m.closest('.song-item')) m.closest('.song-item').classList.remove('dropdown-open');
        }
    });
    const target = targetElement || document.getElementById(targetId);
    if (target) {
        if (target.style.display === 'block') {
            target.style.display = 'none';
            if (target.closest('.song-item')) target.closest('.song-item').classList.remove('dropdown-open');
        } else {
            target.style.display = 'block';
            if (target.closest('.song-item')) target.closest('.song-item').classList.add('dropdown-open');
        }
    }
};

document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(m => {
        m.style.display = 'none';
        if (m.closest('.song-item')) m.closest('.song-item').classList.remove('dropdown-open');
    });
});

// Efeito Antigravity Background Blob
const blob = document.getElementById('blob');
document.body.onpointermove = event => { 
    if(blob) {
        const { clientX, clientY } = event;
        blob.animate({
            left: `${clientX}px`,
            top: `${clientY}px`
        }, { duration: 3000, fill: "forwards" });
    }
};

window.toggleSongPlaylistAssignment = async function(songId, playlistName) {
    if (!isAdmin) {
        window.showToast('🔒 Permissão', 'Apenas Administradores podem alterar músicas em playlists.');
        if (confirm('A alteração de playlists exige login de Administrador.\n\nDeseja abrir o Login agora?')) {
            window.toggleMobilePlaylists(false);
            window.openAdminPanelDirectly();
        }
        return;
    }

    const song = songsData.find(s => s.id === songId);
    if (!song) return;

    let updatedPlaylists = [...song.playlists];
    if (updatedPlaylists.includes(playlistName)) {
        updatedPlaylists = updatedPlaylists.filter(p => p !== playlistName);
    } else {
        updatedPlaylists.push(playlistName);
    }

    try {
        const collectionName = window.appMode === 'letras' ? "repertorio_letras" : "repertorio";
        await updateDoc(doc(db, collectionName, song.id), { playlists: updatedPlaylists });
    } catch (err) {
        console.error("Erro ao atualizar playlists da música:", err);
        window.showToast('Erro', 'Não foi possível salvar alteração no banco.');
    }
}

window.renderSongViewPlaylists = function() {
    const bar = document.getElementById('sv-playlists-bar');
    const container = document.getElementById('sv-playlists-container');
    
    if (!bar || !container) return;

    if (!isAdmin || !currentActiveSongId) {
        bar.style.display = 'none';
        return;
    }

    const song = songsData.find(s => s.id === currentActiveSongId);
    if (!song) {
        bar.style.display = 'none';
        return;
    }

    if (localPlaylists.size === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    container.innerHTML = '';

    Array.from(localPlaylists).sort().forEach(p => {
        const btn = document.createElement('button');
        const hasPlaylist = song.playlists.includes(p);
        
        btn.className = `chip ${hasPlaylist ? 'active' : ''}`;
        btn.style.padding = '4px 10px';
        btn.style.fontSize = '0.8rem';
        
        btn.textContent = hasPlaylist ? `✓ ${p}` : `+ ${p}`;
        btn.onclick = () => window.toggleSongPlaylistAssignment(song.id, p);
        
        container.appendChild(btn);
    });
}

function isChordLine(line) {
    if (line.trim() === '') return false;
    const tokens = line.trim().split(/\s+/);
    const chordTokenRegex = /^[A-G][m#bM\d\/\(\)\+\-º°]*(dim|aug|sus)?[\d\(\)\+\-º°]*(\/[A-G][#b]?)?$/;
    return tokens.every(token => chordTokenRegex.test(token));
}

function formatCifraText(text) {
    if (!text) return '';

    const lines = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .split('\n');

    let html = '';
    let currentBlock = [];

    function flushBlock() {
        if (currentBlock.length > 0) {
            const blockText = currentBlock.join('\n');
            if (blockText.trim() !== '') {
                html += `<div class="cifra-block">${blockText}</div>`;
            }
            currentBlock = [];
        }
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmed = line.trim();

        if (/^(\-{3,}|\={3,}|\[coluna\]|\[col\]|\[quebra\]|\[quebra-coluna\])$/i.test(trimmed)) {
            flushBlock();
            html += '<div class="column-break"></div>';
        } else if (trimmed === '') {
            flushBlock();
        } else {
            if (window.appMode !== 'letras') {
                // Section tags formatting: [Intro], [Verso 1], [Refrão], [Intro] A D Bm E
                const sectionMatch = line.match(/^(\s*)(\[[^\]]+\])(\s*)$/);
                const sectionWithChordsMatch = line.match(/^(\s*)(\[[^\]]+\])(\s+)(.*)$/);

                if (sectionMatch) {
                    line = `${sectionMatch[1]}<span class="cifra-section-tag">${sectionMatch[2]}</span>${sectionMatch[3]}`;
                } else if (sectionWithChordsMatch && isChordLine(sectionWithChordsMatch[4])) {
                    const tagPart = `<span class="cifra-section-tag">${sectionWithChordsMatch[2]}</span>`;
                    const chordsPart = sectionWithChordsMatch[4].replace(/(\S+)/g, '<span class="chord">$1</span>');
                    line = `${sectionWithChordsMatch[1]}${tagPart}${sectionWithChordsMatch[3]}${chordsPart}`;
                } else if (isChordLine(line)) {
                    line = line.replace(/(\S+)/g, '<span class="chord">$1</span>');
                }
            }
            currentBlock.push(line);
        }
    }
    flushBlock();
    return html || text;
}

// Columns Management (Cifras & Letras)
window.toggleColumns = function() {
    const svContent = document.getElementById('sv-content');
    const isCurrently2Col = svContent ? svContent.classList.contains('two-columns') : false;
    const isNarrowPortrait = window.innerWidth < 680 && window.innerHeight > window.innerWidth;

    // Se o usuário estiver no celular na vertical (em pé), orientar que 2 colunas é ideal para tablet ou celular deitado
    if (!isCurrently2Col && isNarrowPortrait && window.appMode !== 'letras') {
        if (typeof window.showToast === 'function') {
            window.showToast('📖 Modo 2 Colunas', 'Ideal para Tablet ou celular deitado (horizontal). Vire a tela na horizontal para aproveitar!');
        }
        return;
    }

    const newCols = isCurrently2Col ? '1' : '2';
    const modeKey = window.appMode || 'cifras';
    localStorage.setItem(`cifraceros_columns_${modeKey}`, newCols);
    window.applyColumnsState();

    setTimeout(() => {
        if (newCols === '2') {
            window.autoFitTwoColumns();
        } else {
            window.autoFitCifra();
        }
    }, 50);
};

window.toggleLyricsColumns = window.toggleColumns; // Alias for compatibility

window.applyColumnsState = function() {
    const svContent = document.getElementById('sv-content');
    const btnToggle = document.getElementById('btn-toggle-columns');
    const colsContainer = document.getElementById('sv-columns-container');
    
    if (colsContainer) colsContainer.style.display = 'flex';
    
    const modeKey = window.appMode || 'cifras';
    const savedCols = localStorage.getItem(`cifraceros_columns_${modeKey}`) || (modeKey === 'letras' ? localStorage.getItem('cifraceros_letras_columns') : '1') || '1';
    const isNarrowPortrait = window.innerWidth < 680 && window.innerHeight > window.innerWidth;
    
    // No celular em pé estreito (<680px), forçar 1 coluna em cifras para evitar sobreposição de texto
    const is2Col = savedCols === '2' && (!isNarrowPortrait || window.appMode === 'letras');
    
    if (svContent) {
        svContent.classList.toggle('two-columns', is2Col);
    }
    
    if (btnToggle) {
        btnToggle.classList.toggle('active', is2Col);
        btnToggle.innerHTML = is2Col ? '📖 2 Colunas' : '📄 1 Coluna';
        btnToggle.title = is2Col ? 'Alternar para 1 coluna' : (isNarrowPortrait ? 'Modo 2 colunas recomendado com o celular deitado' : 'Dividir em 2 colunas');
    }
};

window.applyLyricsColumnsState = window.applyColumnsState; // Alias for compatibility

// Song Notes Management
let notesSaveTimeout = null;

window.saveSongNote = function() {
    if (!currentActiveSongId) return;
    const textarea = document.getElementById('song-notes-textarea');
    const status = document.getElementById('notes-status');
    if (!textarea || !status) return;

    const text = textarea.value;
    localStorage.setItem(`cifraceros_note_${currentActiveSongId}`, text);

    status.textContent = "Salvando...";
    clearTimeout(notesSaveTimeout);
    notesSaveTimeout = setTimeout(() => {
        status.textContent = "Salvo automaticamente";
    }, 400);
};

window.loadSongNote = function(songId) {
    const textarea = document.getElementById('song-notes-textarea');
    const status = document.getElementById('notes-status');
    if (!textarea) return;

    const saved = localStorage.getItem(`cifraceros_note_${songId}`) || '';
    textarea.value = saved;
    if (status) status.textContent = "Salvo automaticamente";
};

window.clearSongNote = function() {
    if (!currentActiveSongId) return;
    const textarea = document.getElementById('song-notes-textarea');
    if (textarea) {
        textarea.value = '';
        window.saveSongNote();
    }
};

window.autoFitCifra = function() {
    if (window.appMode === 'letras') {
        const isTablet = window.innerWidth >= 768;
        const pre = document.getElementById('sv-content');
        if (pre) pre.style.fontSize = isTablet ? '1.35rem' : '1.15rem';
        return;
    }
    const pre = document.getElementById('sv-content');
    if (!pre || pre.classList.contains('two-columns')) return;

    const isLandscape = window.innerWidth > window.innerHeight;
    const isTabletOrDesktop = window.innerWidth >= 768;

    // Responsive initial font size based on device orientation
    let size = (isTabletOrDesktop && isLandscape) ? 1.38 : (isTabletOrDesktop ? 1.28 : 1.18);
    pre.style.fontSize = `${size}rem`;

    // Decrease font size smoothly until it fits cleanly without horizontal scrollbar
    while (pre.scrollWidth > pre.clientWidth + 2 && size > 0.65) {
        size -= 0.02;
        pre.style.fontSize = `${size.toFixed(2)}rem`;
    }

    currentFontSize = parseFloat(size.toFixed(2));
};

window.autoFitTwoColumns = function() {
    const pre = document.getElementById('sv-content');
    if (!pre || !pre.classList.contains('two-columns')) return;

    if (window.appMode === 'letras') {
        const isTablet = window.innerWidth >= 768;
        pre.style.fontSize = isTablet ? '1.25rem' : '1.05rem';
        return;
    }

    // Dynamic column gap based on tablet/mobile viewport width
    const isTablet = window.innerWidth >= 768 && window.innerWidth <= 1280;
    const gap = isTablet ? 24 : (window.innerWidth <= 768 ? 20 : 36);
    const colWidth = (pre.clientWidth - gap) / 2;
    if (colWidth <= 80) return;

    const lines = pre.innerText.split('\n');
    let maxLen = 0;
    for (let l of lines) {
        const trimmed = l.trimEnd();
        // Ignore empty lines, pure section tags, or long separator lines
        if (!trimmed || /^[-=_~*#]{6,}$/.test(trimmed)) continue;
        if (trimmed.length > maxLen) {
            maxLen = trimmed.length;
        }
    }

    if (maxLen === 0) return;

    // JetBrains Mono monospace character width ≈ fontSizeInRem * 9.6px
    // 5% safe margin to prevent any line breaks
    const safeColWidth = colWidth * 0.95;
    const targetSize = safeColWidth / (maxLen * 9.6);

    const isLandscape = window.innerWidth > window.innerHeight;
    const isTabletOrDesktop = window.innerWidth >= 768;

    const minFont = 0.60;
    const maxFont = (isTabletOrDesktop && isLandscape) ? 1.32 : (isTabletOrDesktop ? 1.10 : 0.90);

    let optimal = Math.max(minFont, Math.min(maxFont, Math.round(targetSize * 100) / 100));

    // No tablet ou desktop, tenta ajustar a altura para a música caber inteira em 1 tela sem precisar rolar
    if (isTabletOrDesktop && lines.length > 0) {
        const availHeight = window.innerHeight - (isLandscape ? 120 : 180);
        const linesPerCol = Math.ceil(lines.length / 2);
        const heightBasedRem = availHeight / (linesPerCol * 23);
        if (heightBasedRem >= 0.70 && heightBasedRem < optimal) {
            optimal = Math.round(heightBasedRem * 100) / 100;
        }
    }

    pre.style.fontSize = `${optimal}rem`;

    // Loop de salvaguarda: se qualquer linha ainda ultrapassar a coluna, diminui gradualmente
    let testSize = optimal;
    while (pre.scrollWidth > pre.clientWidth + 2 && testSize > 0.55) {
        testSize -= 0.02;
        pre.style.fontSize = `${testSize.toFixed(2)}rem`;
    }

    currentFontSize = parseFloat(pre.style.fontSize) || optimal;
};

// Responsive Rotation & Resize Engine with settlement debouncing
let resizeFitTimer = null;
window.triggerResponsiveAutoFit = function() {
    clearTimeout(resizeFitTimer);
    resizeFitTimer = setTimeout(() => {
        const songView = document.getElementById('song-view');
        if (songView && songView.style.display !== 'none') {
            window.applyColumnsState();
            const pre = document.getElementById('sv-content');
            if (pre) {
                if (pre.classList.contains('two-columns')) {
                    window.autoFitTwoColumns();
                } else {
                    window.autoFitCifra();
                }
            }
        }
    }, 120);
};

window.addEventListener('resize', window.triggerResponsiveAutoFit);
window.addEventListener('orientationchange', () => {
    setTimeout(window.triggerResponsiveAutoFit, 100);
    setTimeout(window.triggerResponsiveAutoFit, 300);
});
if (window.screen && window.screen.orientation) {
    try {
        window.screen.orientation.addEventListener('change', () => {
            setTimeout(window.triggerResponsiveAutoFit, 100);
            setTimeout(window.triggerResponsiveAutoFit, 300);
        });
    } catch (e) {}
}

window.openSong = function(song) {
    hideAll();
    stopAutoScroll();
    scrollPos = 0;
    closeSidebar();
    currentActiveSongId = song.id;
    if (typeof window.requestScreenWakeLock === 'function') window.requestScreenWakeLock();
    if (typeof window.pushNavigationState === 'function') window.pushNavigationState('song');

    document.getElementById('song-view').style.display = 'block';
    document.getElementById('sv-title').textContent = song.title;
    
    const transposeContainer = document.getElementById('sv-transpose-container');
    const transposeBadge = document.getElementById('sv-transpose');
    if (window.appMode === 'letras') {
        if (transposeContainer) transposeContainer.style.display = 'none';
    } else {
        if (transposeContainer) transposeContainer.style.display = 'flex';
        if (transposeBadge) transposeBadge.textContent = song.transpose ? song.transpose : 'Original';
    }
    
    const syncBtnContainer = document.getElementById('sync-btn-container');
    if (window.appMode === 'letras' && window.letrasRole === 'bolha') {
        if (syncBtnContainer) syncBtnContainer.style.display = 'flex';
    } else {
        if (syncBtnContainer) syncBtnContainer.style.display = 'none';
    }

    const contentArea = document.getElementById('sv-content');
    contentArea.innerHTML = formatCifraText(song.lyrics);
    contentArea.style.fontSize = `${currentFontSize}rem`;

    if (window.appMode === 'letras') {
        contentArea.style.whiteSpace = 'pre-wrap';
        contentArea.style.wordWrap = 'break-word';
    } else {
        contentArea.style.whiteSpace = 'pre';
        contentArea.style.wordWrap = 'normal';
    }

    window.applyColumnsState();

    const notesGroup = document.getElementById('sv-notes-container') || document.getElementById('btn-toggle-notes')?.closest('.tool-group');
    const widget = document.getElementById('culto-notes-widget');
    const btn = document.getElementById('btn-toggle-notes');

    if (window.appMode === 'letras') {
        if (notesGroup) notesGroup.style.display = 'none';
        if (widget) {
            widget.style.display = 'none';
            widget.classList.add('hidden');
        }
    } else {
        if (notesGroup) notesGroup.style.display = 'flex';
        // Load notes & manage notes widget display
        window.loadCultoNotes();

        let savedNotesVisible = localStorage.getItem('cifraceros_notes_visible');
        let isNotesVisible = true;
        if (savedNotesVisible !== null) {
            isNotesVisible = savedNotesVisible === 'true';
        } else if (window.innerWidth <= 1280 || (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches)) {
            isNotesVisible = false; // Oculto por padrão no mobile e tablet
        }
        if (widget) {
            widget.style.display = isNotesVisible ? 'flex' : 'none';
            widget.classList.toggle('hidden', !isNotesVisible);
        }
        if (btn) btn.classList.toggle('active', isNotesVisible);
    }

    document.querySelector('.main-content').scrollTop = 0;

    // Small delay to ensure layout is computed before autofitting
    setTimeout(() => {
        const pre = document.getElementById('sv-content');
        if (pre && pre.classList.contains('two-columns')) {
            window.autoFitTwoColumns();
        } else {
            window.autoFitCifra();
        }
    }, 50);
    setTimeout(window.triggerResponsiveAutoFit, 180);

    window.renderSongViewPlaylists();
    const setlistBtn = document.getElementById('btn-toggle-setlist-item');
    if (setlistBtn) {
        const inSetlist = setlistIds.includes(song.id);
        setlistBtn.textContent = inSetlist ? '⚡ No Acesso Rápido' : '⚡ + Acesso Rápido';
        setlistBtn.classList.toggle('active', inSetlist);
    }
};

window.adjustFontSize = function(delta) {
    currentFontSize = Math.max(0.5, Math.min(3, currentFontSize + delta));
    document.getElementById('sv-content').style.fontSize = `${currentFontSize}rem`;
};

window.toggleAutoScroll = function() {
    isScrolling = !isScrolling;
    const btn = document.getElementById('btn-scroll-play');
    const dockPlay = document.getElementById('btn-dock-scroll-play');
    const dockScrollBtn = document.getElementById('dock-btn-scroll');

    if (isScrolling) {
        if (btn) {
            btn.textContent = '⏸';
            btn.classList.add('active');
        }
        if (dockPlay) {
            dockPlay.textContent = '⏸';
            dockPlay.classList.add('active');
        }
        if (dockScrollBtn) {
            dockScrollBtn.classList.add('is-scrolling');
        }
        const mainContent = document.querySelector('.main-content');
        if (mainContent) scrollPos = mainContent.scrollTop;
        startAutoScroll();
    } else {
        stopAutoScroll();
    }
};

window.setScrollSpeedFromRange = function(val) {
    scrollSpeed = parseFloat(val);
    const speedFormatted = scrollSpeed.toFixed(1) + 'x';
    const mobDisplay = document.getElementById('mobile-scroll-speed-val');
    if (mobDisplay) mobDisplay.textContent = speedFormatted;

    const desktopDisplay = document.getElementById('scroll-speed-display');
    if (desktopDisplay) desktopDisplay.textContent = Math.round(scrollSpeed * 100) + '%';
};

window.toggleMobileScrollControl = function(forceState) {
    const bar = document.getElementById('mobile-scroll-control-bar');
    if (!bar) return;
    const isShowing = bar.style.display !== 'none';
    const nextState = forceState !== undefined ? forceState : !isShowing;

    if (nextState) {
        if (typeof window.pushNavigationState === 'function') window.pushNavigationState('scroll');
        bar.style.display = 'flex';
        const range = document.getElementById('mobile-scroll-range');
        if (range) range.value = scrollSpeed;
        const valDisp = document.getElementById('mobile-scroll-speed-val');
        if (valDisp) valDisp.textContent = scrollSpeed.toFixed(1) + 'x';
        
        const dockScrollBtn = document.getElementById('dock-btn-scroll');
        if (dockScrollBtn) dockScrollBtn.classList.add('active');
    } else {
        bar.style.display = 'none';
        const dockScrollBtn = document.getElementById('dock-btn-scroll');
        if (dockScrollBtn && !isScrolling) dockScrollBtn.classList.remove('active');
    }
};

// Sincroniza scrollPos com rolagem manual suave
document.querySelector('.main-content').addEventListener('scroll', (e) => {
    if (isScrolling) {
        const currentTop = e.target.scrollTop;
        if (Math.abs(currentTop - scrollPos) > 15) {
            scrollPos = currentTop;
        }
    }
}, { passive: true });

function startAutoScroll() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;
    
    let lastTime = performance.now();
    scrollPos = mainContent.scrollTop;

    function scrollStep(currentTime) {
        if (!isScrolling) return;

        // Limita deltaTime para no máximo 40ms para evitar saltos bruscos
        const deltaTime = Math.min(currentTime - lastTime, 40);
        lastTime = currentTime;

        // Base calibrada: ~45 pixels por segundo em 1.0x
        const pixelsPerMs = (scrollSpeed * 45) / 1000;
        scrollPos += pixelsPerMs * deltaTime;

        // Subpixel render suave sem truncamento com Math.floor
        mainContent.scrollTop = scrollPos;

        if (mainContent.scrollTop + mainContent.clientHeight >= mainContent.scrollHeight - 2) {
            stopAutoScroll();
            return;
        }

        scrollInterval = requestAnimationFrame(scrollStep);
    }
    scrollInterval = requestAnimationFrame(scrollStep);
}

function stopAutoScroll() {
    isScrolling = false;
    if (scrollInterval) {
        cancelAnimationFrame(scrollInterval);
        scrollInterval = null;
    }
    const btn = document.getElementById('btn-scroll-play');
    if (btn) {
        btn.textContent = '▶';
        btn.classList.remove('active');
    }
    const dockPlay = document.getElementById('btn-dock-scroll-play');
    if (dockPlay) {
        dockPlay.textContent = '▶';
        dockPlay.classList.remove('active');
    }
    const dockScrollBtn = document.getElementById('dock-btn-scroll');
    if (dockScrollBtn) {
        dockScrollBtn.classList.remove('is-scrolling');
        const bar = document.getElementById('mobile-scroll-control-bar');
        if (!bar || bar.style.display === 'none') {
            dockScrollBtn.classList.remove('active');
        }
    }
}

window.adjustScrollSpeed = function(delta) {
    scrollSpeed = Math.max(0.1, Math.min(5.0, parseFloat((scrollSpeed + delta * 0.2).toFixed(1))));
    const speedPercent = Math.round(scrollSpeed * 100) + '%';
    const desktopDisplay = document.getElementById('scroll-speed-display');
    if (desktopDisplay) desktopDisplay.textContent = speedPercent;
    
    const range = document.getElementById('mobile-scroll-range');
    if (range) range.value = scrollSpeed;
    const mobDisplay = document.getElementById('mobile-scroll-speed-val');
    if (mobDisplay) mobDisplay.textContent = scrollSpeed.toFixed(1) + 'x';
};

function triggerEditMode(song) {
    openAdminPanelDirectly();
    stopAutoScroll();
    editingSongId = song.id;
    document.getElementById('form-title').textContent = "Editar Música";
    document.getElementById('btn-submit-song').textContent = "Atualizar Música";
    document.getElementById('m-title').value = song.title;
    document.getElementById('m-transpose').value = song.transpose || '';
    document.getElementById('m-lyrics').value = song.lyrics;
    document.getElementById('upload-msg').style.display = 'none';
}

window.closeSong = function() {
    hideAll();
    stopAutoScroll();
    if (typeof window.releaseScreenWakeLock === 'function') window.releaseScreenWakeLock();
    if (typeof window.toggleMobileScrollControl === 'function') window.toggleMobileScrollControl(false);
    currentActiveSongId = null;
    document.getElementById('welcome-view').style.display = 'flex';
    if (window.innerWidth <= 960) {
        document.getElementById('sidebar')?.classList.add('open');
        document.getElementById('mobile-overlay')?.classList.add('open');
        const dockBtn = document.getElementById('dock-btn-songs');
        if (dockBtn) dockBtn.classList.add('active');
    }
};

window.closeAdmin = function() {
    editingSongId = null;
    document.body.classList.remove('admin-active');
    hideAll();
    stopAutoScroll();
    document.getElementById('welcome-view').style.display = 'flex';
    if (window.innerWidth <= 960) {
        document.getElementById('sidebar')?.classList.add('open');
        document.getElementById('mobile-overlay')?.classList.add('open');
        const dockBtn = document.getElementById('dock-btn-songs');
        if (dockBtn) dockBtn.classList.add('active');
    }
};

function hideAll() {
    document.getElementById('welcome-view').style.display = 'none';
    document.getElementById('song-view').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'none';
    document.body.classList.remove('admin-active');
    document.getElementById('main-app-container')?.classList.remove('admin-active');
    const widget = document.getElementById('culto-notes-widget');
    if (widget) widget.style.display = 'none';
}

window.performMagicFetch = async function() {
    const urlInput = document.getElementById('magic-url').value.trim();
    const msgDiv = document.getElementById('magic-msg');
    const btn = document.getElementById('btn-magic-fetch');
    
    if (!urlInput || !urlInput.includes('cifraclub.com.br')) {
        msgDiv.textContent = 'Por favor, insira um link válido do Cifra Club.';
        msgDiv.className = 'msg msg-error';
        msgDiv.style.display = 'block';
        setTimeout(() => msgDiv.style.display = 'none', 3000);
        return;
    }

    btn.textContent = 'Puxando...';
    btn.disabled = true;
    msgDiv.style.display = 'none';

    try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(urlInput)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`Erro no servidor proxy (${response.status})`);
        }
        
        const htmlText = await response.text();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        
        // Extração
        const titleEl = doc.querySelector('h1.t1');
        const artistEl = doc.querySelector('a.t3');
        const tomEl = doc.querySelector('#cifra_tom a');
        const preEl = doc.querySelector('pre');
        
        if (!preEl || !titleEl) {
            throw new Error('Não foi possível encontrar a cifra na página.');
        }

        const songTitle = titleEl.textContent.trim() + (artistEl ? ` - ${artistEl.textContent.trim()}` : '');
        const songTom = tomEl ? tomEl.textContent.trim() : '';
        const songLyrics = preEl.textContent.trim();

        // Preenchimento
        document.getElementById('m-title').value = songTitle;
        document.getElementById('m-transpose').value = songTom;
        document.getElementById('m-lyrics').value = songLyrics;

        msgDiv.textContent = 'Cifra importada com sucesso! Revise e clique em "Salvar Música".';
        msgDiv.className = 'msg msg-success';
        msgDiv.style.display = 'block';
        document.getElementById('magic-url').value = '';
    } catch (error) {
        msgDiv.textContent = 'Erro ao puxar: ' + error.message;
        msgDiv.className = 'msg msg-error';
        msgDiv.style.display = 'block';
    } finally {
        btn.textContent = 'Puxar Cifra';
        btn.disabled = false;
        setTimeout(() => msgDiv.style.display = 'none', 5000);
    }
};

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    const errDiv = document.getElementById('login-error');
    errDiv.style.display = 'none';

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        hideAll();
        document.getElementById('main-app-container')?.classList.add('admin-active');
        document.getElementById('admin-panel').style.display = 'block';
    } catch (error) {
        errDiv.textContent = "Falha na autenticação.";
        errDiv.style.display = 'block';
        setTimeout(() => errDiv.style.display = 'none', 4000);
    }
});

document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgDiv = document.getElementById('upload-msg');
    const submitBtn = document.getElementById('btn-submit-song');
    msgDiv.style.display = 'none';
    
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Salvando...";

    const payload = {
        title: document.getElementById('m-title').value,
        transpose: document.getElementById('m-transpose').value,
        lyrics: document.getElementById('m-lyrics').value
    };

    try {
        const collectionName = window.appMode === 'letras' ? "repertorio_letras" : "repertorio";
        
        if (editingSongId) {
            await updateDoc(doc(db, collectionName, editingSongId), payload);
            msgDiv.textContent = "Música atualizada!";
        } else {
            await addDoc(collection(db, collectionName), { ...payload, playlists: [] });
            msgDiv.textContent = "Música cadastrada com sucesso!";
            document.getElementById('upload-form').reset();
        }
        msgDiv.className = "msg msg-success";
        msgDiv.style.display = 'block';
        setTimeout(() => msgDiv.style.display = 'none', 4000);
    } catch (error) {
        msgDiv.textContent = "Erro ao salvar.";
        msgDiv.className = "msg msg-error";
        msgDiv.style.display = 'block';
        setTimeout(() => msgDiv.style.display = 'none', 4000);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    }
});

startListeningToSongs();

// --- Setlist Logic (Refactored for Cloud Sync) ---
let setlistIds = [];
let unsubSetlist = null;
let isUpdatingSetlistLocally = false;

function startListeningToSetlist(mode) {
    if (unsubSetlist) {
        unsubSetlist();
        unsubSetlist = null;
    }
    
    if (!mode) return;

    unsubSetlist = onSnapshot(doc(db, "app_state", `setlist_${mode}`), (docSnap) => {
        if (isUpdatingSetlistLocally) return;
        
        if (docSnap.exists()) {
            setlistIds = docSnap.data().ids || [];
        } else {
            setlistIds = [];
        }
        renderSetlist();
    });
}

async function saveSetlist() {
    if (!window.appMode) return;
    
    isUpdatingSetlistLocally = true;
    try {
        await setDoc(doc(db, "app_state", `setlist_${window.appMode}`), {
            ids: setlistIds
        });
    } catch (err) {
        console.error("Erro ao salvar Setlist na nuvem: ", err);
    } finally {
        setTimeout(() => { isUpdatingSetlistLocally = false; }, 500); 
    }
}

window.toggleMobileSongs = function() {
    window.toggleMobilePlaylists(false);
    const setlistOverlay = document.getElementById('mobile-setlist-overlay');
    if (setlistOverlay) setlistOverlay.classList.remove('open');
    const disparoOverlay = document.getElementById('mobile-disparo-overlay');
    if (disparoOverlay) disparoOverlay.classList.remove('open');
    
    window.toggleSidebar();
    const isSidebarOpen = document.getElementById('sidebar').classList.contains('open');
    const dockBtnSongs = document.getElementById('dock-btn-songs');
    if (dockBtnSongs) dockBtnSongs.classList.toggle('active', isSidebarOpen);
    
    const searchInput = document.getElementById('search-input');
    if (searchInput && isSidebarOpen) {
        setTimeout(() => searchInput.focus(), 250);
    }
};

window.toggleMobileSetlist = function() {
    window.toggleMobilePlaylists(false);
    window.closeSidebar();
    const disparoOverlay = document.getElementById('mobile-disparo-overlay');
    if (disparoOverlay) disparoOverlay.classList.remove('open');
    
    const overlay = document.getElementById('mobile-setlist-overlay');
    if (overlay) {
        overlay.classList.toggle('open');
        const isOpen = overlay.classList.contains('open');
        if (isOpen) {
            renderSetlist();
            if (typeof window.pushNavigationState === 'function') window.pushNavigationState('setlist');
        }
        const dockBtnSetlist = document.getElementById('dock-btn-setlist');
        if (dockBtnSetlist) dockBtnSetlist.classList.toggle('active', isOpen);
    }
};

window.addCurrentSongToSetlist = function() {
    if (!currentActiveSongId) {
        window.showToast('⚡ Acesso Rápido', 'Abra uma música primeiro para adicioná-la.');
        return;
    }
    if (setlistIds.includes(currentActiveSongId)) {
        window.showToast('⚡ Acesso Rápido', 'Esta música já está no Acesso Rápido.');
        return;
    }
    setlistIds.push(currentActiveSongId);
    saveSetlist();
    renderSetlist();
    window.showToast('⚡ Acesso Rápido', 'Música adicionada ao Acesso Rápido!');
};

window.toggleCurrentSongInSetlist = function() {
    if (!currentActiveSongId) return;
    const index = setlistIds.indexOf(currentActiveSongId);
    if (index !== -1) {
        setlistIds.splice(index, 1);
        saveSetlist();
        renderSetlist();
        window.showToast('⚡ Acesso Rápido', 'Removida do Acesso Rápido.');
    } else {
        setlistIds.push(currentActiveSongId);
        saveSetlist();
        renderSetlist();
        window.showToast('⚡ Acesso Rápido', 'Adicionada ao Acesso Rápido!');
    }
};

// ==========================================
// GAVETA DE LISTAS / PLAYLISTS MOBILE
// ==========================================
let expandedPlaylist = null;

window.toggleMobilePlaylists = function(forceState) {
    const overlay = document.getElementById('mobile-playlists-overlay');
    if (!overlay) return;
    
    const isCurrentlyOpen = overlay.classList.contains('open');
    const nextState = forceState !== undefined ? forceState : !isCurrentlyOpen;
    
    if (nextState) {
        window.closeSidebar();
        const setlistOverlay = document.getElementById('mobile-setlist-overlay');
        if (setlistOverlay) setlistOverlay.classList.remove('open');
        const dockBtnSetlist = document.getElementById('dock-btn-setlist');
        if (dockBtnSetlist) dockBtnSetlist.classList.remove('active');
        const disparoOverlay = document.getElementById('mobile-disparo-overlay');
        if (disparoOverlay) disparoOverlay.classList.remove('open');
        
        window.renderMobilePlaylists();
        overlay.classList.add('open');
        if (typeof window.pushNavigationState === 'function') window.pushNavigationState('playlists');
    } else {
        overlay.classList.remove('open');
    }

    const dockBtnPlaylists = document.getElementById('dock-btn-playlists');
    if (dockBtnPlaylists) dockBtnPlaylists.classList.toggle('active', nextState);
};

window.renderMobilePlaylists = function() {
    const container = document.getElementById('mobile-playlists-content');
    if (!container) return;
    container.innerHTML = '';

    // Card fixo para "Todas as Músicas"
    const allCard = document.createElement('div');
    allCard.className = 'playlist-card';
    allCard.innerHTML = `
        <div class="playlist-card-header" onclick="window.selectPlaylistFilterFromMobile('all')">
            <div class="playlist-title-group">
                <span style="font-size: 1.3rem;">🎵</span>
                <div>
                    <strong>Todas as Músicas</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Ver todo o repertório</div>
                </div>
            </div>
            <span class="playlist-badge-count">${songsData.length}</span>
        </div>
    `;
    container.appendChild(allCard);

    if (localPlaylists.size === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.9rem;';
        empty.innerHTML = `
            <p>Nenhuma lista personalizada criada ainda.</p>
            <button class="btn btn-accent" style="margin-top: 10px; font-size: 0.85rem;" onclick="window.promptCreatePlaylistMobile()">+ Criar Primeira Lista</button>
        `;
        container.appendChild(empty);
        return;
    }

    const sortedPlaylists = Array.from(localPlaylists).sort();
    sortedPlaylists.forEach(playlistName => {
        const songsInList = songsData.filter(s => s.playlists && s.playlists.includes(playlistName));
        const isExpanded = expandedPlaylist === playlistName;
        
        const card = document.createElement('div');
        card.className = `playlist-card ${isExpanded ? 'is-expanded' : ''}`;

        const header = document.createElement('div');
        header.className = 'playlist-card-header';
        
        const safePName = escapeHTML(playlistName);
        
        header.innerHTML = `
            <div class="playlist-title-group" onclick="window.togglePlaylistExpansion('${safePName}')" style="cursor: pointer; flex-grow: 1;">
                <span style="font-size: 1.3rem;">${isExpanded ? '📂' : '📁'}</span>
                <div>
                    <strong>${safePName}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${songsInList.length} ${songsInList.length === 1 ? 'música' : 'músicas'}</div>
                </div>
            </div>
            <div class="playlist-actions-group">
                <span class="playlist-badge-count" style="margin-right: 4px;">${songsInList.length}</span>
                <button type="button" class="playlist-action-btn playlist-toggle-btn" onclick="window.togglePlaylistExpansion('${safePName}')" title="${isExpanded ? 'Recolher' : 'Ver músicas'}">
                    ${isExpanded ? '▲' : '▼'}
                </button>
                <button type="button" class="playlist-action-btn btn-delete" onclick="event.stopPropagation(); window.deletePlaylist('${safePName}')" title="Apagar esta lista">🗑️</button>
            </div>
        `;
        card.appendChild(header);

        if (isExpanded) {
            const songsContainer = document.createElement('div');
            songsContainer.className = 'playlist-songs-expanded';
            
            // Botão em destaque para abrir e filtrar o repertório completo por esta lista
            if (songsInList.length > 0) {
                const openRepBtn = document.createElement('button');
                openRepBtn.type = 'button';
                openRepBtn.className = 'btn-open-playlist-repertoire';
                openRepBtn.innerHTML = `🔍 Abrir <strong>"${safePName}"</strong> no Repertório (${songsInList.length})`;
                openRepBtn.onclick = () => window.selectPlaylistFilterFromMobile(playlistName);
                songsContainer.appendChild(openRepBtn);
            }

            if (songsInList.length === 0) {
                const emptySong = document.createElement('div');
                emptySong.style.cssText = 'padding: 14px; text-align: center; color: var(--text-muted); font-size: 0.85rem;';
                emptySong.textContent = 'Nenhuma música nesta lista ainda.';
                songsContainer.appendChild(emptySong);
            } else {
                songsInList.forEach((song, idx) => {
                    try {
                        const row = document.createElement('div');
                        row.className = 'playlist-song-row';
                        
                        const safeTitle = escapeHTML(song.title || 'Sem título');
                        const hasTranspose = song.transpose !== undefined && song.transpose !== null && String(song.transpose).trim() !== '';
                        const safeTrans = hasTranspose ? `<span class="song-transpose-tag" style="margin-left: 6px;">Tom: ${escapeHTML(song.transpose)}</span>` : '';
                        
                        row.innerHTML = `
                            <div class="playlist-song-clickable" style="display: flex; align-items: center; gap: 10px; flex-grow: 1; min-width: 0;">
                                <span class="playlist-song-num">${idx + 1}</span>
                                <span style="font-size: 0.9rem; color: var(--chord-color);">🎵</span>
                                <span class="song-name" style="font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${safeTitle}</span>
                                ${safeTrans}
                            </div>
                            <button type="button" class="playlist-song-remove" title="Remover desta lista">✕</button>
                        `;
                        
                        row.querySelector('.playlist-song-clickable').onclick = () => {
                            window.openSong(song);
                            window.toggleMobilePlaylists(false);
                        };
                        
                        row.querySelector('.playlist-song-remove').onclick = async (e) => {
                            e.stopPropagation();
                            await window.toggleSongPlaylistAssignment(song.id, playlistName);
                            window.renderMobilePlaylists();
                            window.renderSongViewPlaylists();
                        };
                        
                        songsContainer.appendChild(row);
                    } catch (errSong) {
                        console.warn('Erro ao renderizar item da lista:', errSong);
                    }
                });
            }

            // Botão sutil para adicionar a música atualmente aberta a esta lista (se houver)
            if (currentActiveSongId) {
                const currentSong = songsData.find(s => s.id === currentActiveSongId);
                if (currentSong && (!currentSong.playlists || !currentSong.playlists.includes(playlistName))) {
                    const addCurrentRow = document.createElement('button');
                    addCurrentRow.type = 'button';
                    addCurrentRow.className = 'btn-add-current-song';
                    addCurrentRow.style.marginTop = '6px';
                    addCurrentRow.innerHTML = `➕ Adicionar música atual: <strong>"${escapeHTML(currentSong.title)}"</strong>`;
                    addCurrentRow.onclick = async () => {
                        await window.toggleSongPlaylistAssignment(currentSong.id, playlistName);
                        window.renderMobilePlaylists();
                        window.renderSongViewPlaylists();
                    };
                    songsContainer.appendChild(addCurrentRow);
                }
            }

            card.appendChild(songsContainer);
        }

        container.appendChild(card);
    });
};

window.togglePlaylistExpansion = function(name) {
    expandedPlaylist = expandedPlaylist === name ? null : name;
    window.renderMobilePlaylists();
};

window.selectPlaylistFilterFromMobile = function(p) {
    selectedPlaylistFilter = p;
    renderPlaylistChips();
    filterAndRender();
    window.toggleMobilePlaylists(false);
    
    // Abrir o sidebar se estiver fechado
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('open')) {
        window.toggleSidebar();
    }
    
    const dockBtnSongs = document.getElementById('dock-btn-songs');
    if (dockBtnSongs) dockBtnSongs.classList.add('active');
    const dockBtnPlaylists = document.getElementById('dock-btn-playlists');
    if (dockBtnPlaylists) dockBtnPlaylists.classList.remove('active');
};

window.filterRepertoireByPlaylist = function(p) {
    selectedPlaylistFilter = p;
    renderPlaylistChips();
    filterAndRender();
    window.toggleMobilePlaylists(false);
    window.toggleSidebar();
};

window.promptCreatePlaylistMobile = async function() {
    if (!isAdmin) {
        window.showToast('🔒 Permissão Necessária', 'Faça login como Administrador para criar novas listas.');
        if (confirm(`A criação de listas no repertório exige acesso de Administrador.\n\nDeseja abrir o Login de Administrador agora?`)) {
            window.toggleMobilePlaylists(false);
            window.openAdminPanelDirectly();
        }
        return;
    }

    const name = prompt("Digite o nome da nova lista:");
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    localPlaylists.add(cleanName);
    renderPlaylistChips();
    renderMobilePlaylists();
    window.showToast('📁 Listas', `Lista "${cleanName}" criada! Adicione músicas a ela.`);
};

window.deletePlaylist = async function(playlistName) {
    if (!isAdmin) {
        window.showToast('🔒 Permissão Necessária', 'Faça login como Administrador para apagar playlists.');
        if (confirm(`A exclusão de listas do repertório exige acesso de Administrador.\n\nDeseja abrir a tela de Login agora?`)) {
            window.toggleMobilePlaylists(false);
            window.openAdminPanelDirectly();
        }
        return;
    }

    if (!confirm(`Tem certeza que deseja apagar a lista "${playlistName}"?\n\n(Fique tranquilo: as músicas continuarão salvas e intactas no repertório geral, apenas a pasta da lista será excluída).`)) return;

    try {
        const affectedSongs = songsData.filter(s => s.playlists && s.playlists.includes(playlistName));
        const collectionName = window.appMode === 'letras' ? "repertorio_letras" : "repertorio";
        
        if (affectedSongs.length > 0) {
            const batch = writeBatch(db);
            affectedSongs.forEach(s => {
                const newPlaylists = s.playlists.filter(p => p !== playlistName);
                batch.update(doc(db, collectionName, s.id), { playlists: newPlaylists });
            });
            await batch.commit();
        }

        localPlaylists.delete(playlistName);
        if (selectedPlaylistFilter === playlistName) selectedPlaylistFilter = 'all';
        if (expandedPlaylist === playlistName) expandedPlaylist = null;
        
        renderPlaylistChips();
        filterAndRender();
        renderMobilePlaylists();
        window.renderSongViewPlaylists();
        window.showToast('📁 Listas', `Lista "${playlistName}" apagada com sucesso!`);
    } catch (err) {
        console.error("Erro ao apagar lista: ", err);
        window.showToast('Erro', 'Não foi possível apagar a lista: ' + (err.message || 'Erro de banco'));
    }
};

function renderSetlist() {
    const desktopContainer = document.getElementById('setlist-container');
    const mobileContainer = document.getElementById('mobile-setlist-container');
    
    [desktopContainer, mobileContainer].forEach(container => {
        if (!container) return;
        container.innerHTML = '';
        
        if (setlistIds.length === 0) {
            container.innerHTML = '<p class="empty-setlist-msg">Arraste as músicas aqui para montar sua ordem.</p>';
        } else {
            setlistIds.forEach((id, index) => {
                const song = songsData.find(s => s.id === id);
                const item = document.createElement('div');
                item.className = 'setlist-item';
                item.dataset.id = id;
                
                const clickableArea = document.createElement('div');
                clickableArea.className = 'song-clickable';
                clickableArea.style.flexGrow = '1';
                clickableArea.innerHTML = `<span>${song ? song.title : 'Carregando...'}</span>`;
                
                if (song) {
                    clickableArea.onclick = () => {
                        openSong(song);
                        if (document.getElementById('mobile-setlist-overlay').classList.contains('open')) {
                            toggleMobileSetlist();
                        }
                    };
                }
                
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-setlist-btn';
                removeBtn.textContent = '✕';
                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    setlistIds.splice(index, 1);
                    saveSetlist();
                    renderSetlist();
                };

                item.appendChild(clickableArea);
                item.appendChild(removeBtn);
                container.appendChild(item);
            });
        }

        // Initialize Sortable for this specific container
        if (Sortable) {
            // Clean up old instances if they exist on this specific element
            if (container._sortable) container._sortable.destroy();
            
            container._sortable = new Sortable(container, {
                group: {
                    name: 'shared',
                    put: true
                },
                animation: 250,
                delay: 200,
                delayOnTouchOnly: true,
                touchStartThreshold: 10,
                onAdd: function (evt) {
                    const songId = evt.item.dataset.id;
                    if (evt.item.parentNode) evt.item.parentNode.removeChild(evt.item);
                    setlistIds.splice(evt.newIndex, 0, songId);
                    saveSetlist();
                    renderSetlist();
                },
                onUpdate: function (evt) {
                    const movedId = setlistIds.splice(evt.oldIndex, 1)[0];
                    setlistIds.splice(evt.newIndex, 0, movedId);
                    saveSetlist();
                    renderSetlist();
                }
            });
        }
    });

    const setlistBtn = document.getElementById('btn-toggle-setlist-item');
    if (setlistBtn && currentActiveSongId) {
        const inSetlist = setlistIds.includes(currentActiveSongId);
        setlistBtn.textContent = inSetlist ? '⚡ No Acesso Rápido' : '⚡ + Acesso Rápido';
        setlistBtn.classList.toggle('active', inSetlist);
    }
}

window.clearSetlist = function() {
    if (confirm("Deseja limpar toda a lista?")) {
        setlistIds = [];
        saveSetlist();
        renderSetlist();
    }
};

// Permanent Culto Notes Logic
let cultoNotesSaveTimeout = null;

window.saveCultoNotes = function() {
    const textarea = document.getElementById('culto-notes-textarea');
    const welcomeTextarea = document.getElementById('welcome-culto-notes-textarea');
    const status = document.getElementById('culto-notes-status');
    const welcomeStatus = document.getElementById('welcome-culto-notes-status');
    if (!textarea) return;

    const text = textarea.value;
    if (welcomeTextarea && welcomeTextarea.value !== text) {
        welcomeTextarea.value = text;
    }

    localStorage.setItem('cifraceros_culto_notes', text);

    if (status) status.textContent = "Salvando...";
    if (welcomeStatus) welcomeStatus.textContent = "Salvando...";

    clearTimeout(cultoNotesSaveTimeout);
    cultoNotesSaveTimeout = setTimeout(() => {
        if (status) status.textContent = "Salvo automaticamente";
        if (welcomeStatus) welcomeStatus.textContent = "Salvo automaticamente";
    }, 400);
};

window.saveCultoNotesFromWelcome = function() {
    const textarea = document.getElementById('culto-notes-textarea');
    const welcomeTextarea = document.getElementById('welcome-culto-notes-textarea');
    if (!welcomeTextarea) return;

    if (textarea) textarea.value = welcomeTextarea.value;
    window.saveCultoNotes();
};

let currentNotesFontSize = parseFloat(localStorage.getItem('cifraceros_notes_fontsize')) || 1.1;

window.adjustNotesFontSize = function(delta) {
    currentNotesFontSize = Math.max(0.7, Math.min(2.2, parseFloat((currentNotesFontSize + delta).toFixed(1))));
    localStorage.setItem('cifraceros_notes_fontsize', currentNotesFontSize);
    
    const t1 = document.getElementById('culto-notes-textarea');
    const t2 = document.getElementById('welcome-culto-notes-textarea');
    if (t1) t1.style.fontSize = `${currentNotesFontSize}rem`;
    if (t2) t2.style.fontSize = `${currentNotesFontSize}rem`;
};

window.loadCultoNotes = function() {
    const textarea = document.getElementById('culto-notes-textarea');
    const welcomeTextarea = document.getElementById('welcome-culto-notes-textarea');
    const status = document.getElementById('culto-notes-status');
    const welcomeStatus = document.getElementById('welcome-culto-notes-status');

    const saved = localStorage.getItem('cifraceros_culto_notes') || '';
    if (textarea) textarea.value = saved;
    if (welcomeTextarea) welcomeTextarea.value = saved;

    if (status) status.textContent = "Salvo automaticamente";
    if (welcomeStatus) welcomeStatus.textContent = "Salvo automaticamente";

    window.adjustNotesFontSize(0);

    const isNotesVisible = localStorage.getItem('cifraceros_notes_visible') !== 'false';
    const widget = document.getElementById('culto-notes-widget');
    const btn = document.getElementById('btn-toggle-notes');
    if (widget) widget.classList.toggle('hidden', !isNotesVisible);
    if (btn) btn.classList.toggle('active', isNotesVisible);
};

window.clearCultoNotes = function() {
    if (confirm("Deseja limpar as notas do culto?")) {
        const textarea = document.getElementById('culto-notes-textarea');
        const welcomeTextarea = document.getElementById('welcome-culto-notes-textarea');
        if (textarea) textarea.value = '';
        if (welcomeTextarea) welcomeTextarea.value = '';
        window.saveCultoNotes();
    }
};

window.toggleNotesWidget = function() {
    const widget = document.getElementById('culto-notes-widget');
    const btn = document.getElementById('btn-toggle-notes');
    if (!widget) return;

    const isCurrentlyHidden = widget.style.display === 'none' || widget.classList.contains('hidden');
    const makeVisible = isCurrentlyHidden;

    widget.style.display = makeVisible ? 'flex' : 'none';
    widget.classList.toggle('hidden', !makeVisible);
    
    if (btn) {
        btn.classList.toggle('active', makeVisible);
    }
    
    localStorage.setItem('cifraceros_notes_visible', makeVisible ? 'true' : 'false');
    
    setTimeout(() => {
        const pre = document.getElementById('sv-content');
        if (pre && pre.classList.contains('two-columns')) {
            window.autoFitTwoColumns();
        } else {
            window.autoFitCifra();
        }
    }, 50);
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(renderSetlist, 500);
    window.loadCultoNotes();
});

// Chat Letras Logic (Popup Discreto)
let isInitialChatLoad = true;

window.toggleLetrasChatPopup = function(forceState) {
    const popup = document.getElementById('letras-chat-popup');
    const btnFloating = document.getElementById('btn-floating-chat');
    const btnToolbar = document.getElementById('btn-toolbar-chat');
    const unreadBadge = document.getElementById('chat-unread-badge');
    const input = document.getElementById('chat-message-input');
    const container = document.getElementById('chat-messages-container');

    if (!popup) return;

    const isCurrentlyOpen = popup.style.display === 'flex';
    const shouldOpen = forceState !== undefined ? forceState : !isCurrentlyOpen;

    popup.style.display = shouldOpen ? 'flex' : 'none';

    if (btnFloating) btnFloating.classList.toggle('active', shouldOpen);
    if (btnToolbar) btnToolbar.classList.toggle('active', shouldOpen);

    if (shouldOpen) {
        if (typeof window.pushNavigationState === 'function') window.pushNavigationState('chat');
        if (unreadBadge) unreadBadge.style.display = 'none';
        if (container) container.scrollTop = container.scrollHeight;
        if (input) setTimeout(() => input.focus(), 150);
    }
};

function startListeningToChat() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    isInitialChatLoad = true;
    const q = query(collection(db, "letras_chat"), orderBy("timestamp", "desc"), limit(50));
    
    unsubChat = onSnapshot(q, (snapshot) => {
        const docs = [];
        snapshot.forEach((docSnap) => docs.push(docSnap.data()));
        docs.reverse(); // Coloca em ordem cronológica para exibição

        container.innerHTML = '';
        docs.forEach((data) => {
            const msgDiv = document.createElement('div');
            msgDiv.className = `chat-message msg-${data.role}`;
            
            const senderName = data.role === 'teclado' ? '🎹 Teclado' : '🗣️ Bolha';
            const safeText = escapeHTML(data.text);
            
            msgDiv.innerHTML = `
                <div class="chat-message-sender">${senderName}</div>
                <div class="chat-message-text">${safeText}</div>
            `;
            container.appendChild(msgDiv);
        });
        
        // Auto-scroll to bottom
        container.scrollTop = container.scrollHeight;
        
        // Verifica mensagens novas para mostrar Pop-up / Toast
        if (!isInitialChatLoad) {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (data.role && data.role !== window.letrasRole) {
                        const senderName = data.role === 'teclado' ? '🎹 Teclado' : '🗣️ Bolha';
                        window.showToast(senderName, data.text);

                        const popup = document.getElementById('letras-chat-popup');
                        const isPopupOpen = popup && popup.style.display === 'flex';
                        if (!isPopupOpen) {
                            const badge = document.getElementById('chat-unread-badge');
                            if (badge) badge.style.display = 'block';
                            const btnToolbar = document.getElementById('btn-toolbar-chat');
                            if (btnToolbar) btnToolbar.classList.add('active');
                        }
                    }
                }
            });
        }
        isInitialChatLoad = false;
    });
}

window.showToast = function(sender, text) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Limita para no máximo 2 toasts simultâneos para evitar sobrecarga na tela
    const existingToasts = container.querySelectorAll('.toast');
    if (existingToasts.length >= 2) {
        for (let i = 0; i <= existingToasts.length - 2; i++) {
            existingToasts[i].classList.remove('show');
            setTimeout(() => existingToasts[i].remove(), 250);
        }
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    const safeSender = escapeHTML(sender);
    const safeText = escapeHTML(text);
    
    toast.innerHTML = `
        <div class="toast-sender">${safeSender}</div>
        <div class="toast-text">${safeText}</div>
    `;
    
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); // Aguarda transição
    }, 4000); // 4 segundos
};

window.sendChatMessage = async function(e) {
    e.preventDefault();
    const input = document.getElementById('chat-message-input');
    const text = input.value.trim();
    
    if (!text || !window.letrasRole) return;
    
    input.value = '';
    
    try {
        await addDoc(collection(db, "letras_chat"), {
            role: window.letrasRole,
            text: text,
            timestamp: serverTimestamp()
        });
    } catch (err) {
        console.error("Erro ao enviar mensagem: ", err);
    }
};

window.clearLetrasChat = async function() {
    if (!confirm("Tem certeza que deseja apagar todo o histórico do chat?")) return;
    
    try {
        const q = query(collection(db, "letras_chat"));
        const snapshot = await getDocs(q);
        
        const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
        
    } catch (err) {
        console.error("Erro ao limpar chat: ", err);
    }
};

window.dispararParaTeclado = async function() {
    if (!currentActiveSongId || window.letrasRole !== 'bolha') return;
    try {
        await setDoc(doc(db, "app_state", "letras_sync"), {
            songId: currentActiveSongId,
            timestamp: serverTimestamp()
        });
        window.showToast('🚀 Sistema', 'Música enviada para o teclado!');
    } catch (err) {
        console.error("Erro ao sincronizar música: ", err);
        window.showToast('Erro', 'Falha ao sincronizar.');
    }
};

window.disparoRapidoFromMobile = async function(songId) {
    if (!songId || window.letrasRole !== 'bolha') return;
    try {
        await setDoc(doc(db, "app_state", "letras_sync"), {
            songId: songId,
            timestamp: serverTimestamp()
        });
        window.showToast('🚀 Fogo na Bomba!', 'Música disparada para o teclado!');
    } catch (err) {
        console.error("Erro ao disparar música: ", err);
        window.showToast('Erro', 'Falha ao disparar.');
    }
};

window.toggleMobileDisparo = function() {
    const overlay = document.getElementById('mobile-disparo-overlay');
    if (!overlay) return;
    overlay.classList.toggle('open');
    if (overlay.classList.contains('open')) {
        if (typeof window.pushNavigationState === 'function') window.pushNavigationState('disparo');
        document.getElementById('disparo-search-input').value = '';
        renderDisparoResults('');
        setTimeout(() => document.getElementById('disparo-search-input').focus(), 300);
    }
};

const disparoSearchInput = document.getElementById('disparo-search-input');
if (disparoSearchInput) {
    disparoSearchInput.addEventListener('input', (e) => {
        renderDisparoResults(e.target.value.toLowerCase());
    });
}

function renderDisparoResults(searchTerm) {
    const container = document.getElementById('mobile-disparo-container');
    if (!container) return;
    container.innerHTML = '';
    
    let results = songsData;
    if (searchTerm) {
        results = results.filter(s => 
            s.title.toLowerCase().includes(searchTerm) || 
            s.lyrics.toLowerCase().includes(searchTerm)
        );
    }
    
    if (results.length === 0) {
        container.innerHTML = '<div class="empty-setlist-msg">Nenhuma música encontrada.</div>';
        return;
    }
    
    results.forEach(song => {
        const div = document.createElement('div');
        div.className = 'setlist-item';
        div.style.padding = '12px 16px';
        div.style.cursor = 'pointer';
        div.style.borderLeft = '4px solid var(--primary-color)';
        
        div.innerHTML = `
            <div style="flex-grow: 1;">
                <div style="font-weight: bold;">${song.title}</div>
            </div>
            <button class="btn btn-accent" style="padding: 6px 12px; font-size: 0.85rem; border-radius: 8px;">🚀 Atirar</button>
        `;
        
        div.onclick = () => window.disparoRapidoFromMobile(song.id);
        
        container.appendChild(div);
    });
}

window.acceptBolhaSync = localStorage.getItem('acceptBolhaSync') !== 'false';

window.updateSyncButtonsUI = function(showToast = false) {
    const btnSidebar = document.getElementById('btn-teclado-sync-toggle');
    const btnMobile = document.getElementById('btn-mobile-sync-toggle');
    const btnDesktop = document.getElementById('btn-desktop-sync-toggle');
    
    if (window.acceptBolhaSync) {
        if (btnSidebar) {
            btnSidebar.style.backgroundColor = 'var(--success-color)';
            btnSidebar.textContent = '📡 Aceitar Bolha: LIGADO';
        }
        if (btnMobile) {
            btnMobile.style.backgroundColor = 'var(--success-color)';
            btnMobile.textContent = '📡 ON';
        }
        if (btnDesktop) {
            btnDesktop.style.backgroundColor = 'var(--success-color)';
            btnDesktop.textContent = '📡 Sincronia: LIGADA';
        }
        if (showToast) window.showToast('📡 Sistema', 'Você está aceitando disparos da Bolha.');
    } else {
        if (btnSidebar) {
            btnSidebar.style.backgroundColor = 'var(--danger-color)';
            btnSidebar.textContent = '🚫 Aceitar Bolha: DESLIGADO';
        }
        if (btnMobile) {
            btnMobile.style.backgroundColor = 'var(--danger-color)';
            btnMobile.textContent = '🚫 OFF';
        }
        if (btnDesktop) {
            btnDesktop.style.backgroundColor = 'var(--danger-color)';
            btnDesktop.textContent = '🚫 Sincronia: DESLIGADA';
        }
        if (showToast) window.showToast('🚫 Sistema', 'Disparos da Bolha foram bloqueados.');
    }
};

window.toggleTecladoSync = function() {
    window.acceptBolhaSync = !window.acceptBolhaSync;
    localStorage.setItem('acceptBolhaSync', window.acceptBolhaSync);
    window.updateSyncButtonsUI(true);
};

let lastSyncTimestamp = 0;
let isFirstLetrasSync = true;
function startListeningToLetrasSync() {
    if (unsubLetrasSync) unsubLetrasSync();
    isFirstLetrasSync = true;
    
    unsubLetrasSync = onSnapshot(doc(db, "app_state", "letras_sync"), (docSnap) => {
        if (!docSnap.exists()) return;
        
        const data = docSnap.data();
        const docTime = data.timestamp ? data.timestamp.toMillis() : 0;
        
        if (isFirstLetrasSync) {
            isFirstLetrasSync = false;
            lastSyncTimestamp = docTime;
            
            if (Date.now() - docTime > 20 * 60 * 1000) return;
            if (!window.acceptBolhaSync) return;
            
            if (songsData.length === 0) {
                pendingSyncSongId = data.songId;
            } else {
                const song = songsData.find(s => s.id === data.songId);
                if (song && song.id !== currentActiveSongId) {
                    window.showToast('📡 Sincronização', 'Sessão restaurada!');
                    window.openSong(song);
                }
            }
            return;
        }
        
        if (docTime > lastSyncTimestamp) {
            lastSyncTimestamp = docTime;
            
            if (!window.acceptBolhaSync) {
                window.showToast('🚫 Disparo Ignorado', 'A Bolha tentou alterar a música.');
                return;
            }
            
            if (songsData.length === 0) {
                pendingSyncSongId = data.songId;
            } else {
                const song = songsData.find(s => s.id === data.songId);
                if (song) {
                    window.showToast('📡 Sincronização', '🔥 Nova música recebida!');
                    window.openSong(song);
                }
            }
        }
    });
}

// --- PWA Service Worker Registration & Cache Management ---
const isNativePlatform = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());

if (isNativePlatform) {
    document.body.classList.add('is-native-app');
    // Em aplicativo nativo Android (Capacitor), desregistra qualquer ServiceWorker antigo
    // e limpa os caches do WebView para que as atualizações do APK sejam aplicadas na hora!
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let reg of registrations) {
                reg.unregister().then(() => console.log('🧹 [Native] SW antigo desregistrado.'));
            }
        }).catch(err => console.warn('Erro ao limpar SW nativo:', err));
    }
    if ('caches' in window) {
        caches.keys().then(keys => {
            keys.forEach(k => caches.delete(k));
        }).catch(err => console.warn('Erro ao limpar Cache nativo:', err));
    }
    const apkElements = [
        document.getElementById('admin-apk-card'),
        document.getElementById('btn-sidebar-apk'),
        document.getElementById('btn-sidebar-top-apk'),
        document.getElementById('btn-topbar-apk'),
        document.getElementById('welcome-apk-card'),
        document.getElementById('btn-mode-apk')
    ];
    apkElements.forEach(el => {
        if (el) el.style.display = 'none';
    });
} else if ('serviceWorker' in navigator) {
    // Modo Web / PWA no navegador: registra e força checagem de nova versão
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(registration => {
            registration.update();
            console.log('SW registered & updated: ', registration);
        }).catch(registrationError => {
            console.log('SW registration failed: ', registrationError);
        });
    });
}

// Detecção precisa de Tablet (ex: Galaxy Tab S6 Lite) para aplicar layout ergonômico
// NUNCA afeta o computador/desktop com mouse!
window.checkAndApplyDeviceMode = function() {
    const isNative = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    const isTouch = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const isAndroid = /android/i.test(navigator.userAgent);
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    const maxDim = Math.max(window.innerWidth, window.innerHeight);

    // Tablet: tela de pelo menos 600px de menor dimensão e 960px de maior dimensão
    const isTabletDims = minDim >= 600 && maxDim >= 960;

    // Desktop com mouse puro (nunca é tablet)
    const isDesktopMouse = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !isNative;

    const isTablet = (isNative || isTouch || isAndroid) && isTabletDims && !isDesktopMouse;

    if (isTablet) {
        document.body.classList.add('is-tablet-device');
    } else {
        document.body.classList.remove('is-tablet-device');
    }
};

window.checkAndApplyDeviceMode();
window.addEventListener('resize', window.checkAndApplyDeviceMode);
window.addEventListener('orientationchange', () => {
    setTimeout(window.checkAndApplyDeviceMode, 150);
});

// ==========================================
// RASTREAMENTO DE SINCRONIA E STATUS OFFLINE
// ==========================================
let hasNotifiedOffline = false;

window.notifyOfflineState = function(mode, songCount) {
    if (hasNotifiedOffline) return;
    hasNotifiedOffline = true;

    const savedRaw = localStorage.getItem(`cifraceros_last_sync_${mode}`);
    let infoText = "";
    if (savedRaw) {
        try {
            const parsed = JSON.parse(savedRaw);
            infoText = `Usando repertório salvo em ${parsed.dateStr} (${songCount || parsed.count} músicas).`;
        } catch (e) {
            infoText = `Usando repertório local: ${songCount} músicas salvas no aparelho.`;
        }
    } else {
        infoText = `Usando repertório local: ${songCount} músicas salvas no aparelho.`;
    }

    window.showToast('📴 Modo Offline', infoText);
    
    const adminStatus = document.getElementById('admin-status-indicator');
    if (adminStatus) {
        adminStatus.innerHTML = `📴 Offline <small style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:normal;">${infoText}</small>`;
    }
};

window.addEventListener('offline', () => {
    hasNotifiedOffline = false;
    const mode = window.appMode || 'cifras';
    window.notifyOfflineState(mode, songsData.length);
});

window.addEventListener('online', () => {
    hasNotifiedOffline = false;
    window.showToast('🟢 Internet Conectada', 'Sincronizando com a nuvem...');
});

// ==========================================
// WAKE LOCK (TELA ATIVA DURANTE LOUVOR/SHOW)
// ==========================================
let screenWakeLock = null;

window.requestScreenWakeLock = async function() {
    try {
        if ('wakeLock' in navigator && !screenWakeLock) {
            screenWakeLock = await navigator.wakeLock.request('screen');
            screenWakeLock.addEventListener('release', () => {
                screenWakeLock = null;
            });
            console.log('💡 [WakeLock] Tela mantida ligada para o músico.');
        }
    } catch (err) {
        console.warn('💡 [WakeLock] Não foi possível ativar wake lock:', err);
    }
};

window.releaseScreenWakeLock = async function() {
    try {
        if (screenWakeLock) {
            await screenWakeLock.release();
            screenWakeLock = null;
            console.log('💡 [WakeLock] Tela liberada.');
        }
    } catch (err) {}
};

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        const songView = document.getElementById('song-view');
        if (songView && songView.style.display === 'block') {
            await window.requestScreenWakeLock();
        }
    }
});

// =======================================================
// NAVEGAÇÃO E TRATAMENTO DO BOTÃO VOLTAR DO ANDROID (BACK)
// =======================================================
let lastBackPressTime = 0;
let isBackHandling = false;

window.pushNavigationState = function(stateName) {
    try {
        history.pushState({ cifraceros_view: stateName, time: Date.now() }, '');
    } catch (e) {}
};

window.handleAppBackButton = function() {
    if (isBackHandling) return true;
    isBackHandling = true;
    setTimeout(() => { isBackHandling = false; }, 200);

    // 1. Role selection (Modo Letras -> Teclado/Bolha)
    const roleBox = document.getElementById('role-selection-box');
    if (roleBox && roleBox.style.display !== 'none') {
        window.cancelRoleSelection();
        return true;
    }

    // 2. Chat de letras popup
    const chatPopup = document.getElementById('letras-chat-popup');
    if (chatPopup && chatPopup.style.display === 'flex') {
        window.toggleLetrasChatPopup(false);
        return true;
    }

    // 3. Barra flutuante de rolagem (slider)
    const scrollBar = document.getElementById('mobile-scroll-control-bar');
    if (scrollBar && scrollBar.style.display === 'flex') {
        window.toggleMobileScrollControl(false);
        return true;
    }

    // 4. Gaveta de Setlist / Acesso Rápido
    const setlistOverlay = document.getElementById('mobile-setlist-overlay');
    if (setlistOverlay && setlistOverlay.classList.contains('open')) {
        window.toggleMobileSetlist();
        return true;
    }

    // 5. Gaveta de Playlists / Minhas Listas
    const playlistsOverlay = document.getElementById('mobile-playlists-overlay');
    if (playlistsOverlay && playlistsOverlay.classList.contains('open')) {
        window.toggleMobilePlaylists(false);
        return true;
    }

    // 6. Gaveta de Disparo Rápido
    const disparoOverlay = document.getElementById('mobile-disparo-overlay');
    if (disparoOverlay && disparoOverlay.classList.contains('open')) {
        window.toggleMobileDisparo();
        return true;
    }

    // 7. Painel de Administração
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel && adminPanel.style.display === 'block') {
        closeAdmin();
        return true;
    }

    // 8. Barra lateral / gaveta do repertório (se estiver aberta em tela mobile/tablet)
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        closeSidebar();
        return true;
    }

    // 8.5 Modo foco no tablet/desktop: botão voltar primeiro restaura os painéis
    const mainContainer = document.getElementById('main-app-container');
    if (mainContainer && mainContainer.classList.contains('focus-mode')) {
        window.toggleFocusMode(false);
        return true;
    }

    // 9. Se uma música estiver aberta
    const songView = document.getElementById('song-view');
    if (songView && songView.style.display === 'block') {
        closeSong();
        return true;
    }

    // 10. Se estiver na tela principal: duplo clique para sair do aplicativo
    const now = Date.now();
    if (now - lastBackPressTime < 2000) {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            window.Capacitor.Plugins.App.exitApp();
        }
        return false;
    } else {
        lastBackPressTime = now;
        window.showToast('ℹ️ Pressione novamente', 'Toque em Voltar mais uma vez para sair do aplicativo.');
        return true;
    }
};

// Integração com Capacitor App Plugin no Android
if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('backButton', () => {
        window.handleAppBackButton();
    });
}

// Suporte para Navegação por Histórico no Browser / PWA
window.addEventListener('popstate', () => {
    window.handleAppBackButton();
});

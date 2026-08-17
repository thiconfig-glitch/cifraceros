import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence, collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy, deleteDoc, getDocs, limit, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
};

window.openAdminPanelDirectly = function() {
    hideAll();
    closeSidebar();
    document.getElementById('admin-panel').style.display = 'block';
};

window.openAdminForCreation = function() {
    editingSongId = null;
    hideAll();
    closeSidebar();
    document.getElementById('admin-panel').style.display = 'block';
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

function startListeningToSongs(mode) {
    if (!mode) return;

    const resultsContainer = document.getElementById('results-container');

    if (mode === 'cifras' && unsubCifras) {
        if (isCifrasLoaded) {
            songsData = songsDataCifras;
            updateDataAndRender();
        } else {
            resultsContainer.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Carregando repertório...</p>';
        }
        return;
    }

    if (mode === 'letras' && unsubLetras) {
        if (isLetrasLoaded) {
            songsData = songsDataLetras;
            updateDataAndRender();
        } else {
            resultsContainer.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Carregando repertório...</p>';
        }
        return;
    }

    resultsContainer.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Carregando repertório...</p>';
    const collectionName = mode === 'letras' ? "repertorio_letras" : "repertorio";

    const listener = onSnapshot(collection(db, collectionName), (querySnapshot) => {
        const newData = querySnapshot.docs.map(d => {
            const data = d.data();
            let pList = [];
            if (data.playlists) {
                pList = Array.isArray(data.playlists) ? data.playlists : [data.playlists];
            }
            return { id: d.id, ...data, playlists: pList };
        });
        
        newData.sort((a, b) => a.title.localeCompare(b.title));
        
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
    document.getElementById('mode-selection-overlay').style.display = 'none';
    document.getElementById('main-app-container').style.display = 'flex';
    
    // Toggle UI elements specific to Letras mode
    const transposeGroup = document.querySelector('input#m-transpose')?.closest('.form-group');
    const chatWidget = document.getElementById('letras-chat-widget');
    
    if (mode === 'letras') {
        document.body.classList.add('letras-mode');
        if (transposeGroup) transposeGroup.style.display = 'none';
        if (chatWidget) chatWidget.style.display = 'flex';
        startListeningToChat();
    } else {
        document.body.classList.remove('letras-mode');
        if (transposeGroup) transposeGroup.style.display = 'block';
        if (chatWidget) chatWidget.style.display = 'none';
        if (unsubChat) {
            unsubChat();
            unsubChat = null;
        }
    }
    startListeningToSetlist(mode);
    startListeningToSongs(mode);
}

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
    if (!str) return '';
    return str
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
        container.innerHTML = '<p style="text-align:center; color:#888;">Nenhuma música encontrada.</p>';
        return;
    }

    songs.forEach(song => {
        const item = document.createElement('div');
        item.className = 'song-item';
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
        }
        window.resultsSortable = new Sortable(container, {
            group: {
                name: 'shared',
                pull: 'clone',
                put: false
            },
            sort: false,
            animation: 250,
            delay: 100,
            delayOnTouchOnly: false,
            touchStartThreshold: 5,
            filter: '.three-dots-btn, .dropdown-menu',
            preventOnFilter: false
        });
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
        console.error(err);
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
    if (window.appMode === 'letras') return text;
    return text.split('\n').map(line => {
        if (isChordLine(line)) {
            return line.replace(/(\S+)/g, '<span class="chord">$1</span>');
        }
        return line;
    }).join('\n');
}

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
    if (window.appMode === 'letras') return;
    const pre = document.getElementById('sv-content');
    if (!pre) return;

    let size = 1.3;
    pre.style.fontSize = `${size}rem`;
    
    // Decrease font size until it fits without scrollbar
    while (pre.scrollWidth > pre.clientWidth && size > 0.5) {
        size -= 0.05;
        pre.style.fontSize = `${size}rem`;
    }
    
    currentFontSize = size;
};

window.addEventListener('resize', () => {
    if (document.getElementById('song-view').style.display !== 'none') {
        window.autoFitCifra();
    }
});

window.openSong = function(song) {
    hideAll();
    stopAutoScroll();
    scrollPos = 0;
    closeSidebar();
    currentActiveSongId = song.id;

    document.getElementById('song-view').style.display = 'block';
    document.getElementById('sv-title').textContent = song.title;
    
    const transposeBadge = document.getElementById('sv-transpose');
    if (window.appMode === 'letras') {
        transposeBadge.style.display = 'none';
    } else {
        transposeBadge.style.display = 'inline-block';
        transposeBadge.textContent = song.transpose ? `Tom: ${song.transpose}` : 'Tom Original';
    }
    
    const contentArea = document.getElementById('sv-content');
    contentArea.innerHTML = formatCifraText(song.lyrics);
    contentArea.style.fontSize = `${currentFontSize}rem`;

    // Load notes & manage notes widget display
    window.loadCultoNotes();

    const isNotesVisible = localStorage.getItem('cifraceros_notes_visible') !== 'false';
    const widget = document.getElementById('culto-notes-widget');
    const btn = document.getElementById('btn-toggle-notes');
    if (widget) {
        widget.style.display = isNotesVisible ? 'flex' : 'none';
        widget.classList.toggle('hidden', !isNotesVisible);
    }
    if (btn) btn.classList.toggle('active', isNotesVisible);

    document.querySelector('.main-content').scrollTop = 0;

    // Small delay to ensure layout is computed before autofitting
    setTimeout(() => {
        window.autoFitCifra();
    }, 50);

    window.renderSongViewPlaylists();
};

window.adjustFontSize = function(delta) {
    currentFontSize = Math.max(0.5, Math.min(3, currentFontSize + delta));
    document.getElementById('sv-content').style.fontSize = `${currentFontSize}rem`;
};

window.toggleAutoScroll = function() {
    isScrolling = !isScrolling;
    const btn = document.getElementById('btn-scroll-play');
    if (isScrolling) {
        btn.textContent = '⏸';
        btn.classList.add('active');
        const mainContent = document.querySelector('.main-content');
        scrollPos = mainContent.scrollTop;
        startAutoScroll();
    } else {
        stopAutoScroll();
    }
};

// Sync internal scrollPos with manual scrolling to prevent jumping
document.querySelector('.main-content').addEventListener('scroll', (e) => {
    if (isScrolling) {
        // We only update scrollPos if the difference is significant to avoid feedback loops
        const currentTop = e.target.scrollTop;
        if (Math.abs(currentTop - scrollPos) > 5) {
            scrollPos = currentTop;
        }
    }
});

function startAutoScroll() {
    const mainContent = document.querySelector('.main-content');
    let lastTime = performance.now();

    function scrollStep(currentTime) {
        if (!isScrolling) return;
        
        const deltaTime = currentTime - lastTime;
        lastTime = currentTime;

        const pixelsPerMs = (scrollSpeed * 50) / 1000;
        scrollPos += pixelsPerMs * deltaTime;
        
        mainContent.scrollTop = Math.floor(scrollPos);

        if (mainContent.scrollTop + mainContent.clientHeight >= mainContent.scrollHeight - 1) {
            stopAutoScroll();
            return;
        }

        scrollInterval = requestAnimationFrame(scrollStep);
    }
    scrollInterval = requestAnimationFrame(scrollStep);
}

function stopAutoScroll() {
    isScrolling = false;
    if (scrollInterval) cancelAnimationFrame(scrollInterval);
    const btn = document.getElementById('btn-scroll-play');
    if (btn) {
        btn.textContent = '▶';
        btn.classList.remove('active');
    }
}

window.adjustScrollSpeed = function(delta) {
    scrollSpeed = Math.max(0.1, Math.min(5.0, parseFloat((scrollSpeed + delta * 0.2).toFixed(1))));
    document.getElementById('scroll-speed-display').textContent = Math.round(scrollSpeed * 100) + '%';
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
    document.getElementById('welcome-view').style.display = 'flex';
    if(window.innerWidth <= 768) toggleSidebar();
};

window.closeAdmin = function() {
    editingSongId = null;
    hideAll();
    stopAutoScroll();
    document.getElementById('welcome-view').style.display = 'flex';
    if(window.innerWidth <= 768) toggleSidebar();
};

function hideAll() {
    document.getElementById('welcome-view').style.display = 'none';
    document.getElementById('song-view').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'none';
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

window.toggleMobileSetlist = function() {
    document.getElementById('mobile-setlist-overlay').classList.toggle('open');
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
                delay: 100,
                delayOnTouchOnly: false,
                touchStartThreshold: 5,
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
        window.autoFitCifra();
    }, 50);
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(renderSetlist, 500);
    window.loadCultoNotes();
});

// Chat Letras Logic
let isInitialChatLoad = true;

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
        
        // Verifica mensagens novas para mostrar Pop-up
        if (!isInitialChatLoad) {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (data.role && data.role !== window.letrasRole) {
                        const senderName = data.role === 'teclado' ? '🎹 Teclado' : '🗣️ Bolha';
                        window.showToast(senderName, data.text);
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

    const toast = document.createElement('div');
    toast.className = 'toast';
    const safeText = escapeHTML(text);
    
    toast.innerHTML = `
        <div class="toast-sender">Nova mensagem: ${sender}</div>
        <div class="toast-text">${safeText}</div>
    `;
    
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10); // Animate in
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); // Wait for transition
    }, 5000); // 5 segundos
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

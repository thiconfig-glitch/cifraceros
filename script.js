import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
const auth = getAuth(app);

let songsData = [];
let localPlaylists = new Set();
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

const fuseOptions = {
    includeScore: true,
    threshold: 0.4, 
    keys: [
        { name: 'title', weight: 0.7 },
        { name: 'lyrics', weight: 0.3 } 
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
        if (btnAdminGate) btnAdminGate.style.display = 'none';
    } else {
        if (statusIndicator) statusIndicator.textContent = "Status: Leitura";
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (loginSection) loginSection.style.display = 'block';
        if (uploadSection) uploadSection.style.display = 'none';
        if (playlistZone) playlistZone.style.display = 'none';
        if (btnAdminGate) btnAdminGate.style.display = 'block';
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

function startListeningToSongs() {
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Carregando repertório...</p>';

    onSnapshot(collection(db, "repertorio"), (querySnapshot) => {
        songsData = querySnapshot.docs.map(d => {
            const data = d.data();
            let pList = [];
            if (data.playlists) {
                pList = Array.isArray(data.playlists) ? data.playlists : [data.playlists];
            }
            return { id: d.id, ...data, playlists: pList };
        });
        
        songsData.sort((a, b) => a.title.localeCompare(b.title));
        
        localPlaylists.clear();
        songsData.forEach(s => s.playlists.forEach(p => localPlaylists.add(p)));
        
        if (isInitialLoad) {
            isInitialLoad = false;
            document.getElementById('admin-status-indicator').textContent = isAdmin ? "Status: Administrador" : "Status: Leitura";
        }
        
        isDataLoaded = true;

        renderPlaylistChips();
        filterAndRender();
        renderSetlist(); // Re-render setlist to ensure titles are synced
    }, (error) => {
        console.error("Erro ao escutar mudanças: ", error);
        resultsContainer.innerHTML = '<p style="text-align:center; color:var(--error-color);">Erro ao carregar dados. Verifique sua conexão.</p>';
    });
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
    }, 300);
});

function filterAndRender() {
    if (!isDataLoaded) return;
    
    let currentList = songsData;

    if (selectedPlaylistFilter !== 'all') {
        currentList = currentList.filter(s => s.playlists.includes(selectedPlaylistFilter));
    }

    const query = searchInput.value;
    if (query) {
        const localFuse = new Fuse(currentList, fuseOptions);
        currentList = localFuse.search(query).map(r => r.item);
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
        clickableArea.innerHTML = `<span>${song.title}</span> <span style="color: var(--chord-color); font-size: 0.8em; opacity: 0.8;">Tom: ${song.transpose || 'Orig'}</span>`;
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
                    pBtn.onclick = () => toggleSongPlaylistAssignment(song, p);
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

async function toggleSongPlaylistAssignment(song, playlistName) {
    let updatedPlaylists = [...song.playlists];
    if (updatedPlaylists.includes(playlistName)) {
        updatedPlaylists = updatedPlaylists.filter(p => p !== playlistName);
    } else {
        updatedPlaylists.push(playlistName);
    }

    try {
        await updateDoc(doc(db, "repertorio", song.id), { playlists: updatedPlaylists });
    } catch (err) {
        console.error(err);
    }
}

function isChordLine(line) {
    if (line.trim() === '') return false;
    const tokens = line.trim().split(/\s+/);
    const chordTokenRegex = /^[A-G][m#bM\d\/\(\)\+\-º°]*(dim|aug|sus)?[\d\(\)\+\-º°]*(\/[A-G][#b]?)?$/;
    return tokens.every(token => chordTokenRegex.test(token));
}

function formatCifraText(text) {
    return text.split('\n').map(line => {
        if (isChordLine(line)) {
            return line.replace(/(\S+)/g, '<span class="chord">$1</span>');
        }
        return line;
    }).join('\n');
}

window.openSong = function(song) {
    hideAll();
    stopAutoScroll();
    scrollPos = 0;
    closeSidebar();
    document.getElementById('song-view').style.display = 'block';
    document.getElementById('sv-title').textContent = song.title;
    document.getElementById('sv-transpose').textContent = song.transpose ? `Tom: ${song.transpose}` : 'Tom Original';
    const contentArea = document.getElementById('sv-content');
    contentArea.innerHTML = formatCifraText(song.lyrics);
    contentArea.style.fontSize = `${currentFontSize}rem`;
    document.querySelector('.main-content').scrollTop = 0;
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
        if (editingSongId) {
            await updateDoc(doc(db, "repertorio", editingSongId), payload);
            msgDiv.textContent = "Música atualizada!";
        } else {
            await addDoc(collection(db, "repertorio"), { ...payload, playlists: [] });
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

// --- Setlist Logic (Refactored for Stability) ---
// We store only IDs in localStorage to ensure data consistency
let setlistIds = JSON.parse(localStorage.getItem('setlistCifraCerosIds') || '[]');

function saveSetlist() {
    localStorage.setItem('setlistCifraCerosIds', JSON.stringify(setlistIds));
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

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(renderSetlist, 500);
});


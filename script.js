import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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
let scrollSpeed = 0.5; // Changed to fractional for more precision
let scrollInterval = null;
let scrollPos = 0; // Sub-pixel accumulator

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
    const statusIndicator = document.getElementById('admin-status-indicator');
    const logoutBtn = document.getElementById('btn-logout-inside');

    if (isAdmin) {
        statusIndicator.textContent = "Status: Administrador";
        logoutBtn.style.display = 'block';
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('upload-section').style.display = 'block';
        document.getElementById('playlist-creation-zone').style.display = 'flex';
    } else {
        statusIndicator.textContent = "Status: Leitura";
        logoutBtn.style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('upload-section').style.display = 'none';
        document.getElementById('playlist-creation-zone').style.display = 'none';
    }
    filterAndRender();
});

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
        
        renderPlaylistChips();
        filterAndRender();
    }, (error) => {
        console.error("Erro ao escutar mudanças: ", error);
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

const searchInput = document.getElementById('search-input');
searchInput.addEventListener('input', () => filterAndRender());

function filterAndRender() {
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
    
    if(songs.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888;">Nenhuma música encontrada.</p>';
        return;
    }

    songs.forEach(song => {
        const item = document.createElement('div');
        item.className = 'song-item';
        item.dataset.id = song.id; // Added for drag and drop
        
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
                toggleDropdownMenu(song.id);
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

    // Make results list draggable for the Setlist
    if (window.Sortable) {
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
            animation: 150
        });
    }
}

window.toggleDropdownMenu = function(songId) {
    const menus = document.querySelectorAll('.dropdown-menu');
    menus.forEach(m => {
        if(m.id !== `dropdown-${songId}`) {
            m.style.display = 'none';
            if (m.closest('.song-item')) m.closest('.song-item').classList.remove('dropdown-open');
        }
    });
    const target = document.getElementById(`dropdown-${songId}`);
    if (target.style.display === 'block') {
        target.style.display = 'none';
        if (target.closest('.song-item')) target.closest('.song-item').classList.remove('dropdown-open');
    } else {
        target.style.display = 'block';
        if (target.closest('.song-item')) target.closest('.song-item').classList.add('dropdown-open');
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
    scrollPos = 0; // Reset sub-pixel position
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
        scrollPos = mainContent.scrollTop; // Sync sub-pixel with current scroll
        startAutoScroll();
    } else {
        stopAutoScroll();
    }
};

function startAutoScroll() {
    const mainContent = document.querySelector('.main-content');
    let lastTime = performance.now();

    function scrollStep(currentTime) {
        if (!isScrolling) return;
        
        const deltaTime = currentTime - lastTime;
        lastTime = currentTime;

        // Base speed: 50 pixels per second at speed 1.0
        const pixelsPerMs = (scrollSpeed * 50) / 1000;
        scrollPos += pixelsPerMs * deltaTime;
        
        mainContent.scrollTop = Math.floor(scrollPos);

        // Stop if reached the end
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
    // Range from 0.1 to 3.0, steps of 0.1
    scrollSpeed = Math.max(0.1, Math.min(5.0, parseFloat((scrollSpeed + delta * 0.2).toFixed(1))));
    // Display as percentage for better UX (0.5 = 50%)
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
    }
});

document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgDiv = document.getElementById('upload-msg');
    msgDiv.style.display = 'none';

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
    } catch (error) {
        msgDiv.textContent = "Erro ao salvar.";
        msgDiv.className = "msg msg-error";
        msgDiv.style.display = 'block';
    }
});

startListeningToSongs();

// --- Setlist / Ordem Logic ---
let setlist = JSON.parse(localStorage.getItem('setlistCifraCeros') || '[]');

function saveSetlist() {
    localStorage.setItem('setlistCifraCeros', JSON.stringify(setlist));
}

function renderSetlist() {
    const container = document.getElementById('setlist-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (setlist.length === 0) {
        container.innerHTML = '<p class="empty-setlist-msg">Arraste as músicas aqui para montar sua ordem.</p>';
    } else {
        setlist.forEach((song, index) => {
            const item = document.createElement('div');
            item.className = 'setlist-item';
            item.dataset.index = index;
            
            const titleSpan = document.createElement('span');
            titleSpan.textContent = song.title;
            titleSpan.style.flexGrow = '1';
            titleSpan.onclick = () => {
                const fullSong = songsData.find(s => s.id === song.id);
                if (fullSong) openSong(fullSong);
            };
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-setlist-btn';
            removeBtn.textContent = '✕';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                setlist.splice(index, 1);
                saveSetlist();
                renderSetlist();
            };

            item.appendChild(titleSpan);
            item.appendChild(removeBtn);
            container.appendChild(item);
        });
    }

    if (window.Sortable && !window.setlistSortable) {
        window.setlistSortable = new Sortable(container, {
            group: {
                name: 'shared',
                put: true
            },
            animation: 150,
            onAdd: function (evt) {
                const songId = evt.item.dataset.id;
                const song = songsData.find(s => s.id === songId);
                
                // Remove the cloned node so we can re-render fresh
                if (evt.item.parentNode) {
                    evt.item.parentNode.removeChild(evt.item);
                }
                
                if (song) {
                    setlist.splice(evt.newIndex, 0, { id: song.id, title: song.title, transpose: song.transpose });
                    saveSetlist();
                    renderSetlist();
                }
            },
            onUpdate: function (evt) {
                const movedItem = setlist.splice(evt.oldIndex, 1)[0];
                setlist.splice(evt.newIndex, 0, movedItem);
                saveSetlist();
                renderSetlist();
            }
        });
    }
}

window.clearSetlist = function() {
    if (confirm("Deseja limpar toda a lista?")) {
        setlist = [];
        saveSetlist();
        renderSetlist();
    }
};

// Initialize setlist on load
document.addEventListener('DOMContentLoaded', () => {
    // We wait a bit to ensure Sortable is loaded from CDN
    setTimeout(renderSetlist, 500);
});


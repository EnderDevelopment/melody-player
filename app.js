const audio = document.getElementById('audio');
const fileInput = document.getElementById('fileInput');
const trackRows = document.getElementById('trackRows');
const searchInput = document.getElementById('searchInput');
const toast = document.getElementById('toast');
const tracks = [];
const playlists = [];
let currentTrackId = null;
let activePlaylistId = null;
let shuffle = false;
let repeat = false;
let sortNewestFirst = true;
let toastTimer;
let playlistSequence = 1;
const artColors = ['#283b2c', '#3a3027', '#27383b', '#3c2e3a', '#343528', '#2e3340', '#3b3428'];
const storageName = 'tempo-library';
const storageVersion = 1;
let storageReady = false;

function openStorage() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB is unavailable.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(storageName, storageVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('tracks')) database.createObjectStore('tracks', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('playlists')) database.createObjectStore('playlists', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const storage = openStorage().catch(() => null);

async function persistLibrary() {
  const database = await storage;
  if (!database) return;
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(['tracks', 'playlists'], 'readwrite');
    const trackStore = transaction.objectStore('tracks');
    const playlistStore = transaction.objectStore('playlists');
    trackStore.clear();
    playlistStore.clear();
    tracks.forEach((track) => trackStore.put({ ...track, url: undefined, file: undefined, blob: track.file }));
    playlists.forEach((playlist) => playlistStore.put(playlist));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function restoreLibrary() {
  const database = await storage;
  if (!database) return;
  const saved = await new Promise((resolve, reject) => {
    const transaction = database.transaction(['tracks', 'playlists'], 'readonly');
    const trackRequest = transaction.objectStore('tracks').getAll();
    const playlistRequest = transaction.objectStore('playlists').getAll();
    transaction.oncomplete = () => resolve({ tracks: trackRequest.result, playlists: playlistRequest.result });
    transaction.onerror = () => reject(transaction.error);
  });
  saved.tracks.forEach((savedTrack) => {
    const track = { ...savedTrack, file: savedTrack.blob };
    delete track.blob;
    track.url = URL.createObjectURL(track.file);
    tracks.push(track);
  });
  playlists.push(...saved.playlists);
  playlistSequence = playlists.reduce((highest, playlist) => Math.max(highest, Number(playlist.id.replace('playlist-', '')) || 0), 0) + 1;
  storageReady = true;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}

function getVisibleTracks() {
  const query = searchInput.value.trim().toLowerCase();
  let visible = tracks.filter((track) => {
    const matchesQuery = !query || `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(query);
    const matchesPlaylist = !activePlaylistId || playlists.find((playlist) => playlist.id === activePlaylistId)?.trackIds.includes(track.id);
    return matchesQuery && matchesPlaylist;
  });
  if (sortNewestFirst) visible = [...visible].reverse();
  return visible;
}

function renderTracks() {
  const visible = getVisibleTracks();
  document.getElementById('trackCount').textContent = tracks.length;
  document.getElementById('visibleCount').textContent = visible.length;
  document.getElementById('listHeading').innerHTML = `${activePlaylistId ? escapeHTML(playlists.find((item) => item.id === activePlaylistId)?.name || 'Playlist') : 'All tracks'} <span>${visible.length}</span>`;
  document.getElementById('viewTitle').textContent = activePlaylistId ? playlists.find((item) => item.id === activePlaylistId)?.name || 'Playlist' : 'All tracks';
  if (!visible.length) {
    const message = tracks.length ? 'No tracks match this view.' : 'Your library is a blank canvas.';
    const detail = tracks.length ? 'Try another search, or add a track to this playlist.' : 'Add a few tracks and they’ll find their place here.';
    trackRows.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state"><div class="empty-art" aria-hidden="true"><span>♫</span><i></i><i></i><i></i><i></i></div><strong>${message}</strong><span>${detail}</span>${tracks.length ? '' : '<button class="import-button" id="emptyImportButton">＋ Choose audio files</button>'}</div></td></tr>`;
    document.getElementById('emptyImportButton')?.addEventListener('click', openFilePicker);
    return;
  }
  trackRows.innerHTML = visible.map((track, index) => `<tr data-id="${track.id}"><td class="number-col"><button class="row-play" aria-label="Play ${escapeHTML(track.title)}">${track.id === currentTrackId && !audio.paused ? 'Ⅱ' : String(index + 1).padStart(2, '0')}</button></td><td><div class="track-title-cell"><div class="cover-art" style="background:${track.color}" aria-hidden="true">♫</div><div class="track-title-text"><strong>${escapeHTML(track.title)}</strong><span>${escapeHTML(track.artist)}</span></div></div></td><td>${escapeHTML(track.album)}</td><td>${escapeHTML(track.added)}</td><td class="duration-col">${track.duration ? formatTime(track.duration) : '—'}</td><td><button class="icon-button track-more" data-action="menu" aria-label="Track options" title="Track options">···</button></td></tr>`).join('');
  trackRows.querySelectorAll('tr[data-id]').forEach((row) => {
    row.querySelector('.row-play').addEventListener('click', () => playTrack(row.dataset.id));
    row.querySelector('[data-action="menu"]').addEventListener('click', () => showTrackMenu(row.dataset.id));
    row.addEventListener('dblclick', (event) => { if (!event.target.closest('button')) playTrack(row.dataset.id); });
  });
}

function renderPlaylists() {
  const list = document.getElementById('playlistList');
  if (!playlists.length) {
    list.innerHTML = '<p class="muted small-copy">Your playlists will appear here.</p>';
    return;
  }
  list.innerHTML = playlists.map((playlist) => `<button class="playlist-link ${playlist.id === activePlaylistId ? 'selected' : ''}" data-id="${playlist.id}">♫ &nbsp;${escapeHTML(playlist.name)}</button>`).join('');
  list.querySelectorAll('.playlist-link').forEach((button) => button.addEventListener('click', () => {
    activePlaylistId = activePlaylistId === button.dataset.id ? null : button.dataset.id;
    showLibrary();
  }));
}

function addFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|opus|aiff?)$/i.test(file.name));
  if (!files.length) {
    if (fileList.length) showToast('Choose audio files to add to your library.');
    return;
  }
  files.forEach((file) => {
    const parsed = file.name.replace(/\.[^.]+$/, '').split(' - ');
    const artist = parsed.length > 1 ? parsed.shift().trim() : 'Unknown artist';
    const title = parsed.join(' - ').trim() || file.name.replace(/\.[^.]+$/, '');
    const track = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, artist, album: 'Local files', added: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), duration: 0, url: URL.createObjectURL(file), color: artColors[tracks.length % artColors.length], file };
    tracks.push(track);
    if (activePlaylistId) playlists.find((playlist) => playlist.id === activePlaylistId)?.trackIds.push(track.id);
  });
  renderTracks();
  renderPlaylists();
  persistLibrary().catch(() => showToast('Library could not be saved on this device.'));
  showToast(`Added ${files.length} ${files.length === 1 ? 'track' : 'tracks'} to your library.`);
  fileInput.value = '';
}

function openFilePicker() { fileInput.click(); }
function currentTrack() { return tracks.find((track) => track.id === currentTrackId); }
function updateNowPlaying() {
  const track = currentTrack();
  document.getElementById('nowTitle').textContent = track?.title || 'Nothing playing';
  document.getElementById('nowArtist').textContent = track?.artist || 'Choose a track to begin';
  document.getElementById('miniArt').style.background = track?.color || '#283125';
  document.getElementById('favoriteButton').disabled = !track;
  document.getElementById('favoriteButton').classList.toggle('favorited', Boolean(track?.favorite));
  document.getElementById('favoriteButton').textContent = track?.favorite ? '♥' : '♡';
  document.getElementById('playGlyph').textContent = audio.paused ? '▶' : 'Ⅱ';
  document.getElementById('playButton').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  renderTracks();
}

function playTrack(id) {
  const track = tracks.find((item) => item.id === id);
  if (!track) return;
  if (currentTrackId === id) {
    if (audio.paused) audio.play().catch(() => showToast('This audio file could not be played.'));
    else audio.pause();
    return;
  }
  currentTrackId = id;
  audio.src = track.url;
  audio.play().catch(() => showToast('This audio file could not be played.'));
  updateNowPlaying();
}

function nextTrack(direction = 1) {
  const list = getVisibleTracks();
  if (!list.length) return;
  let index = list.findIndex((track) => track.id === currentTrackId);
  if (shuffle && list.length > 1) {
    let next = index;
    while (next === index) next = Math.floor(Math.random() * list.length);
    playTrack(list[next].id);
    return;
  }
  if (index < 0) index = direction > 0 ? -1 : 0;
  const nextIndex = (index + direction + list.length) % list.length;
  if (direction < 0 && index <= 0 && currentTrack() && audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  playTrack(list[nextIndex].id);
}

function showLibrary() {
  document.getElementById('libraryView').classList.remove('hidden');
  document.getElementById('queueView').classList.add('hidden');
  document.getElementById('queueNav').classList.remove('active');
  document.getElementById('libraryNav').classList.add('active');
  renderPlaylists();
  renderTracks();
}

function showQueue() {
  document.getElementById('libraryView').classList.add('hidden');
  document.getElementById('queueView').classList.remove('hidden');
  document.getElementById('libraryNav').classList.remove('active');
  document.getElementById('queueNav').classList.add('active');
  const list = getVisibleTracks();
  const queue = document.getElementById('queueContent');
  queue.innerHTML = list.length ? `<div class="queue-list">${list.map((track, index) => `<div class="track-table-wrap"><table class="track-table"><tbody><tr data-id="${track.id}"><td class="number-col"><button class="row-play" aria-label="Play ${escapeHTML(track.title)}">${track.id === currentTrackId ? '♫' : String(index + 1).padStart(2, '0')}</button></td><td><div class="track-title-cell"><div class="cover-art" style="background:${track.color}" aria-hidden="true">♫</div><div class="track-title-text"><strong>${escapeHTML(track.title)}</strong><span>${escapeHTML(track.artist)}</span></div></div></td><td>${escapeHTML(track.album)}</td><td class="duration-col">${track.duration ? formatTime(track.duration) : '—'}</td></tr></tbody></table></div>`).join('')}</div>` : '<p class="muted">Add audio files to see what is up next.</p>';
  queue.querySelectorAll('tr[data-id]').forEach((row) => row.addEventListener('click', () => playTrack(row.dataset.id)));
}

function showTrackMenu(id) {
  const track = tracks.find((item) => item.id === id);
  if (!track) return;
  if (!playlists.length) {
    createPlaylist();
    return;
  }
  const available = playlists.find((playlist) => !playlist.trackIds.includes(id));
  if (available) {
    available.trackIds.push(id);
    renderPlaylists();
    renderTracks();
    persistLibrary().catch(() => showToast('Library could not be saved on this device.'));
    showToast(`Added to ${available.name}.`);
  } else {
    const playlist = playlists[0];
    playlist.trackIds = playlist.trackIds.filter((trackId) => trackId !== id);
    renderPlaylists();
    renderTracks();
    persistLibrary().catch(() => showToast('Library could not be saved on this device.'));
    showToast(`Removed from ${playlist.name}.`);
  }
}

function createPlaylist() {
  const name = window.prompt('Name your playlist:');
  if (!name?.trim()) return;
  const playlist = { id: `playlist-${playlistSequence++}`, name: name.trim(), trackIds: [] };
  playlists.push(playlist);
  activePlaylistId = playlist.id;
  renderPlaylists();
  showLibrary();
  persistLibrary().catch(() => showToast('Library could not be saved on this device.'));
  showToast(`Created ${playlist.name}.`);
}

function clearLibrary() {
  if (!tracks.length && !playlists.length) {
    showToast('Your library is already empty.');
    return;
  }
  if (!window.confirm('Clear all tracks and playlists from this session?')) return;
  tracks.forEach((track) => URL.revokeObjectURL(track.url));
  tracks.length = 0;
  playlists.length = 0;
  activePlaylistId = null;
  currentTrackId = null;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  updateNowPlaying();
  renderPlaylists();
  persistLibrary().catch(() => showToast('Library could not be cleared from this device.'));
  showToast('Library cleared.');
}

document.getElementById('importButton').addEventListener('click', openFilePicker);
document.getElementById('browseButton').addEventListener('click', openFilePicker);
document.getElementById('dropBrowseButton').addEventListener('click', (event) => { event.stopPropagation(); openFilePicker(); });
document.getElementById('emptyImportButton')?.addEventListener('click', openFilePicker);
fileInput.addEventListener('change', () => addFiles(fileInput.files));
searchInput.addEventListener('input', () => { renderTracks(); if (!document.getElementById('queueView').classList.contains('hidden')) showQueue(); });
document.getElementById('sortButton').addEventListener('click', (event) => {
  sortNewestFirst = !sortNewestFirst;
  event.currentTarget.innerHTML = `${sortNewestFirst ? 'Recently added' : 'Recently added (oldest first)'} <span aria-hidden="true">⌄</span>`;
  renderTracks();
});
document.getElementById('newPlaylistButton').addEventListener('click', createPlaylist);
document.getElementById('libraryNav').addEventListener('click', () => { activePlaylistId = null; showLibrary(); });
document.getElementById('queueNav').addEventListener('click', showQueue);
document.getElementById('playButton').addEventListener('click', () => currentTrackId ? playTrack(currentTrackId) : tracks[0] && playTrack(tracks[0].id));
document.getElementById('previousButton').addEventListener('click', () => nextTrack(-1));
document.getElementById('nextButton').addEventListener('click', () => nextTrack(1));
document.getElementById('shuffleButton').addEventListener('click', (event) => { shuffle = !shuffle; event.currentTarget.classList.toggle('active', shuffle); event.currentTarget.setAttribute('aria-pressed', String(shuffle)); showToast(shuffle ? 'Shuffle on.' : 'Shuffle off.'); });
document.getElementById('repeatButton').addEventListener('click', (event) => { repeat = !repeat; event.currentTarget.classList.toggle('active', repeat); event.currentTarget.title = `Repeat ${repeat ? 'on' : 'off'}`; event.currentTarget.setAttribute('aria-label', `Repeat ${repeat ? 'on' : 'off'}`); showToast(repeat ? 'Repeat on.' : 'Repeat off.'); });
document.getElementById('favoriteButton').addEventListener('click', () => { const track = currentTrack(); if (!track) return; track.favorite = !track.favorite; updateNowPlaying(); showToast(track.favorite ? 'Added to favorites.' : 'Removed from favorites.'); });
document.getElementById('clearButton').addEventListener('click', clearLibrary);
document.getElementById('seekBar').addEventListener('input', (event) => { if (Number.isFinite(audio.duration)) audio.currentTime = (event.target.value / 1000) * audio.duration; });
document.getElementById('volumeBar').addEventListener('input', (event) => { audio.volume = Number(event.target.value); });
audio.volume = 0.8;
audio.addEventListener('loadedmetadata', () => {
  const track = currentTrack();
  if (track) track.duration = audio.duration;
  document.getElementById('duration').textContent = formatTime(audio.duration);
  renderTracks();
});
audio.addEventListener('timeupdate', () => {
  document.getElementById('currentTime').textContent = formatTime(audio.currentTime);
  document.getElementById('seekBar').value = audio.duration ? Math.round(audio.currentTime / audio.duration * 1000) : 0;
});
audio.addEventListener('play', updateNowPlaying);
audio.addEventListener('pause', updateNowPlaying);
audio.addEventListener('ended', () => {
  if (repeat) { audio.currentTime = 0; audio.play(); }
  else nextTrack(1);
});
const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('click', (event) => { if (!event.target.closest('button')) openFilePicker(); });
dropZone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openFilePicker(); } });
['dragenter', 'dragover'].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.remove('dragging'); }));
dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
const shortcutsDialog = document.getElementById('shortcutsDialog');
document.getElementById('shortcutsButton').addEventListener('click', () => shortcutsDialog.showModal());
document.getElementById('shortcutsClose').addEventListener('click', () => shortcutsDialog.close());
shortcutsDialog.addEventListener('click', (event) => { if (event.target === shortcutsDialog) shortcutsDialog.close(); });
document.addEventListener('keydown', (event) => {
  const tag = document.activeElement.tagName;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || document.activeElement.isContentEditable;
  if (event.key === 'Escape' && shortcutsDialog.open) { shortcutsDialog.close(); return; }
  if (typing || shortcutsDialog.open || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === '?' || (event.key === '/' && event.shiftKey)) { event.preventDefault(); shortcutsDialog.showModal(); return; }
  if (event.key === '/') { event.preventDefault(); searchInput.focus(); return; }
  if (event.code === 'Space') { event.preventDefault(); document.getElementById('playButton').click(); return; }
  if (event.shiftKey && event.key === 'ArrowLeft') { event.preventDefault(); nextTrack(-1); return; }
  if (event.shiftKey && event.key === 'ArrowRight') { event.preventDefault(); nextTrack(1); return; }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    const volume = document.getElementById('volumeBar');
    const change = event.key === 'ArrowUp' ? 0.05 : -0.05;
    volume.value = String(Math.max(0, Math.min(1, Number(volume.value) + change)));
    audio.volume = Number(volume.value);
  }
});
renderTracks();

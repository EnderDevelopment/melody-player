# Open Source Music Player

Melody Player is an open source browser-based music player for managing and listening to local audio files. This local music player supports file importing, drag-and-drop playback, playlists, search, sorting, queue browsing, favorites, shuffle, repeat, volume control, keyboard shortcuts, and persistent browser storage.

## Install

1. Download or clone the project files.
2. Keep `index.html`, `app.js`, and `styles.css` in the same directory.
3. Open `index.html` in a modern web browser.
4. For the most reliable browser storage behavior, serve the directory through a local static web server.

Example using a local server with Python:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in your browser.

## Use

1. Select `Add music`, `Add tracks`, or `Choose audio files`.
2. Choose one or more local audio files, or drag them into the upload area.
3. Select a track to play it.
4. Use the bottom player controls to pause, seek, adjust volume, play the previous or next track, enable shuffle, or enable repeat.
5. Use the search field to filter the library by title, artist, or album.
6. Use the sort control to switch between newest-first and oldest-first ordering.
7. Select the plus button beside Playlists to create a playlist.
8. Use the track options button to add or remove a track from a playlist.
9. Select `Up next` to view the current library order as a queue.
10. Select the heart button in the player to mark the current track as a favorite.
11. Open `Keyboard shortcuts` or use these shortcuts:
    - `Space`: play or pause
    - `Shift` + `Left Arrow`: previous track
    - `Shift` + `Right Arrow`: next track
    - `Up Arrow` or `Down Arrow`: adjust volume
    - `/`: focus library search
    - `?`: open keyboard shortcuts
    - `Escape`: close the shortcuts dialog
12. Use `Clear library` to remove all imported tracks and playlists from the current browser storage after confirmation.

---

More open source project projects by EnderDevelopment: https://github.com/EnderDevelopment

Project page: https://dash.enderdevelopment.com/community/1ee6c081-51fd-49cc-8d41-17b26b3da403?utm_source=github&utm_medium=readme&utm_campaign=auto_publish&utm_content=1ee6c081-51fd-49cc-8d41-17b26b3da403

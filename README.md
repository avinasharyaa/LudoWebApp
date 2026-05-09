# ShareLink Ludo

A small online Ludo web app that lets one player create a room, copy a shareable link, and have friends join by link or room code.

## Features

- Create a room instantly with no database setup.
- Join the same room from other devices using a 6-character code.
- Live room updates through server-sent events.
- 2 to 4 player turn-based Ludo flow with:
  - token yards
  - dice rolling
  - safe spots
  - captures
  - home lane and win detection

## Run locally

```bash
npm start
```

Then open `http://localhost:3000`.

## Notes

- Room state is kept in memory, so restarting the server clears active rooms.
- This is an MVP implementation of Ludo. It keeps the core room-sharing and turn flow simple and dependency-free.

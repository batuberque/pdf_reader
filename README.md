# PDF Reader

A browser PDF reader with highlights, notes, search and a speed-reading (RSVP) mode. The interface is in Turkish.

**Privacy:** there is no server. PDFs, highlights and notes are stored in your browser (IndexedDB) and never leave your device. Clearing site data deletes them.

## Run locally

```sh
pnpm install
pnpm dev      # development
pnpm test     # unit tests
pnpm build    # production build in dist/
```

## Security

A strict Content-Security-Policy is set in `index.html`. See [SECURITY.md](SECURITY.md) to report a problem.

## License

MIT

# Language redirect worker

This worker handles first-visit language routing for the public docs homepage.
GitHub Pages still owns the HTML, assets, locale pages, and static-file serving.

- Redirects only homepage requests with a clear language signal.
- Ignores already-localized paths, assets, bots, and non-page traffic.
- Explicit language choices take priority over cookies and browser language
  headers.
- English remains the default root page.

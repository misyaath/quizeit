# Contributing to Quizeit

1. Follow the [local development setup](README.md#developer-setup).
2. Read the [code map](docs/development.md#code-map) to find the feature or shared package that owns the behavior.
3. For an independently enabled feature, follow the [plugin guide](docs/plugins.md). If several extensions need the same core behavior, expose a narrow service or documented extension point that can be reused.
4. Run `npm test` and `npm run build`. Include the flows you verified and any required configuration when opening a pull request.

## Update the documentation

Edit the Markdown in `docs/` alongside the relevant code. The VitePress site uses those same files.

```sh
npm ci --prefix docs
npm run dev --prefix docs
npm run build --prefix docs
```

GitHub Actions checks docs changes on pull requests. Changes merged to `main` publish to [GitHub Pages](https://misyaath.github.io/quizeit/).

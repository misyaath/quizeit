# Contributing to Quizeit

1. Follow the [local development setup](README.md#developer-setup).
2. Read the [code map](docs/development.md#code-map) to find the feature or shared package that owns the behavior.
3. For an independently enabled feature, follow the [plugin guide](docs/plugins.md). If several extensions need the same core behavior, expose a narrow service or documented extension point that can be reused.
4. Run `npm test` and `npm run build`. Include the flows you verified and any required configuration when opening a pull request.
